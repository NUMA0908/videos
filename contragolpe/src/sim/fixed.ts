/**
 * Aritmética de la simulación. Todo lo que vive en el estado de juego son enteros:
 * las posiciones y velocidades se guardan en "sub-unidades" (SUB por píxel).
 * Así la simulación es idéntica en cualquier máquina (requisito para rollback).
 */
export const SUB = 100;

/** Convierte píxeles (dato de diseño, puede tener decimales) a sub-unidades enteras. */
export const px = (n: number): number => Math.round(n * SUB);

/** Sub-unidades → píxeles (solo para render/debug, nunca de vuelta a la simulación). */
export const toPx = (u: number): number => u / SUB;

/** División entera truncada hacia cero. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const sign = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Escala un entero por un porcentaje entero (redondeo hacia abajo). */
export const pct = (v: number, percent: number): number => Math.floor((v * percent) / 100);
