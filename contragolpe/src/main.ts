import { App } from "./app/App";
import { FightScene } from "./scenes/FightScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { TrialScene } from "./scenes/TrialScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const app = new App(canvas);
const params = new URLSearchParams(location.search);

function versus(): void {
  app.setScene(new FightScene(app, { chars: ["rayo", "rayo"], mode: "versus" }, "muelle"));
}

const mode = params.get("modo");
if (mode === "trial") app.setScene(new TrialScene(app, "rayo", versus));
else if (mode === "galeria") app.setScene(new GalleryScene(app, params.get("pj") ?? "rayo", Number(params.get("pag") ?? 0)));
else versus();
app.start();
canvas.focus();

// Acceso para pruebas automatizadas y depuración desde la consola.
(window as unknown as { __game: App }).__game = app;
