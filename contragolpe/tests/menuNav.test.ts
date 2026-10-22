import { describe, expect, it } from "vitest";
import type { App } from "../src/app/App";
import { defaultSettings } from "../src/app/settings";
import { PadButton } from "../src/input/gamepad";
import type { InputManager } from "../src/input/InputManager";
import { nav } from "../src/scenes/nav";
import type { Scene } from "../src/scenes/Scene";
import { FakePad, makeInput, type FakeKeyboard } from "./padHelpers";

/** App mínima para correr las escenas reales sin DOM ni canvas (solo `update`, nunca `render`). */
class FakeApp {
  scene: Scene | null = null;
  settings = defaultSettings();
  time = 0;
  loop = { timeScale: 1 };
  ctx = {} as CanvasRenderingContext2D;
  audio = { play() {}, playMusic() {}, setVolumes() {}, duck() {}, unlock() {} };
  constructor(readonly input: InputManager) {}
  setScene(s: Scene): void {
    this.scene?.exit?.();
    this.scene = s;
    this.input.consume();
    s.enter?.();
  }
  saveSettings(): void {}
  resize(): void {}
  toast(): void {}
  async toggleFullscreen(): Promise<void> {}
  /** Un tick como en el juego: sondeo, escena, fin de tick. */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.time += 1 / 60;
      this.input.poll();
      this.scene?.update();
      this.input.endTick();
    }
  }
  get kind(): string | undefined {
    return this.scene?.kind;
  }
}

function setup(pads: (FakePad | null)[], autoJoin = true): { app: FakeApp; kb: FakeKeyboard; pads: (FakePad | null)[] } {
  const { input, kb } = makeInput(pads, {}, { autoJoin });
  const app = new FakeApp(input);
  nav.title(app as unknown as App);
  app.tick();
  return { app, kb, pads };
}

/** Pulsar y soltar un botón (un tick abajo, uno arriba). */
function tap(app: FakeApp, pad: FakePad, b: number, times = 1): void {
  for (let i = 0; i < times; i++) {
    pad.press(b);
    app.tick();
    pad.release(b);
    app.tick();
  }
}

const priv = <T>(o: unknown, k: string): T => (o as Record<string, T>)[k];

describe("menús solo con mando", () => {
  it("título → Versus CPU → personajes → escenario → combate → pausa → salir al menú, todo con el mando", () => {
    const pad = new FakePad();
    const { app } = setup([pad]);
    tap(app, pad, PadButton.DOWN, 2);
    tap(app, pad, PadButton.A);
    expect(app.kind).toBe("select");
    tap(app, pad, PadButton.RIGHT); // otro personaje
    tap(app, pad, PadButton.A); // el mío
    tap(app, pad, PadButton.A); // el rival
    app.tick(30);
    expect(app.kind).toBe("stage");
    tap(app, pad, PadButton.A);
    app.tick(40);
    expect(app.kind).toBe("match");
    app.tick(200); // presentación
    tap(app, pad, PadButton.START);
    expect(priv<boolean>(app.scene, "pauseOpen")).toBe(true);
    tap(app, pad, PadButton.UP); // de "Continuar" a la última opción: "Salir al menú"
    tap(app, pad, PadButton.A);
    expect(app.kind).toBe("title");
  });

  it("B/○ vuelve atrás en cada pantalla", () => {
    const pad = new FakePad();
    const { app } = setup([pad]);
    tap(app, pad, PadButton.A); // Arcade
    expect(app.kind).toBe("select");
    tap(app, pad, PadButton.B);
    expect(app.kind).toBe("title");
    tap(app, pad, PadButton.DOWN, 6);
    tap(app, pad, PadButton.A);
    expect(app.kind).toBe("options");
    tap(app, pad, PadButton.B);
    expect(app.kind).toBe("title");
  });

  it("sin dobles disparos: mantener A no atraviesa pantallas ni confirma dos veces", () => {
    const pad = new FakePad();
    const { app } = setup([pad]);
    pad.press(PadButton.A);
    app.tick(120); // dos segundos con A pulsado
    expect(app.kind).toBe("select"); // un solo avance: título → selección
    expect(priv<boolean[]>(app.scene, "locked")).toEqual([false, false]);
    pad.release(PadButton.A);
    app.tick();
    tap(app, pad, PadButton.A);
    expect(priv<boolean[]>(app.scene, "locked")[0]).toBe(true);
  });

  it("la misma pulsación que abre la pausa no elige una opción (Enter = pausa y aceptar)", () => {
    const pad = new FakePad();
    const { app, kb } = setup([pad]);
    tap(app, pad, PadButton.DOWN, 2);
    tap(app, pad, PadButton.A);
    tap(app, pad, PadButton.A, 2);
    app.tick(30);
    tap(app, pad, PadButton.A);
    app.tick(240);
    expect(app.kind).toBe("match");
    kb.down("Enter");
    app.tick();
    kb.up("Enter");
    app.tick(5);
    expect(priv<boolean>(app.scene, "pauseOpen")).toBe(true);
  });
});

