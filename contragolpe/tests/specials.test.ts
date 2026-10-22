import { describe, expect, it } from "vitest";
import { getMove } from "../src/data/characters";
import { TUNING } from "../src/data/tuning";
import { px } from "../src/sim/fixed";
import { stepInPlace } from "../src/sim/step";
import { DOWN, HK, HP, LK, LP, LEFT, motion, placeAt, playSeq, readyMatch, RIGHT, run, SP, UP } from "./helpers";

const QCF = [2, 3, 6];
const DP = [6, 2, 3];

describe("motion inputs y prioridad", () => {
  it("↓↘→ + LP lanza la Onda lenta; + HP la rápida", () => {
    const s = placeAt(readyMatch(), 400);
    const ev = playSeq(s, motion(QCF, LP), 0, 14);
    expect(ev.some((e) => e.type === "projectile" && e.move === "fb_l")).toBe(true);
    expect(s.projectiles[0].vx).toBe(px(4.2));
    const s2 = placeAt(readyMatch(), 400);
    playSeq(s2, motion(QCF, HP), 0, 14);
    expect(s2.projectiles[0].vx).toBe(px(7.5));
  });

  it("→↓↘ + P sale el Puño Ascendente", () => {
    const s = placeAt(readyMatch(), 300);
    playSeq(s, motion(DP, HP));
    expect(s.fighters[0].move).toBe("dp_h");
  });

  it("caminar hacia delante y hacer ↓↘→ + P da proyectil, no anti-aéreo", () => {
    const s = placeAt(readyMatch(), 400);
    const seq = [...Array(8).fill(RIGHT), ...motion(QCF, HP)];
    playSeq(s, seq);
    expect(s.fighters[0].move).toBe("fb_h");
  });

  it("terminando en ↘ sale la Z aunque se haya pasado por el cuarto de círculo", () => {
    const s = placeAt(readyMatch(), 400);
    playSeq(s, motion([6, 2, 3], LP));
    expect(s.fighters[0].move).toBe("dp_l");
  });

  it("un motion demasiado lento no sale", () => {
    const s = placeAt(readyMatch(), 400);
    playSeq(s, motion(QCF, LP, 9));
    expect(s.fighters[0].move).not.toBe("fb_l");
  });

  it("solo un proyectil propio en pantalla", () => {
    const s = placeAt(readyMatch(), 700);
    playSeq(s, motion(QCF, LP), 0, 50);
    expect(s.projectiles.length).toBe(1);
    playSeq(s, motion(QCF, LP), 0, 20);
    expect(s.projectiles.length).toBe(1);
    // En su lugar sale el normal.
    expect(["st_lp", null]).toContain(s.fighters[0].move);
  });

  it("súper con medidor lleno (↓↘→↓↘→ + P); sin medidor no sale", () => {
    const s = placeAt(readyMatch(), 400);
    playSeq(s, motion([2, 3, 6, 2, 3, 6], HP));
    expect(s.fighters[0].move).not.toBe("super");
    const s2 = placeAt(readyMatch(), 400);
    s2.fighters[0].meter = TUNING.meter.max;
    const ev = playSeq(s2, motion([2, 3, 6, 2, 3, 6], HP));
    expect(s2.fighters[0].move).toBe("super");
    expect(ev.some((e) => e.type === "super")).toBe(true);
    expect(s2.fighters[0].meter).toBe(0);
    expect(s2.freeze).toBe(getMove("rayo", "super").superFlash);
  });

  it("atajo HP + HK con medidor lleno", () => {
    const s = placeAt(readyMatch(), 400);
    s.fighters[0].meter = TUNING.meter.max;
    playSeq(s, [HP | HK]);
    expect(s.fighters[0].move).toBe("super");
  });

  it("inputs simplificados: SP = proyectil, SP+↓ = anti-aéreo; desactivado no hace nada", () => {
    const s = placeAt(readyMatch(), 400);
    playSeq(s, [SP]);
    expect(s.fighters[0].move).toBe("fb_h");
    const s2 = placeAt(readyMatch(), 400);
    playSeq(s2, [DOWN | SP]);
    expect(s2.fighters[0].move).toBe("dp_h");
    const off = placeAt(readyMatch({ simple: [false, false] }), 400);
    playSeq(off, [SP]);
    expect(off.fighters[0].move).toBe(null);
  });
});

