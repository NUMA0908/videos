import { describe, expect, it } from "vitest";
import { DEFAULT_PAD } from "../src/input/bindings";
import { PadButton, stickDirection } from "../src/input/gamepad";
import { DEFAULT_PAD_TUNING, sanitizePadTuning } from "../src/input/padTuning";
import { resolveSOCD } from "../src/input/socd";
import { createMatch } from "../src/sim/state";
import { hashValue } from "../src/sim/hash";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { DOWN, HP, LEFT, LK, LP, PARRY, placeAt, readyMatch, RIGHT, SP, UP } from "./helpers";
import { FakePad, makeInput, tick } from "./padHelpers";

const T = DEFAULT_PAD_TUNING; // zona muerta 0.45, soltar 0.32, diagonales 56°, margen 6°
const at = (deg: number, r: number): [number, number] => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];

describe("stick: zona muerta radial e histéresis", () => {
  it("la zona muerta es radial: una diagonal suave cuenta aunque ningún eje pase el umbral", () => {
    expect(stickDirection(0.4, 0, 0, T)).toBe(0);
    expect(stickDirection(0.5, 0, 0, T)).toBe(RIGHT);
    // 0.35 por eje (< 0.45) pero radio 0.49 (> 0.45): ↘
    expect(stickDirection(0.35, 0.35, 0, T)).toBe(RIGHT | DOWN);
    expect(stickDirection(0, -0.6, 0, T)).toBe(UP);
  });

  it("histéresis de radio: activa en 0.45, suelta por debajo de 0.32", () => {
    let d = stickDirection(0.5, 0, 0, T);
    expect(d).toBe(RIGHT);
    d = stickDirection(0.4, 0, d, T);
    expect(d).toBe(RIGHT); // en la franja: se mantiene
    d = stickDirection(0.3, 0, d, T);
    expect(d).toBe(0); // por debajo de soltar
    d = stickDirection(0.4, 0, d, T);
    expect(d).toBe(0); // desde neutral la franja no activa: sin parpadeo
  });

  it("histéresis de sector: en la frontera no salta de dirección", () => {
    // Cardinal ocupa ±17°, diagonal ±28°; margen 6°.
    let d = stickDirection(...at(10, 0.9), 0, T);
    expect(d).toBe(RIGHT);
    d = stickDirection(...at(20, 0.9), d, T);
    expect(d).toBe(RIGHT); // pasado la frontera (17°) pero dentro del margen
    d = stickDirection(...at(25, 0.9), d, T);
    expect(d).toBe(RIGHT | DOWN);
    d = stickDirection(...at(14, 0.9), d, T);
    expect(d).toBe(RIGHT | DOWN); // vuelve un poco: sigue en diagonal
    d = stickDirection(...at(8, 0.9), d, T);
    expect(d).toBe(RIGHT);
  });

  it("las 8 direcciones (Y del Gamepad API crece hacia abajo)", () => {
    const expected = [RIGHT, RIGHT | DOWN, DOWN, LEFT | DOWN, LEFT, LEFT | UP, UP, RIGHT | UP];
    expected.forEach((mask, i) => expect(stickDirection(...at(i * 45, 1), 0, T)).toBe(mask));
  });

  it("ajustes guardados inválidos se corrigen (y soltar siempre queda por debajo de activar)", () => {
    const t = sanitizePadTuning({ stickDeadzone: 5, stickRelease: 0.9, diagonalArc: "x", triggerThreshold: -1 });
    expect(t.stickDeadzone).toBe(0.85);
    expect(t.stickRelease).toBeLessThan(t.stickDeadzone);
    expect(t.diagonalArc).toBe(DEFAULT_PAD_TUNING.diagonalArc);
    expect(t.triggerThreshold).toBe(0.1);
  });
});

