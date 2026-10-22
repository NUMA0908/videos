import { getChar } from "../data/characters";
import { TUNING } from "../data/tuning";
import {
  advanceMovementState,
  controlEnabled,
  faceOpponent,
  NEUTRAL_STATES,
  neutralMovement,
  setState,
  toNeutral,
  updateBuffer,
} from "./fighter";
import { cleanSOCD, pushInput } from "./input";
import { integrate, resolveBodies } from "./physics";
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

/** Variante que muta el estado (para simulaciones masivas sin copias). */
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

  updateRound(s);

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
}

function updateFighter(s: GameState, side: Side): void {
  const f = s.fighters[side];
  const o = s.fighters[side === 0 ? 1 : 0];
  f.t++;
  if (f.throwProtect > 0) f.throwProtect--;

  advanceMovementState(s, f);

  if (NEUTRAL_STATES.has(f.state)) {
    f.idleT++;
    faceOpponent(f, o);
    if (controlEnabled(s)) neutralMovement(s, side);
    else {
      setState(f, "idle");
      f.vx = 0;
      f.crouching = false;
    }
  } else {
    f.idleT = 0;
  }
}

function onLand(s: GameState, f: FighterState): void {
  const o = s.fighters[f.side === 0 ? 1 : 0];
  const ch = getChar(f.char);
  f.vx = 0;
  if (f.state === "air") {
    setState(f, "land");
    f.landingRecovery = ch.jump.landing;
    faceOpponent(f, o);
    s.events.push({ type: "land", side: f.side, x: f.x, y: 0 });
  }
}

function updateRound(s: GameState): void {
  const r = s.round;
  r.t++;
  if (r.phase === "intro") {
    if (r.t === 1) s.events.push({ type: "round", side: 0, x: 0, y: 0 });
    if (r.t >= TUNING.round.introFrames) {
      r.phase = "fight";
      r.t = 0;
      s.events.push({ type: "fight", side: 0, x: 0, y: 0 });
      for (const f of s.fighters) toNeutral(f);
    }
  } else if (r.phase === "fight" && s.config.timer && r.timer > 0) {
    r.timer--;
  }
}
