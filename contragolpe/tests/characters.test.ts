import { describe, expect, it } from "vitest";
import { dirMask, motionFrames } from "../src/ai/macros";
import { CHARACTERS, getChar } from "../src/data/characters";
import { TUNING } from "../src/data/tuning";
import { Btn, MOTIONS } from "../src/sim/input";
import { stepInPlace } from "../src/sim/step";
import type { SimEvent } from "../src/sim/types";
import { HP, HK, LEFT, LK, LP, placeAt, readyMatch, RIGHT, UP } from "./helpers";

const BUTTON: Record<string, number> = { LP: Btn.LP, HP: Btn.HP, LK: Btn.LK, HK: Btn.HK };
const MOTION_DIRS: Record<string, number[]> = { qcf: [2, 3, 6], qcb: [2, 1, 4], dp: [6, 2, 3], hcb: [6, 3, 2, 1, 4] };

describe("datos de personajes", () => {
  for (const ch of CHARACTERS) {
    it(`${ch.id}: todas las referencias existen`, () => {
      for (const st of ["stand", "crouch", "air"] as const)
        for (const b of ["LP", "HP", "LK", "HK"] as const) expect(ch.moves[ch.normals[st][b]], `${st}.${b}`).toBeDefined();
      for (const sp of ch.specials) expect(ch.moves[sp.move], sp.move).toBeDefined();
      for (const id of Object.values(ch.simple)) expect(ch.moves[id], id).toBeDefined();
      expect(ch.moves[ch.super].meterCost).toBe(TUNING.meter.max);
      expect(ch.moves[ch.throw].kind).toBe("throw");
      for (const m of Object.values(ch.moves)) {
        if (m.projectile) expect(ch.projectiles[m.projectile.kind], `${m.id} → ${m.projectile.kind}`).toBeDefined();
        expect(m.startup).toBeGreaterThan(0);
      }
    });
  }

  it("identidades: vida y velocidad distintas", () => {
    const [rayo, chispa, muralla] = ["rayo", "chispa", "muralla"].map(getChar);
    expect(chispa.health).toBeLessThan(rayo.health);
    expect(muralla.health).toBeGreaterThan(rayo.health);
    expect(chispa.walkF).toBeGreaterThan(rayo.walkF);
    expect(muralla.walkF).toBeLessThan(rayo.walkF);
    expect(chispa.moves.st_lp.startup).toBeLessThan(rayo.moves.st_lp.startup);
    expect(muralla.moves.st_hp.damage).toBeGreaterThan(rayo.moves.st_hp.damage);
  });
});

describe("cada especial sale con su motion", () => {
  for (const ch of CHARACTERS) {
    for (const sp of ch.specials) {
      it(`${ch.id}: ${sp.motion} + ${sp.button} → ${sp.move}`, () => {
        const s = placeAt(readyMatch({ chars: [ch.id, "rayo"] }), 420);
        const seq = motionFrames(MOTION_DIRS[sp.motion], BUTTON[sp.button], 1, 2);
        let started = false;
        for (let i = 0; i < seq.length + 2; i++) {
          stepInPlace(s, seq[i] ?? 0, 0);
          if (s.fighters[0].move === sp.move) started = true;
        }
        expect(started).toBe(true);
      });
    }
    it(`${ch.id}: la súper conecta y hace daño alto`, () => {
      const s = placeAt(readyMatch({ chars: [ch.id, "rayo"] }), 160);
      s.fighters[0].meter = TUNING.meter.max;
      for (let i = 0; i < 260; i++) stepInPlace(s, i === 0 ? HP | HK : 0, 0);
      expect(1000 - s.fighters[1].health).toBeGreaterThan(220);
    });
    it(`${ch.id}: el agarre conecta de cerca`, () => {
      const s = placeAt(readyMatch({ chars: [ch.id, "rayo"] }), 76);
      const ev: SimEvent[] = [];
      for (let i = 0; i < 60; i++) {
        stepInPlace(s, i === 0 ? LP | LK : 0, 0);
        ev.push(...s.events);
      }
      expect(ev.some((e) => e.type === "throwHit")).toBe(true);
    });
    it(`${ch.id}: los cuatro normales de pie conectan de cerca`, () => {
      for (const b of [LP, HP, LK, HK]) {
        const s = placeAt(readyMatch({ chars: [ch.id, "rayo"] }), 84);
        let hit = false;
        for (let i = 0; i < 30; i++) {
          stepInPlace(s, i === 0 ? b : 0, 0);
          if (s.events.some((e) => e.type === "hit" && e.side === 0)) hit = true;
        }
        expect(hit, `botón ${b}`).toBe(true);
      }
    });
  }
});

