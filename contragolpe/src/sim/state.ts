import { getChar } from "../data/characters";
import { TUNING } from "../data/tuning";
import { px } from "./fixed";
import { BUFFERED_BUTTONS, createHistory, NO_PRESS } from "./input";
import type { FighterState, GameState, MatchConfig, Side } from "./types";

export function defaultConfig(partial: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: "versus",
    chars: ["rayo", "rayo"],
    parry: "normal",
    simple: [true, true],
    infiniteHealth: false,
    infiniteMeter: false,
    timer: true,
    roundsToWin: TUNING.round.roundsToWin,
    ...partial,
  };
}

export function createFighter(charId: string, side: Side, x: number): FighterState {
  const ch = getChar(charId);
  return {
    char: charId,
    side,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    state: "idle",
    t: 0,
    move: null,
    mf: 0,
    crouching: false,
    stun: 0,
    hitstop: 0,
    health: ch.health,
    maxHealth: ch.health,
    meter: 0,
    hitMask: 0,
    contact: "none",
    contactMf: 0,
    sinceContact: 0,
    chain: 0,
    extraRecovery: 0,
    armorLeft: 0,
    throwBack: false,
    comboHits: 0,
    comboDamage: 0,
    juggles: 0,
    airReset: false,
    lastCounter: false,
    parryWindow: 0,
    parryLow: false,
    parryCooldown: 0,
    redParry: 0,
    techWindow: 0,
    throwProtect: 0,
    heldBy: -1,
    jumpDir: 0,
    airUsed: false,
    landingRecovery: 0,
    pushVx: 0,
    pushT: 0,
    buf: BUFFERED_BUTTONS.map(() => NO_PRESS),
    idleT: 0,
  };
}

export function startPositions(): [number, number] {
  const mid = px(TUNING.stage.width / 2);
  const half = px(TUNING.stage.startDistance / 2);
  return [mid - half, mid + half];
}

export function createMatch(config: Partial<MatchConfig> = {}, seed = 1): GameState {
  const cfg = defaultConfig(config);
  const [x0, x1] = startPositions();
  return {
    frame: 0,
    rng: seed | 0,
    config: cfg,
    round: {
      num: 1,
      phase: "intro",
      t: 0,
      timer: TUNING.round.seconds * 60,
      wins: [0, 0],
      winner: -1,
      matchWinner: -1,
      timeOver: false,
      perfect: false,
    },
    fighters: [createFighter(cfg.chars[0], 0, x0), createFighter(cfg.chars[1], 1, x1)],
    projectiles: [],
    nextId: 1,
    inputs: [createHistory(), createHistory()],
    freeze: 0,
    freezeOwner: -1,
    events: [],
  };
}

/** Reinicia posiciones/vida para una nueva ronda conservando victorias y configuración. */
export function resetForRound(s: GameState): void {
  const [x0, x1] = startPositions();
  const keepMeter = [s.fighters[0].meter, s.fighters[1].meter];
  s.fighters = [createFighter(s.config.chars[0], 0, x0), createFighter(s.config.chars[1], 1, x1)];
  s.fighters[0].meter = keepMeter[0];
  s.fighters[1].meter = keepMeter[1];
  s.projectiles = [];
  s.freeze = 0;
  s.freezeOwner = -1;
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(text: string): GameState {
  return JSON.parse(text) as GameState;
}
