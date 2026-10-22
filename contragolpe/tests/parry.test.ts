import { describe, expect, it } from "vitest";
import { getMove } from "../src/data/characters";
import { TUNING, type ParryDifficulty } from "../src/data/tuning";
import { px } from "../src/sim/fixed";
import { stepInPlace } from "../src/sim/step";
import type { GameState, SimEvent } from "../src/sim/types";
import { DOWN, HK, HP, LEFT, LK, LP, motion, PARRY, placeAt, readyMatch, RIGHT, UP } from "./helpers";

/** Frame (índice de paso) en el que conecta el ataque de J1 si J2 no hace nada. */
function hitFrame(make: () => GameState, atk: (i: number) => number): number {
  const s = make();
  for (let i = 0; i < 120; i++) {
    stepInPlace(s, atk(i), 0);
    if (s.events.some((e) => (e.type === "hit" || e.type === "block") && e.side === 0)) return i;
  }
  throw new Error("no conectó");
}

/** J2 pulsa PARRY (con `dir`) en el frame `p`. Devuelve los eventos. */
function tryAt(make: () => GameState, atk: (i: number) => number, p: number, dir = 0, frames = 60): SimEvent[] {
  const s = make();
  const ev: SimEvent[] = [];
  for (let i = 0; i < frames; i++) {
    stepInPlace(s, atk(i), i === p ? PARRY | dir : dir);
    ev.push(...s.events);
  }
  return ev;
}

const parried = (ev: SimEvent[]) => ev.some((e) => e.type === "parry" && e.side === 1);
const gotHit = (ev: SimEvent[]) => ev.find((e) => e.type === "hit" && e.side === 0);

describe("ventana de parry: frame exacto de éxito y de fallo", () => {
  const jab = (i: number) => (i === 20 ? LP : 0);
  for (const diff of ["easy", "normal", "hardcore"] as ParryDifficulty[]) {
    const W = TUNING.parry.windows[diff];
    const make = () => placeAt(readyMatch({ parry: diff }), 70);
    const H = hitFrame(make, jab);

    it(`${diff} (${W} frames): el primer frame válido es H−${W - 1}`, () => {
      expect(parried(tryAt(make, jab, H - W + 1))).toBe(true);
    });
    it(`${diff}: un frame antes es demasiado pronto (y el golpe es counter hit)`, () => {
      const ev = tryAt(make, jab, H - W);
      expect(parried(ev)).toBe(false);
      expect(ev.some((e) => e.type === "parryFail" && e.side === 1)).toBe(true);
      expect(gotHit(ev)?.counter).toBe(true);
    });
    it(`${diff}: pulsar en el mismo frame del impacto todavía vale`, () => {
      expect(parried(tryAt(make, jab, H))).toBe(true);
    });
    it(`${diff}: un frame después ya es tarde`, () => {
      const ev = tryAt(make, jab, H + 1);
      expect(parried(ev)).toBe(false);
      expect(gotHit(ev)).toBeDefined();
    });
  }
});

