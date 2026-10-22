import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, session } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Logger } from "./logger";
import { CSP, isAllowedUrl } from "./security";
import { readSettings, readWindowState, visibleOnSomeDisplay, writeSettings, writeWindowState, type WindowState } from "./storage";

/**
 * Proceso principal de CONTRAGOLPE escritorio.
 * El juego es exactamente el mismo que en el navegador; aquí solo hay ventana, seguridad, guardado y sistema.
 */

const T0 = Date.now();
const DEV_SERVER = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, "..", "dist");
// Pruebas automáticas: carpeta de datos aislada.
if (process.env.CONTRAGOLPE_USER_DATA) app.setPath("userData", process.env.CONTRAGOLPE_USER_DATA);
const USER_DATA = app.getPath("userData");
const log = new Logger(path.join(USER_DATA, "logs"));

// El audio debe poder sonar sin un gesto previo (es un juego, no una web).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Tipos MIME explícitos: con `nosniff`, un módulo JS sin su tipo correcto no se ejecuta. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

let win: BrowserWindow | null = null;
let inMatch = false;
let allowClose = false;

process.on("uncaughtException", (err) => log.log("error", `uncaughtException: ${err.stack ?? err}`));
process.on("unhandledRejection", (err) => log.log("error", `unhandledRejection: ${String(err)}`));

function saveWindowState(): void {
  if (!win) return;
  const b = win.getNormalBounds();
  const st: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, fullscreen: win.isFullScreen(), maximized: win.isMaximized() };
  try {
    writeWindowState(USER_DATA, st);
  } catch (e) {
    log.log("warn", `No se pudo guardar el estado de la ventana: ${String(e)}`);
  }
}

function createWindow(): void {
  const st = readWindowState(USER_DATA);
  const visible = visibleOnSomeDisplay(st, screen.getAllDisplays().map((d) => d.workArea));
  win = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: visible ? st.x : undefined,
    y: visible ? st.y : undefined,
    minWidth: 640,
    minHeight: 360,
    show: false,
    backgroundColor: "#000000",
    title: "CONTRAGOLPE",
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  if (st.maximized) win.maximize();
  if (st.fullscreen) win.setFullScreen(true);
  win.once("ready-to-show", () => {
    win?.show();
    log.log("info", `Ventana lista en ${Date.now() - T0} ms`);
  });

  // F11 y Alt+Enter alternan pantalla completa (también en partida, sin pasar por el juego).
  win.webContents.on("before-input-event", (ev, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" || (input.key === "Enter" && input.alt)) {
      ev.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    }
  });
  win.on("blur", () => win?.webContents.send("window:focus", false));
  win.on("focus", () => win?.webContents.send("window:focus", true));

  // Confirmación al cerrar en mitad de una partida (opcional desde el juego).
  win.on("close", (ev) => {
    saveWindowState();
    if (inMatch && !allowClose && win) {
      const choice = dialog.showMessageBoxSync(win, {
        type: "question",
        buttons: ["Seguir jugando", "Salir"],
        defaultId: 0,
        cancelId: 0,
        title: "CONTRAGOLPE",
        message: "Hay una partida en curso.",
        detail: "¿Seguro que quieres salir?",
      });
      if (choice === 0) ev.preventDefault();
    }
  });

  // Si el proceso del juego se cae, se avisa claramente y se ofrece reiniciar.
  win.webContents.on("render-process-gone", (_e, details) => {
    log.log("error", `El renderer se cayó: ${details.reason} (código ${details.exitCode})`);
    if (!win || details.reason === "clean-exit") return;
    const choice = dialog.showMessageBoxSync(win, {
      type: "error",
      buttons: ["Reiniciar el juego", "Salir"],
      defaultId: 0,
      title: "CONTRAGOLPE",
      message: "El juego se ha cerrado inesperadamente.",
      detail: `Motivo: ${details.reason}. Se ha guardado un registro en:\n${path.join(USER_DATA, "logs")}`,
    });
    if (choice === 0) win.reload();
    else {
      allowClose = true;
      app.quit();
    }
  });
  win.on("unresponsive", () => log.log("warn", "La ventana no responde"));

  if (DEV_SERVER) void win.loadURL(DEV_SERVER);
  else void win.loadURL("app://game/index.html");
  win.on("closed", () => (win = null));
}

// Un solo ejemplar: si se abre otra vez, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // Endurecer todos los webContents: sin ventanas nuevas, sin navegar fuera del juego, sin <webview>.
  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (ev, url) => {
      if (!isAllowedUrl(url, DEV_SERVER)) {
        ev.preventDefault();
        log.log("warn", `Navegación bloqueada: ${url}`);
      }
    });
    contents.on("will-redirect", (ev, url) => {
      if (!isAllowedUrl(url, DEV_SERVER)) ev.preventDefault();
    });
    contents.on("will-attach-webview", (ev) => ev.preventDefault());
  });

  void app.whenReady().then(() => {
    log.log("info", `Inicio v${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform}`);
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "fullscreen"));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "fullscreen");

    protocol.handle("app", async (req) => {
      const url = new URL(req.url);
      const file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
      if (url.host !== "game" || !file.startsWith(DIST)) return new Response("No encontrado", { status: 404 });
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      headers.set("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
      headers.set("Content-Security-Policy", CSP);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(res.body, { status: res.status, headers });
    });

    registerIpc();
    createWindow();
  });

  app.on("before-quit", () => saveWindowState());
  app.on("window-all-closed", () => app.quit());
}

function registerIpc(): void {
  ipcMain.handle("window:toggle-fullscreen", () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle("window:set-fullscreen", (_e, on: unknown) => {
    if (win && typeof on === "boolean") win.setFullScreen(on);
    return win?.isFullScreen() ?? false;
  });
  ipcMain.handle("window:is-fullscreen", () => win?.isFullScreen() ?? false);
  ipcMain.handle("app:quit", () => {
    allowClose = true;
    app.quit();
  });

  ipcMain.handle("settings:load", () => {
    const r = readSettings(USER_DATA);
    if (r.status === "corrupt") log.log("warn", `Configuración dañada: se usan valores por defecto (copia en ${r.backup})`);
    if (r.status === "migrated") log.log("info", "Configuración migrada al esquema actual");
    return r.settings ? JSON.stringify(r.settings) : null;
  });
  ipcMain.handle("settings:save", (_e, json: unknown) => {
    if (typeof json !== "string" || json.length > 200_000) return false;
    try {
      const obj = JSON.parse(json) as unknown;
      if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
      writeSettings(USER_DATA, obj as Record<string, unknown>);
      return true;
    } catch (e) {
      log.log("error", `No se pudo guardar la configuración: ${String(e)}`);
      return false;
    }
  });

  ipcMain.on("app:in-match", (_e, on: unknown) => {
    inMatch = on === true;
  });

  // Registro desde el juego, con límite para que un bucle de errores no llene el disco.
  let budget = 200;
  setInterval(() => (budget = 200), 60_000).unref();
  ipcMain.on("log", (_e, level: unknown, message: unknown) => {
    if (budget-- <= 0) return;
    const lv = level === "error" || level === "warn" ? level : "info";
    log.log(lv, `[juego] ${String(message).slice(0, 2000)}`);
  });
  ipcMain.on("metric", (_e, name: unknown, value: unknown) => {
    if (typeof name === "string" && typeof value === "number") log.log("info", `[métrica] ${name.slice(0, 40)} = ${value}`);
  });
}