describe("SOCD (teclado y mando por igual)", () => {
  it("izquierda+derecha = neutral; arriba+abajo = arriba", () => {
    expect(resolveSOCD(LEFT | RIGHT | LP)).toBe(LP);
    expect(resolveSOCD(UP | DOWN)).toBe(UP);
    expect(resolveSOCD(UP | DOWN | LEFT | RIGHT)).toBe(UP);
  });

  it("se aplica al teclado, a la cruceta y a la mezcla de ambos", () => {
    const pad = new FakePad();
    const { input, kb } = makeInput([pad]);
    kb.down("KeyA");
    kb.down("KeyD");
    expect(tick(input)[0]).toBe(0);
    kb.down("KeyW");
    kb.down("KeyS");
    expect(tick(input)[0]).toBe(UP);
    kb.up("KeyW");
    kb.up("KeyS");
    kb.up("KeyD");
    pad.press(PadButton.RIGHT); // teclado ← + cruceta →
    expect(tick(input)[0]).toBe(0);
    kb.up("KeyA");
    pad.press(PadButton.UP, PadButton.DOWN);
    expect(tick(input)[0]).toBe(UP | RIGHT);
  });
});

describe("mapeo estándar, remapeo y gatillos", () => {
  it("cada botón del mapeo estándar produce su bit (mismos bits que el teclado)", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const cases: [number, number][] = [
      [PadButton.X, LP],
      [PadButton.Y, HP],
      [PadButton.A, LK],
      [PadButton.B, 128],
      [PadButton.RB, PARRY],
      [PadButton.LB, LP | LK],
      [PadButton.LT, SP],
    ];
    for (const [b, bit] of cases) {
      pad.releaseAll().press(b);
      expect(tick(input)[0], `botón ${b}`).toBe(bit);
    }
    pad.releaseAll().press(PadButton.DOWN, PadButton.X);
    expect(tick(input)[0]).toBe(DOWN | LP);
  });

  it("el remapeo cambia qué botón da cada acción", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad], { xbox: { ...structuredClone(DEFAULT_PAD), LP: [PadButton.A], LK: [PadButton.X] } });
    pad.press(PadButton.A);
    expect(tick(input)[0]).toBe(LP);
    pad.releaseAll().press(PadButton.X);
    expect(tick(input)[0]).toBe(LK);
  });

  it("gatillos analógicos: digitales con umbral configurable e histéresis", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const RT_BITS = HP | 128; // RT = HP+HK (súper) mientras no haya remapeo
    pad.analog(PadButton.RT, 0.3);
    expect(tick(input)[0]).toBe(0); // Chrome dice pressed=true, pero no llega al umbral
    pad.analog(PadButton.RT, 0.5);
    expect(tick(input)[0]).toBe(RT_BITS);
    pad.analog(PadButton.RT, 0.4);
    expect(tick(input)[0]).toBe(RT_BITS); // por encima de soltar (0.37)
    pad.analog(PadButton.RT, 0.3);
    expect(tick(input)[0]).toBe(0);
    input.tuning.triggerThreshold = 0.2;
    expect(tick(input)[0]).toBe(RT_BITS);
  });

  it("cruceta y stick a la vez", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    pad.press(PadButton.DOWN).stick(0.9, 0);
    expect(tick(input)[0]).toBe(DOWN | RIGHT);
  });
});

