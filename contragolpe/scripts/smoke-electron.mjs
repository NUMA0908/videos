// Smoke test de la app de escritorio con Playwright + Electron.
//
//   node scripts/smoke-electron.mjs            → app empaquetada en release/<plataforma>-unpacked (npm run app:build)
//   node scripts/smoke-electron.mjs --source   → Electron de node_modules sobre dist/ + dist-electron/ (sin empaquetar)
//
// Recorre el camino real de un jugador: arranque → menú → "Versus contra CPU" → personaje → escenario → combate
// unos segundos → pausa → "Salir al menú" → "Salir del juego". Falla si hay errores de consola o de página,
// si la app no se cierra sola o si el registro de la app tiene líneas [error]. Además mide arranque, FPS reales y
// memoria (menú y combate) y las deja en release/smoke-metrics.json.
//
// En Linux sin pantalla: xvfb-run -a node scripts/smoke-electron.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromSource = process.argv.includes("--source");

function packagedExecutable() {
  const rel = path.join(root, "release");
  const candidates = {
    win32: [path.join(rel, "win-unpacked", "CONTRAGOLPE.exe")],
    darwin: ["mac", "mac-arm64", "mac-universal"].map((d) => path.join(rel, d, "CONTRAGOLPE.app", "Contents", "MacOS", "CONTRAGOLPE")),
    linux: [path.join(rel, "linux-unpacked", "contragolpe")],
  }[process.platform] ?? [];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) throw new Error(`No hay app empaquetada (${candidates.join(", ")}). Ejecuta antes: npm run app:build`);
  return exe;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "contragolpe-smoke-"));
  const args = fromSource ? ["."] : [];
  // Solo dentro de contenedores como root: Chromium no arranca su sandbox del SO sin privilegios de usuario normal.
  if (process.getuid?.() === 0) args.push("--no-sandbox");
  const executablePath = fromSource ? path.join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron") : packagedExecutable();
  console.log(`Ejecutable: ${path.relative(root, executablePath)}`);

  const t0 = Date.now();
  const app = await electron.launch({
    executablePath,
    args,
    cwd: root,
    env: { ...process.env, CONTRAGOLPE_USER_DATA: userData },
    timeout: 60_000,
  });
  const closed = new Promise((r) => app.on("close", r));
  const win = await app.firstWindow();
  const errors = [];
  win.on("console", (m) => {
    if (m.type() === "error") errors.push(`consola: ${m.text()}`);
  });
  win.on("pageerror", (e) => errors.push(`página: ${e.message}`));

  /** Estado del juego para entender un atasco en una máquina que no tenemos delante (CI). */
  const diagnose = () =>
    win
      .evaluate(() => {
        const g = window.__game;
        const i = g?.input;
        return JSON.stringify(
          {
            escena: g?.scene?.kind,
            seleccion: g?.scene?.sel,
            fps: g?.loop?.fps,
            tps: g?.loop?.tps,
            frames: g?.perf?.frames,
            foco: g?.focused,
            ultimoDispositivo: i?.lastDevice,
            mandosJugador: i?.playerPad,
            mandos: (i?.readers ?? []).filter((r) => r.connected).map((r) => ({ id: r.id, mapping: r.mapping, dir: r.dir, botones: r.buttons.map((b, n) => (b ? n : -1)).filter((n) => n >= 0), ejes: r.axes.map((a) => +a.toFixed(2)) })),
          },
          null,
          1,
        );
      })
      .then((d) => `estado: ${d}\nerrores hasta ahora: ${errors.join(" | ") || "ninguno"}`)
      .catch((e) => `sin diagnóstico (${e.message})`);

  // Con una CSP sin unsafe-eval, waitForFunction no funciona: se consulta con evaluate.
  const kind = () => win.evaluate(() => window.__game?.scene?.kind ?? null).catch(() => null);
  async function waitFor(fn, what, ms = 20_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return;
      await sleep(50);
    }
    throw new Error(`Tiempo agotado esperando: ${what}\n${await diagnose()}`);
  }
  async function press(key, times = 1) {
    for (let i = 0; i < times; i++) {
      await win.keyboard.press(key);
      await sleep(120);
    }
  }
  const memory = async () => {
    const mainMetrics = await app.evaluate(({ app: a }) => a.getAppMetrics().map((m) => ({ type: m.type, kb: m.memory.workingSetSize })));
    const heap = await win.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const porTipoMB = {};
    for (const m of mainMetrics) porTipoMB[m.type] = (porTipoMB[m.type] ?? 0) + Math.round(m.kb / 1024);
    return { totalMB: Math.round(mainMetrics.reduce((n, m) => n + m.kb, 0) / 1024), porTipoMB, heapMB: +(heap / 1048576).toFixed(1) };
  };
  const perf = () => win.evaluate(() => ({ fps: window.__game.loop.fps, tps: window.__game.loop.tps, ...window.__game.perf }));

  await waitFor(async () => (await kind()) === "title", "menú principal");
  const startupMs = Date.now() - t0;
  console.log(`✓ menú principal en ${startupMs} ms`);
  await sleep(2000);
  const menu = { ...(await memory()), ...(await perf()) };

  // Título → "Versus contra CPU" (tercera opción).
  await press("ArrowDown", 2);
  await press("Enter");
  await waitFor(async () => (await kind()) === "select", "selección de personaje");
  console.log("✓ selección de personaje");
  // Confirmar personaje(s) y escenario hasta entrar en combate.
  await waitFor(async () => {
    if ((await kind()) === "match") return true;
    await press("Enter");
    return (await kind()) === "match";
  }, "combate");
  console.log("✓ combate iniciado");
  // Se juega un poco (el jugador camina y golpea) y se mide.
  await win.keyboard.down("KeyD");
  for (let i = 0; i < 12; i++) await press(i % 2 ? "KeyJ" : "KeyU");
  await win.keyboard.up("KeyD");
  await sleep(5000);
  const match = { ...(await memory()), ...(await perf()) };
  const frame = await win.evaluate(() => window.__game.scene.fight.state.frame);
  if (frame < 200) throw new Error(`La simulación apenas avanzó (${frame} ticks)`);
  console.log(`✓ ${frame} ticks simulados; ${match.fps} FPS / ${match.tps} TPS`);

  // Pausa → "Salir al menú" (última opción: arriba desde "Continuar").
  await waitFor(async () => {
    if (await win.evaluate(() => window.__game.scene.pauseOpen === true)) return true;
    await press("Escape");
    return false;
  }, "menú de pausa");
  await press("ArrowUp");
  await press("Enter");
  await waitFor(async () => (await kind()) === "title", "vuelta al menú");
  console.log("✓ vuelta al menú principal");

  // "Salir del juego" (última opción del menú principal; solo existe en escritorio).
  await press("ArrowUp");
  // La app puede cerrarse antes de que Playwright suelte la tecla: eso es justo lo esperado.
  await win.keyboard.press("Enter").catch(() => {});
  const exited = await Promise.race([closed.then(() => true), sleep(10_000).then(() => false)]);
  if (!exited) {
    await app.close();
    throw new Error('"Salir del juego" no cerró la app');
  }
  console.log("✓ la app se cerró sola");

  const logFile = path.join(userData, "logs", "main.log");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  for (const line of log.split("\n")) if (line.includes("[error]")) errors.push(`registro: ${line}`);
  if (!fs.existsSync(path.join(userData, "window-state.json"))) errors.push("no se guardó el estado de la ventana al cerrar");

  const metrics = { platform: `${process.platform}-${process.arch}`, packaged: !fromSource, startupMs, menu, match };
  fs.mkdirSync(path.join(root, "release"), { recursive: true });
  fs.writeFileSync(path.join(root, "release", "smoke-metrics.json"), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
  fs.rmSync(userData, { recursive: true, force: true });

  if (errors.length) {
    console.error(`✗ ${errors.length} error(es):\n${errors.join("\n")}`);
    process.exit(1);
  }
  console.log("SMOKE OK");
}

main().catch((e) => {
  console.error("✗ SMOKE FALLÓ:", e);
  process.exit(1);
});
