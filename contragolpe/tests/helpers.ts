import { TUNING } from "../src/data/tuning";
import { Btn } from "../src/sim/input";
import { createMatch } from "../src/sim/state";
import { stepInPlace } from "../src/sim/step";
import type { GameState, MatchConfig } from "../src/sim/types";

export const { UP, DOWN, LEFT, RIGHT, LP, HP, LK, HK, PARRY, SP } = Btn;

/** Partida ya en fase de pelea (salta la intro). */
export function readyMatch(config: Partial<MatchConfig> = {}, seed = 7): GameState {
  const s = createMatch(config, seed);
  for (let i = 0; i < TUNING.round.introFrames + 1; i++) stepInPlace(s, 0, 0);
  if (s.round.phase !== "fight") throw new Error("la intro no terminó");
  return s;
}

/** Avanza n frames con inputs fijos (o funciones por frame). */
export function run(
  s: GameState,
  n: number,
  in0: number | ((i: number) => number) = 0,
  in1: number | ((i: number) => number) = 0,
): GameState {
  for (let i = 0; i < n; i++) {
    stepInPlace(s, typeof in0 === "function" ? in0(i) : in0, typeof in1 === "function" ? in1(i) : in1);
  }
  return s;
}

/** Secuencia de inputs (un bitmask por frame). */
export function feed(s: GameState, seq0: number[], seq1: number[] = []): GameState {
  const n = Math.max(seq0.length, seq1.length);
  for (let i = 0; i < n; i++) stepInPlace(s, seq0[i] ?? 0, seq1[i] ?? 0);
  return s;
}

/** Pseudo-aleatorio simple para generar inputs de prueba reproducibles. */
export function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

/** Recorre el estado y devuelve las rutas de los números no enteros. */
export function nonIntegerPaths(value: unknown, path = "state"): string[] {
  if (typeof value === "number") return Number.isInteger(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonIntegerPaths(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => nonIntegerPaths(v, `${path}.${k}`));
  return [];
}

import { px } from "../src/sim/fixed";
import { NEUTRAL_STATES } from "../src/sim/fighter";
import type { FighterState } from "../src/sim/types";

/** Coloca a los personajes separados `gapPx` (centro a centro) en mitad del escenario, mirándose. */
export function placeAt(s: GameState, gapPx: number, centerPx = TUNING.stage.width / 2): GameState {
  const [a, b] = s.fighters;
  a.x = px(centerPx - gapPx / 2);
  b.x = px(centerPx + gapPx / 2);
  a.facing = 1;
  b.facing = -1;
  return s;
}

export const isActionable = (f: FighterState): boolean => NEUTRAL_STATES.has(f.state);

/**
 * Mide la ventaja real tras un contacto: el atacante (J1) pulsa `button` en el frame 0;
 * el defensor (J2) sostiene `defInput`. Devuelve frames de ventaja (positivo = atacante) y el tipo de contacto.
 */
export function measureAdvantage(
  s: GameState,
  button: number,
  defInput: number | ((i: number) => number),
  atkHold = 0,
): {
  adv: number;
  contact: string;
  hitstop: number;
  atkFree: number;
  defFree: number;
  contactFrame: number;
  counter: boolean;
  damage: number;
} {
  let contactFrame = -1;
  let counter = false;
  let damage = 0;
  let contact = "none";
  let atkFree = -1;
  let defFree = -1;
  let hitstop = 0;
  for (let i = 0; i < 200; i++) {
    const d = typeof defInput === "function" ? defInput(i) : defInput;
    stepInPlace(s, i === 0 ? button | atkHold : atkHold, d);
    const [a, b] = s.fighters;
    if (contactFrame < 0 && a.contact !== "none") {
      contactFrame = i;
      contact = a.contact;
      hitstop = a.hitstop;
      const ev = s.events.find((e) => e.type === "hit" && e.side === 0);
      counter = !!ev?.counter;
      damage = ev?.damage ?? 0;
    }
    if (contactFrame >= 0) {
      if (atkFree < 0 && isActionable(a)) atkFree = i;
      if (defFree < 0 && isActionable(b)) defFree = i;
      if (atkFree >= 0 && defFree >= 0) break;
    }
  }
  if (contactFrame < 0) throw new Error("el ataque no conectó");
  return { adv: defFree - atkFree, contact, hitstop, atkFree, defFree, contactFrame, counter, damage };
}
