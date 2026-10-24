import { describe, expect, it } from "vitest";
import { Cpu, CPU_LEVELS } from "../src/ai/cpu";
import { Dummy } from "../src/ai/dummy";
import { createMatch } from "../src/sim/state";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { HK, HP, LP, placeAt, readyMatch } from "./helpers";

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

describe("CPU humana (sin trampas)", () => {
  it("el tiempo de reacción varía dentro de reaction ± spread y cambia poco a poco", () => {
    for (const lv of CPU_LEVELS) {
      const s = createMatch({ chars: ["rayo", "chispa"], mode: "versus" }, 5);
      const a = new Cpu(lv, 0, 21);
      const b = new Cpu(CPU_LEVELS[1], 1, 22);
      const seen = new Set<number>();
      let prev = a.reactionNow;
      for (let i = 0; i < 3000 && s.round.phase !== "over"; i++) {
        stepInPlace(s, a.input(s), b.input(s));
        const r = a.reactionNow;
        expect(r).toBeGreaterThanOrEqual(lv.reaction - lv.reactionSpread);
        expect(r).toBeLessThanOrEqual(lv.reaction + lv.reactionSpread);
        expect(Math.abs(r - prev)).toBeLessThanOrEqual(1);
        prev = r;
        seen.add(r);
      }
      expect(seen.size, lv.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("hit-confirm a velocidad humana: no cancela antes de `confirm` frames reales tras el contacto", () => {
    const lv = { ...CPU_LEVELS[2], blindCancel: 0, combo: 1 };
    const s = placeAt(readyMatch({ chars: ["rayo", "rayo"] }), 110);
    const cpu = new Cpu(lv, 0, 4);
    // El directo (HP) lo pulsa la prueba; desde ahí, la CPU decide sola si cancela.
    let contactAt = -1;
    let specialAt = -1;
    for (let i = 0; i < 40; i++) {
      const out = cpu.input(s);
      const f = s.fighters[0];
      if (contactAt < 0 && f.contact === "hit") contactAt = i;
      stepInPlace(s, i === 0 ? HP : contactAt >= 0 ? out : 0, 0);
      if (specialAt < 0 && s.fighters[0].move === "fb_h") specialAt = i;
    }
    expect(contactAt).toBeGreaterThan(0);
    // Confirma el directo (su hitstop da tiempo) y sale el especial de remate...
    expect(specialAt).toBeGreaterThan(0);
    // ...pero no antes de reconocer el golpe (confirm − 2 como mínimo) + las 3 direcciones del motion.
    expect(specialAt - contactAt).toBeGreaterThanOrEqual(lv.confirm - 2 + 3);
  });

  it("cambia de plan cuando le va mal y lo mantiene cuando le va bien", () => {
    const lv = { ...CPU_LEVELS[2], adapt: 1 };
    const losing = readyMatch({ chars: ["rayo", "rayo"] });
    const a = new Cpu(lv, 0, 9);
    const plansLosing = new Set<string>();
    for (let i = 0; i < 1300; i++) {
      losing.fighters[0].health -= 1; // recibe daño sin hacer nada
      a.input(losing);
      plansLosing.add(a.plan);
    }
    expect(plansLosing.size).toBeGreaterThan(1);

    const winning = readyMatch({ chars: ["rayo", "rayo"] });
    const b = new Cpu(lv, 0, 9);
    for (let i = 0; i < 1300; i++) {
      winning.fighters[1].health -= 1;
      b.input(winning);
      expect(b.plan).toBe("costumbre");
    }
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
