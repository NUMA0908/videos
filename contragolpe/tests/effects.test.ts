import { describe, expect, it } from "vitest";
import { Effects } from "../src/render/effects";
import { createMatch } from "../src/sim/state";
import type { SimEvent } from "../src/sim/types";

const HEAVY_HIT: SimEvent = { type: "hit", side: 0, x: 0, y: 10000, strength: "heavy" };
const KO: SimEvent = { type: "ko", side: 1, x: 0, y: 10000 };

describe("efectos (fuera de la simulación)", () => {
  it("reutiliza partículas: tras muchos golpes no crecen las reservas sin límite", () => {
    const s = createMatch({}, 1);
    const fx = new Effects();
    const pool = () => (fx as unknown as { particlePool: unknown[] }).particlePool.length;
    let peak = 0;
    for (let round = 0; round < 50; round++) {
      fx.onEvents(s, [HEAVY_HIT, KO]);
      peak = Math.max(peak, fx.liveParticles);
      for (let t = 0; t < 60; t++) fx.update();
      expect(fx.liveParticles).toBe(0);
    }
    // Todo lo creado vuelve a la reserva y se reutiliza: el total de objetos es el pico de un solo golpe.
    expect(pool()).toBe(peak);
  });

  it("modo bajo consumo: la mitad de partículas (redondeando hacia arriba) y sin estelas", () => {
    const s = createMatch({}, 1);
    const full = new Effects();
    const low = new Effects();
    low.settings.lowPower = true;
    full.onEvents(s, [HEAVY_HIT]);
    low.onEvents(s, [HEAVY_HIT]);
    expect(low.liveParticles).toBeGreaterThan(0);
    expect(low.liveParticles).toBeLessThanOrEqual(Math.ceil(full.liveParticles / 2) + 1);
    low.trackSmear(0, true, { x: 0, y: 0 }, "#fff");
    expect((low as unknown as { smears: unknown[] }).smears.length).toBe(0);
  });
});
