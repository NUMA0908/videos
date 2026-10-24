import { getMove } from "../data/characters";
import type { FighterState, FState, SimEvent } from "../sim/types";
import { poseFor } from "./animator";
import { lerpPose, type Pose } from "./skeleton";

/**
 * Capa de presentación de un personaje, encima de `poseFor` (que es una función pura del estado).
 * Guarda memoria SOLO de render (nunca escribe en la simulación) para lo que una función pura no puede hacer:
 *  - **Poses de enlace**: al cambiar de estado no se salta de una pose a otra; se mezcla desde la pose que
 *    se veía durante unos frames. Los golpes recibidos, bloqueos y parry cortan en seco (el impacto debe leerse
 *    al instante) y la mezcla de un ataque termina siempre antes de su primer frame activo, así la pose de
 *    golpe coincide exactamente con el frame en que pega.
 *  - **Exageración en el impacto**: estiramiento del cuerpo en los 2 primeros frames activos (se sostiene
 *    durante el hitstop porque el personaje está congelado).
 *  - **Retroceso del golpeado** proporcional a la fuerza del golpe, y vibración de hitstop que decae.
 * Solo avanza con los frames NO congelados del personaje: durante el hitstop todo queda quieto.
 */

/** Frames de mezcla al ENTRAR en cada estado (0 = corte seco). */
const BLEND_IN: Record<FState, number> = {
  idle: 4,
  walkF: 3,
  walkB: 3,
  crouch: 2,
  prejump: 2,
  air: 3,
  land: 2,
  dashF: 2,
  dashB: 2,
  attack: 4,
  fall: 3,
  blockstun: 0,
  hitstun: 0,
  airHit: 0,
  knockdown: 3,
  wakeup: 0,
  parry: 0,
  parryFail: 2,
  throw: 2,
  thrown: 0,
  throwTech: 2,
  ko: 0,
  win: 4,
  intro: 0,
};

/** Fuerza visual de cada tipo de golpe recibido (retroceso del cuerpo y vibración de hitstop, en px). */
const IMPACT = {
  light: { recoil: 0.55, shake: 2.5 },
  heavy: { recoil: 1, shake: 4.5 },
  super: { recoil: 1.2, shake: 5 },
  blockLight: { recoil: 0.2, shake: 1.5 },
  blockHeavy: { recoil: 0.4, shake: 2.5 },
} as const;

