import { getChar, getMove } from "../data/characters";
import { totalFrames } from "../data/moves/common";
import type { CharacterData, MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import { currentDir, faceOpponent, setState } from "./fighter";
import { px } from "./fixed";
import { BUFFERED_BUTTONS, BUTTON_INDEX, isDown, NO_PRESS, type ButtonName } from "./input";
import type { FighterState, GameState, Side } from "./types";

/** Botones de ataque en orden de fuerza (a igualdad de edad gana el más fuerte). */
const ATTACK_ORDER: ("HK" | "HP" | "LK" | "LP")[] = ["HK", "HP", "LK", "LP"];

export function bufAge(f: FighterState, b: ButtonName): number {
  return f.buf[BUTTON_INDEX[b]];
}

export function buffered(f: FighterState, b: ButtonName): boolean {
  return f.buf[BUTTON_INDEX[b]] !== NO_PRESS;
}

export function consume(f: FighterState, ...buttons: ButtonName[]): void {
  for (const b of buttons) f.buf[BUTTON_INDEX[b]] = NO_PRESS;
}

export function consumeAll(f: FighterState): void {
  for (let i = 0; i < BUFFERED_BUTTONS.length; i++) f.buf[i] = NO_PRESS;
}

/** Botón de ataque con buffer más reciente (y más fuerte a igualdad). */
export function freshestAttack(f: FighterState): "HK" | "HP" | "LK" | "LP" | null {
  let best: "HK" | "HP" | "LK" | "LP" | null = null;
  let bestAge = NO_PRESS;
  for (const b of ATTACK_ORDER) {
    const a = bufAge(f, b);
    if (a < bestAge) {
      best = b;
      bestAge = a;
    }
  }
  return best;
}

export function moveOf(f: FighterState): MoveData | null {
  return f.move ? getMove(f.char, f.move) : null;
}

export function moveTotal(mv: MoveData): number {
  return totalFrames(mv);
}

/** Empieza un movimiento: este mismo tick es su frame 1. */
export function startMove(s: GameState, f: FighterState, moveId: string): void {
  const o = s.fighters[f.side === 0 ? 1 : 0];
  const mv = getMove(f.char, moveId);
  const wasAir = f.y > 0;
  if (!wasAir) faceOpponent(f, o);
  f.state = "attack";
  f.t = 0;
  f.move = moveId;
  f.mf = 1;
  f.hitMask = 0;
  f.contact = "none";
  f.contactMf = 0;
  f.sinceContact = 0;
  f.extraRecovery = 0;
  f.armorLeft = mv.armor?.hits ?? 0;
  if (mv.stance === "air") {
    f.airUsed = true;
    f.landingRecovery = mv.landingRecovery ?? 3;
  } else {
    f.crouching = mv.stance === "crouch";
    f.vx = 0;
  }
  if (mv.meterCost) f.meter -= mv.meterCost;
  if (mv.meterOnWhiff) f.meter = Math.min(TUNING.meter.max, f.meter + mv.meterOnWhiff);
  applyMoveMotion(f, mv);
}

/** Velocidades impuestas por el movimiento en el frame actual. */
export function applyMoveMotion(f: FighterState, mv: MoveData): void {
  if (!mv.motion) {
    if (mv.stance !== "air" && f.y === 0) f.vx = 0;
    return;
  }
  let set = false;
  for (const m of mv.motion) {
    if (f.mf >= m.from && f.mf <= m.to) {
      if (m.vx !== undefined) {
        f.vx = px(m.vx) * f.facing;
        set = true;
      }
      if (m.vy !== undefined && f.mf === m.from) {
        f.vy = px(m.vy);
        f.y = Math.max(f.y, 1);
      }
    }
  }
  if (!set && f.y === 0 && mv.stance !== "air") f.vx = 0;
}

function normalFor(ch: CharacterData, stance: "stand" | "crouch" | "air", b: "HK" | "HP" | "LK" | "LP", dir: number): string {
  if (stance === "stand" && ch.normals.command) {
    for (const c of ch.normals.command) if (c.button === b && c.dir === dir) return c.move;
  }
  return ch.normals[stance][b];
}

/**
 * Intenta empezar un normal en el suelo con lo que haya en el buffer.
 * (Las fases siguientes añaden súper, especiales, agarres y parry con mayor prioridad.)
 */
export function tryGroundNormal(s: GameState, side: Side): boolean {
  const f = s.fighters[side];
  const b = freshestAttack(f);
  if (!b) return false;
  const ch = getChar(f.char);
  const dir = currentDir(s, side);
  const id = normalFor(ch, isDown(dir) ? "crouch" : "stand", b, dir);
  if (!id) return false;
  consume(f, b);
  startMove(s, f, id);
  return true;
}

export function tryAirNormal(s: GameState, side: Side): boolean {
  const f = s.fighters[side];
  if (f.airUsed) return false;
  const b = freshestAttack(f);
  if (!b) return false;
  const id = getChar(f.char).normals.air[b];
  if (!id) return false;
  consume(f, b);
  startMove(s, f, id);
  return true;
}

/** Fin de un movimiento en el suelo: vuelve a neutral o, si sigue en el aire, cae. */
export function endMove(f: FighterState): void {
  if (f.y > 0) {
    setState(f, "fall");
    return;
  }
  f.state = "idle";
  f.t = 0;
  f.move = null;
  f.mf = 0;
  f.extraRecovery = 0;
  f.contact = "none";
  f.chain = 0;
  f.vx = 0;
}
