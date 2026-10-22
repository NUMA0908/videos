import { describe, expect, it } from "vitest";
import { Cpu, CPU_LEVELS } from "../src/ai/cpu";
import { Dummy } from "../src/ai/dummy";
import { createMatch } from "../src/sim/state";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { HK, LP, placeAt, readyMatch } from "./helpers";

/** Juega un partido completo CPU vs CPU. Devuelve el estado final. */
export function cpuMatch(c0: string, c1: string, l0: number, l1: number, seed: number, maxFrames = 60 * 60 * 6): GameState {
  const s = createMatch({ chars: [c0, c1], mode: "versus" }, seed);
  const a = new Cpu(CPU_LEVELS[l0], 0, seed * 3 + 1);
  const b = new Cpu(CPU_LEVELS[l1], 1, seed * 5 + 2);
  for (let i = 0; i < maxFrames && s.round.phase !== "over"; i++) stepInPlace(s, a.input(s), b.input(s));
  return s;
}

describe("CPU", () => {
  it("juega partidos completos sin errores y alguien gana", () => {
    for (const [c0, c1] of [["rayo", "chispa"], ["muralla", "rayo"], ["chispa", "muralla"]]) {
      const s = cpuMatch(c0, c1, 1, 1, 7);
      expect(s.round.phase).toBe("over");
      expect([0, 1, 2]).toContain(s.round.matchWinner);
    }
  });

  it("es determinista con la misma semilla", () => {
    const a = cpuMatch("rayo", "chispa", 1, 1, 3);
    const b = cpuMatch("rayo", "chispa", 1, 1, 3);
    expect(a.frame).toBe(b.frame);
    expect(a.round.wins).toEqual(b.round.wins);
  });

  it("la dificultad importa: Difícil gana a Fácil la mayoría de las veces", () => {
    let hardWins = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const s = cpuMatch("rayo", "rayo", 2, 0, 100 + i);
      if (s.round.matchWinner === 0) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(Math.ceil(N * 0.7));
  });
});

describe("muñeco de entrenamiento", () => {
  it("modo bloquear: bloquea jab y barrida", () => {
    for (const atk of [LP, 0x02 | HK]) {
      const s = placeAt(readyMatch(), 80);
      const d = new Dummy(1);
      d.mode = "block";
      let blocked = false;
      for (let i = 0; i < 40; i++) {
        stepInPlace(s, i === 0 ? atk : atk & 0x02, d.input(s));
        if (s.events.some((e) => e.type === "block")) blocked = true;
      }
      expect(blocked).toBe(true);
    }
  });

  it("modo parry: parria el golpe", () => {
    const s = placeAt(readyMatch(), 110);
    const d = new Dummy(1);
    d.mode = "parry";
    let parried = false;
    for (let i = 0; i < 40; i++) {
      stepInPlace(s, i === 0 ? HK : 0, d.input(s));
      if (s.events.some((e) => e.type === "parry")) parried = true;
    }
    expect(parried).toBe(true);
  });
});