describe("efecto del parry", () => {
  const make = () => placeAt(readyMatch(), 70);
  const jab = (i: number) => (i === 0 ? LP : 0);

  it("no hace daño, congela 8 frames y da medidor", () => {
    const s = make();
    let parryStep = -1;
    for (let i = 0; i < 40; i++) {
      stepInPlace(s, jab(i), i === 2 ? PARRY : 0);
      if (parryStep < 0 && s.events.some((e) => e.type === "parry")) {
        parryStep = i;
        expect(s.fighters[1].hitstop).toBe(TUNING.parry.freeze);
        expect(s.fighters[0].hitstop).toBe(TUNING.parry.freeze);
      }
    }
    expect(parryStep).toBeGreaterThan(0);
    expect(s.fighters[1].health).toBe(1000);
    expect(s.fighters[1].meter).toBe(TUNING.parry.meterGain);
  });

  it("el defensor actúa en cuanto termina el congelamiento; el atacante arrastra +10 frames", () => {
    const s = make();
    let p = -1;
    let defFree = -1;
    let atkFree = -1;
    for (let i = 0; i < 60; i++) {
      stepInPlace(s, jab(i), i === 2 ? PARRY : 0);
      if (p < 0 && s.events.some((e) => e.type === "parry")) p = i;
      if (p >= 0 && defFree < 0 && s.fighters[1].state === "idle" && s.fighters[1].hitstop === 0) defFree = i;
      if (p >= 0 && atkFree < 0 && s.fighters[0].state === "idle") atkFree = i;
    }
    const mv = getMove("rayo", "st_lp");
    // defFree = último frame congelado: el defensor puede actuar en el siguiente.
    expect(defFree - p).toBe(TUNING.parry.freeze);
    // Ventaja = (frames que le quedaban al atacante + 10) tras el congelamiento.
    expect(atkFree - (defFree + 1)).toBe(mv.active - 1 + mv.recovery + TUNING.parry.attackerExtraRecovery);
  });

  it("parriar una patada fuerte permite castigar con un directo", () => {
    const s = placeAt(readyMatch(), 110);
    const H = hitFrame(() => placeAt(readyMatch(), 110), (i) => (i === 0 ? HK : 0));
    let punished = false;
    for (let i = 0; i < 80; i++) {
      stepInPlace(s, i === 0 ? HK : 0, i === H - 2 ? PARRY : i === H + 4 ? HP : 0);
      if (s.events.some((e) => e.type === "hit" && e.side === 1)) punished = true;
    }
    expect(punished).toBe(true);
    expect(s.fighters[1].health).toBe(1000);
  });

  it("fallar deja 20 frames de recuperación y enfriamiento antes de poder repetir", () => {
    const s = placeAt(readyMatch(), 400);
    stepInPlace(s, 0, PARRY);
    const W = TUNING.parry.windows.normal;
    for (let i = 0; i < W; i++) stepInPlace(s, 0, 0);
    expect(s.fighters[1].state).toBe("parryFail");
    // Durante el fallo y el enfriamiento, pulsar parry no hace nada.
    for (let i = 0; i < TUNING.parry.failRecovery + 2; i++) stepInPlace(s, 0, i % 2 ? PARRY : 0);
    expect(s.fighters[1].state).not.toBe("parry");
    for (let i = 0; i < TUNING.parry.cooldown + 2; i++) stepInPlace(s, 0, 0);
    stepInPlace(s, 0, PARRY);
    expect(s.fighters[1].state).toBe("parry");
  });
});

