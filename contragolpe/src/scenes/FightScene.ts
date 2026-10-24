import type { App } from "../app/App";
import type { SfxName } from "../audio/Audio";
import { getChar, getMove } from "../data/characters";
import { TUNING } from "../data/tuning";
import type { WorldBox } from "../sim/boxes";
import { toPx } from "../sim/fixed";
import { allProjectileBoxes } from "../sim/projectiles";
import { createMatch } from "../sim/state";
import { stepInPlace } from "../sim/step";
import type { FighterState, GameState, MatchConfig, Side, SimEvent } from "../sim/types";

/** Sonido de impacto según lo que golpea (capa 2). */
function hitSfx(e: SimEvent, s: GameState): SfxName {
  if (e.strength === "super") return "hitSuper";
  const info = strikeInfo(s.fighters[e.side].char, e.move);
  const heavy = e.strength === "heavy";
  if (info.special) return "hitSpecial";
  if (info.limb === "kick") return heavy ? "hitKickH" : "hitKickL";
  return heavy ? "hitPunchH" : "hitPunchL";
}

/** Frame en que suena el swing: un poco antes del primer frame activo, para que el silbido culmine al pegar. */
export function swingFrame(startup: number, heavy: boolean): number {
  return Math.max(1, startup - (heavy ? 3 : 2));
}
import { poseFor } from "../render/animator";
import { InputLog } from "../render/debug";
import { Effects } from "../render/effects";
import { FighterAnimator } from "../render/fighterAnim";
import { Hud } from "../render/hud";
import { GameRenderer, type FighterFx } from "../render/renderer";
import { resolvePalette, solve } from "../render/skeleton";
import { strikeInfo } from "../render/strikeInfo";
import { getStage, type Stage } from "../render/stages";
import { FONT, VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "./Scene";

/** De dónde sale el input de un lado: dispositivos del jugador, IA, guion... */
export type InputSource = (s: GameState, side: Side) => number;

const SIMPLE_SFX: Partial<Record<SimEvent["type"], SfxName>> = {
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
  /** Lados controlados por personas (vibran sus mandos; la CPU y el muñeco no). */
  rumbleSides: [boolean, boolean] = [true, true];
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
  /** Poses con transiciones, exageración del impacto y vibración de hitstop (solo presentación). */
  readonly anims: [FighterAnimator, FighterAnimator] = [new FighterAnimator(), new FighterAnimator()];
  readonly logs: [InputLog, InputLog] = [new InputLog(), new InputLog()];
  debug = false;
  /** Último input de cada lado (para el modo entrenamiento y la IA). */
  lastInputs: [number, number] = [0, 0];
  private superDim = 0;
  private parryFlash: [number, number] = [0, 0];
  private koSlow = 0;
  private koFocus: Side | null = null;
  /** Frame del movimiento en el tick anterior (para que el swing suene una sola vez aunque haya congelamiento). */
  private prevMf: [number, number] = [0, 0];

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
    this.stopRumble();
  }

  restart(seed = 1): void {
    this.state = createMatch(this.config, seed);
    this.hud.reset(this.state);
    this.fx.clear();
    for (const a of this.anims) a.reset();
    this.renderer.cam.snap(this.state);
    this.koSlow = 0;
    this.app.loop.timeScale = 1;
  }

  update(): void {
    const input = this.app.input;
    if (input.keyPressed("F1")) this.debug = !this.debug;
    const feel = this.fx.settings;
    feel.shake = this.app.settings.shake;
    feel.flashes = this.app.settings.flashes;
    feel.lowPower = this.app.settings.lowPower;
    if (this.paused) return;
    if (this.onMatchOver === null && this.state.round.phase === "over" && this.state.round.t > 60 && input.menu().confirm) {
      this.restart();
      return;
    }

    const m0 = this.inputs[0] ? this.inputs[0](this.state, 0) : input.sample(0);
    const m1 = this.inputs[1] ? this.inputs[1](this.state, 1) : input.sample(1);
    this.lastInputs[0] = m0;
    this.lastInputs[1] = m1;
    // En el sitio: mismo resultado que step() (que es clonar + stepInPlace) pero sin copiar el estado en cada
    // tick. Nadie guarda referencias a estados anteriores (la IA y el HUD copian lo que necesitan).
    stepInPlace(this.state, m0, m1);
    const s = this.state;
    this.logs[0].push(m0, s.fighters[0].facing);
    this.logs[1].push(m1, s.fighters[1].facing);
    this.hud.update(s);
    this.react(s);
    this.fx.onEvents(s, s.events);
    for (const side of [0, 1] as const) {
      this.anims[side].onEvents(s.events, side);
      this.anims[side].tick(s.fighters[side], s.frame, this.app.settings.flashes);
    }
    if (s.events.length) this.rumble(s);
    this.trackSmears(s);
    this.fx.update();
    this.updateCamera(s);
    this.onTick?.(s);
  }

  /** Vibración: solo los mandos de los lados humanos, con el reloj de presentación (fuera de la simulación). */
  private rumble(s: GameState): void {
    const input = this.app.input;
    const pad = (side: 0 | 1) => (this.rumbleSides[side] ? (input.reader(side)?.pad ?? null) : null);
    this.app.rumble.onEvents(s.events, [pad(0), pad(1)], this.app.time * 1000);
  }

  /** Corta la vibración (pausa, fin de la partida). */
  stopRumble(): void {
    const input = this.app.input;
    this.app.rumble.stop([input.reader(0)?.pad ?? null, input.reader(1)?.pad ?? null]);
  }

  /** Sonido, rótulos y cámara lenta según los eventos del tick. */
  private react(s: GameState): void {
    for (const side of [0, 1] as const) if (this.parryFlash[side] > 0) this.parryFlash[side]--;
    const audio = this.app.audio;
    const pan = (x: number) => (this.renderer.cam.sx(toPx(x)) - VIEW_W / 2) / (VIEW_W / 2);
    for (const e of s.events) {
      const def = s.fighters[(1 - e.side) as Side];
      if (e.type === "hit") {
        audio.play(hitSfx(e, s), pan(e.x));
        if (e.counter) audio.play("counter", pan(e.x));
        // Capa 3 (solo con archivos de voz): queja del golpeado en golpes fuertes.
        if (e.strength !== "light") audio.voice(def.char, "hurt", pan(e.x), 0.5);
      } else if (e.type === "block") {
        audio.play(e.strength === "light" ? "block" : "blockHeavy", pan(e.x));
      } else {
        const name = SIMPLE_SFX[e.type];
        if (name) audio.play(name, pan(e.x));
      }
      if (e.type === "ko") audio.voice(def.char, "ko", pan(e.x));
      else if (e.type === "super") audio.voice(s.fighters[e.side].char, "super", pan(e.x));
      else if (e.type === "roundWin") audio.voice(s.fighters[e.side].char, "win", 0);
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
    // Capa 1: swing de cada golpe con extremidad, conecte o no (el impacto se suma encima si conecta).
    for (const f of s.fighters) {
      const mf = f.state === "attack" && f.move ? f.mf : 0;
      const prev = this.prevMf[f.side];
      this.prevMf[f.side] = mf;
      if (!mf || mf === prev || !f.move) continue;
      const mv = getMove(f.char, f.move);
      const limb = mv.anim.limb;
      if (!limb || limb === "none" || !mv.hitboxes.length) continue;
      const heavy = mv.strength === "heavy";
      if (mf === 1 && mv.kind !== "super") {
        // Voz al lanzar (solo con archivos): rara en ligeros, más en fuertes y especiales.
        audio.voice(f.char, mv.kind === "special" ? "special" : heavy ? "heavy" : "attack", pan(f.x), mv.kind === "special" ? 0.6 : heavy ? 0.35 : 0.12);
      }
      if (mf !== swingFrame(mv.startup, heavy)) continue;
      const info = strikeInfo(f.char, f.move);
      const name: SfxName = info.special ? "swingSpecial" : info.limb === "kick" ? (heavy ? "swingKickH" : "swingKickL") : heavy ? "swingPunchH" : "swingPunchL";
      audio.play(name, pan(f.x));
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
          const j = solve(this.anims[f.side].pose ?? poseFor(f, s.frame), ch.look);
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
    const anim = this.anims[f.side];
    return {
      flash: anim.flash,
      jitter: anim.jitter,
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
      lowPower: this.app.settings.lowPower,
      anims: this.anims,
    });
    this.fx.draw(ctx, this.renderer.cam);
    if (s.freeze > 0 && s.freezeOwner !== -1 && !this.app.settings.lowPower) this.drawSpeedLines(ctx, s);
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
