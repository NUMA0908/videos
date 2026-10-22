import { getChar } from "../data/characters";
import { toPx } from "../sim/fixed";
import { Btn } from "../sim/input";
import { Rng } from "../sim/rng";
import type { GameState, Side } from "../sim/types";
import { dirMask, motionFrames } from "./macros";

/**
 * Bots de una sola táctica para el análisis de balance. Si alguno gana a la CPU con frecuencia,
 * esa táctica es dominante y hay que corregir el diseño (principios de Sirlin).
 */
export type BotFn = (s: GameState) => number;

export const ONE_TRICK_BOTS: Record<string, (side: Side, seed: number) => BotFn> = {
  /** Solo salta hacia delante y patea. */
  saltador: (side) => {
    let q: number[] = [];
    return (s) => {
      const me = s.fighters[side];
      if (q.length) return q.shift()!;
      if (me.state === "idle" || me.state === "walkF" || me.state === "walkB" || me.state === "crouch") {
        q = [Btn.UP | dirMask(6, me.facing), Btn.UP | dirMask(6, me.facing), Btn.UP | dirMask(6, me.facing)];
        return q.shift()!;
      }
      if (me.state === "air" && me.vy < 0 && toPx(me.y) < 110) return Btn.HK;
      return 0;
    };
  },
  /** Solo bloquea agachado (tortuga). */
  tortuga: (side) => (s) => dirMask(1, s.fighters[side].facing),
  /** Lanza proyectiles sin parar y bloquea mientras tanto. */
  zoner: (side) => {
    let q: number[] = [];
    return (s) => {
      const me = s.fighters[side];
      if (q.length) return q.shift()!;
      const mine = s.projectiles.some((p) => p.owner === side);
      if (!mine && (me.state === "idle" || me.state === "crouch" || me.state === "walkB")) {
        q = motionFrames([2, 3, 6], Btn.HP, me.facing, 1);
        return q.shift()!;
      }
      return dirMask(1, me.facing);
    };
  },
  /** Camina hacia delante y agarra. */
  agarrador: (side) => (s) => {
    const me = s.fighters[side];
    const o = s.fighters[side === 0 ? 1 : 0];
    const d = Math.abs(toPx(me.x - o.x));
    if (d < 88 && s.frame % 3 === 0) return Btn.LP | Btn.LK;
    return dirMask(6, me.facing);
  },
  /** Aprieta botones al azar. */
  machacador: (side, seed) => {
    const r = new Rng(seed);
    const btns = [Btn.LP, Btn.HP, Btn.LK, Btn.HK];
    return (s) => {
      const me = s.fighters[side];
      const dir = r.chance(0.3) ? dirMask(r.pick([1, 2, 3, 4, 6]), me.facing) : dirMask(6, me.facing);
      return r.chance(0.35) ? dir | r.pick(btns) : dir;
    };
  },
  /** Spamea el anti-aéreo cuando el rival está cerca. */
  dpSpam: (side) => {
    let q: number[] = [];
    return (s) => {
      const me = s.fighters[side];
      const o = s.fighters[side === 0 ? 1 : 0];
      if (q.length) return q.shift()!;
      if (Math.abs(toPx(me.x - o.x)) < 170 && (me.state === "idle" || me.state === "walkF")) {
        q = motionFrames([6, 2, 3], Btn.HP, me.facing, 1);
        return q.shift()!;
      }
      return dirMask(6, me.facing);
    };
  },
  /** Pulsa parry a ciegas todo el rato. */
  parrySpam: (side) => (s) => (s.frame % 4 === 0 ? Btn.PARRY : 0) | (s.frame % 40 < 20 ? 0 : dirMask(6, s.fighters[side].facing)),
};

void getChar;
