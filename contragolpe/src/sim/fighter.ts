import { getChar } from "../data/characters";
import type { CharacterData } from "../data/types";
import { TUNING } from "../data/tuning";
import { idiv, px } from "./fixed";
import {
  BUFFERED_BUTTONS,
  inputAt,
  isDown,
  isUp,
  matchMotion,
  MOTIONS,
  NO_PRESS,
  pressedAt,
  toNumpad,
  type InputHistory,
} from "./input";
import type { FighterState, FState, GameState, Side } from "./types";

/** Estados en los que el personaje puede actuar libremente en el suelo. */
export const NEUTRAL_STATES: ReadonlySet<FState> = new Set(["idle", "walkF", "walkB", "crouch"]);

export function setState(f: FighterState, st: FState): void {
  if (f.state !== st) {
    f.state = st;
    f.t = 0;
  }
}

export function toNeutral(f: FighterState): void {
  setState(f, "idle");
  f.move = null;
  f.mf = 0;
  f.stun = 0;
  f.extraRecovery = 0;
  f.armorLeft = 0;
  f.contact = "none";
  f.chain = 0;
  f.crouching = false;
  f.vx = 0;
}

export function controlEnabled(s: GameState): boolean {
  return s.round.phase === "fight";
}

/** Actualiza la edad de las pulsaciones con buffer. Los frames congelados no envejecen el buffer. */
export function updateBuffer(f: FighterState, h: InputHistory, frozen: boolean): void {
  const pressed = pressedAt(h, 0);
  for (let i = 0; i < BUFFERED_BUTTONS.length; i++) {
    if (pressed & BUFFERED_BUTTONS[i]) f.buf[i] = 0;
    else if (f.buf[i] !== NO_PRESS && !frozen) {
      f.buf[i]++;
      if (f.buf[i] > TUNING.inputBuffer) f.buf[i] = NO_PRESS;
    }
  }
}

export function currentDir(s: GameState, side: Side): number {
  const f = s.fighters[side];
  return toNumpad(inputAt(s.inputs[side], 0), f.facing);
}

/** Mira al rival (solo en estados neutrales en el suelo). */
export function faceOpponent(f: FighterState, o: FighterState): void {
  if (o.x > f.x) f.facing = 1;
  else if (o.x < f.x) f.facing = -1;
}

/** Desplazamiento entero del frame `t` (1..n) de un dash que recorre `dist` sub-unidades frenando linealmente. */
export function dashStep(dist: number, n: number, t: number): number {
  if (t < 1 || t > n) return 0;
  const sum = (n * (n + 1)) / 2;
  const w = n - t + 1;
  let d = idiv(dist * w, sum);
  if (t === 1) {
    let total = 0;
    for (let i = 1; i <= n; i++) total += idiv(dist * (n - i + 1), sum);
    d += dist - total;
  }
  return d;
}

/** Frames de movimiento de un dash (el resto es recuperación). */
export const dashMoveFrames = (frames: number): number => Math.max(1, frames - 5);

function startJump(f: FighterState): void {
  setState(f, "prejump");
  f.vx = 0;
  f.crouching = false;
}

function launchJump(s: GameState, f: FighterState, ch: CharacterData): void {
  const dir = currentDir(s, f.side);
  // La dirección del salto se lee en el último frame de prejump (más permisivo).
  f.jumpDir = dir === 9 ? 1 : dir === 7 ? -1 : f.jumpDir;
  setState(f, "air");
  f.vy = px(ch.jump.vy);
  f.vx = f.jumpDir === 1 ? px(ch.jump.vxF) * f.facing : f.jumpDir === -1 ? px(-Math.abs(ch.jump.vxB)) * f.facing : 0;
  f.y = 1; // despega este frame
  f.airUsed = false;
  s.events.push({ type: "jump", side: f.side, x: f.x, y: 0 });
}

/**
 * Movimiento en neutral: caminar, agacharse, saltar, dash.
 * Devuelve true si se inició una acción.
 */
export function neutralMovement(s: GameState, side: Side): void {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  const h = s.inputs[side];
  const dir = currentDir(s, side);

  if (isUp(dir)) {
    f.jumpDir = dir === 9 ? 1 : dir === 7 ? -1 : 0;
    startJump(f);
    return;
  }

  const prevDir = toNumpad(inputAt(h, 1), f.facing);
  if (dir === 6 && prevDir !== 6 && matchMotion(h, f.facing, MOTIONS.dashF, TUNING.dashWindow)) {
    setState(f, "dashF");
    f.crouching = false;
    f.vx = 0;
    s.events.push({ type: "dash", side, x: f.x, y: 0 });
    return;
  }
  if (dir === 4 && prevDir !== 4 && matchMotion(h, f.facing, MOTIONS.dashB, TUNING.dashWindow)) {
    setState(f, "dashB");
    f.crouching = false;
    f.vx = 0;
    s.events.push({ type: "dash", side, x: f.x, y: 0 });
    return;
  }

  if (isDown(dir)) {
    setState(f, "crouch");
    f.crouching = true;
    f.vx = 0;
    return;
  }
  f.crouching = false;
  if (dir === 6) {
    setState(f, "walkF");
    f.vx = px(ch.walkF) * f.facing;
  } else if (dir === 4) {
    setState(f, "walkB");
    f.vx = -px(ch.walkB) * f.facing;
  } else {
    setState(f, "idle");
    f.vx = 0;
  }
}

/**
 * Avanza los temporizadores del estado actual (un frame no congelado).
 * Los estados de combate (attack, hitstun...) se amplían en `combat.ts`.
 */
export function advanceMovementState(s: GameState, f: FighterState): void {
  const ch = getChar(f.char);
  switch (f.state) {
    case "prejump":
      f.vx = 0;
      if (f.t >= ch.jump.prejump) launchJump(s, f, ch);
      break;
    case "land":
      f.vx = 0;
      if (f.t >= f.landingRecovery) toNeutral(f);
      break;
    case "dashF": {
      const n = dashMoveFrames(ch.dashF.frames);
      f.vx = dashStep(px(ch.dashF.distance), n, f.t) * f.facing;
      if (f.t >= ch.dashF.frames) toNeutral(f);
      break;
    }
    case "dashB": {
      const n = dashMoveFrames(ch.dashB.frames);
      f.vx = -dashStep(px(ch.dashB.distance), n, f.t) * f.facing;
      if (f.t >= ch.dashB.frames) toNeutral(f);
      break;
    }
    default:
      break;
  }
}
