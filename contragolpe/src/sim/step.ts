import { getChar } from "../data/characters";
import { TUNING } from "../data/tuning";
import { applyMoveMotion, endMove, moveOf, moveTotal, tryAirNormal, tryGroundNormal } from "./actions";
import { resolveStrikes } from "./combat";
import {
  advanceMovementState,
  controlEnabled,
  currentDir,
  faceOpponent,
  NEUTRAL_STATES,
  neutralMovement,
  recover,
  setState,
  updateBuffer,
} from "./fighter";
import { cleanSOCD, isDown, pushInput } from "./input";
import { integrate, resolveBodies } from "./physics";
import { updateRoundEnd, updateRoundStart } from "./round";
import { cloneState } from "./state";
import type { FighterState, GameState, Side } from "./types";

/**
 * Un tick de simulación (1/60 s). Función pura: no modifica `prev`.
 * Mismos inputs ⇒ mismo estado resultante, siempre.
 */
export function step(prev: GameState, in0: number, in1: number): GameState {
  const s = cloneState(prev);
  stepInPlace(s, in0, in1);
  return s;
}

/**
 * Variante que muta el estado (para simulaciones masivas sin copias).
 * Orden: inputs → ronda → personajes (estado + acciones) → física → cuerpos → golpes → fin de ronda.
 */
export function stepInPlace(s: GameState, in0: number, in1: number): void {
  s.events = [];
  s.frame++;
  const raw: [number, number] = [in0, in1];

  for (const side of [0, 1] as const) {
    const f = s.fighters[side];
    const frozen = s.freeze > 0 || f.hitstop > 0;
    pushInput(s.inputs[side], cleanSOCD(raw[side]), frozen);
    updateBuffer(f, s.inputs[side], frozen);
  }

  if (s.freeze > 0) {
    s.freeze--;
    return;
  }

  updateRoundStart(s);

  const prevX: [number, number] = [s.fighters[0].x, s.fighters[1].x];
  const frozen: [boolean, boolean] = [s.fighters[0].hitstop > 0, s.fighters[1].hitstop > 0];

  for (const side of [0, 1] as const) {
    const f = s.fighters[side];
    if (frozen[side]) {
      f.hitstop--;
      continue;
    }
    updateFighter(s, side);
  }

  for (const side of [0, 1] as const) {
    if (frozen[side]) continue;
    const f = s.fighters[side];
    if (integrate(f)) onLand(s, f);
  }

  resolveBodies(s, prevX);
  resolveStrikes(s);
  updateRoundEnd(s);
}

function advanceAttack(f: FighterState): void {
  const mv = moveOf(f);
  if (!mv) {
    endMove(f);
    return;
  }
  f.mf++;
  if (f.contact !== "none") f.sinceContact++;
  applyMoveMotion(f, mv);
  if (mv.stance === "air") {
    if (f.mf > moveTotal(mv)) {
      setState(f, "air");
      f.move = null;
      f.mf = 0;
    }
  } else if (f.mf > moveTotal(mv) + f.extraRecovery) {
    endMove(f);
  }
}

function updateFighter(s: GameState, side: Side): void {
  const f = s.fighters[side];
  const o = s.fighters[side === 0 ? 1 : 0];
  f.t++;
  if (f.throwProtect > 0) f.throwProtect--;

  switch (f.state) {
    case "attack":
      advanceAttack(f);
      break;
    case "hitstun":
      if (f.stun > 0) f.stun--;
      else recover(f);
      break;
    case "blockstun":
      if (f.stun > 0) {
        f.stun--;
        // Se puede cambiar de guardia alta a baja durante el blockstun.
        f.crouching = isDown(currentDir(s, side));
      } else recover(f);
      break;
    case "knockdown":
      f.vx = 0;
      if (f.t >= TUNING.knockdown.groundFrames) setState(f, "wakeup");
      break;
    case "wakeup":
      if (f.t >= TUNING.knockdown.wakeupFrames) recover(f);
      break;
    case "win":
    case "intro":
      f.vx = 0;
      break;
    default:
      advanceMovementState(s, f);
  }

  if (NEUTRAL_STATES.has(f.state)) {
    f.idleT++;
    faceOpponent(f, o);
    if (controlEnabled(s)) {
      if (!tryGroundNormal(s, side)) neutralMovement(s, side);
    } else {
      setState(f, "idle");
      f.vx = 0;
      f.crouching = false;
    }
  } else {
    f.idleT = 0;
    if (f.state === "air" && controlEnabled(s)) tryAirNormal(s, side);
  }
}

function onLand(s: GameState, f: FighterState): void {
  const o = s.fighters[f.side === 0 ? 1 : 0];
  const ch = getChar(f.char);
  f.vx = 0;
  switch (f.state) {
    case "air":
      setState(f, "land");
      f.landingRecovery = f.airUsed ? f.landingRecovery : ch.jump.landing;
      faceOpponent(f, o);
      s.events.push({ type: "land", side: f.side, x: f.x, y: 0 });
      break;
    case "attack": {
      const mv = moveOf(f);
      if (mv && (mv.stance === "air" || mv.landingRecovery !== undefined)) {
        setState(f, "land");
        f.landingRecovery = mv.landingRecovery ?? 3;
        f.move = null;
        f.mf = 0;
        faceOpponent(f, o);
        s.events.push({ type: "land", side: f.side, x: f.x, y: 0 });
      }
      break;
    }
    case "fall": {
      const mv = moveOf(f);
      setState(f, "land");
      f.landingRecovery = mv?.landingRecovery ?? 6;
      f.move = null;
      f.mf = 0;
      faceOpponent(f, o);
      s.events.push({ type: "land", side: f.side, x: f.x, y: 0 });
      break;
    }
    case "airHit":
      if (f.airReset) {
        setState(f, "land");
        f.landingRecovery = TUNING.knockdown.landingAfterReset;
        f.airReset = false;
        faceOpponent(f, o);
      } else {
        setState(f, "knockdown");
        s.events.push({ type: "knockdown", side: f.side, x: f.x, y: 0 });
      }
      break;
    case "thrown":
      setState(f, "knockdown");
      s.events.push({ type: "knockdown", side: f.side, x: f.x, y: 0 });
      break;
    case "ko":
      s.events.push({ type: "knockdown", side: f.side, x: f.x, y: 0 });
      break;
    default:
      break;
  }
}
