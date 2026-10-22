import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashValue } from "../src/sim/hash";
import { createMatch, deserialize, serialize } from "../src/sim/state";
import { step, stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { lcg, nonIntegerPaths } from "./helpers";

/** Inputs aleatorios pero reproducibles: mantiene cada combinación unos frames, como un humano. */
function randomInputs(seed: number, n: number): [number, number][] {
  const r = lcg(seed);
  const out: [number, number][] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    if (r() % 5 === 0) a = r() & 0x3ff;
    if (r() % 5 === 0) b = r() & 0x3ff;
    out.push([a, b]);
  }
  return out;
}

function playOut(inputs: [number, number][], seed = 3): GameState {
  let s = createMatch({}, seed);
  for (const [a, b] of inputs) s = step(s, a, b);
  return s;
}

describe("determinismo", () => {
  const inputs = randomInputs(1234, 3000);

  it("mismos inputs ⇒ mismo hash de estado", () => {
    const h1 = hashValue(playOut(inputs));
    const h2 = hashValue(playOut(inputs));
    expect(h1).toBe(h2);
  });

  it("inputs distintos ⇒ estados distintos", () => {
    const other = randomInputs(999, 3000);
    expect(hashValue(playOut(inputs))).not.toBe(hashValue(playOut(other)));
  });

  it("step() es puro: no modifica el estado anterior", () => {
    const s0 = createMatch({}, 3);
    const before = serialize(s0);
    step(s0, 0xff, 0xff);
    expect(serialize(s0)).toBe(before);
  });

  it("step y stepInPlace dan exactamente lo mismo", () => {
    let a = createMatch({}, 3);
    const b = createMatch({}, 3);
    for (const [x, y] of inputs.slice(0, 1500)) {
      a = step(a, x, y);
      stepInPlace(b, x, y);
    }
    expect(hashValue(a)).toBe(hashValue(b));
  });

  it("guardar y restaurar un frame reproduce el futuro (base del rollback)", () => {
    let s = createMatch({}, 3);
    for (const [a, b] of inputs.slice(0, 1000)) s = step(s, a, b);
    const saved = serialize(s);
    let cont = s;
    for (const [a, b] of inputs.slice(1000)) cont = step(cont, a, b);
    let restored = deserialize(saved);
    for (const [a, b] of inputs.slice(1000)) restored = step(restored, a, b);
    expect(hashValue(restored)).toBe(hashValue(cont));
  });

  it("todo número del estado es entero (sin coma flotante en la simulación)", () => {
    let s = createMatch({}, 3);
    for (const [a, b] of inputs) {
      s = step(s, a, b);
      const bad = nonIntegerPaths(s);
      if (bad.length) throw new Error(`frame ${s.frame}: ${bad.join(", ")}`);
    }
    expect(s.frame).toBe(inputs.length);
  });
});

describe("pureza del código de simulación", () => {
  const forbidden = /\b(Math\.random|Date\.now|performance\.|window\.|document\.|requestAnimationFrame|setTimeout|localStorage)\b/;
  const dirs = ["src/sim", "src/data", "src/data/characters", "src/data/moves"];
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      it(`${dir}/${file} no usa APIs no deterministas`, () => {
        const text = readFileSync(join(dir, file), "utf8");
        expect(text.match(forbidden)?.[0] ?? null).toBeNull();
      });
    }
  }
});
