import { DEFAULT_KEYS } from "../src/input/bindings";
import type { GamepadLike } from "../src/input/gamepad";
import { InputManager, type PadProfiles } from "../src/input/InputManager";

/** Mando simulado: imita lo que devuelve `navigator.getGamepads()` para un mando. */
export class FakePad implements GamepadLike {
  id: string;
  index: number;
  mapping: string;
  connected = true;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  vibrationActuator?: unknown;
  constructor(index = 0, id = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)", mapping = "standard") {
    this.index = index;
    this.id = id;
    this.mapping = mapping;
    this.buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    this.axes = [0, 0, 0, 0];
  }
  /** Pulsa o suelta botones digitales (solo los indicados). */
  press(...ids: number[]): this {
    for (const b of ids) this.buttons[b] = { pressed: true, value: 1 };
    return this;
  }
  release(...ids: number[]): this {
    for (const b of ids) this.buttons[b] = { pressed: false, value: 0 };
    return this;
  }
  releaseAll(): this {
    for (let b = 0; b < this.buttons.length; b++) this.release(b);
    return this;
  }
  /** Valor analógico (gatillos): `pressed` como lo reporta Chrome (cualquier valor > 0). */
  analog(b: number, value: number): this {
    this.buttons[b] = { pressed: value > 0, value };
    return this;
  }
  stick(x: number, y: number): this {
    this.axes[0] = x;
    this.axes[1] = y;
    return this;
  }
}

/** "Ventana" mínima para el teclado: recibe los listeners y permite simular teclas. */
export class FakeKeyboard {
  private listeners = new Map<string, ((e: unknown) => void)[]>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  private emit(type: string, code: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ code, repeat: false, preventDefault() {} });
  }
  down(code: string): void {
    this.emit("keydown", code);
  }
  up(code: string): void {
    this.emit("keyup", code);
  }
}

/**
 * InputManager con mandos simulados y teclado falso. Por defecto los mandos ya conectados quedan unidos
 * (J1 el primero, J2 el segundo), como tras la pantalla de unión; `autoJoin: false` para probar la unión.
 */
export function makeInput(
  pads: (FakePad | null)[] = [],
  profiles: PadProfiles = {},
  opts: { autoJoin?: boolean } = {},
): { input: InputManager; kb: FakeKeyboard; pads: (FakePad | null)[] } {
  const input = new InputManager(structuredClone(DEFAULT_KEYS), profiles, () => pads);
  const kb = new FakeKeyboard();
  input.attach(kb as unknown as Window);
  if (opts.autoJoin !== false) {
    input.poll();
    let p = 0;
    for (let i = 0; i < pads.length && p < 2; i++) if (pads[i]?.connected) input.assign(p++ as 0 | 1, i);
    input.endTick();
  }
  return { input, kb, pads };
}

/** Un tick de entrada como en el juego: sondeo, muestreo de los dos jugadores y fin de tick. */
export function tick(input: InputManager): [number, number] {
  input.poll();
  const r: [number, number] = [input.sample(0), input.sample(1)];
  input.endTick();
  return r;
}
