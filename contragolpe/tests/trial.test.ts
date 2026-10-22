import { describe, expect, it } from "vitest";
import { TRIAL_LESSONS } from "../src/ai/trial";
import { Btn } from "../src/sim/input";
import { Rng } from "../src/sim/rng";
import { px } from "../src/sim/fixed";
import { stepInPlace } from "../src/sim/step";
import type { SimEvent } from "../src/sim/types";
import { placeAt, readyMatch } from "./helpers";

/** Ejecuta un intento de la lección: J2 sigue el guion; J1 usa `p1(i, state)`. */
function attempt(lessonIdx: number, p1: (i: number) => number, seed = 1, frames = 260): SimEvent[] {
  const L = TRIAL_LESSONS[lessonIdx];
  const s = placeAt(readyMatch({ mode: "trial", infiniteHealth: true, timer: false }), L.gap);
  s.fighters[1].meter = L.dummyMeter ?? 0;
  s.fighters[0].meter = L.playerMeter ?? 0;
  const script = L.script(-1, new Rng(seed));
  const ev: SimEvent[] = [];
  for (let i = 0; i < frames; i++) {
    stepInPlace(s, p1(i), script[i] ?? 0);
    ev.push(...s.events);
  }
  return ev;
}

describe("Trial de parry: todas las lecciones son jugables", () => {
  TRIAL_LESSONS.forEach((L, idx) => {
    it(`${idx + 1}. ${L.title}: el ataque del muñeco conecta`, () => {
      const hold = L.red ? Btn.LEFT | Btn.DOWN : 0;
      for (const seed of [1, 2, 3, 4]) {
        const ev = attempt(idx, () => hold, seed);
        const kind = L.red ? "block" : "hit";
        expect(ev.some((e) => e.type === kind && e.side === 1), `semilla ${seed}`).toBe(true);
      }
    });

    it(`${idx + 1}. ${L.title}: existe un timing que la supera`, () => {
      for (const seed of [1, 2, 3, 4]) {
        let solved = false;
        if (L.hitsPerAttempt > 1) {
          // Multi-golpe: pulsar cada vez que el proyectil esté cerca y se pueda actuar.
          for (let reach = 60; reach <= 160 && !solved; reach += 10) {
            const L2 = TRIAL_LESSONS[idx];
            const s = placeAt(readyMatch({ mode: "trial", infiniteHealth: true, timer: false }), L2.gap);
            s.fighters[1].meter = L2.dummyMeter ?? 0;
            const script = L2.script(-1, new Rng(seed));
            let parries = 0;
            let prev = 0;
            for (let i = 0; i < 300; i++) {
              const me = s.fighters[0];
              const p = s.projectiles[0];
              const near = p && Math.abs(p.x - me.x) < px(reach) && me.state === "idle" && me.hitstop === 0;
              const inp = near && !prev ? Btn.PARRY : 0;
              prev = inp;
              stepInPlace(s, inp, script[i] ?? 0);
              parries += s.events.filter((e) => e.type === "parry" && e.side === 0).length;
            }
            solved = parries >= L2.hitsPerAttempt;
          }
        } else {
          for (let p = 0; p < 120 && !solved; p++) {
            for (const dir of [0, Btn.DOWN]) {
              const hold = L.red ? Btn.LEFT | Btn.DOWN : 0;
              const ev = attempt(idx, (i) => hold | (i === p ? Btn.PARRY | dir : dir && i > p ? dir : 0), seed);
              const ok = L.red ? ev.some((e) => e.type === "redParry") : ev.some((e) => e.type === "parry" && e.side === 0);
              if (ok) {
                solved = true;
                break;
              }
            }
          }
        }
        expect(solved, `semilla ${seed}`).toBe(true);
      }
    });
  });
});
