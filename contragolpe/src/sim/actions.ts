import { getChar, getMove } from "../data/characters";
import { totalFrames } from "../data/moves/common";
import type { CharacterData, MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import { currentDir, faceOpponent, setState } from "./fighter";
import { px } from "./fixed";
import {
  BUFFERED_BUTTONS,
  BUTTON_INDEX,
  Btn,
  HISTORY_LEN,
  isBack,
  isDown,
  matchMotion,
  MOTIONS,
  NO_PRESS,
  pressedAt,
  type ButtonName,
  type InputHistory,
} from "./input";
import { startParry } from "./parry";
import { hasProjectile, spawnProjectile } from "./projectiles";
import type { FighterState, GameState, Side } from "./types";

/**
 * Selección de acciones a partir del input. Prioridad: súper > especial > agarre > normal.
 * Contextos:
 *  - neutral: en el suelo y libre.
 *  - air: en el aire (normales aéreos).
 *  - cancel: tras el contacto de un ataque cancelable (chain / especial / súper según el movimiento).
 *  - kara: primeros frames de un normal, todavía convertible en agarre/especial/súper (tolerancia de pulsación).
 */
export type ActionContext = "neutral" | "air" | "cancel" | "kara";

const ATTACK_ORDER: ("HK" | "HP" | "LK" | "LP")[] = ["HK", "HP", "LK", "LP"];
const BUTTON_BIT: Record<ButtonName, number> = { LP: Btn.LP, HP: Btn.HP, LK: Btn.LK, HK: Btn.HK, PARRY: Btn.PARRY, SP: Btn.SP };

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

/** Frames desde la última pulsación del botón en el historial (NO_PRESS si no hay en `within`). */
function pressAgo(h: InputHistory, bit: number, within: number): number {
  for (let ago = 0; ago < Math.min(within, HISTORY_LEN - 2); ago++) if (pressedAt(h, ago) & bit) return ago;
  return NO_PRESS;
}

/** Edad efectiva de un botón: el buffer, o (en kara) una pulsación muy reciente ya consumida por el normal. */
function ageOf(s: GameState, f: FighterState, b: ButtonName, ctx: ActionContext): number {
  const a = bufAge(f, b);
  if (a !== NO_PRESS || ctx !== "kara") return a;
  return pressAgo(s.inputs[f.side], BUTTON_BIT[b], TUNING.karaWindow + 1);
}

/** Dos botones pulsados "a la vez" (dentro de `simultaneousGap`). */
export function together(s: GameState, f: FighterState, a: ButtonName, b: ButtonName, ctx: ActionContext): boolean {
  const ga = ageOf(s, f, a, ctx);
  const gb = ageOf(s, f, b, ctx);
  return ga !== NO_PRESS && gb !== NO_PRESS && Math.abs(ga - gb) <= TUNING.simultaneousGap;
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
  f.parryWindow = 0;
  if (mv.stance === "air") {
    f.airUsed = true;
    f.landingRecovery = mv.landingRecovery ?? 3;
  } else {
    f.crouching = mv.stance === "crouch";
    f.vx = 0;
  }
  if (mv.meterCost) f.meter = Math.max(0, f.meter - mv.meterCost);
  if (mv.meterOnWhiff) f.meter = Math.min(TUNING.meter.max, f.meter + mv.meterOnWhiff);
  if (mv.superFlash) {
    s.freeze = mv.superFlash;
    s.freezeOwner = f.side;
    s.events.push({ type: "super", side: f.side, x: f.x, y: f.y + px(120), move: moveId });
  } else if (mv.kind === "special") {
    s.events.push({ type: "special", side: f.side, x: f.x, y: f.y + px(100), move: moveId });
  } else {
    s.events.push({ type: "whiff", side: f.side, x: f.x, y: f.y + px(100), strength: mv.strength, move: moveId });
  }
  applyMoveMotion(f, mv);
  if (mv.projectile && mv.projectile.frame === 1) spawnProjectile(s, f, mv.projectile);
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

function canUse(s: GameState, f: FighterState, id: string): boolean {
  if (!id) return false;
  const mv = getMove(f.char, id);
  if (mv.projectile && hasProjectile(s, f.side)) return false;
  if (mv.meterCost && f.meter < mv.meterCost) return false;
  return true;
}

function trySuper(s: GameState, side: Side, ctx: ActionContext): boolean {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  if (!ch.super || !canUse(s, f, ch.super)) return false;
  const h = s.inputs[side];
  const punch = ageOf(s, f, "LP", ctx) !== NO_PRESS || ageOf(s, f, "HP", ctx) !== NO_PRESS;
  const motion = punch && matchMotion(h, f.facing, MOTIONS.qcf2, TUNING.superMotionWindow, TUNING.motionFinalWithin);
  const shortcut = together(s, f, "HP", "HK", ctx);
  if (!motion && !shortcut) return false;
  consume(f, "LP", "HP", "HK");
  startMove(s, f, ch.super);
  return true;
}

/** Versión del especial según el botón (si hay L y H, gana la pulsación más reciente; empate = fuerte). */
function trySpecial(s: GameState, side: Side, ctx: ActionContext): boolean {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  const h = s.inputs[side];
  const dir = currentDir(s, side);
  const qcfDone = matchMotion(h, f.facing, MOTIONS.qcf, TUNING.motionWindow, TUNING.motionFinalWithin);
  let best: { move: string; age: number; strong: boolean } | null = null;
  // La lista está en orden de prioridad por familias (mismo motion y mismo tipo de botón: puño o patada).
  // La primera familia que coincide decide; dentro de ella, la versión según el botón.
  let family: string | null = null;
  for (const sp of ch.specials) {
    const key = sp.motion + (sp.button === "LP" || sp.button === "HP" ? "P" : "K");
    if (family && key !== family) break;
    const age = ageOf(s, f, sp.button, ctx);
    if (age === NO_PRESS) continue;
    if (!matchMotion(h, f.facing, MOTIONS[sp.motion], TUNING.motionWindow, TUNING.motionFinalWithin)) continue;
    // Conflicto Z / cuarto de círculo: si se termina en → (no en ↘ ni ↓) gana el cuarto de círculo.
    if (sp.motion === "dp" && dir === 6 && qcfDone) continue;
    if (!canUse(s, f, sp.move)) continue;
    family = key;
    const strong = sp.button === "HP" || sp.button === "HK";
    if (!best || age < best.age || (age === best.age && strong && !best.strong)) best = { move: sp.move, age, strong };
  }
  if (!best) return trySimple(s, side);
  consume(f, "LP", "HP", "LK", "HK");
  startMove(s, f, best.move);
  return true;
}

/** Inputs simplificados: SP + dirección. */
function trySimple(s: GameState, side: Side): boolean {
  if (!s.config.simple[side]) return false;
  const f = s.fighters[side];
  if (!buffered(f, "SP")) return false;
  const ch = getChar(f.char);
  const dir = currentDir(s, side);
  const id = isDown(dir) ? ch.simple.down : dir === 6 || dir === 9 ? ch.simple.forward : isBack(dir) ? ch.simple.back : ch.simple.neutral;
  if (!canUse(s, f, id)) return false;
  consume(f, "SP");
  startMove(s, f, id);
  return true;
}

function tryThrow(s: GameState, side: Side, ctx: ActionContext): boolean {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  if (!ch.throw || f.y > 0) return false;
  if (!together(s, f, "LP", "LK", ctx)) return false;
  consume(f, "LP", "LK");
  f.throwBack = isBack(currentDir(s, side));
  startMove(s, f, ch.throw);
  return true;
}

function normalFor(ch: CharacterData, stance: "stand" | "crouch" | "air", b: "HK" | "HP" | "LK" | "LP", dir: number): string {
  if (stance === "stand" && ch.normals.command) {
    for (const c of ch.normals.command) if (c.button === b && c.dir === dir) return c.move;
  }
  return ch.normals[stance][b];
}

/** Botón de ataque con buffer más reciente (y más fuerte a igualdad). */
export function freshestAttack(f: FighterState, onlyLight = false): "HK" | "HP" | "LK" | "LP" | null {
  let best: "HK" | "HP" | "LK" | "LP" | null = null;
  let bestAge = NO_PRESS;
  for (const b of ATTACK_ORDER) {
    if (onlyLight && (b === "HK" || b === "HP")) continue;
    const a = bufAge(f, b);
    if (a < bestAge) {
      best = b;
      bestAge = a;
    }
  }
  return best;
}

function tryNormal(s: GameState, side: Side, ctx: ActionContext): boolean {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  const chain = ctx === "cancel";
  const b = freshestAttack(f, chain);
  if (!b) return false;
  const dir = currentDir(s, side);
  const stance = ctx === "air" ? "air" : isDown(dir) ? "crouch" : "stand";
  const id = normalFor(ch, stance, b, dir);
  if (!id) return false;
  if (chain && getMove(f.char, id).strength !== "light") return false;
  const chainCount = chain ? f.chain + 1 : 0;
  consume(f, b);
  startMove(s, f, id);
  f.chain = chainCount;
  return true;
}

function tryParryInput(s: GameState, side: Side): boolean {
  const f = s.fighters[side];
  if (!buffered(f, "PARRY") || f.parryCooldown > 0) return false;
  startParry(s, f, currentDir(s, side));
  return true;
}

/** Intenta una acción en el contexto dado. Devuelve true si empezó algo. */
export function tryActions(s: GameState, side: Side, ctx: ActionContext): boolean {
  const f = s.fighters[side];
  if (ctx === "air") {
    if (f.airUsed) return false;
    if (tryParryInput(s, side)) return true;
    return tryNormal(s, side, "air");
  }
  const cur = ctx === "neutral" ? null : moveOf(f);
  const cancels = cur?.cancels ?? [];
  const allowSuper = ctx !== "cancel" || cancels.includes("super");
  const allowSpecial = ctx !== "cancel" || cancels.includes("special");
  const allowThrow = ctx === "neutral" || ctx === "kara";
  const allowNormal = ctx === "neutral" || (ctx === "cancel" && cancels.includes("chain") && f.chain < TUNING.maxChain - 1);
  if (allowSuper && trySuper(s, side, ctx)) return true;
  if (allowSpecial && trySpecial(s, side, ctx)) return true;
  if (ctx === "neutral" && tryParryInput(s, side)) return true;
  if (allowThrow && tryThrow(s, side, ctx)) return true;
  if (allowNormal && tryNormal(s, side, ctx)) return true;
  return false;
}

/** ¿En qué contexto de cancelación está un personaje que ataca? (null = ninguno) */
export function attackContext(f: FighterState): ActionContext | null {
  const mv = moveOf(f);
  if (!mv) return null;
  if (mv.kind === "normal" && f.mf <= TUNING.karaWindow && f.contact === "none" && mv.stance !== "air") return "kara";
  if (f.contact !== "none" && f.contact !== "parried" && mv.cancels?.length && f.sinceContact <= TUNING.cancelWindow) return "cancel";
  return null;
}

/** Fin de un movimiento: vuelve a neutral o, si sigue en el aire, cae. */
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
