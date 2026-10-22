import { AXIS_BASE, HAT_BASE, isAxisCode, isButtonCode, isHatCode } from "./padCodes";
import type { PadKind } from "./padKind";

/** Nombres de los botones del mapeo estándar según el tipo de mando (texto; los íconos se dibujan aparte). */
const NAMES: Record<Exclude<PadKind, "raw">, string[]> = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "Cruceta ↑", "Cruceta ↓", "Cruceta ←", "Cruceta →", "Xbox"],
  playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "Cruceta ↑", "Cruceta ↓", "Cruceta ←", "Cruceta →", "PS"],
  // En el mapeo estándar el botón de abajo (0) es B y el de la derecha (1) es A en los mandos de Nintendo.
  switch: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "L3", "R3", "Cruceta ↑", "Cruceta ↓", "Cruceta ←", "Cruceta →", "Home"],
  generic: ["Abajo (1)", "Derecha (2)", "Izquierda (3)", "Arriba (4)", "L1", "R1", "L2", "R2", "Select", "Start", "L3", "R3", "Cruceta ↑", "Cruceta ↓", "Cruceta ←", "Cruceta →", "Guía"],
};

export function padCodeName(code: number, kind: PadKind): string {
  if (isButtonCode(code)) return kind !== "raw" ? (NAMES[kind][code] ?? `Botón ${code + 1}`) : `Botón ${code + 1}`;
  if (isAxisCode(code)) {
    const i = (code - AXIS_BASE) >> 1;
    return `Eje ${i + 1}${(code - AXIS_BASE) & 1 ? "−" : "+"}`;
  }
  if (isHatCode(code)) return `Cruceta (hat ${code - HAT_BASE + 1})`;
  return "?";
}