describe("proyectiles", () => {
  it("bloquear un proyectil quita un poco de vida (chip)", () => {
    const s = placeAt(readyMatch(), 300);
    playSeq(s, motion(QCF, HP), RIGHT | DOWN, 60);
    expect(s.fighters[1].health).toBe(1000 - 12);
  });

  it("dos proyectiles normales se anulan", () => {
    const s = placeAt(readyMatch(), 500);
    const seq0 = motion(QCF, LP);
    const seq1 = motion(QCF, LP, 2, -1);
    let clash = false;
    for (let i = 0; i < 90; i++) {
      stepInPlace(s, seq0[i] ?? 0, seq1[i] ?? 0);
      if (s.events.some((e) => e.type === "projectileClash")) clash = true;
    }
    expect(clash).toBe(true);
    expect(s.projectiles.length).toBe(0);
    expect(s.fighters[0].health).toBe(1000);
    expect(s.fighters[1].health).toBe(1000);
  });

  it("el proyectil tiene recuperación larga: de cerca y bloqueado se castiga", () => {
    const fb = getMove("rayo", "fb_h");
    expect(fb.recovery).toBeGreaterThanOrEqual(30);
  });
});

describe("anti-aéreo invencible", () => {
  it("atraviesa un golpe durante sus primeros frames", () => {
    const s = placeAt(readyMatch(), 70);
    // J2 lanza un jab que estaría activo justo cuando J1 empieza la Z.
    const seq0 = motion(DP, HP);
    const start = seq0.length - 1;
    const ev = playSeq(s, seq0, (i) => (i === start - 2 ? LP : 0), 30);
    expect(ev.filter((e) => e.type === "hit" && e.side === 1)).toHaveLength(0);
    expect(ev.some((e) => e.type === "hit" && e.side === 0)).toBe(true);
  });

  it("si falla queda muy expuesto (más de 45 frames sin poder actuar)", () => {
    const s = placeAt(readyMatch(), 500);
    playSeq(s, motion(DP, HP));
    let n = 0;
    while (s.fighters[0].state !== "idle" && n < 200) {
      stepInPlace(s, 0, 0);
      n++;
    }
    expect(n).toBeGreaterThan(45);
  });

  it("con buen timing derriba a un rival que salta", () => {
    let success = false;
    for (let delay = 8; delay < 36 && !success; delay++) {
      const s = placeAt(readyMatch(), 200);
      const ev = playSeq(s, [...Array(delay).fill(0), ...motion(DP, HP)], (i) => (i < 3 ? UP | LEFT : 0), 90);
      const hit = ev.find((e) => e.type === "hit" && e.side === 0);
      success = !!hit && ev.some((e) => e.type === "knockdown" && e.side === 1) && hit.y > px(160);
    }
    expect(success).toBe(true);
  });
});

describe("agarres", () => {
  it("LP+LK cerca agarra aunque el rival bloquee", () => {
    const s = placeAt(readyMatch(), 74);
    const ev = playSeq(s, [LP | LK], RIGHT | DOWN, 50);
    expect(ev.some((e) => e.type === "throw")).toBe(true);
    expect(ev.some((e) => e.type === "throwHit")).toBe(true);
    expect(s.fighters[1].health).toBe(1000 - 120);
  });

  it("de lejos el agarre falla y deja expuesto", () => {
    const s = placeAt(readyMatch(), 160);
    const ev = playSeq(s, [LP | LK], 0, 10);
    expect(ev.some((e) => e.type === "throw")).toBe(false);
    expect(s.fighters[0].move).toBe("throw");
  });

  it("escape (tech) pulsando LP+LK dentro de la ventana", () => {
    const s = placeAt(readyMatch(), 74);
    const ev = playSeq(s, [LP | LK], (i) => (i === 6 ? LP | LK : 0), 50);
    expect(ev.some((e) => e.type === "tech")).toBe(true);
    expect(s.fighters[1].health).toBe(1000);
  });

  it("tarde no hay escape", () => {
    const s = placeAt(readyMatch(), 74);
    // Agarre conecta en el frame 4 (startup 5); la ventana es de 7 frames.
    playSeq(s, [LP | LK], (i) => (i === 4 + TUNING.throw.techWindow + 3 ? LP | LK : 0), 50);
    expect(s.fighters[1].health).toBe(1000 - 120);
  });

  it("pulsación casi simultánea (LP y LK con un frame de diferencia) también agarra", () => {
    const s = placeAt(readyMatch(), 74);
    const ev = playSeq(s, [LP, LP | LK], 0, 40);
    expect(ev.some((e) => e.type === "throw")).toBe(true);
  });

  it("agarre hacia atrás: el rival cae al otro lado", () => {
    const s = placeAt(readyMatch(), 74);
    playSeq(s, [LEFT | LP | LK], 0, 60);
    expect(s.fighters[1].x).toBeLessThan(s.fighters[0].x);
  });

  it("no se puede agarrar a quien está en blockstun", () => {
    const s = placeAt(readyMatch(), 74);
    s.fighters[1].state = "blockstun";
    s.fighters[1].stun = 20;
    const ev = playSeq(s, [LP | LK], RIGHT, 8);
    expect(ev.some((e) => e.type === "throw")).toBe(false);
  });
});

