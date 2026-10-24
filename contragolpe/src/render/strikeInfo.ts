import { getChar } from "../data/characters";

/**
 * Qué tipo de golpe es un evento de la simulación (para elegir efecto visual y sonido).
 * Solo lee datos: la simulación no sabe nada de esto.
 */
export interface StrikeInfo {
  /** Extremidad que golpea ("none" = proyectil, agarre o energía sin extremidad). */
  limb: "punch" | "kick" | "none";
  /** Especial o súper (se dibuja/suena con la energía del personaje). */
  special: boolean;
}

const NONE: StrikeInfo = { limb: "none", special: true };

/** `moveId` es el `move` del evento: un movimiento o, en golpes de proyectil, el tipo de proyectil. */
export function strikeInfo(charId: string, moveId: string | undefined): StrikeInfo {
  if (!moveId) return NONE;
  const mv = getChar(charId).moves[moveId];
  if (!mv) return NONE;
  const l = mv.anim.limb;
  const limb = l === "handF" || l === "handB" ? "punch" : l === "footF" || l === "footB" ? "kick" : "none";
  return { limb, special: mv.kind === "special" || mv.kind === "super" || limb === "none" };
}
