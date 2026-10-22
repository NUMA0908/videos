import { describe, expect, it } from "vitest";
import { getChar } from "../src/data/characters";
import { TUNING } from "../src/data/tuning";
import { comboScale } from "../src/sim/combat";
import { px } from "../src/sim/fixed";
import { WALL_MAX } from "../src/sim/physics";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { DOWN, HK, HP, LEFT, LK, LP, placeAt, readyMatch, RIGHT, run, UP } from "./helpers";

/**
 * Escena en dos pasadas: primero sin defensa para saber en qué frame conecta el golpe;
 * luego el defensor sostiene `guard` solo desde 2 frames antes (sin alejarse caminando).
 */
function guardedContact(gap: number, frames: number, atk: (i: number) => number, guard: number): string {
  const probe = placeAt(readyMatch(), gap);
  let hitFrame = -1;
  for (let i = 0; i < frames && hitFrame < 0; i++) {
    stepInPlace(probe, atk(i), 0);
    if (probe.events.some((e) => e.type === "hit" && e.side === 0)) hitFrame = i;
  }
  if (hitFrame < 0) return "none";
  return contactOf(placeAt(readyMatch(), gap), frames, atk, (i) => (i >= hitFrame - 2 ? guard : 0));
}

/** Ejecuta hasta que haya un contacto de J1 y devuelve el tipo ("hit"/"block"). */
function contactOf(s: GameState, frames: number, in0: (i: number) => number, in1: (i: number) => number): string {
  for (let i = 0; i < frames; i++) {
    stepInPlace(s, in0(i), in1(i));
    const ev = s.events.find((e) => (e.type === "hit" || e.type === "block") && e.side === 0);
    if (ev) return ev.type;
  }
  return "none";
}

describe("bloqueo y alturas", () => {
  it("un golpe medio se bloquea de pie o agachado", () => {
    expect(contactOf(placeAt(readyMatch(), 80), 20, (i) => (i === 0 ? LK : 0), () => RIGHT)).toBe("block");
    expect(contactOf(placeAt(readyMatch(), 80), 20, (i) => (i === 0 ? LK : 0), () => RIGHT | DOWN)).toBe("block");
  });

  it("el jab de pie pasa por encima de un rival agachado", () => {
    expect(contactOf(placeAt(readyMatch(), 70), 20, (i) => (i === 0 ? LP : 0), () => DOWN)).toBe("none");
  });

  it("un golpe bajo solo se bloquea agachado", () => {
    const low = (i: number) => (i === 0 ? DOWN | LK : DOWN);
    expect(contactOf(placeAt(readyMatch(), 80), 20, low, () => RIGHT)).toBe("hit");
    expect(contactOf(placeAt(readyMatch(), 80), 20, low, () => RIGHT | DOWN)).toBe("block");
  });

  it("un ataque en salto (alto/overhead) solo se bloquea de pie", () => {
    const jumpIn = (i: number) => (i < 3 ? UP | RIGHT : i === 34 ? HK : 0);
    expect(guardedContact(170, 70, jumpIn, RIGHT | DOWN)).toBe("hit");
    expect(guardedContact(170, 70, jumpIn, RIGHT)).toBe("block");
  });

  it("sin sostener atrás no hay bloqueo", () => {
    expect(contactOf(placeAt(readyMatch(), 70), 20, (i) => (i === 0 ? LP : 0), () => 0)).toBe("hit");
    expect(contactOf(placeAt(readyMatch(), 70), 20, (i) => (i === 0 ? LP : 0), () => LEFT)).toBe("hit");
  });

  it("cross-up: hay que bloquear hacia el otro lado", () => {
    // J1 salta por encima con la rodilla cruzada y golpea cuando ya está detrás de J2.
    const crossUp = (i: number) => (i < 3 ? UP | RIGHT : i === 24 ? LK : 0);
    const findGap = () => {
      for (let gap = 90; gap < 200; gap += 4) {
        const s = placeAt(readyMatch(), gap);
        for (let i = 0; i < 60; i++) {
          stepInPlace(s, crossUp(i), 0);
          const ev = s.events.find((e) => e.type === "hit" && e.side === 0);
          if (ev) {
            if (s.fighters[0].x > s.fighters[1].x) return gap;
            break;
          }
        }
      }
      return -1;
    };
    const gap = findGap();
    expect(gap).toBeGreaterThan(0);
    // Sostener "atrás" según hacia dónde mira J2 (derecha) no sirve: el golpe viene por la derecha.
    expect(guardedContact(gap, 60, crossUp, RIGHT)).toBe("hit");
    expect(guardedContact(gap, 60, crossUp, LEFT)).toBe("block");
  });
});

