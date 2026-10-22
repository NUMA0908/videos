import { Btn } from "../sim/input";
import type { PadTuning } from "./padTuning";

/**
 * Lectura de mandos (Gamepad API) → estado digital por mando: botones pulsados y dirección (cruceta + stick).
 * Funciones puras y una clase sin DOM: los tests usan objetos que imitan `Gamepad`.
 */

/** Lo que usamos de un `Gamepad` (permite mandos simulados en los tests). */
export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ReadonlyArray<number>;
  readonly vibrationActuator?: unknown;
}

/** Botones del mapeo estándar W3C. */
export const PadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

/** Gatillos analógicos del mapeo estándar: usan el umbral configurable. */
const ANALOG_TRIGGERS = new Set<number>([PadButton.LT, PadButton.RT]);
/** Histéresis de los gatillos: se suelta un poco por debajo del umbral. */
const TRIGGER_RELEASE_GAP = 0.08;

// Sectores del stick: ángulo en grados (0 = derecha, 90 = abajo; el eje Y del Gamepad API crece hacia abajo).
const SECTORS: { center: number; mask: number; diagonal: boolean }[] = [
  { center: 0, mask: Btn.RIGHT, diagonal: false },
  { center: 45, mask: Btn.RIGHT | Btn.DOWN, diagonal: true },
  { center: 90, mask: Btn.DOWN, diagonal: false },
  { center: 135, mask: Btn.LEFT | Btn.DOWN, diagonal: true },
  { center: 180, mask: Btn.LEFT, diagonal: false },
  { center: 225, mask: Btn.LEFT | Btn.UP, diagonal: true },
  { center: 270, mask: Btn.UP, diagonal: false },
  { center: 315, mask: Btn.RIGHT | Btn.UP, diagonal: true },
];

function angleDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function halfWidth(diagonal: boolean, t: PadTuning): number {
  return (diagonal ? t.diagonalArc : 90 - t.diagonalArc) / 2;
}

/**
 * Stick analógico → dirección digital de 8 vías.
 * - Zona muerta **radial** (no por eje): la diagonal cuesta lo mismo que una cardinal.
 * - **Histéresis** de radio: se activa con `stickDeadzone` y se suelta por debajo de `stickRelease`.
 * - **Histéresis de sector**: no cambia de dirección hasta salir `sectorHysteresis` grados del sector actual.
 * `prev` es la dirección del tick anterior (0 = neutral).
 */
export function stickDirection(x: number, y: number, prev: number, t: PadTuning): number {
  const r = Math.hypot(x, y);
  if (r < (prev ? t.stickRelease : t.stickDeadzone)) return 0;
  let a = (Math.atan2(y, x) * 180) / Math.PI;
  if (a < 0) a += 360;
  if (prev) {
    for (const s of SECTORS) {
      if (s.mask === prev && angleDistance(a, s.center) <= halfWidth(s.diagonal, t) + t.sectorHysteresis) return prev;
    }
  }
  let best = SECTORS[0];
  let bestOver = Infinity;
  for (const s of SECTORS) {
    // Distancia al sector normalizada por su anchura: el más "dentro" gana (fronteras exactas sin huecos).
    const over = angleDistance(a, s.center) / halfWidth(s.diagonal, t);
    if (over < bestOver) {
      bestOver = over;
      best = s;
    }
  }
  return best.mask;
}

/** Cruceta del mapeo estándar → máscara de dirección. */
export function dpadDirection(buttons: ReadonlyArray<boolean>): number {
  let m = 0;
  if (buttons[PadButton.UP]) m |= Btn.UP;
  if (buttons[PadButton.DOWN]) m |= Btn.DOWN;
  if (buttons[PadButton.LEFT]) m |= Btn.LEFT;
  if (buttons[PadButton.RIGHT]) m |= Btn.RIGHT;
  return m;
}

/**
 * Estado de un mando entre ticks. `update` se llama una vez por tick con la lectura de ese tick;
 * reutiliza sus arrays (no genera basura).
 */
export class PadReader {
  connected = false;
  id = "";
  mapping = "";
  /** Botones digitales de este tick y del anterior. */
  readonly buttons: boolean[] = [];
  readonly prevButtons: boolean[] = [];
  /** Ejes crudos de este tick (para la calibración y la vista de entrada). */
  readonly axes: number[] = [];
  /** Dirección del stick izquierdo (con histéresis), de la cruceta y la combinada. */
  stickDir = 0;
  dpadDir = 0;
  dir = 0;
  /** Dirección del tick anterior (para detectar pulsaciones nuevas en los menús). */
  prevDir = 0;
  /** Referencia al objeto real (vibración). */
  pad: GamepadLike | null = null;

  update(gp: GamepadLike | null, t: PadTuning): void {
    this.prevButtons.length = this.buttons.length;
    for (let i = 0; i < this.buttons.length; i++) this.prevButtons[i] = this.buttons[i];
    this.prevDir = this.dir;
    if (!gp || !gp.connected) {
      this.connected = false;
      this.pad = null;
      this.buttons.length = 0;
      this.axes.length = 0;
      this.stickDir = this.dpadDir = this.dir = 0;
      return;
    }
    this.connected = true;
    this.pad = gp;
    this.id = gp.id;
    this.mapping = gp.mapping;
    const standard = gp.mapping === "standard";
    const n = gp.buttons.length;
    this.buttons.length = n;
    for (let i = 0; i < n; i++) {
      const b = gp.buttons[i];
      if (standard && ANALOG_TRIGGERS.has(i)) {
        // Gatillo analógico → digital con umbral configurable e histéresis.
        const was = this.prevButtons[i] === true;
        this.buttons[i] = b.value >= (was ? t.triggerThreshold - TRIGGER_RELEASE_GAP : t.triggerThreshold);
      } else {
        this.buttons[i] = b.pressed || b.value > 0.5;
      }
    }
    this.axes.length = gp.axes.length;
    for (let i = 0; i < gp.axes.length; i++) this.axes[i] = gp.axes[i];
    this.dpadDir = standard ? dpadDirection(this.buttons) : 0;
    this.stickDir = gp.axes.length >= 2 ? stickDirection(gp.axes[0], gp.axes[1], this.stickDir, t) : 0;
    // Cruceta y stick a la vez: se suman (el SOCD final resuelve contradicciones).
    this.dir = this.dpadDir | this.stickDir;
  }

  down(b: number): boolean {
    return this.buttons[b] === true;
  }

  pressed(b: number): boolean {
    return this.buttons[b] === true && this.prevButtons[b] !== true;
  }

  /** Alguna pulsación nueva en este tick (unirse, desbloquear audio). */
  anyPressed(): boolean {
    for (let i = 0; i < this.buttons.length; i++) if (this.buttons[i] && !this.prevButtons[i]) return true;
    return false;
  }
}
