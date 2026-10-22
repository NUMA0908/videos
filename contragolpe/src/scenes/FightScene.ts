import type { App } from "../app/App";
import { getChar } from "../data/characters";
import type { WorldBox } from "../sim/boxes";
import { toPx } from "../sim/fixed";
import { allProjectileBoxes } from "../sim/projectiles";
import { createMatch } from "../sim/state";
import { step } from "../sim/step";
import type { FighterState, GameState, MatchConfig } from "../sim/types";
import { InputLog } from "../render/debug";
import { Hud } from "../render/hud";
import { GameRenderer, type FighterFx } from "../render/renderer";
import { getStage, type Stage } from "../render/stages";
import { FONT, VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "./Scene";

/** Escena de combate: une simulación, entrada, render y (más adelante) audio y efectos. */
export class FightScene implements Scene {
  state: GameState;
  readonly stage: Stage;
  readonly renderer: GameRenderer;
  readonly hud = new Hud();
  readonly logs: [InputLog, InputLog] = [new InputLog(), new InputLog()];
  debug = false;
  private superDim = 0;

  constructor(
    readonly app: App,
    readonly config: Partial<MatchConfig>,
    stageId: string,
  ) {
    this.state = createMatch(config, 1);
    this.stage = getStage(stageId);
    this.renderer = new GameRenderer(app.ctx);
    this.renderer.cam.snap(this.state);
  }

  private restart(): void {
    this.state = createMatch(this.config, 1);
    this.hud.reset(this.state);
    this.renderer.cam.snap(this.state);
  }

  update(): void {
    const input = this.app.input;
    if (input.keyPressed("F1")) this.debug = !this.debug;
    if (this.state.round.phase === "over" && this.state.round.t > 60 && input.menu().confirm) {
      this.restart();
      return;
    }
    const m0 = input.sample(0);
    const m1 = input.sample(1);
    this.state = step(this.state, m0, m1);
    this.logs[0].push(m0, this.state.fighters[0].facing);
    this.logs[1].push(m1, this.state.fighters[1].facing);
    this.hud.update(this.state);
    const s = this.state;
    const cam = this.renderer.cam;
    if (s.freeze > 0 && s.freezeOwner !== -1) {
      const f = s.fighters[s.freezeOwner];
      cam.zoomTarget = 1.28;
      cam.focusX = toPx(f.x);
      cam.focusY = toPx(f.y) + 60;
      this.superDim = Math.min(0.6, this.superDim + 0.08);
    } else {
      cam.zoomTarget = 1;
      cam.focusX = null;
      this.superDim = Math.max(0, this.superDim - 0.05);
    }
    cam.update(s);
  }

  private fxFor(f: FighterState): FighterFx {
    const s = this.state;
    if (s.freeze > 0 && s.freezeOwner === f.side) {
      const pal = getChar(f.char).look.colors;
      return { flash: 0, jitter: 0, glow: pal.energy, glowAlpha: 0.9 };
    }
    const hitFrozen = f.hitstop > 0 && (f.state === "hitstun" || f.state === "airHit" || f.state === "ko");
    const blockFrozen = f.hitstop > 0 && f.state === "blockstun";
    return {
      flash: hitFrozen && f.hitstop % 4 >= 2 ? 1 : 0,
      jitter: hitFrozen || blockFrozen ? (f.hitstop % 2 === 0 ? 2.5 : -2.5) : 0,
      glow: null,
      glowAlpha: 0,
    };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const s = this.state;
    this.renderer.drawWorld(s, this.stage, {
      debug: this.debug,
      altPalette: [false, s.config.chars[0] === s.config.chars[1]],
      fx: [this.fxFor(s.fighters[0]), this.fxFor(s.fighters[1])],
      time: this.app.time,
      dim: this.superDim,
    });
    if (this.debug) this.renderer.drawDebug(s, this.logs, (st): WorldBox[] => allProjectileBoxes(st));
    this.hud.draw(ctx, s);

    if (s.round.phase === "over" && s.round.t > 60) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, VIEW_H - 92, VIEW_W, 40);
      ctx.fillStyle = "#fff";
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Pulsa Enter / LP para la revancha", VIEW_W / 2, VIEW_H - 72);
      ctx.restore();
    }
  }
}
