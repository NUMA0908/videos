import type { Pose } from "./skeleton";

/**
 * Biblioteca de poses. Se escriben con objetivos (dónde está cada mano y cada tobillo respecto a la cadera)
 * y una pequeña IK de dos huesos calcula los ángulos. Así es fácil "dibujar" una pose pensando en el cuerpo,
 * y luego el animador interpola ángulos (movimientos suaves y naturales).
 */

/** Proporciones de referencia para la IK (las de Rayo). Otros personajes escalan los mismos ángulos. */
const REF = { torso: 60, shoulderDrop: 7, upperArm: 32, foreArm: 30, thigh: 44, shin: 45 };

type V2 = [number, number];

export interface PoseSpec {
  torso?: number;
  head?: number;
  hx?: number;
  /** Mano delantera/trasera respecto a la cadera (x adelante, y arriba). */
  hF?: V2;
  hB?: V2;
  /** Ángulos directos (si no se da la mano). */
  aF?: V2;
  aB?: V2;
  /** Tobillos respecto a la cadera. */
  fF?: V2;
  fB?: V2;
  lF?: V2;
  lB?: V2;
  /** Sentido del codo/rodilla: +1 antihorario, -1 horario (por defecto codos -1, rodillas +1). */
  elbowF?: 1 | -1;
  elbowB?: 1 | -1;
  kneeF?: 1 | -1;
  kneeB?: 1 | -1;
  rot?: number;
  hy?: number;
  ground?: number;
  open?: number;
}

const DEG = 180 / Math.PI;

/** Ángulo de extremidad (0 = abajo, 90 = adelante) de un vector. */
const limbAngle = (dx: number, dy: number) => Math.atan2(dx, -dy) * DEG;

/** IK de dos huesos: devuelve [ángulo del primer hueso, ángulo del segundo]. */
function twoBone(root: V2, target: V2, l1: number, l2: number, bend: 1 | -1): V2 {
  let dx = target[0] - root[0];
  let dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  const minD = Math.abs(l1 - l2) + 0.01;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  } else if (d < minD) {
    if (d === 0) dy = -1;
    const k = minD / Math.max(d, 1e-6);
    dx *= k;
    dy *= k;
    d = minD;
  }
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) * bend;
  const jx = root[0] + l1 * Math.cos(base + a);
  const jy = root[1] + l1 * Math.sin(base + a);
  return [limbAngle(jx - root[0], jy - root[1]), limbAngle(root[0] + dx - jx, root[1] + dy - jy)];
}

export function ik(spec: PoseSpec): Pose {
  const torso = spec.torso ?? 8;
  const t = torso / DEG;
  const sh: V2 = [Math.sin(t) * (REF.torso - REF.shoulderDrop), Math.cos(t) * (REF.torso - REF.shoulderDrop)];
  const arm = (hand: V2 | undefined, angles: V2 | undefined, dx: number, bend: 1 | -1, fallback: V2): V2 =>
    angles ?? (hand ? twoBone([sh[0] + dx, sh[1]], hand, REF.upperArm, REF.foreArm, bend) : fallback);
  const leg = (foot: V2 | undefined, angles: V2 | undefined, dx: number, bend: 1 | -1, fallback: V2): V2 =>
    angles ?? (foot ? twoBone([dx, 0], foot, REF.thigh, REF.shin, bend) : fallback);
  return {
    hx: spec.hx ?? 0,
    torso,
    head: spec.head ?? -4,
    aF: arm(spec.hF, spec.aF, 3, spec.elbowF ?? -1, [30, 150]),
    aB: arm(spec.hB, spec.aB, -3, spec.elbowB ?? -1, [20, 160]),
    lF: leg(spec.fF, spec.lF, 3, spec.kneeF ?? 1, [20, 5]),
    lB: leg(spec.fB, spec.lB, -3, spec.kneeB ?? 1, [-15, -25]),
    rot: spec.rot ?? 0,
    hy: spec.hy ?? 0,
    ground: spec.ground ?? 1,
    open: spec.open ?? 0,
  };
}

// Piernas y manos frecuentes
const STANCE_LEGS = { fF: [30, -80] as V2, fB: [-34, -80] as V2 };
const CROUCH_LEGS = { fF: [36, -50] as V2, fB: [-28, -50] as V2 };
const GUARD = { hF: [42, 50] as V2, hB: [26, 58] as V2 };

