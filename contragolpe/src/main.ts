import { App } from "./app/App";
import { desktop } from "./app/desktop";
import { FightScene } from "./scenes/FightScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { nav } from "./scenes/nav";
import { Cpu, CPU_LEVELS } from "./ai/cpu";

import { loadDesktopSettings } from "./app/settings";

// Errores del juego → registro de la app de escritorio (en el navegador, solo la consola).
window.addEventListener("error", (e) => desktop?.log?.("error", `${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) => desktop?.log?.("error", `Promesa rechazada: ${String(e.reason)}`));

const bootStart = performance.now();
const canvas = document.getElementById("game") as HTMLCanvasElement;
const app = new App(canvas, await loadDesktopSettings());
const params = new URLSearchParams(location.search);

// Atajos de desarrollo: ?modo=galeria | trial | versus&p1=..&p2=..&esc=..
const mode = params.get("modo");
if (mode === "galeria") app.setScene(new GalleryScene(app, params.get("pj") ?? "rayo", Number(params.get("pag") ?? 0)));
else if (mode === "trial") nav.trial(app, params.get("p1") ?? "rayo");
else if (mode === "versus") {
  const chars: [string, string] = [params.get("p1") ?? "rayo", params.get("p2") ?? "rayo"];
  app.setScene(new FightScene(app, { chars, mode: "versus" }, params.get("esc") ?? "muelle"));
} else if (mode === "demo") {
  // CPU contra CPU (pruebas de rendimiento y pantalla de demostración).
  const chars: [string, string] = [params.get("p1") ?? "rayo", params.get("p2") ?? "muralla"];
  const fight = new FightScene(app, { chars, mode: "demo" }, params.get("esc") ?? "azotea", 7);
  const cpus = [new Cpu(CPU_LEVELS[2], 0, 11), new Cpu(CPU_LEVELS[2], 1, 12)];
  fight.inputs = [(s) => cpus[0].input(s), (s) => cpus[1].input(s)];
  fight.hud.labels = ["CPU", "CPU"];
  app.setScene(fight);
} else if (mode === "entrenamiento") {
  nav.match(app, { mode: "training", chars: [params.get("p1") ?? "rayo", params.get("p2") ?? "rayo"], stage: params.get("esc") ?? "muelle", p2: "dummy" });
} else nav.title(app);
app.start();
if (app.settings.startFullscreen && desktop) void desktop.setFullscreen(true);
document.getElementById("loading")?.remove();
requestAnimationFrame(() => desktop?.reportMetric?.("arranque_renderer_ms", Math.round(performance.now() - bootStart)));
canvas.focus();

// Acceso para pruebas automatizadas y depuración desde la consola.
(window as unknown as { __game: App }).__game = app;
