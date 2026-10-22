/**
 * Tipos de datos de diseño: personajes y movimientos.
 * Todo lo que un diseñador ajusta vive en `src/data/` como datos, no como lógica.
 * Unidades: distancias en píxeles (se convierten a sub-unidades al cargar), tiempos en frames (60/s).
 */

/** Caja relativa al origen del personaje (centro entre los pies). `x` crece hacia donde mira; `y` crece hacia arriba. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cajas activas en un rango de frames del movimiento (inclusivo, frame 1 = primer frame del movimiento). */
export interface TimedBoxes {
  from: number;
  to: number;
  boxes: Box[];
  /** Golpes distintos de un mismo movimiento (multi-hit). Cada `hit` conecta como mucho una vez. */
  hit?: number;
}

/** alto = overhead (bloquear de pie), medio = cualquier guardia, bajo = bloquear agachado. */
export type Guard = "high" | "mid" | "low";
export const GUARD_LABEL: Record<Guard, string> = { high: "alto", mid: "medio", low: "bajo" };

export type MoveKind = "normal" | "special" | "super" | "throw";
export type Stance = "stand" | "crouch" | "air";
export type Strength = "light" | "heavy";
export type CancelKind = "chain" | "special" | "super";
export type InvulnKind = "strike" | "throw" | "projectile" | "all";

export interface Invuln {
  from: number;
  to: number;
  kind: InvulnKind;
}

/** Velocidad impuesta durante un rango de frames (px/frame, `vx` hacia adelante, `vy` hacia arriba). */
export interface MoveMotion {
  from: number;
  to: number;
  vx?: number;
  /** Si se define, en `from` el personaje sale del suelo con esta velocidad vertical. */
  vy?: number;
}

export interface ProjectileSpawn {
  frame: number;
  kind: string;
  x: number;
  y: number;
}

export interface ThrowSpec {
  /** Distancia máxima (px) entre orígenes para agarrar. */
  range: number;
  techable: boolean;
  /** Frame (dentro de la animación de lanzamiento) en el que se aplica el daño. */
  damageFrame: number;
  /** Duración total de la animación de lanzamiento para el atacante. */
  duration: number;
  /** Agarra solo rivales en el aire (anti-aéreo de agarre). */
  air?: boolean;
  /** Velocidad con la que sale despedido el rival (px/frame). */
  toss: { vx: number; vy: number };
  /** Separación (px) a la que se coloca al rival mientras se le agarra. */
  hold: number;
}

/** Pose clave de la animación de un movimiento (las poses están en `src/render/poses.ts`). */
export interface MoveAnim {
  windup: string;
  strike: string;
  recover?: string;
  /** Keyframes explícitos (frame del movimiento → pose). Si existen, mandan sobre windup/strike/recover. */
  keys?: { at: number; pose: string }[];
  /** Extremidad que golpea (para efectos y para el test de coherencia pose ↔ hitbox). */
  limb?: "handF" | "handB" | "footF" | "footB" | "none";
}

export interface MoveData {
  id: string;
  name: string;
  /** Cómo se hace, para la lista de movimientos (p. ej. "↓↘→ + P"). */
  notation: string;
  kind: MoveKind;
  stance: Stance;
  strength: Strength;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Daño al bloquear (especiales y súper). */
  chip?: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  /** Frames extra de hitstun si es counter hit (por defecto según la fuerza). */
  chHitstunBonus?: number;
  /** Distancia que empuja al rival al pegar/bloquear (px). */
  pushback: number;
  guard: Guard;
  hitboxes: TimedBoxes[];
  hurtboxes?: TimedBoxes[];
  invuln?: Invuln[];
  /** Absorbe N golpes durante estos frames (súper armadura). */
  armor?: { from: number; to: number; hits: number };
  cancels?: CancelKind[];
  knockdown?: boolean;
  /** Velocidad de lanzamiento del rival si le derriba o le pega en el aire (px/frame). */
  launch?: { vx: number; vy: number };
  /** Puede golpear a un rival que cae tras un golpe aéreo (juggle). */
  juggle?: boolean;
  meterOnHit: number;
  meterOnBlock: number;
  meterOnWhiff?: number;
  meterCost?: number;
  motion?: MoveMotion[];
  projectile?: ProjectileSpawn;
  throw?: ThrowSpec;
  /** Recuperación al aterrizar (ataques aéreos y movimientos que dejan el suelo). */
  landingRecovery?: number;
  /** El movimiento termina al tocar el suelo (ataques aéreos). */
  endsOnLanding?: boolean;
  /** Pantalla de súper: congela el juego N frames al empezar. */
  superFlash?: number;
  anim: MoveAnim;
  sfx?: "light" | "heavy" | "special" | "super" | "throw";
}

