import type { App } from "../app/App";
import { CharSelectScene, type SelectMode } from "./CharSelectScene";
import { JoinScene } from "./JoinScene";
import { MatchScene, type MatchSetup } from "./MatchScene";
import { MoveListScene } from "./MoveListScene";
import { OptionsScene } from "./OptionsScene";
import { StageSelectScene } from "./StageSelectScene";
import { TitleScene } from "./TitleScene";
import { TrialScene } from "./TrialScene";

/** Navegación entre pantallas (un solo sitio que conoce el flujo del juego). */
export const nav = {
  title(app: App, index = 0): void {
    // Fuera del Versus cada jugador vuelve a su juego de teclas.
    app.input.keySet[0] = 0;
    app.input.keySet[1] = 1;
    app.setScene(new TitleScene(app, index));
  },
  /** Versus de 2 jugadores: primero "presiona un botón para unirte". */
  join(app: App): void {
    app.setScene(new JoinScene(app, () => nav.select(app, "versus"), () => nav.title(app, 1)));
  },
  select(app: App, mode: SelectMode): void {
    app.setScene(new CharSelectScene(app, mode));
  },
  stage(app: App, setup: Omit<MatchSetup, "stage">): void {
    app.setScene(new StageSelectScene(app, setup));
  },
  match(app: App, setup: MatchSetup): void {
    app.setScene(new MatchScene(app, setup));
  },
  trial(app: App, charId: string): void {
    app.setScene(new TrialScene(app, charId, () => nav.title(app, 4)));
  },
  options(app: App, back: () => void): void {
    app.setScene(new OptionsScene(app, back));
  },
  moveList(app: App, charId: string, back: () => void): void {
    app.setScene(new MoveListScene(app, charId, back));
  },
};
