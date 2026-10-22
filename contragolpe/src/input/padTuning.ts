/**
 * Ajustes del mando: zona muerta, histéresis, sectores del stick y umbral de gatillos.
 * Este archivo es la "configuración de fábrica"; el jugador los cambia en Opciones → Mando y se guardan
 * con el resto de ajustes (`settings.padTuning`).
 */
export interface PadTuning {
  /** Radio del stick (0..1) a partir del cual marca una dirección. */
  stickDeadzone: number;
  /** Radio por debajo del cual se suelta (histéresis: más bajo que `stickDeadzone`, evita parpadeos en el borde). */
  stickRelease: number;
  /**
   * Ancho en grados de cada sector diagonal (los cardinales ocupan 90 − esto). Más de 45° = diagonales
   * "generosas": el cuarto de círculo con el stick pasa por ↘ sin tener que apuntar con precisión.
   */
  diagonalArc: number;
  /** Margen en grados para no saltar de sector en la frontera entre dos direcciones. */
  sectorHysteresis: number;
  /** Gatillos analógicos (LT/RT): valor a partir del cual cuentan como pulsados. */
  triggerThreshold: number;
}

export const DEFAULT_PAD_TUNING: PadTuning = {
  stickDeadzone: 0.45,
  stickRelease: 0.32,
  diagonalArc: 56,
  sectorHysteresis: 6,
  triggerThreshold: 0.45,
};

/** Rangos válidos (para validar lo guardado y para los controles de Opciones). */
export const PAD_TUNING_LIMITS: Record<keyof PadTuning, [number, number]> = {
  stickDeadzone: [0.2, 0.85],
  stickRelease: [0.1, 0.85],
  diagonalArc: [30, 70],
  sectorHysteresis: [0, 15],
  triggerThreshold: [0.1, 0.9],
};

/** Valida y corrige unos ajustes (de un archivo o de Opciones): nunca deja valores imposibles. */
export function sanitizePadTuning(raw: unknown): PadTuning {
  const out = { ...DEFAULT_PAD_TUNING };
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof PadTuning)[]) {
      const v = r[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        const [lo, hi] = PAD_TUNING_LIMITS[k];
        out[k] = Math.max(lo, Math.min(hi, v));
      }
    }
  }
  // La histéresis solo tiene sentido si soltar es más fácil que activar.
  out.stickRelease = Math.min(out.stickRelease, out.stickDeadzone - 0.05);
  return out;
}
