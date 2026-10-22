import type { CharacterData } from "../types";
import { RAYO_MOVES, RAYO_PROJECTILES } from "../moves/rayo";

/**
 * TOMÁS "RAYO" VALDEZ — Equilibrado.
 * Boxeador de barrio que aprendió karate en un gimnasio de azotea. Proyectil, anti-aéreo
 * y normales honestas: el personaje para aprender.
 */
export const RAYO: CharacterData = {
  id: "rayo",
  name: "Tomás Valdez",
  nickname: "RAYO",
  archetype: "Equilibrado",
  description: "Proyectil, anti-aéreo invencible y normales fiables. Ideal para aprender.",
  quote: "La tormenta no avisa dos veces.",
  health: 1000,
  walkF: 3.2,
  walkB: 2.6,
  dashF: { frames: 18, distance: 112 },
  dashB: { frames: 22, distance: 104, invuln: 7 },
  jump: { prejump: 4, vy: 16.5, gravity: 0.75, vxF: 4.0, vxB: -3.6, landing: 3 },
  boxes: {
    standHurt: [
      { x: -26, y: 0, w: 52, h: 148 },
      { x: -13, y: 146, w: 30, h: 34 },
    ],
    crouchHurt: [
      { x: -30, y: 0, w: 62, h: 92 },
      { x: -6, y: 88, w: 30, h: 28 },
    ],
    airHurt: [
      { x: -24, y: 30, w: 50, h: 110 },
      { x: -12, y: 138, w: 30, h: 34 },
    ],
    standPush: { x: -34, y: 0, w: 68, h: 150 },
    crouchPush: { x: -36, y: 0, w: 72, h: 100 },
    airPush: { x: -26, y: 40, w: 52, h: 100 },
  },
  moves: RAYO_MOVES,
  projectiles: RAYO_PROJECTILES,
  normals: {
    stand: { LP: "st_lp", HP: "st_hp", LK: "st_lk", HK: "st_hk" },
    crouch: { LP: "cr_lp", HP: "cr_hp", LK: "cr_lk", HK: "cr_hk" },
    air: { LP: "j_lp", HP: "j_hp", LK: "j_lk", HK: "j_hk" },
    command: [{ dir: 6, button: "HP", move: "oh" }],
  },
  specials: [
    { move: "dp_l", motion: "dp", button: "LP" },
    { move: "dp_h", motion: "dp", button: "HP" },
    { move: "fb_l", motion: "qcf", button: "LP" },
    { move: "fb_h", motion: "qcf", button: "HP" },
    { move: "rush_l", motion: "qcb", button: "LK" },
    { move: "rush_h", motion: "qcb", button: "HK" },
  ],
  super: "super",
  throw: "throw",
  simple: { neutral: "fb_h", forward: "rush_h", down: "dp_h", back: "fb_l" },
  look: {
    scale: 1,
    torso: 60,
    upperArm: 32,
    foreArm: 30,
    thigh: 44,
    shin: 45,
    headR: 15,
    shoulderW: 46,
    waistW: 30,
    limbW: 13,
    colors: {
      skin: "#b9774f",
      hair: "#17141a",
      top: "#2453c4",
      topShade: "#183a8f",
      pants: "#ece6d6",
      pantsShade: "#b8b09c",
      accent: "#ffd23f",
      gloves: "#f4f1ea",
      shoes: "#b9774f",
      energy: "#46c8ff",
      energyCore: "#f2fbff",
      outline: "#0b0b14",
    },
    altColors: { top: "#b8322a", topShade: "#83211c", accent: "#f6f6f6", energy: "#ff8d3a", energyCore: "#fff3e0" },
    hairStyle: "spiky",
    sleeves: "short",
    extra: "headband",
    stanceWidth: 1,
  },
};
