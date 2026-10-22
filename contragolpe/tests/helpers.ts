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