describe("conexión y desconexión", () => {
  it("el primer mando que pulsa es J1 y el segundo J2 (no el orden de conexión)", () => {
    const a = new FakePad(0, "Pad A");
    const b = new FakePad(1, "Pad B");
    const list: (FakePad | null)[] = [a, b];
    const { input } = makeInput(list, {}, { autoJoin: false });
    tick(input);
    expect(input.playerPad).toEqual([null, null]); // conectados pero nadie ha pulsado
    b.press(PadButton.A);
    tick(input);
    expect(input.playerPad).toEqual([1, null]);
    a.press(PadButton.A);
    tick(input);
    expect(input.playerPad).toEqual([1, 0]);
    a.releaseAll().press(PadButton.X);
    b.releaseAll().press(PadButton.Y);
    expect(tick(input)).toEqual([HP, LP]);
  });

  it("desconectar deja el hueco esperando; reconectar el mismo mando lo recupera sin volver a unirse", () => {
    const a = new FakePad(0, "Pad A");
    const b = new FakePad(1, "Pad B");
    const list: (FakePad | null)[] = [a, b];
    const { input } = makeInput(list, {}, { autoJoin: false });
    a.press(PadButton.A);
    tick(input);
    b.press(PadButton.A);
    tick(input);
    expect(input.playerPad).toEqual([0, 1]);
    list[0] = null; // J1 se desconecta
    input.poll();
    expect(input.events).toEqual([{ type: "lost", player: 0, id: "Pad A" }]);
    expect(input.isLost(0)).toBe(true);
    expect(input.sample(0)).toBe(0); // sin botones pegados
    input.endTick();
    // Vuelve en otro índice (como hace el navegador a veces): mismo id → mismo jugador.
    list[0] = null;
    list[2] = new FakePad(2, "Pad A").press(PadButton.X);
    input.poll();
    expect(input.events[0]).toEqual({ type: "reconnected", player: 0, id: "Pad A" });
    expect(input.playerPad).toEqual([2, 1]);
    expect(input.sample(0)).toBe(LP);
  });

  it("con J1 esperando, otro mando que pulsa ocupa su hueco; o J1 sigue con teclado", () => {
    const a = new FakePad(0, "Pad A");
    const list: (FakePad | null)[] = [a, null];
    const { input, kb } = makeInput(list, {}, { autoJoin: false });
    a.press(PadButton.A);
    tick(input);
    list[0] = null;
    tick(input);
    expect(input.isLost(0)).toBe(true);
    list[1] = new FakePad(1, "Pad C").press(PadButton.A);
    tick(input);
    expect(input.playerPad).toEqual([1, null]);
    expect(input.isLost(0)).toBe(false);
    // Otro caso: se suelta al teclado.
    list[1] = null;
    tick(input);
    expect(input.isLost(0)).toBe(true);
    input.releaseToKeyboard(0);
    kb.down("KeyD");
    expect(tick(input)[0]).toBe(RIGHT);
    expect(input.isLost(0)).toBe(false);
  });

  it("un mando desconectado no deja botones pegados", () => {
    const pad = new FakePad().press(PadButton.X).stick(1, 0);
    const list: (FakePad | null)[] = [pad];
    const { input } = makeInput(list);
    expect(tick(input)[0]).toBe(LP | RIGHT);
    pad.connected = false;
    expect(tick(input)[0]).toBe(0);
  });
});

/** Juega una secuencia de masks del J1 en una partida y devuelve el hash final y los eventos de proyectil. */
function play(seq: number[]): { hash: string; fireball: boolean } {
  const s: GameState = placeAt(readyMatch(), 400);
  let fireball = false;
  for (const m of seq) {
    stepInPlace(s, m, 0);
    if (s.events.some((e) => e.type === "projectile")) fireball = true;
  }
  for (let i = 0; i < 20; i++) {
    stepInPlace(s, 0, 0);
    if (s.events.some((e) => e.type === "projectile")) fireball = true;
  }
  return { hash: hashValue(s), fireball };
}

