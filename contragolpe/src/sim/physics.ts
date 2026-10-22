import { getChar } from "../data/characters";
import { TUNING } from "../data/tuning";
import { overlaps, pushbox } from "./boxes";
import { idiv, px } from "./fixed";
import type { FighterState, GameState } from "./types";

export const WALL_MIN = px(40);
export const WALL_MAX = px(TUNING.stage.width - 40);

export function gravityOf(f: FighterState): number {
  return px(getChar(f.char).jump.gravity);
}

/** Integra posición. Devuelve true si el personaje aterrizó este frame. */
export function integrate(f: FighterState): boolean {
  let dx = f.vx;
  if (f.pushT > 0) {
    dx += f.pushVx;
    // Frenado lineal del empuje.
    f.pushVx = f.pushT > 1 ? f.pushVx - idiv(f.pushVx, f.pushT) : 0;
    f.pushT--;
  }
  f.x += dx;
  if (f.y > 0 || f.vy > 0) {
    f.y += f.vy;
    f.vy -= gravityOf(f);
    if (f.y <= 0) {
      f.y = 0;
      f.vy = 0;
      return true;
    }
  }
  return false;
}

/** Aplica un empuje que se reparte en `TUNING.pushbackFrames` frames frenando. */
export function applyPush(f: FighterState, distance: number): void {
  const n = TUNING.pushbackFrames;
  // Con frenado lineal desde v0 hasta 0 en n frames la distancia es ~ v0 * (n+1) / 2.
  f.pushVx = idiv(distance * 2, n + 1);
  f.pushT = n;
}

function clampWall(f: FighterState): number {
  if (f.x < WALL_MIN) {
    const d = WALL_MIN - f.x;
    f.x = WALL_MIN;
    return d;
  }
  if (f.x > WALL_MAX) {
    const d = WALL_MAX - f.x;
    f.x = WALL_MAX;
    return d;
  }
  return 0;
}

export function atWall(f: FighterState, dir: 1 | -1): boolean {
  return dir === -1 ? f.x <= WALL_MIN : f.x >= WALL_MAX;
}

/**
 * Pushboxes: los personajes no se atraviesan. Si uno está contra la pared, el otro absorbe todo el empuje.
 * También limita la separación máxima (lo que cabe en cámara).
 */
export function resolveBodies(s: GameState, prevX: [number, number]): void {
  const [a, b] = s.fighters;
  clampWall(a);
  clampWall(b);

  const ignore = (f: FighterState) => f.state === "thrown" || (f.state === "ko" && f.y > 0);
  if (!ignore(a) && !ignore(b)) {
    for (let pass = 0; pass < 2; pass++) {
      const pa = pushbox(a);
      const pb = pushbox(b);
      if (!overlaps(pa, pb)) break;
      const overlap = Math.min(pa.x1, pb.x1) - Math.max(pa.x0, pb.x0);
      // ¿Quién queda a la izquierda? Por posición; si empatan, por la posición previa; luego por lado.
      const aLeft = a.x !== b.x ? a.x < b.x : prevX[0] !== prevX[1] ? prevX[0] < prevX[1] : a.side === 0;
      const left = aLeft ? a : b;
      const right = aLeft ? b : a;
      const leftWall = left.x <= WALL_MIN;
      const rightWall = right.x >= WALL_MAX;
      if (leftWall && !rightWall) right.x += overlap;
      else if (rightWall && !leftWall) left.x -= overlap;
      else {
        const half = idiv(overlap, 2);
        left.x -= half;
        right.x += overlap - half;
      }
      clampWall(a);
      clampWall(b);
    }
  }

  // Separación máxima: retrocede quien se esté alejando.
  const maxSep = px(TUNING.stage.maxSeparation);
  const dist = Math.abs(a.x - b.x);
  if (dist > maxSep) {
    const excess = dist - maxSep;
    const aLeft = a.x < b.x;
    const outA = aLeft ? prevX[0] - a.x : a.x - prevX[0];
    const outB = aLeft ? b.x - prevX[1] : prevX[1] - b.x;
    let shareA: number;
    if (outA > 0 && outB > 0) shareA = idiv(excess, 2);
    else if (outA > 0) shareA = excess;
    else if (outB > 0) shareA = 0;
    else shareA = idiv(excess, 2);
    const shareB = excess - shareA;
    a.x += aLeft ? shareA : -shareA;
    b.x += aLeft ? -shareB : shareB;
  }
}
