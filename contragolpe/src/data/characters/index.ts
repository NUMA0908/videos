import type { CharacterData, MoveData, ProjectileData } from "../types";
import { CHISPA } from "./chispa";
import { MURALLA } from "./muralla";
import { RAYO } from "./rayo";

/** Registro de personajes jugables (orden = orden en la pantalla de selección). */
export const CHARACTERS: CharacterData[] = [RAYO, CHISPA, MURALLA];

const byId = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getChar(id: string): CharacterData {
  const c = byId.get(id);
  if (!c) throw new Error(`Personaje desconocido: ${id}`);
  return c;
}

export function getMove(charId: string, moveId: string): MoveData {
  const m = getChar(charId).moves[moveId];
  if (!m) throw new Error(`Movimiento desconocido: ${charId}/${moveId}`);
  return m;
}

export function getProjectile(charId: string, kind: string): ProjectileData {
  const p = getChar(charId).projectiles[kind];
  if (!p) throw new Error(`Proyectil desconocido: ${charId}/${kind}`);
  return p;
}
