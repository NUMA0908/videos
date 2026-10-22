import type { SimEvent } from "../sim/types";

/**
 * Vibración del mando. Vive en la capa de efectos (como las partículas): reacciona a `state.events`
 * y nunca escribe en la simulación. Si el mando no tiene `vibrationActuator`, no hace nada.
 *
 * Reglas:
 * - Corta y con peso: golpes ligeros apenas un toque, fuertes un golpe seco, súper y KO largos.
 * - Proporcional: la intensidad del ajuste escala las magnitudes.
 * - **No se acumula**: mientras dura una vibración, otra más débil se ignora (un golpe de varios impactos
 *   durante el hitstop no encadena cinco vibraciones); solo una más fuerte la sustituye.
 */
export interface RumbleEffect {
  /** Motor grande (graves) y pequeño (agudos), 0..1. */
  strong: number;
  weak: number;
  /** Duración en ms. */
  ms: number;
}

export const RUMBLE: Record<"hitLight" | "hitHeavy" | "hitSuper" | "counter" | "block" | "parry" | "super" | "ko" | "koWin" | "throw", RumbleEffect> = {
  hitLight: { strong: 0.22, weak: 0.38, ms: 70 },
  hitHeavy: { strong: 0.6, weak: 0.45, ms: 140 },
  hitSuper: { strong: 0.85, weak: 0.6, ms: 220 },
  counter: { strong: 0.75, weak: 0.55, ms: 170 },
  block: { strong: 0.05, weak: 0.22, ms: 50 },
  parry: { strong: 0, weak: 0.55, ms: 60 },
  super: { strong: 0.45, weak: 0.3, ms: 260 },
  ko: { strong: 1, weak: 0.8, ms: 480 },
  koWin: { strong: 0.25, weak: 0.25, ms: 200 },
  throw: { strong: 0.55, weak: 0.3, ms: 160 },
};

/** Qué vibración le toca a cada lado por un evento (null = ninguna). */
export function rumbleFor(e: SimEvent, side: 0 | 1): RumbleEffect | null {
  const victim = e.side !== side; // en golpes y bloqueos `side` es quien ataca
  switch (e.type) {
    case "hit":
      if (!victim) return null;
      if (e.counter) return RUMBLE.counter;
      return e.strength === "super" ? RUMBLE.hitSuper : e.strength === "heavy" ? RUMBLE.hitHeavy : RUMBLE.hitLight;
    case "block":
      return victim ? RUMBLE.block : null;
    case "throwHit":
      return victim ? RUMBLE.throw : null;
    case "parry":
    case "redParry":
      return victim ? null : RUMBLE.parry; // `side` es quien hace el parry
    case "super":
      return victim ? null : RUMBLE.super;
    case "ko":
      return victim ? RUMBLE.ko : RUMBLE.koWin;
    default:
      return null;
  }
}

interface Actuator {
  playEffect?: (type: string, params: Record<string, number>) => Promise<unknown>;
  reset?: () => Promise<unknown>;
}

/** Lo mínimo de un mando para vibrar (los tests usan objetos falsos). */
export interface RumblePad {
  vibrationActuator?: unknown;
}

export class Rumbler {
  enabled = true;
  /** 0..1: escala todas las magnitudes. */
  intensity = 1;
  /** Hasta cuándo (ms del reloj de presentación) dura la vibración de cada lado y con qué fuerza. */
  private until: [number, number] = [0, 0];
  private power: [number, number] = [0, 0];

  /**
   * Lanza la vibración de un efecto en un mando (si puede y si no hay ya una igual o más fuerte en curso).
   * `force`: la prueba de Opciones, que siempre suena.
   */
  play(pad: RumblePad | null | undefined, side: 0 | 1, fx: RumbleEffect, nowMs: number, force = false): boolean {
    if (!this.enabled || this.intensity <= 0 || !pad) return false;
    const power = Math.max(fx.strong, fx.weak);
    if (!force && nowMs < this.until[side] && power <= this.power[side]) return false;
    const act = pad.vibrationActuator as Actuator | undefined;
    if (!act || typeof act.playEffect !== "function") return false;
    this.until[side] = nowMs + fx.ms;
    this.power[side] = power;
    const k = this.intensity;
    try {
      act.playEffect("dual-rumble", { startDelay: 0, duration: fx.ms, strongMagnitude: Math.min(1, fx.strong * k), weakMagnitude: Math.min(1, fx.weak * k) })?.catch?.(() => {});
    } catch {
      // Algunos navegadores lanzan si el mando no lo admite: sin vibración, sin errores.
      return false;
    }
    return true;
  }

  /** Reparte los eventos de un tick a los mandos de cada lado. */
  onEvents(events: readonly SimEvent[], pads: [RumblePad | null, RumblePad | null], nowMs: number): void {
    if (!this.enabled) return;
    for (const e of events) {
      for (const side of [0, 1] as const) {
        const fx = rumbleFor(e, side);
        if (fx) this.play(pads[side], side, fx, nowMs);
      }
    }
  }

  /** Corta cualquier vibración (pausa, salir de la partida). */
  stop(pads: (RumblePad | null)[]): void {
    this.until = [0, 0];
    this.power = [0, 0];
    for (const p of pads) {
      const act = p?.vibrationActuator as Actuator | undefined;
      try {
        act?.reset?.()?.catch?.(() => {});
      } catch {
        // nada
      }
    }
  }
}