describe("Muralla (grappler)", () => {
  it("el Abrazo de Oso no se puede escapar", () => {
    const s = placeAt(readyMatch({ chars: ["muralla", "rayo"] }), 90);
    const seq = motionFrames(MOTION_DIRS.hcb, LP, 1, 2);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 80; i++) {
      stepInPlace(s, seq[i] ?? 0, i > seq.length && i < seq.length + 12 ? LP | LK : 0);
      ev.push(...s.events);
    }
    expect(ev.some((e) => e.type === "throwHit" && e.side === 0)).toBe(true);
    expect(ev.some((e) => e.type === "tech")).toBe(false);
    expect(1000 - s.fighters[1].health).toBe(180);
  });

  it("el Atrapa Cielos atrapa a un rival que salta (y no a uno en el suelo)", () => {
    let caught = false;
    for (let delay = 6; delay < 30 && !caught; delay++) {
      const s = placeAt(readyMatch({ chars: ["muralla", "rayo"] }), 200);
      const seq = [...new Array(delay).fill(0), ...motionFrames(MOTION_DIRS.dp, HP, 1, 2)];
      for (let i = 0; i < 90; i++) {
        stepInPlace(s, seq[i] ?? 0, i < 3 ? UP | LEFT : 0);
        if (s.events.some((e) => e.type === "throwHit" && e.side === 0)) caught = true;
      }
    }
    expect(caught).toBe(true);
    const ground = placeAt(readyMatch({ chars: ["muralla", "rayo"] }), 100);
    const seq = motionFrames(MOTION_DIRS.dp, HP, 1, 2);
    let grabbed = false;
    for (let i = 0; i < 60; i++) {
      stepInPlace(ground, seq[i] ?? 0, 0);
      if (ground.events.some((e) => e.type === "throw")) grabbed = true;
    }
    expect(grabbed).toBe(false);
  });

  it("la Embestida encaja un golpe con su armadura", () => {
    const s = placeAt(readyMatch({ chars: ["muralla", "rayo"] }), 160);
    const seq = motionFrames(MOTION_DIRS.qcf, HK, 1, 2);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      stepInPlace(s, seq[i] ?? 0, i === 10 ? LP : 0);
      ev.push(...s.events);
    }
    expect(ev.some((e) => e.type === "armor" && e.side === 0)).toBe(true);
    expect(ev.some((e) => e.type === "hit" && e.side === 0)).toBe(true);
  });
});

describe("Chispa (rushdown)", () => {
  it("la Rodada atraviesa un proyectil", () => {
    let passed = false;
    for (let delay = 0; delay < 30 && !passed; delay++) {
      const s = placeAt(readyMatch({ chars: ["chispa", "rayo"] }), 360);
      const roll = [...new Array(delay).fill(0), ...motionFrames(MOTION_DIRS.qcb, HK, 1, 2)];
      const fb = motionFrames([2, 3, 6], HP, -1, 2);
      let hitByFb = false;
      let crossed = false;
      for (let i = 0; i < 90; i++) {
        stepInPlace(s, roll[i] ?? 0, fb[i] ?? 0);
        if (s.events.some((e) => e.type === "hit" && e.side === 1)) hitByFb = true;
        const p = s.projectiles[0];
        if (p && p.x < s.fighters[0].x && s.fighters[0].move?.startsWith("roll")) crossed = true;
      }
      passed = !hitByFb && crossed;
    }
    expect(passed).toBe(true);
  });

  it("su Chispazo se apaga antes de cruzar la pantalla", () => {
    const s = placeAt(readyMatch({ chars: ["chispa", "rayo"] }), 700);
    const seq = motionFrames([2, 3, 6], HP, 1, 2);
    for (let i = 0; i < 80; i++) stepInPlace(s, seq[i] ?? 0, 0);
    expect(s.projectiles.length).toBe(0);
    expect(s.fighters[1].health).toBe(1000);
  });

  it("el overhead (→+HK) le gana al bloqueo agachado", () => {
    const s = placeAt(readyMatch({ chars: ["chispa", "rayo"] }), 110);
    let hit = false;
    for (let i = 0; i < 40; i++) {
      stepInPlace(s, i === 0 ? dirMask(6, 1) | HK : 0, RIGHT | Btn.DOWN);
      if (s.events.some((e) => e.type === "hit" && e.side === 0)) hit = true;
    }
    expect(hit).toBe(true);
  });
});

void MOTIONS;