/** Poses comunes a todos los personajes (movimiento, defensa, reacciones). */
export const BASE_POSES: Record<string, Pose> = {
  stance: ik({ torso: 10, head: -6, ...GUARD, ...STANCE_LEGS }),
  stanceB: ik({ torso: 12, head: -5, hF: [42, 46], hB: [27, 54], fF: [30, -77], fB: [-34, -77] }),

  walk0: ik({ torso: 10, head: -6, ...GUARD, ...STANCE_LEGS }),
  walk1: ik({ torso: 12, head: -6, hF: [44, 50], hB: [26, 56], fF: [46, -70], fB: [-30, -82] }),
  walk2: ik({ torso: 12, head: -6, hF: [44, 48], hB: [28, 56], fF: [44, -81], fB: [-42, -78] }),
  walk3: ik({ torso: 10, head: -6, hF: [42, 50], hB: [26, 58], fF: [34, -82], fB: [-12, -70] }),

  crouch: ik({ torso: 28, head: -14, hF: [52, 38], hB: [36, 44], ...CROUCH_LEGS }),
  prejump: ik({ torso: 18, head: -8, hF: [40, 40], hB: [24, 46], fF: [30, -62], fB: [-30, -64] }),
  jumpUp: ik({ torso: 4, head: -6, hF: [30, 66], hB: [16, 72], fF: [14, -80], fB: [-14, -86] }),
  jumpTuck: ik({ torso: 12, head: -6, hF: [40, 42], hB: [26, 48], fF: [30, -38], fB: [6, -46] }),
  jumpDown: ik({ torso: 6, head: -6, hF: [36, 54], hB: [20, 60], fF: [26, -70], fB: [-18, -82] }),
  land: ik({ torso: 22, head: -10, hF: [44, 40], hB: [28, 46], fF: [34, -62], fB: [-32, -62] }),
  dashF: ik({ torso: 26, head: -10, hF: [40, 30], hB: [8, 36], fF: [50, -70], fB: [-44, -66] }),
  dashB: ik({ torso: -10, head: -4, hF: [32, 56], hB: [16, 62], fF: [40, -72], fB: [-28, -84] }),

  blockStand: ik({ torso: 2, head: -12, hF: [30, 72], hB: [36, 62], fF: [26, -82], fB: [-38, -78] }),
  blockCrouch: ik({ torso: 20, head: -14, hF: [40, 54], hB: [46, 44], ...CROUCH_LEGS }),

  hitHigh: ik({ torso: -18, head: -28, hF: [10, 34], hB: [-12, 28], fF: [36, -80], fB: [-30, -80] }),
  hitMid: ik({ torso: 28, head: 12, hF: [28, 10], hB: [18, 16], fF: [28, -82], fB: [-36, -78] }),
  hitCrouch: ik({ torso: -4, head: -20, hF: [14, 26], hB: [-6, 22], ...CROUCH_LEGS }),
  airHit: ik({ torso: -22, head: -25, hF: [-12, 70], hB: [-30, 60], fF: [34, -66], fB: [12, -80], rot: -25 }),
  airHit2: ik({ torso: -20, head: -20, hF: [-20, 64], hB: [-34, 52], fF: [40, -60], fB: [20, -76], rot: -70 }),
  lying: ik({ torso: 0, head: -8, hF: [-8, 10], hB: [-14, 14], fF: [6, -88], fB: [-6, -88], rot: -92 }),
  wakeup: ik({ torso: 40, head: -10, hF: [40, -10], hB: [30, -6], fF: [34, -44], fB: [-26, -46] }),

  win: ik({ torso: 0, head: -14, hF: [16, 118], hB: [-14, 26], fF: [22, -86], fB: [-24, -86] }),
  intro: ik({ torso: 4, head: 6, hF: [28, 64], hB: [30, 62], fF: [16, -86], fB: [-18, -86], open: 1 }),
  ko: ik({ torso: 0, head: -20, hF: [-20, 20], hB: [-26, 30], fF: [10, -88], fB: [-2, -88], rot: -92 }),

  parry: ik({ torso: 6, head: -8, hF: [56, 62], hB: [18, 48], fF: [36, -80], fB: [-32, -80], open: 1 }),
  parryLow: ik({ torso: 26, head: -10, hF: [60, 12], hB: [34, 40], ...CROUCH_LEGS, open: 1 }),
  parryAir: ik({ torso: 8, head: -8, hF: [56, 58], hB: [20, 46], fF: [30, -46], fB: [4, -54], open: 1 }),
  parryFail: ik({ torso: 32, head: 18, hF: [46, 18], hB: [-22, 30], fF: [42, -76], fB: [-36, -82] }),

  throwGrab: ik({ torso: 16, head: -6, hF: [60, 50], hB: [52, 56], fF: [34, -80], fB: [-38, -78], open: 1 }),
  throwToss: ik({ torso: -14, head: -10, hF: [-30, 84], hB: [-20, 80], fF: [36, -80], fB: [-36, -80] }),
  throwTech: ik({ torso: -6, head: -10, hF: [52, 44], hB: [44, 50], fF: [30, -82], fB: [-40, -78], open: 1 }),
};

export const POSES: Record<string, Pose> = { ...BASE_POSES };

/** Registra poses adicionales (las de ataques se definen junto a cada set de movimientos). */
export function registerPoses(extra: Record<string, Pose>): void {
  Object.assign(POSES, extra);
}

export function getPose(key: string): Pose {
  return POSES[key] ?? POSES.stance;
}
