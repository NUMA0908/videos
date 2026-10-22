import type { Box, MoveData, TimedBoxes } from "../types";

type Required_ = "id" | "name" | "notation" | "startup" | "active" | "recovery" | "damage" | "hitstun" | "blockstun" | "anim";

/**
 * Atajo para definir movimientos con valores por defecto razonables.
 * `hit` = cajas activas durante todos los frames activos (atajo de `hitboxes`).
 * `limbHurt` = hurtbox extra de la extremidad que se extiende (desde el primer frame activo
 * hasta `limbHurtExtra` frames después del último): así los golpes fallados son castigables.
 */
export function defineMove(
  spec: Pick<MoveData, Required_> &
    Partial<MoveData> & { hit?: Box[]; limbHurt?: Box[]; limbHurtExtra?: number },
): MoveData {
  const strength = spec.strength ?? "light";
  const lastActive = spec.startup + spec.active - 1;
  const hitboxes: TimedBoxes[] = spec.hitboxes ?? (spec.hit ? [{ from: spec.startup, to: lastActive, boxes: spec.hit }] : []);
  const hurtboxes: TimedBoxes[] = [...(spec.hurtboxes ?? [])];
  if (spec.limbHurt) {
    hurtboxes.push({ from: spec.startup - 1, to: lastActive + (spec.limbHurtExtra ?? Math.ceil(spec.recovery / 2)), boxes: spec.limbHurt });
  }
  const { hit: _hit, limbHurt: _lh, limbHurtExtra: _lhe, ...rest } = spec;
  return {
    kind: "normal",
    stance: "stand",
    strength,
    hitstop: strength === "heavy" ? 9 : 4,
    pushback: strength === "heavy" ? 26 : 16,
    guard: "mid",
    meterOnHit: strength === "heavy" ? 40 : 20,
    meterOnBlock: strength === "heavy" ? 20 : 10,
    meterOnWhiff: 0,
    sfx: strength === "heavy" ? "heavy" : "light",
    ...rest,
    hitboxes,
    hurtboxes: hurtboxes.length ? hurtboxes : undefined,
  };
}

/** Total de frames de un movimiento (startup incluye el primer frame activo). */
export const totalFrames = (m: Pick<MoveData, "startup" | "active" | "recovery">): number =>
  m.startup - 1 + m.active + m.recovery;
