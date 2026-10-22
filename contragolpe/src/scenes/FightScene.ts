import type { App } from "../app/App";
import type { SfxName } from "../audio/Audio";
import { getChar, getMove } from "../data/characters";
import { TUNING } from "../data/tuning";
import type { WorldBox } from "../sim/boxes";
import { toPx } from "../sim/fixed";
import { allProjectileBoxes } from "../sim/projectiles";
import { createMatch } from "../sim/state";
import { step } from "../sim/step";
import type { FighterState, GameState, MatchConfig, Side, SimEvent } from "../sim/types";
import { poseFor } from "../render/animator";
import { InputLog } from "../render/debug";
import { Effects } from "../render/effects";
import { Hud } from "../render/hud";
import { GameRenderer, type FighterFx } from "../render/renderer";
import { resolvePalette, solve } from "../render/skeleton";
import { getStage, type Stage } from "../render/stages";
import { FONT, VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "./Scene";

/** De dónde sale el input de un lado: dispositivos del jugador, IA, guion... */
export type InputSource = (s: GameState, side: Side) => number;

const HIT_SFX: Record<string, SfxName> = { light: "hitLight", heavy: "hitHeavy", super: "hitSuper" };
const SIMPLE_SFX: Partial<Record<SimEvent["type"], SfxName>> = {
  block: "block",
  parry: "parry",
  redParry: "redParry",
  parryFail: "parryFail",
  projectile: "projectile",
  projectileClash: "clash",
  super: "super",
  ko: "ko",
  jump: "jump",
  land: "land",
  dash: "dash",
  throw: "throw",
  throwHit: "throwHit",
  tech: "tech",
  knockdown: "knockdown",
  round: "round",
  fight: "fight",
  roundWin: "win",
};

/** Escena de combate: une simulación, entrada, render, efectos y audio. */
export class FightScene implements Scene {
  readonly kind = "fight";
  /** null = dispositivos del jugador correspondiente. */
  inputs: [InputSource | null, InputSource | null] = [null, null];
  /** Se llama tras cada tick (modos de juego que observan los eventos). */
  onTick: ((s: GameState) => void) | null = null;
  /** Dibujo extra encima del HUD. */
  overlay: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  paused = false;
  /** Si existe, la escena padre decide qué pasa al terminar el partido. */
  onMatchOver: (() => void) | null = null;
  state: GameState;
  readonly stage: Stage;
  readonly renderer: GameRenderer;
  readonly hud = new Hud();
  readonly fx = new Effects();
  readonly logs: [InputLog, InputLog] = [new InputLog(), new InputLog()];
  debug = false;
  /** Último input de cada lado (para el modo entrenamiento y la IA). */
  lastInputs: [number, number] = [0, 0];
  private superDim = 0;
  private parryFlash: [number, number] = [0, 0];
  private koSlow = 0;
  private koFocus: Side | null = null;

  constructor(
    readonly app: App,
    readonly config: Partial<MatchConfig>,
    stageId: string,
    seed = 1,
  ) {
    this.state = createMatch(config, seed);
    this.stage = getStage(stageId);
    this.renderer = new GameRenderer(app.ctx);
    this.renderer.cam.snap(this.state);
  }

  enter(): void {
    this.app.audio.playMusic(this.stage.music);
  }

  exit(): void {
    this.app.loop.timeScale = 1;
  }

  restart(seed = 1): void {
    this.state = createMatch(this.config, seed);
    this.hud.reset(this.state);
    this.fx.clear();
    this.renderer.cam.snap(this.state);
    this.koSlow = 0;
    this.app.loop.timeScale = 1;
  }

  update(): void {
    const input = this.app.input;
    if (input.keyPressed("F1")) this.debug = !this.debug;
    this.fx.settings = { shake: this.app.settings.shake, flashes: this.app.settings.flashes };
    if (this.paused) return;
    if (this.onMatchOver === null && this.state.round.phase === "over" && this.state.round.t > 60 && input.menu().confirm) {
      this.restart();
      return;
    }

    const m0 = this.inputs[0] ? this.inputs[0](this.state, 0) : input.sample(0);
    const m1 = this.inputs[1] ? this.inputs[1](this.state, 1) : input.sample(1);
    this.lastInputs = [m0, m1];
    this.state = step(this.state, m0, m1);
    const s = this.state;
    this.logs[0].push(m0, s.fighters[0].facing);
    this.logs[1].push(m1, s.fighters[1].facing);
    this.hud.update(s);
    this.react(s);
    this.fx.onEvents(s, s.events);
    this.trackSmears(s);
    this.fx.update();
    this.updateCamera(s);
    this.onTick?.(s);
  }

  /** Sonido, rótulos y cámara lenta según los eventos del tick. */
  private react(s: GameState): void {
    for (const side of [0, 1] as const) if (this.parryFlash[side] > 0) this.parryFlash[side]--;
    const audio = this.app.audio;
    const pan = (x: number) => (this.renderer.cam.sx(toPx(x)) - VIEW_W / 2) / (VIEW_W / 2);
    for (const e of s.events) {
      if (e.type === "hit") {
        audio.play(HIT_SFX[e.strength ?? "light"] ?? "hitLight", pan(e.x));
        if (e.counter) audio.play("counter", pan(e.x));
      } else {
        const name = SIMPLE_SFX[e.type];
        if (name) audio.play(name, pan(e.x));
      }
      if (e.type === "parry" || e.type === "redParry") {
        this.parryFlash[e.side] = 12;
        this.hud.popup(e.side, e.type === "redParry" ? "RED PARRY" : "PARRY", e.type === "redParry" ? "#ff6b6b" : "#9fe8ff", 45);
      } else if (e.type === "tech") {
        this.hud.popup(e.side, "ESCAPE", "#ffffff", 40);
      } else if (e.type === "ko") {
        this.koSlow = TUNING.round.koSlowFrames;
        this.koFocus = (1 - e.side) as Side;
      }
    }
    // Silbido del golpe al aire: suena en el primer frame activo si no hubo contacto.
    for (const f of s.fighters) {
      if (f.state !== "attack" || !f.move || f.contact !== "none" || f.hitstop > 0) continue;
      const mv = getMove(f.char, f.move);
      if (mv.kind === "normal" && f.mf === mv.startup && mv.hitboxes.length) {
        audio.play(mv.strength === "heavy" ? "whiffHeavy" : "whiffLight", pan(f.x));
      }
    }
    if (this.koSlow > 0) {
      this.koSlow--;
      this.app.loop.timeScale = this.koSlow > 0 ? 0.3 : 1;
    }
  }

  /** Registra la posición de la extremidad que golpea durante los frames activos (estela). */
  private trackSmears(s: GameState): void {
    for (const f of s.fighters) {
      let point: { x: number; y: number } | null = null;
      let active = false;
      let color = "#ffffff";
      if (f.state === "attack" && f.move) {
        const mv = getMove(f.char, f.move);
        const limb = mv.anim.limb;
        if (limb && limb !== "none" && f.mf >= mv.startup - 1 && f.mf <= mv.startup + mv.active - 1) {
          const ch = getChar(f.char);
          const j = solve(poseFor(f, s.frame), ch.look);
          const p = limb === "handF" ? j.haF : limb === "handB" ? j.haB : limb === "footF" ? j.ftF : j.ftB;
          point = { x: toPx(f.x) + p.x * f.facing, y: toPx(f.y) + p.y };
          active = true;
          color = mv.kind === "normal" ? "#ffffff" : resolvePalette(ch.look, false).energy;
        }
      }
      this.fx.trackSmear(f.side, active, point, color);
    }
  }

  private updateCamera(s: GameState): void {
    const cam = this.renderer.cam;
    if (s.freeze > 0 && s.freezeOwner !== -1) {
      const f = s.fighters[s.freezeOwner];
      cam.zoomTarget = 1.28;
      cam.focusX = toPx(f.x);
      cam.focusY = toPx(f.y) + 60;
      this.superDim = Math.min(0.6, this.superDim + 0.08);
    } else if (this.koSlow > 0 && this.koFocus !== null) {
      const f = s.fighters[this.koFocus];
      cam.zoomTarget = 1.18;
      cam.focusX = toPx(f.x);
      cam.focusY = toPx(f.y) + 40;
      this.superDim = Math.max(0, this.superDim - 0.05);
    } else {
      cam.zoomTarget = 1;
      cam.focusX = null;
      this.superDim = Math.max(0, this.superDim - 0.05);
    }
    cam.update(s);
    this.fx.applyShake(cam, this.app.time);
  }

  private fxFor(f: FighterState): FighterFx {
    const s = this.state;
    const flashes = this.app.settings.flashes;
    if (s.freeze > 0 && s.freezeOwner === f.side) {
      const pal = getChar(f.char).look.colors;
      return { flash: 0, jitter: 0, glow: pal.energy, glowAlpha: 0.9 };
    }
    if (f.state === "parry") return { flash: 0, jitter: 0, glow: "#9fe8ff", glowAlpha: 0.3 + 0.2 * (f.parryWindow % 2) };
    if (this.parryFlash[f.side] > 0) return { flash: 0, jitter: 0, glow: "#ffffff", glowAlpha: (0.9 * this.parryFlash[f.side]) / 12 };
    const hitFrozen = f.hitstop > 0 && (f.state === "hitstun" || f.state === "airHit" || f.state === "ko" || f.state === "thrown");
    const blockFrozen = f.hitstop > 0 && f.state === "blockstun";
    return {
      flash: hitFrozen && flashes && f.hitstop % 4 >= 2 ? 1 : 0,
      jitter: hitFrozen || blockFrozen ? (f.hitstop % 2 === 0 ? 3 : -3) : 0,
      glow: hitFrozen && !flashes ? "#ffffff" : null,
      glowAlpha: hitFrozen && !flashes ? 0.25 : 0,
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
    this.fx.draw(ctx, this.renderer.cam);
    if (s.freeze > 0 && s.freezeOwner !== -1) this.drawSpeedLines(ctx, s);
    if (this.fx.flash > 0) {
      ctx.globalAlpha = this.fx.flash;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }
    if (this.debug) this.renderer.drawDebug(s, this.logs, (st): WorldBox[] => allProjectileBoxes(st));
    this.hud.draw(ctx, s);
    this.overlay?.(ctx);

    if (s.round.phase === "over" && s.round.t > 60 && !this.overlay) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, VIEW_H - 92, VIEW_W, 40);
      ctx.fillStyle = "#fff";
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Pulsa Enter / LP para continuar", VIEW_W / 2, VIEW_H - 72);
      ctx.restore();
    }
  }

  /** Líneas de velocidad radiales durante la pantalla de súper. */
  private drawSpeedLines(ctx: CanvasRenderingContext2D, s: GameState): void {
    const f = s.fighters[s.freezeOwner as Side];
    const cam = this.renderer.cam;
    const cx = cam.sx(toPx(f.x));
    const cy = cam.sy(toPx(f.y) + 100);
    const pal = resolvePalette(getChar(f.char).look, false);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = pal.energyCore;
    const t = this.app.time;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.sin(i * 12.9) * 0.1;
      const r0 = 160 + ((t * 900 + i * 53) % 220);
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + 120), cy + Math.sin(a) * (r0 + 120));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Para menús que vuelven a usar la escena (revancha). */
  get matchOver(): boolean {
    return this.state.round.phase === "over";
  }
}
