import type { ParryDifficulty } from "../data/tuning";
import type { InputHistory } from "./input";

/**
 * Estado completo de la simulación. Solo datos planos (números, strings, arrays):
 * se puede clonar, serializar a JSON y restaurar en cualquier frame (listo para rollback).
 */

export type Side = 0 | 1;
export type Facing = 1 | -1;

export type FState =
  | "idle"
  | "walkF"
  | "walkB"
  | "crouch"
  | "prejump"
  | "air"
  | "land"
  | "dashF"
  | "dashB"
  | "attack"
  /** Cayendo tras un movimiento que dejó el suelo (DP, etc.). No puede actuar hasta aterrizar. */
  | "fall"
  | "blockstun"
  | "hitstun"
  /** Golpeado en el aire o lanzado: vuela y cae. */
  | "airHit"
  | "knockdown"
  | "wakeup"
  | "parry"
  | "parryFail"
  | "throw"
  | "thrown"
  | "throwTech"
  | "ko"
  | "win"
  | "intro";

export type Contact = "none" | "hit" | "block" | "parried";

export interface FighterState {
  char: string;
  side: Side;
  /** Posición y velocidad en sub-unidades (enteros). `y` = altura sobre el suelo. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  state: FState;
  /** Frames (no congelados) desde que entró al estado actual. */
  t: number;
  /** Movimiento en curso (estado "attack", "fall", "throw"). */
  move: string | null;
  /** Frame del movimiento, empezando en 1. */
  mf: number;
  crouching: boolean;
  /** Frames restantes de hitstun/blockstun/recuperación según el estado. */
  stun: number;
  /** Frames de congelamiento por impacto. */
  hitstop: number;
  health: number;
  maxHealth: number;
  meter: number;

  // --- ataque en curso ---
  /** Bits de los golpes (hit ids) del movimiento actual que ya conectaron. */
  hitMask: number;
  contact: Contact;
  /** Frame del movimiento en el que hubo contacto (para la ventana de cancel). */
  contactMf: number;
  /** Frames no congelados desde el último contacto. */
  sinceContact: number;
  chain: number;
  extraRecovery: number;
  armorLeft: number;
  /** El throw se hizo sosteniendo atrás (lanza hacia el otro lado). */
  throwBack: boolean;

  // --- como defensor ---
  comboHits: number;
  comboDamage: number;
  juggles: number;
  /** Al caer de airHit aterriza de pie en vez de quedar derribado. */
  airReset: boolean;
  /** Golpe recibido como counter hit (para el HUD). */
  lastCounter: boolean;

  // --- parry ---
  /** Frames restantes de la ventana de parry (0 = no hay ventana abierta). */
  parryWindow: number;
  parryLow: boolean;
  parryCooldown: number;
  /** Ventana de red parry (durante blockstun). */
  redParry: number;

  // --- agarres ---
  /** Frames restantes para escapar (tech) mientras te agarran. */
  techWindow: number;
  throwProtect: number;
  /** Lado del que agarra (para colocar al agarrado). */
  heldBy: -1 | Side;

  // --- movimiento ---
  jumpDir: -1 | 0 | 1;
  airUsed: boolean;
  landingRecovery: number;
  /** Empuje (pushback) pendiente: velocidad y frames restantes. */
  pushVx: number;
  pushT: number;

  // --- input ---
  /** Edad (frames no congelados) de la última pulsación de cada botón con buffer; NO_PRESS si no hay. */
  buf: number[];
  /** Frames que lleva en estado accionable (para el ajuste de facing y IA). */
  idleT: number;
}

export interface ProjectileState {
  id: number;
  owner: Side;
  kind: string;
  x: number;
  y: number;
  vx: number;
  facing: Facing;
  t: number;
  hits: number;
  /** Frames hasta poder volver a golpear (multi-hit). */
  cooldown: number;
  hitstop: number;
  dead: boolean;
}

export type GameMode = "versus" | "arcade" | "training" | "trial" | "demo";

export interface MatchConfig {
  mode: GameMode;
  chars: [string, string];
  parry: ParryDifficulty;
  /** "Inputs simplificados" activos por jugador. */
  simple: [boolean, boolean];
  /** Entrenamiento: vida y medidor se rellenan. */
  infiniteHealth: boolean;
  infiniteMeter: boolean;
  timer: boolean;
  roundsToWin: number;
}

export type RoundPhase = "intro" | "fight" | "ko" | "end" | "over";

export interface RoundState {
  num: number;
  phase: RoundPhase;
  /** Frames en la fase actual. */
  t: number;
  /** Frames restantes del reloj de ronda. */
  timer: number;
  wins: [number, number];
  /** Ganador de la ronda: 0/1, 2 = empate, -1 = sin decidir. */
  winner: -1 | 0 | 1 | 2;
  /** Ganador del partido cuando phase = "over". */
  matchWinner: -1 | 0 | 1 | 2;
  timeOver: boolean;
  perfect: boolean;
}

export type SimEventType =
  | "hit"
  | "block"
  | "parry"
  | "parryFail"
  | "redParry"
  | "whiff"
  | "throw"
  | "throwHit"
  | "tech"
  | "projectile"
  | "projectileClash"
  | "super"
  | "special"
  | "armor"
  | "ko"
  | "jump"
  | "land"
  | "dash"
  | "knockdown"
  | "round"
  | "fight"
  | "timeOver"
  | "roundWin"
  | "matchOver";

export interface SimEvent {
  type: SimEventType;
  /** Quién causa el evento (atacante / quien hace la acción). */
  side: Side;
  /** Posición en sub-unidades (para partículas y sonido panorámico). */
  x: number;
  y: number;
  strength?: "light" | "heavy" | "super";
  counter?: boolean;
  damage?: number;
  move?: string;
}

export interface GameState {
  frame: number;
  rng: number;
  config: MatchConfig;
  round: RoundState;
  fighters: [FighterState, FighterState];
  projectiles: ProjectileState[];
  nextId: number;
  inputs: [InputHistory, InputHistory];
  /** Congelamiento global (pantalla de súper). */
  freeze: number;
  freezeOwner: -1 | Side;
  events: SimEvent[];
}
