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

/**
 * Acciones del mando: las del teclado más tres atajos de un botón.
 * Agarre = LP+LK y Súper = HP+HK son exactamente las combinaciones que ya acepta la simulación;
 * Pausa no llega a la simulación (solo menús).
 */
export type PadAction = Action | "THROW" | "SUPER" | "PAUSE";
export const PAD_ACTIONS: PadAction[] = ["up", "down", "left", "right", "LP", "HP", "LK", "HK", "THROW", "PARRY", "SUPER", "SP", "PAUSE"];
export const PAD_BUTTON_ACTIONS: PadAction[] = PAD_ACTIONS.filter((a) => a !== "up" && a !== "down" && a !== "left" && a !== "right");

export const PAD_ACTION_LABEL: Record<PadAction, string> = {
  ...ACTION_LABEL,
  THROW: "Agarre (LP+LK)",
  SUPER: "Súper (HP+HK)",
  SP: "Especial de un botón (SP)",
  PAUSE: "Pausa",
};

export const PAD_ACTION_BIT: Record<PadAction, number> = {
  ...ACTION_BIT,
  THROW: Btn.LP | Btn.LK,
  SUPER: Btn.HP | Btn.HK,
  PAUSE: 0,
};

/** Entradas del mando por acción (códigos de `padCodes.ts`: botón, eje o hat). */
export type PadBindings = Record<PadAction, number[]>;

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

/**
 * Diseño por defecto con mapeo estándar (remapeable):
 *   X/□ = LP · Y/△ = HP · A/✕ = LK · B/○ = HK · LB/L1 = agarre · RB/R1 = parry · RT/R2 = súper
 *   LT/L2 = especial de un botón (solo con "inputs simplificados") · Start/Options = pausa · cruceta = dirección.
 */
export const DEFAULT_PAD: PadBindings = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  LP: [2],
  HP: [3],
  LK: [0],
  HK: [1],
  THROW: [4],
  PARRY: [5],
  SUPER: [7],
  SP: [6],
  PAUSE: [9],
};

/**
 * Mando sin mapeo estándar: nada asignado (se configura con la guía paso a paso). Los ejes 0/1 se leen
 * siempre como stick, así que un mando genérico ya se mueve antes de configurarlo.
 */
export const DEFAULT_RAW_PAD: PadBindings = {
  up: [],
  down: [],
  left: [],
  right: [],
  LP: [],
  HP: [],
  LK: [],
  HK: [],
  THROW: [],
  PARRY: [],
  SUPER: [],
  SP: [],
  PAUSE: [],
};

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
