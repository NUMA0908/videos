import { describe, expect, it } from "vitest";
import { FixedLoop } from "../src/app/loop";

/** Simula `seconds` segundos de un monitor a `hz` (con jitter opcional) y cuenta ticks de simulación. */
function run(hz: number, seconds: number, jitter = 0): { ticks: number; frames: number } {
  let ticks = 0;
  let frames = 0;
  const loop = new FixedLoop(
    () => ticks++,
    () => frames++,
  );
  let t = 0;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  while (t <= seconds * 1000) {
    loop.advance(t);
    t += 1000 / hz + rnd() * jitter;
  }
  return { ticks, frames };
}

describe("bucle de paso fijo y frecuencia del monitor", () => {
  for (const hz of [30, 60, 75, 120, 144, 165, 240]) {
    it(`${hz} Hz: 60 ticks por segundo (sin doble velocidad)`, () => {
      const r = run(hz, 10);
      expect(Math.abs(r.ticks - 600)).toBeLessThanOrEqual(2);
      expect(r.frames).toBeGreaterThanOrEqual(hz * 10 - 1);
    });
  }

  it("con jitter de ±2 ms a 144 Hz sigue a 60 ticks", () => {
    const r = run(144, 10, 2);
    expect(Math.abs(r.ticks - 600)).toBeLessThanOrEqual(2);
  });

  it("tras un parón largo (pestaña oculta) no recupera cientos de ticks de golpe", () => {
    let ticks = 0;
    const loop = new FixedLoop(() => ticks++, () => undefined);
    loop.advance(0);
    loop.advance(5000);
    expect(ticks).toBeLessThanOrEqual(6);
  });

  it("la cámara lenta solo cambia cuántos ticks se ejecutan", () => {
    let ticks = 0;
    const loop = new FixedLoop(() => ticks++, () => undefined);
    loop.timeScale = 0.3;
    for (let t = 0; t <= 10000; t += 1000 / 144) loop.advance(t);
    expect(Math.abs(ticks - 180)).toBeLessThanOrEqual(2);
  });
});