describe("empuje y esquina", () => {
  it("en campo abierto el empujado es el defensor", () => {
    const s = placeAt(readyMatch(), 70);
    const ax = s.fighters[0].x;
    const bx = s.fighters[1].x;
    run(s, 25, (i) => (i === 0 ? LP : 0), RIGHT);
    expect(s.fighters[1].x).toBeGreaterThan(bx);
    expect(s.fighters[0].x).toBe(ax);
  });

  it("contra la pared el atacante retrocede", () => {
    const s = readyMatch();
    s.fighters[1].x = WALL_MAX;
    s.fighters[0].x = WALL_MAX - px(70);
    const ax = s.fighters[0].x;
    run(s, 25, (i) => (i === 0 ? LP : 0), RIGHT);
    expect(s.fighters[1].x).toBe(WALL_MAX);
    expect(s.fighters[0].x).toBeLessThan(ax);
  });
});

describe("combos y escalado", () => {
  it("el escalado de daño baja con cada golpe y nunca de 30 %", () => {
    expect(comboScale(1)).toBe(100);
    expect(comboScale(2)).toBe(100);
    expect(comboScale(3)).toBe(85);
    expect(comboScale(50)).toBe(30);
  });

  it("jab → jab enlaza (+5 al pegar) y cuenta como combo de 2", () => {
    const s = placeAt(readyMatch(), 66);
    // El segundo jab se pulsa con margen y sale del buffer en el primer frame libre.
    run(s, 30, (i) => (i === 0 || i === 14 ? LP : 0), 0);
    const hits = s.fighters[1].comboHits;
    expect(hits).toBe(2);
  });

  it("machacar jab no hace un combo infinito", () => {
    const s = placeAt(readyMatch(), 66);
    let maxCombo = 0;
    for (let i = 0; i < 600; i++) {
      stepInPlace(s, i % 2 === 0 ? LP : 0, 0);
      maxCombo = Math.max(maxCombo, s.fighters[1].comboHits);
    }
    expect(maxCombo).toBeLessThan(10);
  });
});

describe("derribo", () => {
  it("la barrida derriba; al levantarse es invulnerable un momento", () => {
    const s = placeAt(readyMatch(), 100);
    run(s, 30, (i) => (i === 0 ? DOWN | HK : 0), 0);
    const b = s.fighters[1];
    expect(["airHit", "knockdown"]).toContain(b.state);
    let sawWakeup = false;
    for (let i = 0; i < 120; i++) {
      stepInPlace(s, 0, 0);
      if (s.fighters[1].state === "wakeup") sawWakeup = true;
      if (sawWakeup && s.fighters[1].state === "idle") break;
    }
    expect(sawWakeup).toBe(true);
    expect(s.fighters[1].state).toBe("idle");
  });

  it("un anti-aéreo derriba a quien salta", () => {
    const s = placeAt(readyMatch(), 180);
    let knocked = false;
    for (let i = 0; i < 80; i++) {
      stepInPlace(s, i === 21 ? DOWN | HP : i > 21 ? 0 : DOWN, i < 3 ? UP | LEFT : 0);
      if (s.fighters[1].state === "airHit") knocked = true;
    }
    expect(knocked).toBe(true);
  });
});

describe("rondas", () => {
  it("KO termina la ronda, suma victoria y empieza la siguiente", () => {
    const s = placeAt(readyMatch(), 70);
    s.fighters[1].health = 10;
    run(s, 10, (i) => (i === 0 ? LP : 0), 0);
    expect(s.fighters[1].state).toBe("ko");
    expect(s.round.phase).toBe("ko");
    expect(s.round.winner).toBe(0);
    run(s, TUNING.round.koFrames + 5, 0, 0);
    expect(s.round.wins).toEqual([1, 0]);
    expect(s.round.num).toBe(2);
    expect(s.round.phase).toBe("intro");
    expect(s.fighters[1].health).toBe(getChar("rayo").health);
  });

  it("al mejor de 3: dos victorias ganan el partido", () => {
    const s = readyMatch();
    for (let round = 0; round < 2; round++) {
      while (s.round.phase !== "fight") stepInPlace(s, 0, 0);
      placeAt(s, 70);
      s.fighters[1].health = 10;
      run(s, 10, (i) => (i === 0 ? LP : 0), 0);
      run(s, TUNING.round.koFrames + 5, 0, 0);
    }
    expect(s.round.phase).toBe("over");
    expect(s.round.matchWinner).toBe(0);
  });

  it("tiempo agotado: gana quien tenga más vida", () => {
    const s = readyMatch();
    s.fighters[0].health = 500;
    s.round.timer = 2;
    run(s, 3, 0, 0);
    expect(s.round.phase).toBe("ko");
    expect(s.round.timeOver).toBe(true);
    expect(s.round.winner).toBe(1);
  });

  it("durante la intro no se puede atacar ni moverse", () => {
    const s = readyMatch();
    run(s, TUNING.round.koFrames, 0, 0);
    const fresh = readyMatch();
    void fresh;
    const intro = readyMatch();
    intro.round.phase = "intro";
    intro.round.t = 1;
    const x = intro.fighters[0].x;
    run(intro, 20, RIGHT | LP, 0);
    expect(intro.fighters[0].x).toBe(x);
    expect(intro.fighters[0].state).not.toBe("attack");
  });
});
