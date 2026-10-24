import { describe, expect, it } from "vitest";
import { groupSamples, pickVariant, sampleKey } from "../src/audio/Audio";
import { swingFrame } from "../src/scenes/FightScene";

describe("audio: archivos, variantes y capas", () => {
  it("reconoce los nombres de archivo que espera el juego", () => {
    expect(sampleKey("/assets/audio/sfx/hitPunchL_2.ogg")).toEqual({ key: "sfx/hitPunchL", n: 2 });
    expect(sampleKey("/assets/audio/voice/rayo/hurt_1.wav")).toEqual({ key: "voice/rayo/hurt", n: 1 });
    expect(sampleKey("/assets/audio/music/muelle.ogg")).toEqual({ key: "music/muelle", n: 0 });
    expect(sampleKey("/assets/audio/sfx/leeme.txt")).toBeNull();
  });

  it("agrupa las variantes de cada sonido en orden", () => {
    const g = groupSamples({
      "/assets/audio/sfx/block_3.ogg": "c",
      "/assets/audio/sfx/block_1.ogg": "a",
      "/assets/audio/sfx/block_2.ogg": "b",
      "/assets/audio/music/plaza.ogg": "m",
    });
    expect(g.get("sfx/block")).toEqual(["a", "b", "c"]);
    expect(g.get("music/plaza")).toEqual(["m"]);
  });

  it("nunca repite la misma variante dos veces seguidas", () => {
    let x = 1;
    const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    let last: number | undefined;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = pickVariant(4, last, rnd);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
    expect(pickVariant(1, 0, rnd)).toBe(0);
  });

  it("el swing suena antes del primer frame activo (y nunca antes del frame 1)", () => {
    expect(swingFrame(10, true)).toBe(7);
    expect(swingFrame(4, false)).toBe(2);
    expect(swingFrame(3, false)).toBe(1);
    expect(swingFrame(1, true)).toBe(1);
  });
});
