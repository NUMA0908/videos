import { describe, expect, it } from "vitest";
import { getMove } from "../src/data/characters";
import { poseFor } from "../src/render/animator";
import { FighterAnimator } from "../src/render/fighterAnim";
import { lerpPose, type Pose } from "../src/render/skeleton";
import { stepInPlace } from "../src/sim/step";
import type { GameState } from "../src/sim/types";
import { HP, LP, placeAt, readyMatch, RIGHT } from "./helpers";

/** Mayor diferencia de ángulo (grados, por el camino más corto) entre dos poses. */
function poseDelta(a: Pose, b: Pose): number {
  const vals = (p: Pose) => [p.torso, p.head, ...p.aF, ...p.aB, ...p.lF, ...p.lB, p.rot];
  const va = vals(a);
  const vb = vals(b);
  return Math.max(...va.map((v, i) => Math.abs(((((vb[i] - v) % 360) + 540) % 360) - 180)));
}

/** Avanza la simulación y los dos animadores como lo hace FightScene. */
function tick(s: GameState, anims: [FighterAnimator, FighterAnimator], in0: number, in1 = 0): void {
  stepInPlace(s, in0, in1);
  for (const side of [0, 1] as const) {
    anims[side].onEvents(s.events, side);
    anims[side].tick(s.fighters[side], s.frame);
  }
}

describe("interpolación de poses", () => {
  it("los ángulos de las extremidades van por el camino más corto (sin vueltas completas)", () => {
    const a = poseFor({ ...readyMatch().fighters[0] }, 0);
    const p0: Pose = { ...a, aB: [39, 170] };
    const p1: Pose = { ...a, aB: [39, -170] };
    const mid = lerpPose(p0, p1, 0.5);
    expect(Math.abs(Math.abs(mid.aB[1]) - 180)).toBeLessThan(1e-9);
  });

  it("caminar no tiene saltos de más de 30° entre frames", () => {
    const s = placeAt(readyMatch({ chars: ["rayo", "rayo"] }), 500);
    let prev = poseFor(s.fighters[0], s.frame);
    let worst = 0;
    for (let i = 0; i < 70; i++) {
      stepInPlace(s, RIGHT, 0);
      const p = poseFor(s.fighters[0], s.frame);
      worst = Math.max(worst, poseDelta(prev, p));
      prev = p;
    }
    expect(worst).toBeLessThan(30);
  });
});

describe("animador de presentación (poses de enlace, impacto y hitstop)", () => {
  it("caminar → directo: sin saltos de pose, y en el primer frame activo se ve exactamente la pose de golpe", () => {
    const s = placeAt(readyMatch({ chars: ["rayo", "rayo"] }), 500);
    const anims: [FighterAnimator, FighterAnimator] = [new FighterAnimator(), new FighterAnimator()];
    for (let i = 0; i < 20; i++) tick(s, anims, RIGHT);
    const mv = getMove("rayo", "st_hp");
    let prev = anims[0].pose as Pose;
    let worst = 0;
    tick(s, anims, HP);
    const f = s.fighters[0];
    expect(f.state).toBe("attack");
    // Sin la capa de enlace, el frame 1 del ataque saltaría de la pose de caminar a la de guardia.
    while (f.mf < mv.startup) {
      worst = Math.max(worst, poseDelta(prev, anims[0].pose as Pose));
      prev = anims[0].pose as Pose;
      tick(s, anims, 0);
    }
    expect(worst).toBeLessThan(40);
    expect(f.mf).toBe(mv.startup);
    expect(poseDelta(anims[0].pose as Pose, poseFor(f, s.frame))).toBe(0);
    expect(anims[0].stretch).toBeGreaterThan(1);
  });

  it("golpe recibido: corte seco a la pose de golpe, congelado durante el hitstop y vibración que decae", () => {
    const s = placeAt(readyMatch({ chars: ["rayo", "rayo"] }), 120);
    const anims: [FighterAnimator, FighterAnimator] = [new FighterAnimator(), new FighterAnimator()];
    tick(s, anims, 0);
    tick(s, anims, HP);
    const def = s.fighters[1];
    let guard = 0;
    while (def.state !== "hitstun" && guard++ < 30) tick(s, anims, 0);
    expect(def.state).toBe("hitstun");
    expect(def.hitstop).toBeGreaterThan(0);
    const first = Math.abs(anims[1].jitter);
    const pose0 = anims[1].pose as Pose;
    expect(anims[1].flash).toBe(1);
    let last = first;
    while (def.hitstop > 1) {
      tick(s, anims, 0);
      // Congelado: la pose no cambia mientras dura el hitstop.
      expect(poseDelta(anims[1].pose as Pose, pose0)).toBe(0);
      last = Math.abs(anims[1].jitter);
    }
    expect(first).toBeGreaterThan(last);
    expect(anims[1].flash).toBe(0);
  });

  it("un golpe ligero vibra menos que uno fuerte", () => {
    const shakeOf = (button: number) => {
      const s = placeAt(readyMatch({ chars: ["rayo", "rayo"] }), 110);
      const anims: [FighterAnimator, FighterAnimator] = [new FighterAnimator(), new FighterAnimator()];
      tick(s, anims, button);
      let guard = 0;
      while (s.fighters[1].state !== "hitstun" && guard++ < 30) tick(s, anims, 0);
      return Math.abs(anims[1].jitter);
    };
    expect(shakeOf(LP)).toBeLessThan(shakeOf(HP));
  });
});
