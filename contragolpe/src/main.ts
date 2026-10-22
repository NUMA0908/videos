import { App } from "./app/App";
import { FightScene } from "./scenes/FightScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const app = new App(canvas);
app.setScene(new FightScene(app, { chars: ["rayo", "rayo"], mode: "versus" }, "muelle"));
app.start();
canvas.focus();

// Acceso para pruebas automatizadas y depuración desde la consola.
(window as unknown as { __game: App }).__game = app;
