import type { CharacterData } from "../types";
import { CHISPA_MOVES, CHISPA_PROJECTILES } from "../moves/chispa";

/**
 * LUNA "CHISPA" REYES — Rushdown.
 * Repartidora en patines que aprendió a pelear esquivando el tráfico. Rapidísima, normales cortos, poca vida:
 * gana pegada a su rival y pierde si la mantienen lejos.
 */
export const CHISPA: CharacterData = {
  id: "chispa",
  name: "Luna Reyes",
  nickname: "CHISPA",
  archetype: "Rushdown",
  description: "Muy rápida, presión constante y mezclas. Poca vida: no puede permitirse errores.",
  quote: "¿Pestañeaste? Ya te pegué dos veces.",
  health: 880,
  walkF: 4.2,
  walkB: 3.3,
  dashF: { frames: 15, distance: 128 },
  dashB: { frames: 18, distance: 96, invuln: 6 },
  jump: { prejump: 3, vy: 15.5, gravity: 0.82, vxF: 4.6, vxB: -4.0, landing: 3 },
  boxes: {
    standHurt: [
      { x: -24, y: 0, w: 48, h: 138 },
      { x: -12, y: 136, w: 28, h: 32 },
    ],
    crouchHurt: [
      { x: -28, y: 0, w: 58, h: 84 },
      { x: -6, y: 80, w: 28, h: 26 },
    ],
    airHurt: [
      { x: -22, y: 28, w: 46, h: 102 },
      { x: -12, y: 126, w: 28, h: 32 },
    ],
    standPush: { x: -30, y: 0, w: 60, h: 140 },
    crouchPush: { x: -32, y: 0, w: 64, h: 92 },
    airPush: { x: -24, y: 40, w: 48, h: 92 },
  },
  moves: CHISPA_MOVES,
  projectiles: CHISPA_PROJECTILES,
  normals: {
    stand: { LP: "st_lp", HP: "st_hp", LK: "st_lk", HK: "st_hk" },
    crouch: { LP: "cr_lp", HP: "cr_hp", LK: "cr_lk", HK: "cr_hk" },
    air: { LP: "j_lp", HP: "j_hp", LK: "j_lk", HK: "j_hk" },
    command: [{ dir: 6, button: "HK", move: "oh" }],
  },
  specials: [
    { move: "dp_l", motion: "dp", button: "LP" },
    { move: "dp_h", motion: "dp", button: "HP" },
    { move: "fb_l", motion: "qcf", button: "LP" },
    { move: "fb_h", motion: "qcf", button: "HP" },
    { move: "rush_l", motion: "qcf", button: "LK" },
    { move: "rush_h", motion: "qcf", button: "HK" },
    { move: "roll_l", motion: "qcb", button: "LK" },
    { move: "roll_h", motion: "qcb", button: "HK" },
  ],
  super: "super",
  throw: "throw",
  simple: { neutral: "fb_h", forward: "rush_h", down: "dp_h", back: "roll_h" },
  look: {
    scale: 0.95,
    torso: 56,
    upperArm: 30,
    foreArm: 28,
    thigh: 42,
    shin: 43,
    headR: 14,
    shoulderW: 38,
    waistW: 26,
    limbW: 11,
    colors: {
      skin: "#d39a6a",
      hair: "#2b1a12",
      top: "#19c3b4",
      topShade: "#0f8c82",
      pants: "#2a1b4a",
      pantsShade: "#1d1236",
      accent: "#ffe14a",
      gloves: "#ff4d6d",
      shoes: "#f2f2f2",
      energy: "#ffe14a",
      energyCore: "#fffbe0",
      outline: "#0b0b14",
    },
    altColors: { top: "#ff7a1a", topShade: "#c2560c", accent: "#7fe3ff", gloves: "#3a6bff", energy: "#7fe3ff", energyCore: "#f0fdff" },
    hairStyle: "ponytail",
    sleeves: "none",
    legwear: "shorts",
    extra: "scarf",
    stanceWidth: 0.9,
  },
};
