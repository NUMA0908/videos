import { describe, expect, it } from "vitest";
import { ONE_TRICK_BOTS } from "../src/ai/bots";
import { Cpu, CPU_LEVELS } from "../src/ai/cpu";
import { CHARACTERS } from "../src/data/characters";
import { px } from "../src/sim/fixed";
import { Btn } from "../src/sim/input";
import { WALL_MAX } from "../src/sim/physics";
import { Rng } from "../src/sim/rng";
import { createMatch } from "../src/sim/state";
import { stepInPlace } from "../src/sim/step";

/** Versión ligera de `npm run sim` para que corra en cada `npm test`. */
describe("balance (simulación ligera)", () => {
  it("fuzzer: ningún combo supera 14 golpes ni el 55 % de la vida, en el centro ni en la esquina", () => {
    for (const ch of CHARACTERS) {
      for (const corner of [false, true]) {
        for (let k = 0; k < 40; k++) {
          const r = new Rng(123 + k * 17 + (corner ? 5 : 0));
          const s = createMatch({ chars: [ch.id, "rayo"], mode: "training", timer: false }, k + 1);
          while (s.round.phase !== "fight") stepInPlace(s, 0, 0);
          s.fighters[0].x = corner ? WALL_MAX - px(90) : px(740);
          s.fighters[1].x = corner ? WALL_MAX : px(830);
          s.fighters[0].meter = 1000;
          let cur = 0;
          let hold = 0;
          let maxHits = 0;
          let maxDmg = 0;
          for (let f = 0; f < 400; f++) {
            if (hold-- <= 0) {
              cur = r.pick([0, Btn.DOWN, Btn.DOWN | Btn.RIGHT, Btn.RIGHT]) | (r.chance(0.6) ? r.pick([Btn.LP, Btn.HP, Btn.LK, Btn.HK, Btn.SP, Btn.HP | Btn.HK]) : 0);
              hold = 1 + r.int(5);
            }
            stepInPlace(s, cur, 0);
            maxHits = Math.max(maxHits, s.fighters[1].comboHits);
            maxDmg = Math.max(maxDmg, s.fighters[1].comboDamage);
          }
          expect(maxHits, `${ch.id} ${corner ? "esquina" : "centro"} #${k}`).toBeLessThanOrEqual(14);
          expect(maxDmg, `${ch.id} ${corner ? "esquina" : "centro"} #${k}`).toBeLessThan(s.fighters[1].maxHealth * 0.55);
        }
      }
    }
  });

  it("tácticas triviales (saltar siempre, tortuga, parry a ciegas) pierden contra la CPU Difícil", () => {
    for (const name of ["saltador", "tortuga", "parrySpam"]) {
      let wins = 0;
      const N = 6;
      for (let k = 0; k < N; k++) {
        const me = CHARACTERS[k % 3].id;
        const s = createMatch({ chars: [me, CHARACTERS[(k + 1) % 3].id], mode: "versus" }, 300 + k);
        const bot = ONE_TRICK_BOTS[name](0, k);
        const cpu = new Cpu(CPU_LEVELS[2], 1, 400 + k);
        for (let f = 0; f < 60 * 60 * 6 && s.round.phase !== "over"; f++) stepInPlace(s, bot(s), cpu.input(s));
        if (s.round.matchWinner === 0) wins++;
      }
      expect(wins, name).toBeLessThanOrEqual(1);
    }
  });
});
