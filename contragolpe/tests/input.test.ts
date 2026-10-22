import { describe, expect, it } from "vitest";
import { TUNING } from "../src/data/tuning";
import {
  Btn,
  cleanSOCD,
  createHistory,
  inputAt,
  matchMotion,
  MOTIONS,
  pressedAt,
  pushInput,
  toNumpad,
} from "../src/sim/input";
import { DOWN, LEFT, LP, readyMatch, RIGHT, UP, run } from "./helpers";

describe("SOCD y notación", () => {
  it("izquierda+derecha = neutral, arriba+abajo = neutral", () => {
    expect(cleanSOCD(LEFT | RIGHT | LP)).toBe(LP);
    expect(cleanSOCD(UP | DOWN | RIGHT)).toBe(RIGHT);
  });

  it("numpad relativo a hacia dónde se mira", () => {
    expect(toNumpad(RIGHT, 1)).toBe(6);
    expect(toNumpad(RIGHT, -1)).toBe(4);
    expect(toNumpad(DOWN | RIGHT, 1)).toBe(3);
    expect(toNumpad(DOWN | LEFT, 1)).toBe(1);
    expect(toNumpad(UP | RIGHT, -1)).toBe(7);
    expect(toNumpad(0, 1)).toBe(5);
  });
});

describe("historial circular", () => {
  it("guarda los últimos frames y detecta pulsaciones", () => {
    const h = createHistory();
    pushInput(h, 0, false);
    pushInput(h, Btn.LP, false);
    pushInput(h, Btn.LP, false);
    expect(inputAt(h, 0)).toBe(Btn.LP);
    expect(pressedAt(h, 0)).toBe(0);
    expect(pressedAt(h, 1)).toBe(Btn.LP);
    for (let i = 0; i < 200; i++) pushInput(h, i, false);
    expect(inputAt(h, 0)).toBe(199);
    expect(inputAt(h, 63)).toBe(136);
  });
});

describe("motion inputs", () => {
  const seq = (dirs: number[], facing: 1 | -1 = 1) => {
    const h = createHistory();
    const fwd = facing === 1 ? RIGHT : LEFT;
    const back = facing === 1 ? LEFT : RIGHT;
    const map: Record<number, number> = {
      1: DOWN | back, 2: DOWN, 3: DOWN | fwd, 4: back, 5: 0, 6: fwd, 7: UP | back, 8: UP, 9: UP | fwd,
    };
    for (const d of dirs) pushInput(h, map[d], false);
    return h;
  };

  it("cuarto de círculo adelante, en ambos lados", () => {
    expect(matchMotion(seq([5, 2, 3, 6]), 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(true);
    expect(matchMotion(seq([5, 2, 3, 6], -1), -1, MOTIONS.qcf, TUNING.motionWindow)).toBe(true);
    expect(matchMotion(seq([5, 2, 6]), 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(false);
    expect(matchMotion(seq([6, 3, 2]), 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(false);
  });

  it("respeta la ventana de tiempo", () => {
    const slow = [2, ...Array(10).fill(3), ...Array(10).fill(6)];
    expect(matchMotion(seq(slow), 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(false);
    const ok = [2, ...Array(6).fill(3), ...Array(6).fill(6)];
    expect(matchMotion(seq(ok), 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(true);
  });

  it("Z (dragon punch) y doble cuarto de círculo", () => {
    expect(matchMotion(seq([6, 5, 2, 3]), 1, MOTIONS.dp, TUNING.motionWindow)).toBe(true);
    expect(matchMotion(seq([6, 1, 3]), 1, MOTIONS.dp, TUNING.motionWindow)).toBe(true);
    expect(matchMotion(seq([2, 3, 6, 2, 3, 6]), 1, MOTIONS.qcf2, TUNING.superMotionWindow)).toBe(true);
    expect(matchMotion(seq([2, 3, 6, 5, 6]), 1, MOTIONS.qcf2, TUNING.superMotionWindow)).toBe(false);
  });

  it("los frames congelados no gastan la ventana", () => {
    const h = createHistory();
    pushInput(h, DOWN, false);
    pushInput(h, DOWN | RIGHT, false);
    for (let i = 0; i < 30; i++) pushInput(h, DOWN | RIGHT, true);
    pushInput(h, RIGHT, false);
    expect(matchMotion(h, 1, MOTIONS.qcf, TUNING.motionWindow)).toBe(true);
  });
});

describe("buffer de botones", () => {
  it("una pulsación vive inputBuffer frames y luego caduca", () => {
    const s = readyMatch();
    run(s, 1, LP);
    expect(s.fighters[0].buf[0]).toBe(0);
    run(s, TUNING.inputBuffer, LP);
    expect(s.fighters[0].buf[0]).toBe(TUNING.inputBuffer);
    run(s, 1, LP);
    expect(s.fighters[0].buf[0]).toBe(99);
  });

  it("congelado (hitstop) no envejece el buffer", () => {
    const s = readyMatch();
    run(s, 1, LP);
    s.fighters[0].hitstop = 10;
    run(s, 10, LP);
    expect(s.fighters[0].buf[0]).toBe(0);
  });
});