/** Estiramiento en el frame de impacto (fracción del tamaño, en la dirección del golpe). */
export const STRIKE_STRETCH = { light: 0.04, heavy: 0.07, special: 0.06 } as const;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export class FighterAnimator {
  /** Pose que se dibuja este tick. */
  pose: Pose | null = null;
  /** Escala horizontal extra (1 = normal); la vertical se compensa para conservar el volumen. */
  stretch = 1;
  /** Desplazamiento horizontal del sprite por la vibración de hitstop (px). */
  jitter = 0;
  /** 1 = el personaje se dibuja en blanco este tick (destello de impacto). */
  flash = 0;

  private from: Pose | null = null;
  private blendT = 0;
  private blendN = 0;
  private prevState: FState | null = null;
  private prevMf = 0;
  private prevT = -1;
  private prevHitstop = 0;
  private hitstopTotal = 0;
  private recoil = 0;
  private shakeAmp = 0;
  private pendingImpact: keyof typeof IMPACT | null = null;

  reset(): void {
    this.pose = null;
    this.from = null;
    this.blendT = this.blendN = 0;
    this.prevState = null;
    this.prevMf = 0;
    this.prevT = -1;
    this.prevHitstop = this.hitstopTotal = 0;
    this.recoil = this.shakeAmp = 0;
    this.pendingImpact = null;
    this.stretch = 1;
    this.jitter = 0;
    this.flash = 0;
  }

  /** Eventos del tick que afectan a ESTE personaje como defensor (se llama antes de `tick`). */
  onEvents(events: SimEvent[], side: 0 | 1): void {
    for (const e of events) {
      if (e.side === side) continue; // e.side = atacante
      if (e.type === "hit" || e.type === "ko") this.pendingImpact = e.strength === "super" ? "super" : e.strength === "heavy" || e.type === "ko" ? "heavy" : "light";
      else if (e.type === "block") this.pendingImpact = e.strength === "light" ? "blockLight" : "blockHeavy";
    }
  }

  /** Calcula la pose de este tick. `flashes` = opción de accesibilidad de destellos. */
  tick(f: FighterState, simFrame: number, flashes = true): void {
    const target = poseFor(f, simFrame);
    const advanced = f.t !== this.prevT || f.mf !== this.prevMf || f.state !== this.prevState;
    const newAttack = f.state === "attack" && this.prevState === "attack" && f.mf < this.prevMf;

    if (this.pose && (f.state !== this.prevState || newAttack)) {
      let n = BLEND_IN[f.state];
      if (f.state === "attack" && f.move) {
        // La mezcla termina antes del primer frame activo: lo que se ve en el impacto es la pose de golpe.
        const mv = getMove(f.char, f.move);
        n = Math.min(n, Math.max(0, mv.startup - 2));
      }
      this.from = n > 0 ? this.pose : null;
      this.blendN = n;
      this.blendT = 0;
    }

    if (advanced && this.from) this.blendT++;
    let pose = target;
    if (this.from && this.blendT < this.blendN) pose = lerpPose(this.from, target, easeOut(this.blendT / this.blendN));
    else this.from = null;

    // Impacto recibido: retroceso y vibración (el corte seco a la pose de golpe ya lo hizo BLEND_IN = 0).
    if (this.pendingImpact) {
      const imp = IMPACT[this.pendingImpact];
      this.recoil = Math.max(this.recoil, imp.recoil);
      this.shakeAmp = imp.shake;
      this.pendingImpact = null;
    }
    if (f.hitstop > this.prevHitstop) this.hitstopTotal = f.hitstop;
    if (this.recoil > 0.01) {
      const r = this.recoil;
      pose = { ...pose, torso: pose.torso - 12 * r, head: pose.head - 14 * r, hx: pose.hx - 5 * r };
      // Se sostiene durante el hitstop y se suelta al reanudarse.
      if (advanced && f.hitstop === 0) this.recoil *= 0.8;
    } else this.recoil = 0;

    // Vibración de hitstop: alterna de lado y decae con los frames que quedan.
    const frozenHit = f.hitstop > 0 && (f.state === "hitstun" || f.state === "airHit" || f.state === "ko" || f.state === "thrown" || f.state === "blockstun");
    if (frozenHit && this.hitstopTotal > 0) {
      const k = f.hitstop / this.hitstopTotal;
      this.jitter = (f.hitstop % 2 === 0 ? 1 : -1) * this.shakeAmp * (0.35 + 0.65 * k);
      // Destello: un "pop" blanco limpio al principio del hitstop (no parpadeo continuo).
      const elapsed = this.hitstopTotal - f.hitstop;
      this.flash = flashes && f.state !== "blockstun" && elapsed < (this.hitstopTotal >= 8 ? 3 : 2) ? 1 : 0;
    } else {
      this.jitter = 0;
      this.flash = 0;
    }

    // Exageración del atacante en los 2 primeros frames activos.
    this.stretch = 1;
    if (f.state === "attack" && f.move) {
      const mv = getMove(f.char, f.move);
      if (mv.hitboxes.length && f.mf >= mv.startup && f.mf <= mv.startup + 1) {
        const amt = mv.kind === "special" || mv.kind === "super" ? STRIKE_STRETCH.special : mv.strength === "heavy" ? STRIKE_STRETCH.heavy : STRIKE_STRETCH.light;
        this.stretch = 1 + amt * (f.mf === mv.startup ? 1 : 0.5);
      }
    }

    this.pose = pose;
    this.prevState = f.state;
    this.prevMf = f.mf;
    this.prevT = f.t;
    this.prevHitstop = f.hitstop;
  }
}
