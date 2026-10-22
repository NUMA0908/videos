import { getChar, getMove } from "../data/characters";
import type { MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import type { FighterState } from "../sim/types";
import "./movePoses";
import { getPose } from "./poses";
import { lerpPose, type Pose } from "./skeleton";

/**
 * Elige la pose de un personaje a partir de su estado de simulación (solo lectura).
 * Todo lo de aquí es presentación: puede usar decimales y curvas sin afectar al determinismo.
 */

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

function cycle(keys: string[], phase: number): Pose {
  const n = keys.length;
  const p = (((phase % 1) + 1) % 1) * n;
  const i = Math.floor(p);
  return lerpPose(getPose(keys[i]), getPose(keys[(i + 1) % n]), easeInOut(p - i));
}

function basePoseFor(mv: MoveData): string {
  if (mv.motion?.some((m) => m.vy !== undefined)) return mv.anim.recover ?? "jumpDown";
  return mv.stance === "crouch" ? "crouch" : mv.stance === "air" ? "jumpTuck" : "stance";
}

export function movePose(mv: MoveData, mf: number): Pose {
  const a = mv.anim;
  if (a.keys && a.keys.length) {
    const keys = a.keys;
    if (mf <= keys[0].at) return getPose(keys[0].pose);
    for (let i = 0; i < keys.length - 1; i++) {
      const k0 = keys[i];
      const k1 = keys[i + 1];
      if (mf <= k1.at) return lerpPose(getPose(k0.pose), getPose(k1.pose), easeOut((mf - k0.at) / Math.max(1, k1.at - k0.at)));
    }
    return getPose(keys[keys.length - 1].pose);
  }
  const base = getPose(basePoseFor(mv));
  const windup = getPose(a.windup);
  const strike = getPose(a.strike);
  const recover = a.recover ? getPose(a.recover) : strike;
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
      return lerpPose(getPose("stance"), getPose("stanceB"), k);
    }
    case "walkF":
      return cycle(["walk0", "walk1", "walk2", "walk3"], f.t / 30);
    case "walkB":
      return cycle(["walk3", "walk2", "walk1", "walk0"], f.t / 34);
    case "crouch":
      return lerpPose(getPose("stance"), getPose("crouch"), easeOut(clamp01((f.t + 1) / 3)));
    case "prejump":
      return getPose("prejump");
    case "air": {
      const ch = getChar(f.char);
      const vy0 = ch.jump.vy * 100;
      const k = f.vy / vy0; // 1 al despegar, 0 en el ápice, negativo al caer
      if (k > 0.45) return lerpPose(getPose("jumpTuck"), getPose("jumpUp"), clamp01((k - 0.45) / 0.55));
      if (k > -0.45) return getPose("jumpTuck");
      return lerpPose(getPose("jumpTuck"), getPose("jumpDown"), clamp01((-k - 0.45) / 0.55));
    }
    case "land":
      return lerpPose(getPose("land"), getPose("stance"), clamp01(f.t / Math.max(1, f.landingRecovery)));
    case "dashF":
      return lerpPose(getPose("dashF"), getPose("stance"), clamp01((f.t - 10) / 8));
    case "dashB":
      return lerpPose(getPose("dashB"), getPose("stance"), clamp01((f.t - 12) / 10));
    case "attack": {
      if (!f.move) return getPose("stance");
      return movePose(getMove(f.char, f.move), f.mf);
    }
    case "fall": {
      const mv = f.move ? getMove(f.char, f.move) : null;
      return getPose(mv?.anim.recover ?? "jumpDown");
    }
    case "blockstun":
      return getPose(f.crouching ? "blockCrouch" : "blockStand");
    case "hitstun": {
      const p = getPose(f.crouching ? "hitCrouch" : f.lastCounter ? "hitMid" : "hitHigh");
      if (f.stun < 5) return lerpPose(getPose(f.crouching ? "crouch" : "stance"), p, f.stun / 5);
      return p;
    }
    case "airHit":
    case "thrown":
      return f.vy > 0 ? getPose("airHit") : getPose("airHit2");
    case "knockdown":
      return getPose("lying");
    case "wakeup": {
      const k = f.t / TUNING.knockdown.wakeupFrames;
      if (k < 0.5) return lerpPose(getPose("lying"), getPose("wakeup"), easeInOut(k / 0.5));
      return lerpPose(getPose("wakeup"), getPose("stance"), easeInOut((k - 0.5) / 0.5));
    }
    case "parry":
      return getPose(f.y > 0 ? "parryAir" : f.parryLow ? "parryLow" : "parry");
    case "parryFail":
      return lerpPose(getPose("parryFail"), getPose("stance"), clamp01((f.t - 12) / 8));
    case "throw":
      return f.t < 8 ? getPose("throwGrab") : lerpPose(getPose("throwToss"), getPose("stance"), clamp01((f.t - 16) / 10));
    case "throwTech":
      return lerpPose(getPose("throwTech"), getPose("stance"), clamp01(f.t / 14));
    case "ko":
      return f.y > 0 ? (f.vy > 0 ? getPose("airHit") : getPose("airHit2")) : getPose("ko");
    case "win":
      return lerpPose(getPose("stance"), getPose("win"), easeOut(clamp01(f.t / 18)));
    case "intro":
      return getPose("intro");
  }
}