export interface ProjectileData {
  id: string;
  /** px/frame */
  speed: number;
  hitbox: Box;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  pushback: number;
  guard: Guard;
  /** Número de golpes (los proyectiles se anulan golpe a golpe). */
  hits: number;
  /** Frames entre golpes consecutivos (multi-hit). */
  hitInterval: number;
  /** Vida máxima en frames. */
  life: number;
  knockdown?: boolean;
  launch?: { vx: number; vy: number };
  meterOnHit: number;
  meterOnBlock: number;
  /** Visual (render). */
  look: "orb" | "spark" | "wave" | "beam";
  radius: number;
}

export interface CharacterBoxes {
  standHurt: Box[];
  crouchHurt: Box[];
  airHurt: Box[];
  /** Pushboxes: solo importa el ancho/alto; evitan que los personajes se atraviesen. */
  standPush: Box;
  crouchPush: Box;
  airPush: Box;
}

/** Esqueleto y colores para el render procedural (ver `src/render/skeleton.ts`). */
export interface CharacterLook {
  scale: number;
  torso: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
  headR: number;
  shoulderW: number;
  waistW: number;
  limbW: number;
  colors: {
    skin: string;
    hair: string;
    top: string;
    topShade: string;
    pants: string;
    pantsShade: string;
    accent: string;
    gloves: string;
    shoes: string;
    energy: string;
    energyCore: string;
    outline: string;
  };
  /** Paleta alternativa para espejos (mismo personaje en ambos lados). */
  altColors: Partial<CharacterLook["colors"]>;
  hairStyle: "spiky" | "ponytail" | "bald" | "short";
  sleeves: "none" | "short";
  extra: "headband" | "scarf" | "beard" | "none";
  /** Postura (cuánto se inclina, ancho de piernas) para dar personalidad al idle. */
  stanceWidth: number;
}

export interface SpecialInput {
  move: string;
  motion: "qcf" | "qcb" | "dp" | "hcb";
  button: "LP" | "HP" | "LK" | "HK";
}

export interface CharacterData {
  id: string;
  name: string;
  nickname: string;
  archetype: string;
  description: string;
  quote: string;
  health: number;
  walkF: number;
  walkB: number;
  dashF: { frames: number; distance: number };
  dashB: { frames: number; distance: number; invuln: number };
  jump: { prejump: number; vy: number; gravity: number; vxF: number; vxB: number; landing: number };
  boxes: CharacterBoxes;
  moves: Record<string, MoveData>;
  projectiles: Record<string, ProjectileData>;
  normals: {
    stand: { LP: string; HP: string; LK: string; HK: string };
    crouch: { LP: string; HP: string; LK: string; HK: string };
    air: { LP: string; HP: string; LK: string; HK: string };
    /** Normales de comando (dirección + botón), p. ej. → + HP. */
    command?: { dir: number; button: "LP" | "HP" | "LK" | "HK"; move: string }[];
  };
  /** En orden de prioridad (el primero que coincida gana). */
  specials: SpecialInput[];
  super: string;
  throw: string;
  /** Atajos del modo "inputs simplificados": botón SP + dirección. */
  simple: { neutral: string; forward: string; down: string; back: string };
  look: CharacterLook;
}
