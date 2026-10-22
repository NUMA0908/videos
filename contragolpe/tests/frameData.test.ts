import { describe, expect, it } from "vitest";
import { getChar, getMove } from "../src/data/characters";
import { blockAdvantage, hitAdvantage } from "../src/sim/frameData";
import { stepInPlace } from "../src/sim/step";
import { HK, HP, LK, LP, measureAdvantage, placeAt, readyMatch, RIGHT } from "./helpers";

const rayo = getChar("rayo");

describe("fórmulas de frame data (sección 5)", () => {
  it("ventaja = stun − ((active − 1) + recovery)", () => {
    const m = { startup: 4, active: 2, recovery: 6, blockstun: 8, hitstun: 12, strength: "light" as const };
    expect(blockAdvantage(m)).toBe(1);
    expect(hitAdvantage(m)).toBe(5);
  });

  it("la tabla base del diseño se cumple en los datos de Rayo", () => {
    const table: [string, number, number, number, number, number, number, number][] = [
      // id, startup, active, recovery, blockstun, hitstun, ventaja bloqueo, ventaja hit
      ["st_lp", 4, 2, 6, 8, 12, 1, 5],
      ["st_lk", 6, 3, 8, 10, 14, 0, 4],
      ["st_hp", 10, 3, 16, 14, 20, -4, 2],
      ["st_hk", 12, 4, 20, 16, 22, -7, -1],
    ];
    for (const [id, su, ac, rc, bs, hs, ob, oh] of table) {
      const m = getMove("rayo", id);
      expect([m.startup, m.active, m.recovery, m.blockstun, m.hitstun], id).toEqual([su, ac, rc, bs, hs]);
      expect(blockAdvantage(m), id).toBe(ob);
      expect(hitAdvantage(m), id).toBe(oh);
    }
    expect(hitAdvantage(getMove("rayo", "st_hk"), true)).toBe(5);
  });
});

describe("la simulación respeta las fórmulas", () => {
  const cases: [string, number, number][] = [
    ["st_lp", LP, 70],
    ["st_lk", LK, 80],
    ["st_hp", HP, 90],
    ["st_hk", HK, 110],
  ];

  for (const [id, btn, gap] of cases) {
    const mv = getMove("rayo", id);
    it(`${mv.name}: ventaja en bloqueo medida = ${blockAdvantage(mv)}`, () => {
      const s = placeAt(readyMatch(), gap);
      const r = measureAdvantage(s, btn, RIGHT);
      expect(r.contact).toBe("block");
      expect(r.adv).toBe(blockAdvantage(mv));
    });
    it(`${mv.name}: ventaja al pegar medida = ${hitAdvantage(mv)}`, () => {
      const s = placeAt(readyMatch(), gap);
      const r = measureAdvantage(s, btn, 0);
      expect(r.contact).toBe("hit");
      expect(r.adv).toBe(hitAdvantage(mv));
      expect(r.hitstop).toBe(mv.hitstop);
    });
  }

  it("counter hit: patada fuerte pasa de −1 a +5", () => {
    const s = placeAt(readyMatch(), 110);
    // J2 empieza su propia patada fuerte 2 frames después: está en startup cuando le llega el golpe.
    const r = measureAdvantage(s, HK, (i) => (i === 2 ? HK : 0));
    expect(r.contact).toBe("hit");
    expect(r.counter).toBe(true);
    expect(r.adv).toBe(5);
  });

  it("counter hit hace más daño", () => {
    const normal = measureAdvantage(placeAt(readyMatch(), 110), HK, 0);
    const ch = measureAdvantage(placeAt(readyMatch(), 110), HK, (i) => (i === 2 ? HK : 0));
    expect(normal.counter).toBe(false);
    expect(ch.damage).toBeGreaterThan(normal.damage);
  });
});

describe("riesgo y recompensa", () => {
  it("una patada fuerte bloqueada (−7) se castiga con un jab de 4 frames", () => {
    const probe = measureAdvantage(placeAt(readyMatch(), 110), HK, RIGHT);
    expect(probe.adv).toBe(-7);
    // Misma escena: J2 pulsa jab en su primer frame libre; J1 sigue recuperándose y se lo come.
    const s = placeAt(readyMatch(), 110);
    let punished = false;
    for (let i = 0; i < probe.defFree + 10; i++) {
      stepInPlace(s, i === 0 ? HK : 0, i === probe.defFree ? LP : i < probe.defFree ? RIGHT : 0);
      if (s.events.some((e) => e.type === "hit" && e.side === 1)) punished = true;
    }
    expect(punished).toBe(true);
  });

  it("un jab bloqueado (+1) gana el intercambio de jabs", () => {
    const probe = measureAdvantage(placeAt(readyMatch(), 70), LP, RIGHT);
    // Repetimos la escena: ambos pulsan jab antes de recuperarse y el buffer lo lanza en su primer frame libre.
    const s = placeAt(readyMatch(), 70);
    let p1Hit = false;
    let p2Hit = false;
    for (let i = 0; i < probe.defFree + 8; i++) {
      const press = i === probe.atkFree - 2 ? LP : 0;
      stepInPlace(s, i === 0 ? LP : press, i < probe.contactFrame + 2 ? RIGHT : press);
      if (i > probe.contactFrame && s.events.some((e) => e.type === "hit" && e.side === 0)) p1Hit = true;
      if (s.events.some((e) => e.type === "hit" && e.side === 1)) p2Hit = true;
    }
    expect(p1Hit).toBe(true);
    expect(p2Hit).toBe(false);
  });

  it("los golpes fuertes tienen más alcance que los ligeros", () => {
    const reach = (id: string) => Math.max(...getMove("rayo", id).hitboxes.flatMap((t) => t.boxes.map((b) => b.x + b.w)));
    expect(reach("st_hk")).toBeGreaterThan(reach("st_lk"));
    expect(reach("st_hp")).toBeGreaterThan(reach("st_lp"));
    expect(rayo.moves.cr_hk.guard).toBe("low");
  });
});


describe("presupuesto de game feel", () => {
  it("hitstop proporcional: ligeros 3–5 frames, fuertes 8–11", () => {
    for (const ch of [getChar("rayo")]) {
      for (const m of Object.values(ch.moves)) {
        if (m.kind !== "normal") continue;
        if (m.strength === "light") expect(m.hitstop, m.id).toBeGreaterThanOrEqual(3);
        if (m.strength === "light") expect(m.hitstop, m.id).toBeLessThanOrEqual(5);
        if (m.strength === "heavy") expect(m.hitstop, m.id).toBeGreaterThanOrEqual(8);
        if (m.strength === "heavy") expect(m.hitstop, m.id).toBeLessThanOrEqual(11);
      }
    }
  });
});
