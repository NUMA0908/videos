/* La Llorona — constantes y utilidades compartidas por todos los scripts. */
"use strict";

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------
const TILE = 32;
const MW = 84;
const MH = 64;
const NIGHT_SECONDS = 540; // 00:00 → 05:00 (amanecer) en 9 minutos reales
const CHILD_NAMES = ["Lucía", "Mateo", "Rosita", "Pedrito"];

const T = {
  GRASS: 0,
  TREE: 1,
  WATER: 2,
  BRIDGE: 3,
  WALL: 4,
  PATH: 5,
  CHURCH: 6,
  BUSH: 7,
  GRAVE: 8,
  FLOOR: 9,
  DEADTREE: 10,
  WELL: 11,
  ALTAR: 12,
  LAMP: 13,
  CRYPT: 14,
  WARDROBE: 15,
  CRADLE: 16,
};
const TILE_COUNT = 17;
const flagsFor = (list) => {
  const a = new Array(TILE_COUNT).fill(false);
  list.forEach((t) => (a[t] = true));
  return a;
};
// No se puede atravesar
const SOLID = flagsFor([T.TREE, T.WALL, T.CHURCH, T.GRAVE, T.DEADTREE, T.WELL, T.ALTAR, T.LAMP, T.CRYPT, T.WARDROBE, T.CRADLE]);
// Tapa la vista (y proyecta sombra)
const OPAQUE = flagsFor([T.TREE, T.WALL, T.CHURCH, T.CRYPT, T.WARDROBE]);
// Sonido de los pasos según el suelo
const SURFACE = {
  [T.GRASS]: "grass",
  [T.BUSH]: "bush",
  [T.WATER]: "water",
  [T.BRIDGE]: "wood",
  [T.FLOOR]: "wood",
  [T.PATH]: "dirt",
};

// ---------------------------------------------------------------------------
// Ajustes de juego
// ---------------------------------------------------------------------------
const PLAYER = { walk: 92, run: 152, radius: 9 };
const STAMINA = { max: 130, drain: 19, regen: 20, recover: 30, holdBreath: 24 };
const BATTERY = { drain: 0.85, pickup: 40 };
const LLORONA = { wander: 50, investigate: 80, search: 70, chase: 104, perChild: 8, catchDist: 20 };
const SANCTUARY_R = 210;
const ALTAR_R = 120;
const ALTAR_SECONDS = 100;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Azar con semilla para generar el mapa; Math.random para el juego
let srng = Math.random;
const srand = (a, b) => a + srng() * (b - a);
const srandi = (a, b) => Math.floor(srand(a, b + 1));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
