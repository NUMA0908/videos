import { getChar, getMove } from "../data/characters";
import type { Box, CharacterData, MoveData } from "../data/types";
import { px } from "./fixed";
import type { FighterState } from "./types";

/** Caja en coordenadas de mundo (sub-unidades). y crece hacia arriba. */
export interface WorldBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function toWorld(f: Pick<FighterState, "x" | "y" | "facing">, b: Box): WorldBox {
  const near = px(b.x);
  const far = px(b.x + b.w);
  const x0 = f.facing === 1 ? f.x + near : f.x - far;
  const x1 = f.facing === 1 ? f.x + far : f.x - near;
  return { x0, x1, y0: f.y + px(b.y), y1: f.y + px(b.y + b.h) };
}

export function overlaps(a: WorldBox, b: WorldBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function anyOverlap(as: WorldBox[], bs: WorldBox[]): boolean {
  for (const a of as) for (const b of bs) if (overlaps(a, b)) return true;
  return false;
}

export function currentMove(f: FighterState): MoveData | null {
  return f.move ? getMove(f.char, f.move) : null;
}

export function isAirborne(f: FighterState): boolean {
  return f.y > 0 || f.state === "air" || f.state === "airHit" || f.state === "fall";
}

/** Postura del cuerpo para elegir hurtbox/pushbox. */
export function bodyStance(f: FighterState): "stand" | "crouch" | "air" {
  if (isAirborne(f)) return "air";
  return f.crouching ? "crouch" : "stand";
}

function baseHurt(ch: CharacterData, f: FighterState): Box[] {
  const st = bodyStance(f);
  return st === "air" ? ch.boxes.airHurt : st === "crouch" ? ch.boxes.crouchHurt : ch.boxes.standHurt;
}

/** Hurtboxes actuales (vacío si el personaje no puede ser golpeado: derribado, levantándose). */
export function hurtboxes(f: FighterState): WorldBox[] {
  if (f.state === "knockdown" || f.state === "wakeup" || f.state === "ko") return [];
  const ch = getChar(f.char);
  const boxes = baseHurt(ch, f).map((b) => toWorld(f, b));
  const mv = f.state === "attack" ? currentMove(f) : null;
  if (mv?.hurtboxes) {
    for (const tb of mv.hurtboxes) {
      if (f.mf >= tb.from && f.mf <= tb.to) for (const b of tb.boxes) boxes.push(toWorld(f, b));
    }
  }
  return boxes;
}

export function pushbox(f: FighterState): WorldBox {
  const ch = getChar(f.char);
  const st = bodyStance(f);
  const b = st === "air" ? ch.boxes.airPush : st === "crouch" ? ch.boxes.crouchPush : ch.boxes.standPush;
  return toWorld(f, b);
}

/** Hitboxes activas este frame, agrupadas por número de golpe. */
export function activeHitboxes(f: FighterState): { hit: number; boxes: WorldBox[] }[] {
  if (f.state !== "attack") return [];
  const mv = currentMove(f);
  if (!mv) return [];
  const out: { hit: number; boxes: WorldBox[] }[] = [];
  for (const tb of mv.hitboxes) {
    const hit = tb.hit ?? 0;
    if (f.mf >= tb.from && f.mf <= tb.to && !(f.hitMask & (1 << hit))) {
      out.push({ hit, boxes: tb.boxes.map((b) => toWorld(f, b)) });
    }
  }
  return out;
}
