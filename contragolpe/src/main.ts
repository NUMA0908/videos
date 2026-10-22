import { App } from "./app/App";
import { FightScene } from "./scenes/FightScene";
import { TrialScene } from "./scenes/TrialScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const app = new App(canvas);
const params = new URLSearchParams(location.search);

function versus(): void {
  app.setScene(new FightScene(app, { chars: ["rayo", "rayo"], mode: "versus" }, "muelle"));
}

if (params.get("modo") === "trial") app.setScene(new TrialScene(app, "rayo", versus));
else versus();
app.start();
canvas.focus();

// Acceso para pruebas automatizadas y depuración desde la consola.
(window as unknown as { __game: App }).__game = app;
