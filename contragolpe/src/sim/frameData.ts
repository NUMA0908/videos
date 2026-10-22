import { TUNING } from "../data/tuning";
import type { MoveData } from "../data/types";

/** Frames que el atacante sigue bloqueado tras el primer frame activo. */
export const lockAfterHit = (m: Pick<MoveData, "active" | "recovery">): number => m.active - 1 + m.recovery;

/** Ventaja en bloqueo = blockstun − ((active − 1) + recovery) */
export const blockAdvantage = (m: Pick<MoveData, "active" | "recovery" | "blockstun">): number =>
  m.blockstun - lockAfterHit(m);

/** Ventaja al pegar = hitstun − ((active − 1) + recovery) (counter hit suma su bonus de hitstun). */
export function hitAdvantage(m: Pick<MoveData, "active" | "recovery" | "hitstun" | "strength" | "chHitstunBonus">, counter = false): number {
  const bonus = counter ? (m.chHitstunBonus ?? TUNING.counterHit.hitstunBonus[m.strength]) : 0;
  return m.hitstun + bonus - lockAfterHit(m);
}

export const fmtAdv = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
