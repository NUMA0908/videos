import { getChar, getMove } from "../data/characters";
import type { MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import type { FighterState } from "../sim/types";
import "./movePoses";
import { getPose, POSES } from "./poses";
import { lerpPose, type Pose } from "./skeleton";

/**
 * Elige la pose de un personaje a partir de su estado de simulación (solo lectura).
 * Todo lo de aquí es presentación: puede usar decimales y curvas sin afectar al determinismo.
 */

/** Pose base con variante por personaje ("chispa.stance" manda sobre "stance"). */
function cp(char: string, key: string): Pose {
  return POSES[`${char}.${key}`] ?? getPose(key);
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

function cycle(char: string, keys: string[], phase: number): Pose {
  const n = keys.length;
  const p = (((phase % 1) + 1) % 1) * n;
  const i = Math.floor(p);
  return lerpPose(cp(char, keys[i]), cp(char, keys[(i + 1) % n]), easeInOut(p - i));
}

function basePoseFor(mv: MoveData): string {
  if (mv.motion?.some((m) => m.vy !== undefined)) return mv.anim.recover ?? "jumpDown";
  return mv.stance === "crouch" ? "crouch" : mv.stance === "air" ? "jumpTuck" : "stance";
}

export function movePose(mv: MoveData, mf: number, char = ""): Pose {
  const a = mv.anim;
  if (a.keys && a.keys.length) {
    const keys = a.keys;
    if (mf <= keys[0].at) return cp(char, keys[0].pose);
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i];
      const k1 = keys[i + 1];
      if (mf <= k1.at) return lerpPose(cp(char, k0.pose), cp(char, k1.pose), easeOut((mf - k0.at) / Math.max(1, k1.at - k0.at)));
    }
    return cp(char, keys[keys.length - 1].pose);
  }
  const base = cp(char, basePoseFor(mv));
  const windup = cp(char, a.windup);
  const strike = cp(char, a.strike);
  const recover = a.recover ? cp(char, a.recover) : strike;
  const lastActive = mv.startup + mv.active - 1;
  if (mf < mv.startup) {
    // Anticipación: llega a la pose de carga rápido y la sostiene (se ve venir).
    const t = clamp01(mf / Math.max(1, (mv.startup - 1) * 0.7));
    return lerpPose(base, windup, easeOut(t));
  }
  if (mf <= lastActive) {
    // Impacto: en el primer frame activo salta a la pose de golpe (lectura nítida).
    return strike;
  }
  const r = clamp01((mf - lastActive) / Math.max(1, mv.recovery));
  if (r < 0.4) return lerpPose(strike, recover, easeOut(r / 0.4));
  return lerpPose(recover, base, easeInOut((r - 0.4) / 0.6));
}

export function poseFor(f: FighterState, simFrame: number): Pose {
  switch (f.state) {
    case "idle": {
      const k = (Math.sin((simFrame + f.side * 17) * 0.09) + 1) / 2;
      return lerpPose(cp(f.char, "stance"), cp(f.char, "stanceB"), k);
    }
    case "walkF":
      return cycle(f.char, ["walk0", "walk1", "walk2", "walk3"], f.t / 30);
    case "walkB":
      return cycle(f.char, ["walk3", "walk2", "walk1", "walk0"], f.t / 34);
    case "crouch":
      return lerpPose(cp(f.char, "stance"), cp(f.char, "crouch"), easeOut(clamp01((f.t + 1) / 3)));
    case "prejump":
      return cp(f.char, "prejump");
    case "air": {
      const ch = getChar(f.char);
      const vy0 = ch.jump.vy * 100;
      const k = f.vy / vy0; // 1 al despegar, 0 en el ápice, negativo al caer
      if (k > 0.45) return lerpPose(cp(f.char, "jumpTuck"), cp(f.char, "jumpUp"), clamp01((k - 0.45) / 0.55));
      if (k > -0.45) return cp(f.char, "jumpTuck");
      return lerpPose(cp(f.char, "jumpTuck"), cp(f.char, "jumpDown"), clamp01((-k - 0.45) / 0.55));
    }
    case "land":
      return lerpPose(cp(f.char, "land"), cp(f.char, "stance"), clamp01(f.t / Math.max(1, f.landingRecovery)));
    case "dashF":
      return lerpPose(cp(f.char, "dashF"), cp(f.char, "stance"), clamp01((f.t - 10) / 8));
    case "dashB":
      return lerpPose(cp(f.char, "dashB"), cp(f.char, "stance"), clamp01((f.t - 12) / 10));
    case "attack": {
      if (!f.move) return cp(f.char, "stance");
      return movePose(getMove(f.char, f.move), f.mf, f.char);
    }
    case "fall": {
      const mv = f.move ? getMove(f.char, f.move) : null;
      return cp(f.char, mv?.anim.recover ?? "jumpDown");
    }
    case "blockstun":
      return cp(f.char, f.crouching ? "blockCrouch" : "blockStand");
    case "hitstun": {
      const p = cp(f.char, f.crouching ? "hitCrouch" : f.lastCounter ? "hitMid" : "hitHigh");
      if (f.stun < 5) return lerpPose(cp(f.char, f.crouching ? "crouch" : "stance"), p, f.stun / 5);
      return p;
    }
    case "airHit":
    case "thrown":
      return f.vy > 0 ? cp(f.char, "airHit") : cp(f.char, "airHit2");
    case "knockdown":
      return cp(f.char, "lying");
    case "wakeup": {
      const k = f.t / TUNING.knockdown.wakeupFrames;
      if (k < 0.5) return lerpPose(cp(f.char, "lying"), cp(f.char, "wakeup"), easeInOut(k / 0.5));
      return lerpPose(cp(f.char, "wakeup"), cp(f.char, "stance"), easeInOut((k - 0.5) / 0.5));
    }
    case "parry":
      return cp(f.char, f.y > 0 ? "parryAir" : f.parryLow ? "parryLow" : "parry");
    case "parryFail":
      return lerpPose(cp(f.char, "parryFail"), cp(f.char, "stance"), clamp01((f.t - 12) / 8));
    case "throw":
      return f.t < 8 ? cp(f.char, "throwGrab") : lerpPose(cp(f.char, "throwToss"), cp(f.char, "stance"), clamp01((f.t - 16) / 10));
    case "throwTech":
      return lerpPose(cp(f.char, "throwTech"), cp(f.char, "stance"), clamp01(f.t / 14));
    case "ko":
      return f.y > 0 ? (f.vy > 0 ? cp(f.char, "airHit") : cp(f.char, "airHit2")) : cp(f.char, "ko");
    case "win":
      return lerpPose(cp(f.char, "stance"), cp(f.char, "win"), easeOut(clamp01(f.t / 18)));
    case "intro":
      return cp(f.char, "intro");
  }
}