describe("alturas y casos especiales", () => {
  const low = (i: number) => (i === 0 ? DOWN | LK : DOWN);

  it("un ataque bajo no se parria de pie (y es counter hit)", () => {
    const make = () => placeAt(readyMatch(), 80);
    const H = hitFrame(make, low);
    const ev = tryAt(make, low, H - 2);
    expect(parried(ev)).toBe(false);
    expect(gotHit(ev)?.counter).toBe(true);
  });

  it("↓ + PARRY desvía el ataque bajo", () => {
    const make = () => placeAt(readyMatch(), 80);
    const H = hitFrame(make, low);
    expect(parried(tryAt(make, low, H - 2, DOWN))).toBe(true);
  });

  it("el parry agachado no sirve contra un ataque en salto", () => {
    const jumpIn = (i: number) => (i < 3 ? UP | RIGHT : i === 34 ? HK : 0);
    const make = () => placeAt(readyMatch(), 170);
    const H = hitFrame(make, jumpIn);
    expect(parried(tryAt(make, jumpIn, H - 2, DOWN, 80))).toBe(false);
    expect(parried(tryAt(make, jumpIn, H - 2, 0, 80))).toBe(true);
  });

  it("funciona contra proyectiles", () => {
    const fb = (i: number) => motion([2, 3, 6], HP)[i] ?? 0;
    const make = () => placeAt(readyMatch(), 300);
    const H = hitFrame(make, fb);
    const s = make();
    for (let i = 0; i < 60; i++) stepInPlace(s, fb(i), i === H - 3 ? PARRY : 0);
    expect(s.fighters[1].health).toBe(1000);
    expect(s.projectiles.length).toBe(0);
  });

  it("parry en el aire (ventana más corta) contra un anti-aéreo", () => {
    // J2 salta hacia J1; J1 hace gancho agachado. Buscamos el frame del golpe y J2 parria en el aire.
    const jump = (i: number) => (i < 3 ? UP | LEFT : 0);
    const run = (aaAt: number, p: number) => {
      const s = placeAt(readyMatch(), 160);
      const ev: SimEvent[] = [];
      let airborneAtParry = false;
      for (let i = 0; i < 70; i++) {
        stepInPlace(s, i === aaAt ? DOWN | HP : DOWN, jump(i) | (i === p ? PARRY : 0));
        if (i === p) airborneAtParry = s.fighters[1].y > 0;
        ev.push(...s.events);
      }
      return { ev, airborneAtParry };
    };
    // Un anti-aéreo que de verdad conecta...
    let aaAt = -1;
    for (let a = 6; a < 34 && aaAt < 0; a++) if (gotHit(run(a, -1).ev)) aaAt = a;
    expect(aaAt).toBeGreaterThan(0);
    // ...y algún frame en el que J2, en el aire, lo desvía.
    let ok = false;
    for (let p = 4; p < 40 && !ok; p++) {
      const r = run(aaAt, p);
      ok = r.airborneAtParry && parried(r.ev);
    }
    expect(ok).toBe(true);
  });

  it("los agarres le ganan al parry", () => {
    const s = placeAt(readyMatch(), 74);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 40; i++) {
      stepInPlace(s, i === 1 ? LP | LK : 0, i === 0 ? PARRY : 0);
      ev.push(...s.events);
    }
    expect(ev.some((e) => e.type === "throw" && e.side === 0)).toBe(true);
  });

  it("red parry: en blockstun, por 1/4 de medidor", () => {
    const chain: Record<number, number> = { 0: LP, 7: LP };
    const atk = (i: number) => chain[i] ?? 0;
    const probe = placeAt(readyMatch(), 66);
    let secondHit = -1;
    let blocks = 0;
    for (let i = 0; i < 40 && secondHit < 0; i++) {
      stepInPlace(probe, atk(i), RIGHT);
      if (probe.events.some((e) => e.type === "block")) {
        blocks++;
        if (blocks === 2) secondHit = i;
      }
    }
    expect(secondHit).toBeGreaterThan(0);
    const run = (meter: number) => {
      const s = placeAt(readyMatch(), 66);
      s.fighters[1].meter = meter;
      const ev: SimEvent[] = [];
      for (let i = 0; i < 40; i++) {
        stepInPlace(s, atk(i), RIGHT | (i === secondHit - 1 ? PARRY : 0));
        ev.push(...s.events);
      }
      return { ev, s };
    };
    const ok = run(500);
    expect(ok.ev.some((e) => e.type === "redParry")).toBe(true);
    expect(ok.s.fighters[1].meter).toBe(500 - TUNING.parry.red.cost + 4); // + medidor por el primer bloqueo
    const broke = run(100);
    expect(broke.ev.some((e) => e.type === "redParry")).toBe(false);
  });

  it("se pueden parriar los 5 golpes de la súper (pulsando para cada uno)", () => {
    const s = placeAt(readyMatch(), 320);
    s.fighters[0].meter = TUNING.meter.max;
    let parries = 0;
    let prev = 0;
    for (let i = 0; i < 260; i++) {
      const def = s.fighters[1];
      const p = s.projectiles[0];
      // Defensor "perfecto": pulsa cuando el orbe está a punto de tocarle y puede actuar.
      const near = p && Math.abs(p.x - def.x) < px(120) && def.state === "idle" && def.hitstop === 0 && def.parryCooldown === 0;
      const input = near && prev === 0 ? PARRY : 0;
      prev = input;
      stepInPlace(s, i === 0 ? HP | HK : 0, input);
      parries += s.events.filter((e) => e.type === "parry").length;
    }
    expect(parries).toBe(5);
    expect(s.fighters[1].health).toBe(1000);
  });
});
