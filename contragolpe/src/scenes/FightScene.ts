import type { App } from "../app/App";
import type { WorldBox } from "../sim/boxes";
import { createMatch } from "../sim/state";
import { step } from "../sim/step";
import type { GameState, MatchConfig } from "../sim/types";
import { InputLog } from "../render/debug";
import { GameRenderer, NO_FX } from "../render/renderer";
import { getStage, type Stage } from "../render/stages";
import { FONT, VIEW_W } from "../render/view";
import type { Scene } from "./Scene";

/** Escena de combate: une simulación, entrada, render y (más adelante) audio y efectos. */
export class FightScene implements Scene {
  state: GameState;
  readonly stage: Stage;
  readonly renderer: GameRenderer;
  readonly logs: [InputLog, InputLog] = [new InputLog(), new InputLog()];
  debug = false;

  constructor(
    readonly app: App,
    config: Partial<MatchConfig>,
    stageId: string,
  ) {
    this.state = createMatch(config, 1);
    this.stage = getStage(stageId);
    this.renderer = new GameRenderer(app.ctx);
    this.renderer.cam.snap(this.state);
  }

  update(): void {
    const input = this.app.input;
    if (input.keyPressed("F1")) this.debug = !this.debug;
    const m0 = input.sample(0);
    const m1 = input.sample(1);
    this.state = step(this.state, m0, m1);
    this.logs[0].push(m0, this.state.fighters[0].facing);
    this.logs[1].push(m1, this.state.fighters[1].facing);
    this.renderer.cam.update(this.state);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    this.renderer.drawWorld(s, this.stage, {
      debug: this.debug,
      altPalette: [false, s.config.chars[0] === s.config.chars[1]],
      fx: [NO_FX, NO_FX],
      time: this.app.time,
    });
    if (this.debug) this.renderer.drawDebug(s, this.logs, (): WorldBox[] => []);

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(VIEW_W / 2 - 300, 8, 600, 24);
    ctx.fillStyle = "#fff";
    ctx.fillText("J1: A/D caminar · W saltar · S agacharse · doble toque = dash   |   F1: debug", VIEW_W / 2, 12);
    if (s.round.phase === "intro") {
      ctx.font = `bold 48px ${FONT}`;
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(s.round.t < 60 ? "RONDA 1" : "¡PELEA!", VIEW_W / 2, 200);
    }
    ctx.restore();
  }
}
