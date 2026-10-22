import { Btn } from "../sim/input";
import type { PadReader } from "./gamepad";

/**
 * Una entrada física del mando como número (así los perfiles son simples listas de enteros en el JSON):
 *   0–99     botón n
 *   100+2·i  eje i hacia positivo (derecha/abajo)   ·   101+2·i  eje i hacia negativo
 *   200+i    "hat" en el eje i (cruceta de muchas palancas arcade sin mapeo estándar: un eje con 8 valores)
 */
export const AXIS_BASE = 100;
export const HAT_BASE = 200;
/** Un eje cuenta como pulsado a partir de aquí (los gatillos en eje van de −1 en reposo a +1). */
export const AXIS_THRESHOLD = 0.5;

export const axisCode = (axis: number, sign: 1 | -1): number => AXIS_BASE + axis * 2 + (sign < 0 ? 1 : 0);
export const hatCode = (axis: number): number => HAT_BASE + axis;
export const isButtonCode = (c: number): boolean => c >= 0 && c < AXIS_BASE;
export const isAxisCode = (c: number): boolean => c >= AXIS_BASE && c < HAT_BASE;
export const isHatCode = (c: number): boolean => c >= HAT_BASE && c < HAT_BASE + 20;
export const isValidCode = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && (isButtonCode(c) || isAxisCode(c) || isHatCode(c));

/** Ocho posiciones del hat, de arriba en sentido horario; el valor en reposo queda fuera de [−1, 1]. */
const HAT_DIRS = [Btn.UP, Btn.UP | Btn.RIGHT, Btn.RIGHT, Btn.DOWN | Btn.RIGHT, Btn.DOWN, Btn.DOWN | Btn.LEFT, Btn.LEFT, Btn.UP | Btn.LEFT];

/** Valor de un eje hat → dirección (0 en reposo). Las 8 posiciones están en −1 + k·2/7. */
export function hatDirection(v: number): number {
  if (!(v >= -1.05 && v <= 1.05)) return 0;
  const k = Math.round(((v + 1) * 7) / 2);
  return HAT_DIRS[k] ?? 0;
}

/** ¿Está activa esta entrada? `dirBit` solo se usa con el hat (qué dirección se pregunta). */
export function codeActive(r: PadReader, code: number, dirBit = 0): boolean {
  if (isButtonCode(code)) return r.down(code);
  if (isAxisCode(code)) {
    const i = (code - AXIS_BASE) >> 1;
    const sign = (code - AXIS_BASE) & 1 ? -1 : 1;
    const v = r.axes[i];
    return v !== undefined && v * sign > AXIS_THRESHOLD;
  }
  if (isHatCode(code)) {
    const v = r.axes[code - HAT_BASE];
    return v !== undefined && (hatDirection(v) & dirBit) !== 0;
  }
  return false;
}
