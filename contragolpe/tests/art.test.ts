import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/data/characters";
import "../src/render/movePoses";
import { getPose, POSES } from "../src/render/poses";
import { solve } from "../src/render/skeleton";

/**
 * QA de arte: la extremidad que golpea, en la pose de impacto, debe caer dentro (o muy cerca)
 * de la hitbox del movimiento. Así lo que se ve es lo que pega.
 */
const MARGIN = 14;

describe("coherencia pose ↔ hitbox", () => {
  for (const ch of CHARACTERS) {
    for (const mv of Object.values(ch.moves)) {
      const limb = mv.anim.limb;
      if (!limb || limb === "none" || !mv.hitboxes.length) continue;
      it(`${ch.id}/${mv.id}: ${limb} dentro de la hitbox`, () => {
        expect(POSES[mv.anim.strike], `pose ${mv.anim.strike} no existe`).toBeDefined();
        const j = solve(getPose(mv.anim.strike), ch.look);
        const p = limb === "handF" ? j.haF : limb === "handB" ? j.haB : limb === "footF" ? j.ftF : j.ftB;
        const boxes = mv.hitboxes[0].boxes;
        const inside = boxes.some(
          (b) => p.x >= b.x - MARGIN && p.x <= b.x + b.w + MARGIN && p.y >= b.y - MARGIN && p.y <= b.y + b.h + MARGIN,
        );
        expect(inside, `${limb} en (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) vs ${JSON.stringify(boxes)}`).toBe(true);
      });
    }
    it(`${ch.id}: todas las poses de sus movimientos existen`, () => {
      for (const mv of Object.values(ch.moves)) {
        for (const key of [mv.anim.windup, mv.anim.strike, mv.anim.recover, ...(mv.anim.keys ?? []).map((k) => k.pose)]) {
          if (key) expect(POSES[key], `${mv.id}: ${key}`).toBeDefined();
        }
      }
    });
  }
});
