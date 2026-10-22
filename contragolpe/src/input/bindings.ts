import { Btn } from "../sim/input";

export type Action = "up" | "down" | "left" | "right" | "LP" | "HP" | "LK" | "HK" | "PARRY" | "SP";

export const ACTIONS: Action[] = ["up", "down", "left", "right", "LP", "HP", "LK", "HK", "PARRY", "SP"];

export const ACTION_LABEL: Record<Action, string> = {
  up: "Arriba (saltar)",
  down: "Abajo (agacharse)",
  left: "Izquierda",
  right: "Derecha",
  LP: "Puño ligero (LP)",
  HP: "Puño fuerte (HP)",
  LK: "Patada ligera (LK)",
  HK: "Patada fuerte (HK)",
  PARRY: "Parry",
  SP: "Especial simple (SP)",
};

export const ACTION_BIT: Record<Action, number> = {
  up: Btn.UP,
  down: Btn.DOWN,
  left: Btn.LEFT,
  right: Btn.RIGHT,
  LP: Btn.LP,
  HP: Btn.HP,
  LK: Btn.LK,
  HK: Btn.HK,
  PARRY: Btn.PARRY,
  SP: Btn.SP,
};

/** Teclas (KeyboardEvent.code) por acción. */
export type KeyBindings = Record<Action, string[]>;
/** Botones del gamepad (mapeo estándar W3C) por acción. */
export type PadBindings = Record<Action, number[]>;

export const DEFAULT_KEYS: [KeyBindings, KeyBindings] = [
  {
    up: ["KeyW"],
    down: ["KeyS"],
    left: ["KeyA"],
    right: ["KeyD"],
    LP: ["KeyJ"],
    HP: ["KeyK"],
    LK: ["KeyU"],
    HK: ["KeyI"],
    PARRY: ["KeyL"],
    SP: ["KeyO"],
  },
  {
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    LP: ["Numpad4"],
    HP: ["Numpad5"],
    LK: ["Numpad7"],
    HK: ["Numpad8"],
    PARRY: ["Numpad6"],
    SP: ["Numpad9"],
  },
];

/** Mapeo estándar: X=LP, Y=HP, A=LK, B=HK, RB=Parry, LB=Especial simple, cruceta = dirección. */
export const DEFAULT_PAD: PadBindings = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  LP: [2],
  HP: [3],
  LK: [0],
  HK: [1],
  PARRY: [5],
  SP: [4],
};

/** Gatillos como macros: LT = agarre (LP+LK), RT = súper (HP+HK). */
export const PAD_MACROS: { button: number; mask: number }[] = [
  { button: 6, mask: Btn.LP | Btn.LK },
  { button: 7, mask: Btn.HP | Btn.HK },
];

export const PAD_START = 9;
export const PAD_BACK = 8;

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Espacio",
  Enter: "Enter",
  ShiftLeft: "Shift izq.",
  ShiftRight: "Shift der.",
  ControlLeft: "Ctrl izq.",
  ControlRight: "Ctrl der.",
};

export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

const PAD_NAMES: Record<number, string> = {
  0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 8: "Select", 9: "Start",
  10: "L3", 11: "R3", 12: "Cruceta ↑", 13: "Cruceta ↓", 14: "Cruceta ←", 15: "Cruceta →",
};

export function padName(b: number): string {
  return PAD_NAMES[b] ?? `Botón ${b}`;
}