describe("prueba clave: mismo movimiento, misma entrada para la simulación", () => {
  // Cuarto de círculo adelante + puño ligero: ↓, ↓, ↘, ↘, →+LP, → (dos ticks por paso, como una mano real).
  const STEPS = ["↓", "↓", "↘", "↘", "→LP", "→"] as const;

  function keyboardSeq(): number[] {
    const { input, kb } = makeInput([]);
    const out: number[] = [];
    const hold = (codes: string[]) => {
      for (const c of ["KeyS", "KeyD", "KeyJ"]) if (!codes.includes(c)) kb.up(c);
      for (const c of codes) kb.down(c);
    };
    for (const st of STEPS) {
      if (st === "↓") hold(["KeyS"]);
      else if (st === "↘") hold(["KeyS", "KeyD"]);
      else if (st === "→LP") hold(["KeyD", "KeyJ"]);
      else hold(["KeyD"]);
      out.push(tick(input)[0]);
    }
    return out;
  }

  function dpadSeq(): number[] {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const out: number[] = [];
    for (const st of STEPS) {
      pad.releaseAll();
      if (st === "↓") pad.press(PadButton.DOWN);
      else if (st === "↘") pad.press(PadButton.DOWN, PadButton.RIGHT);
      else if (st === "→LP") pad.press(PadButton.RIGHT, PadButton.X);
      else pad.press(PadButton.RIGHT);
      out.push(tick(input)[0]);
    }
    return out;
  }

  function stickSeq(): number[] {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const out: number[] = [];
    // El stick barre de abajo (90°) a la derecha (0°) sin apuntar exacto: 95°, 80°, 50°, 38°, 8°, 3°.
    const angles = [95, 80, 50, 38, 8, 3];
    STEPS.forEach((st, i) => {
      pad.releaseAll().stick(...at(angles[i], 0.9));
      if (st === "→LP") pad.press(PadButton.X);
      out.push(tick(input)[0]);
    });
    return out;
  }

  it("teclado, cruceta y stick producen exactamente la misma secuencia de bitmasks", () => {
    const k = keyboardSeq();
    expect(k).toEqual([DOWN, DOWN, DOWN | RIGHT, DOWN | RIGHT, RIGHT | LP, RIGHT]);
    expect(dpadSeq()).toEqual(k);
    expect(stickSeq()).toEqual(k);
  });

  it("y por tanto la simulación termina en el mismo estado, con la Onda lanzada", () => {
    const a = play(keyboardSeq());
    const b = play(dpadSeq());
    const c = play(stickSeq());
    expect(a.fireball).toBe(true);
    expect(b.hash).toBe(a.hash);
    expect(c.hash).toBe(a.hash);
  });

  it("cuarto de círculo cómodo con el stick: un arco descuidado (sin llegar al borde) también sale", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const seq: number[] = [];
    // Arco real a 60 Hz: empieza algo detrás de ↓ (100°), radio 0.7–0.8, termina pasado → (−5°), 9 lecturas.
    const path: [number, number][] = [[100, 0.7], [92, 0.75], [82, 0.8], [68, 0.8], [52, 0.78], [36, 0.76], [20, 0.8], [6, 0.8], [-5, 0.8]];
    path.forEach(([deg, r], i) => {
      pad.releaseAll().stick(...at(deg, r));
      if (i === path.length - 2) pad.press(PadButton.X);
      seq.push(tick(input)[0]);
    });
    expect(play(seq).fireball).toBe(true);
  });
});

describe("el mando no altera la simulación", () => {
  it("una partida con inputs grabados desde mando es reproducible (mismo hash dos veces)", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const masks: number[] = [];
    for (let i = 0; i < 300; i++) {
      pad.releaseAll().stick(...at((i * 37) % 360, (i % 7) / 6));
      if (i % 11 === 0) pad.press(PadButton.X);
      if (i % 17 === 0) pad.analog(PadButton.RT, 0.9);
      masks.push(tick(input)[0]);
    }
    const run = () => {
      const s = createMatch({}, 3);
      for (const m of masks) stepInPlace(s, m, 0);
      return hashValue(s);
    };
    expect(run()).toBe(run());
  });
});

describe("menús", () => {
  it("la calibración puede leer el menú sin el stick (el stick no mueve la selección)", () => {
    const pad = new FakePad().stick(0.7, 0.7);
    const { input } = makeInput([pad]);
    input.poll();
    expect(input.menu(false).down).toBe(false);
    expect(input.menu(false).right).toBe(false);
    input.endTick();
    pad.press(PadButton.DOWN);
    input.poll();
    expect(input.menu(false).down).toBe(true);
  });
});
