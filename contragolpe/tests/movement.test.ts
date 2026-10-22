import { describe, expect, it } from "vitest";
import { getChar } from "../src/data/characters";
import { px } from "../src/sim/fixed";
import { overlaps, pushbox } from "../src/sim/boxes";
import { WALL_MAX, WALL_MIN } from "../src/sim/physics";
import { DOWN, LEFT, readyMatch, RIGHT, run, UP } from "./helpers";

const rayo = getChar("rayo");

describe("movimiento básico", () => {
  it("camina hacia adelante a su velocidad", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 10, RIGHT);
    expect(s.fighters[0].state).toBe("walkF");
    expect(s.fighters[0].x - x0).toBe(px(rayo.walkF) * 10);
  });

  it("retrocede más lento de lo que avanza", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 10, LEFT);
    expect(s.fighters[0].state).toBe("walkB");
    expect(x0 - s.fighters[0].x).toBe(px(rayo.walkB) * 10);
  });

  it("se agacha y no se mueve", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 5, DOWN | RIGHT);
    expect(s.fighters[0].state).toBe("crouch");
    expect(s.fighters[0].crouching).toBe(true);
    expect(s.fighters[0].x).toBe(x0);
  });

  it("salto vertical: prejump, sube, baja y aterriza en el mismo sitio", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 1, UP);
    expect(s.fighters[0].state).toBe("prejump");
    run(s, rayo.jump.prejump, 0);
    expect(s.fighters[0].state).toBe("air");
    let maxY = 0;
    let frames = 0;
    while (s.fighters[0].state === "air" && frames < 200) {
      run(s, 1, 0);
      maxY = Math.max(maxY, s.fighters[0].y);
      frames++;
    }
    expect(s.fighters[0].state).toBe("land");
    expect(s.fighters[0].x).toBe(x0);
    expect(maxY).toBeGreaterThan(px(150));
    expect(frames).toBeGreaterThan(35);
    expect(frames).toBeLessThan(55);
    run(s, rayo.jump.landing, 0);
    expect(s.fighters[0].state).toBe("idle");
  });

  it("salto hacia adelante avanza y salto atrás retrocede", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 60, (i) => (i < 6 ? UP | RIGHT : 0));
    expect(s.fighters[0].x).toBeGreaterThan(x0 + px(120));
    const s2 = readyMatch();
    run(s2, 60, (i) => (i < 6 ? UP | LEFT : 0));
    expect(s2.fighters[0].x).toBeLessThan(x0 - px(100));
  });

  it("dash con doble toque adelante", () => {
    const s = readyMatch();
    const x0 = s.fighters[0].x;
    run(s, 1, RIGHT);
    run(s, 2, 0);
    run(s, 1, RIGHT);
    expect(s.fighters[0].state).toBe("dashF");
    run(s, rayo.dashF.frames, 0);
    expect(s.fighters[0].state).toBe("idle");
    // 3 px de caminar el primer frame + la distancia exacta del dash
    expect(s.fighters[0].x - x0).toBe(px(rayo.walkF) + px(rayo.dashF.distance));
  });

  it("los personajes no se atraviesan caminando", () => {
    const s = readyMatch();
    run(s, 200, RIGHT, LEFT);
    const [a, b] = s.fighters;
    expect(overlaps(pushbox(a), pushbox(b))).toBe(false);
    expect(a.x).toBeLessThan(b.x);
  });

  it("no se sale del escenario y respeta la separación máxima", () => {
    const s = readyMatch();
    run(s, 600, LEFT, RIGHT);
    const [a, b] = s.fighters;
    expect(a.x).toBeGreaterThanOrEqual(WALL_MIN);
    expect(b.x).toBeLessThanOrEqual(WALL_MAX);
    expect(b.x - a.x).toBeLessThanOrEqual(px(820));
  });

  it("al cruzar por encima del rival, se da la vuelta al aterrizar (cross-up)", () => {
    const s = readyMatch();
    // Acercarse y saltar por encima
    run(s, 58, RIGHT);
    run(s, 70, (i) => (i < 6 ? UP | RIGHT : 0));
    const [a, b] = s.fighters;
    expect(a.x).toBeGreaterThan(b.x);
    expect(a.facing).toBe(-1);
    expect(b.facing).toBe(1);
  });
});