describe("cancels y combos", () => {
  it("patada rastrera → Onda rápida (cancel) combea", () => {
    const s = placeAt(readyMatch(), 90);
    // ↓+LK, y durante el golpe ↓↘→ + HP
    const seq = [DOWN | LK, DOWN, DOWN, DOWN, DOWN, DOWN | RIGHT, DOWN | RIGHT, RIGHT | HP];
    playSeq(s, seq, 0, 40);
    expect(s.fighters[1].comboHits === 0 ? null : s.fighters[1].comboHits).toBe(null);
    const s2 = placeAt(readyMatch(), 90);
    let maxCombo = 0;
    for (let i = 0; i < 60; i++) {
      stepInPlace(s2, seq[i] ?? 0, 0);
      maxCombo = Math.max(maxCombo, s2.fighters[1].comboHits);
    }
    expect(maxCombo).toBe(2);
  });

  it("chain: jab → jab → patada ligera", () => {
    const s = placeAt(readyMatch(), 66);
    let maxCombo = 0;
    const presses: Record<number, number> = { 0: LP, 7: LP, 14: LK };
    for (let i = 0; i < 50; i++) {
      stepInPlace(s, presses[i] ?? 0, 0);
      maxCombo = Math.max(maxCombo, s.fighters[1].comboHits);
    }
    expect(maxCombo).toBe(3);
  });

  it("los fuertes no se encadenan con chain", () => {
    const s = placeAt(readyMatch(), 90);
    for (let i = 0; i < 12; i++) stepInPlace(s, i === 0 ? HP : i === 12 ? LP : 0, 0);
    // Tras el contacto, pulsar LP no cancela un directo (no tiene "chain").
    for (let i = 0; i < 6; i++) stepInPlace(s, i === 1 ? LP : 0, 0);
    expect(s.fighters[0].move).toBe("st_hp");
  });

  it("especial → súper (super cancel) desde la Embestida", () => {
    const s = placeAt(readyMatch(), 140);
    s.fighters[0].meter = TUNING.meter.max;
    const seq = [...motion([2, 1, 4], LK)];
    let superStarted = false;
    for (let i = 0; i < 80; i++) {
      // Al conectar, atajo HP+HK
      const atk = s.fighters[0];
      const inp = seq[i] ?? (atk.contact !== "none" && atk.move === "rush_l" ? HP | HK : 0);
      stepInPlace(s, inp, 0);
      if (s.fighters[0].move === "super") superStarted = true;
    }
    expect(superStarted).toBe(true);
  });

  it("el escalado reduce el daño de un combo largo", () => {
    const s = placeAt(readyMatch(), 66);
    const presses: Record<number, number> = { 0: LP, 7: LP, 14: LK };
    for (let i = 0; i < 50; i++) stepInPlace(s, presses[i] ?? 0, 0);
    // 30 + 30 + 35*0.85 = 89 (sin escalado serían 95)
    expect(1000 - s.fighters[1].health).toBe(30 + 30 + Math.floor(35 * 0.85));
  });
});

describe("medidor y súper", () => {
  it("pegar, recibir y bloquear llenan el medidor", () => {
    const s = placeAt(readyMatch(), 70);
    run(s, 20, (i) => (i === 0 ? LP : 0), 0);
    expect(s.fighters[0].meter).toBeGreaterThan(0);
    expect(s.fighters[1].meter).toBeGreaterThan(0);
    const b = placeAt(readyMatch(), 70);
    run(b, 20, (i) => (i === 0 ? LP : 0), RIGHT);
    expect(b.fighters[1].meter).toBeGreaterThan(0);
  });

  it("la súper congela la pantalla y su proyectil pega 5 veces", () => {
    const s = placeAt(readyMatch(), 300);
    s.fighters[0].meter = TUNING.meter.max;
    const ev = playSeq(s, [HP | HK], 0, 200);
    const hits = ev.filter((e) => e.type === "hit" && e.side === 0);
    expect(hits.length).toBe(5);
    expect(1000 - s.fighters[1].health).toBeGreaterThan(220);
  });

  it("la súper es invencible al empezar (sirve de reversal)", () => {
    const s = placeAt(readyMatch(), 70);
    s.fighters[0].meter = TUNING.meter.max;
    const ev = playSeq(s, [HP | HK], (i) => (i === 0 ? HP : 0), 60);
    expect(ev.filter((e) => e.type === "hit" && e.side === 1)).toHaveLength(0);
  });
});