describe("desconexión en plena partida", () => {
  function inMatch(): { app: FakeApp; kb: FakeKeyboard; list: (FakePad | null)[]; pad: FakePad } {
    const pad = new FakePad(0, "Pad A");
    const list: (FakePad | null)[] = [pad];
    const { app, kb } = setup(list);
    tap(app, pad, PadButton.DOWN, 2);
    tap(app, pad, PadButton.A);
    tap(app, pad, PadButton.A, 2);
    app.tick(30);
    tap(app, pad, PadButton.A);
    app.tick(240);
    expect(app.kind).toBe("match");
    return { app, kb, list, pad };
  }

  it("se pausa con aviso; al reconectar recupera al jugador y se continúa con A", () => {
    const { app, list, pad } = inMatch();
    list[0] = null;
    app.tick();
    expect(priv<boolean>(app.scene, "pauseOpen")).toBe(true);
    expect(priv<{ lost: number | null }>(app.scene, "padLost").lost).toBe(0);
    const frame = priv<{ state: { frame: number } }>(app.scene, "fight").state.frame;
    app.tick(60);
    expect(priv<{ state: { frame: number } }>(app.scene, "fight").state.frame).toBe(frame); // congelado
    list[0] = pad; // vuelve el mismo mando
    app.tick();
    expect(priv<{ lost: number | null }>(app.scene, "padLost").lost).toBeNull();
    expect(app.input.playerPad[0]).toBe(0);
    tap(app, pad, PadButton.A); // "Continuar"
    expect(priv<boolean>(app.scene, "pauseOpen")).toBe(false);
  });

  it("o se presiona una tecla y J1 sigue con teclado", () => {
    const { app, kb, list } = inMatch();
    list[0] = null;
    app.tick();
    kb.down("KeyD");
    app.tick();
    kb.up("KeyD");
    app.tick();
    expect(priv<{ lost: number | null }>(app.scene, "padLost").lost).toBeNull();
    expect(app.input.isLost(0)).toBe(false);
    expect(priv<boolean>(app.scene, "pauseOpen")).toBe(true); // la pausa sigue: se continúa a propósito
  });
});

describe("pantalla de unión (Versus)", () => {
  it("el primer mando que pulsa A es J1 y el segundo J2", () => {
    const a = new FakePad(0, "Pad A");
    const b = new FakePad(1, "Pad B");
    const { app } = setup([a, b], false);
    // El primero que pulsa en el título ya es J1; en la pantalla de unión se vuelve a elegir.
    tap(app, a, PadButton.DOWN);
    tap(app, a, PadButton.A);
    expect(app.kind).toBe("join");
    tap(app, b, PadButton.A);
    tap(app, a, PadButton.A);
    expect(app.input.playerPad).toEqual([1, 0]);
    app.tick(45);
    expect(app.kind).toBe("select");
  });

  it("teclado + mando: quien entra con las teclas de J1 las conserva aunque sea J2", () => {
    const a = new FakePad(0, "Pad A");
    const { app, kb } = setup([a], false);
    tap(app, a, PadButton.DOWN);
    tap(app, a, PadButton.A);
    expect(app.kind).toBe("join");
    tap(app, a, PadButton.A); // mando → J1
    kb.down("Enter");
    app.tick();
    kb.up("Enter");
    app.tick(45);
    expect(app.kind).toBe("select");
    expect(app.input.keySet).toEqual([1, 0]);
    // J2 mueve su cursor con WASD (las teclas de J1).
    const before = priv<number[]>(app.scene, "cursor")[1];
    kb.down("KeyD");
    app.tick();
    kb.up("KeyD");
    app.tick();
    expect(priv<number[]>(app.scene, "cursor")[1]).not.toBe(before);
  });

  it("B/○ saca a un mando sentado y, sin nadie, vuelve al título", () => {
    const a = new FakePad(0, "Pad A");
    const { app } = setup([a], false);
    tap(app, a, PadButton.DOWN);
    tap(app, a, PadButton.A);
    tap(app, a, PadButton.A);
    expect(app.input.playerPad[0]).toBe(0);
    tap(app, a, PadButton.B);
    expect(app.input.playerPad[0]).toBeNull();
    tap(app, a, PadButton.B);
    expect(app.kind).toBe("title");
  });
});
