/**
 * Tipo de mando a partir de `Gamepad.id` y `mapping`. Decide los íconos que se muestran y qué perfil de
 * botones se usa (un perfil por tipo; los mandos sin mapeo estándar tienen uno por modelo).
 *
 * Ejemplos reales de `id` (Chrome/Electron; Firefox usa "045e-0b13-…"):
 *   "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"
 *   "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
 *   "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"
 */
export type PadKind = "xbox" | "playstation" | "switch" | "generic" | "raw";

export const PAD_KIND_LABEL: Record<PadKind, string> = {
  xbox: "Xbox",
  playstation: "PlayStation",
  switch: "Switch",
  generic: "Genérico",
  raw: "No estándar",
};

const VENDORS: [RegExp, PadKind][] = [
  [/045e|xbox|xinput|microsoft/i, "xbox"],
  [/054c|playstation|dualshock|dualsense|ps[345]/i, "playstation"],
  [/057e|nintendo|switch|pro controller|joy-?con/i, "switch"],
];

export function detectPadKind(id: string, mapping: string): PadKind {
  if (mapping !== "standard") return "raw";
  for (const [re, kind] of VENDORS) if (re.test(id)) return kind;
  return "generic";
}

/** Clave del perfil guardado: el tipo, o `raw:<id>` para mandos no estándar (cada modelo se configura aparte). */
export function profileKey(id: string, mapping: string): string {
  const kind = detectPadKind(id, mapping);
  return kind === "raw" ? `raw:${id.slice(0, 120)}` : kind;
}
