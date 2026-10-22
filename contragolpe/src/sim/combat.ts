import { getChar } from "../data/characters";
import type { Guard, MoveData, Strength } from "../data/types";
import { TUNING } from "../data/tuning";
import { moveOf } from "./actions";
import { activeHitboxes, anyOverlap, hurtboxes, isAirborne } from "./boxes";
import { setState } from "./fighter";
import { pct, px, sign } from "./fixed";
import { Btn, inputAt } from "./input";
import { tryParry } from "./parry";
import { applyPush, WALL_MAX, WALL_MIN } from "./physics";
import type { FighterState, GameState, Side } from "./types";

/** Datos comunes de un golpe (de un movimiento o de un proyectil). */
export interface Strike {
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  pushback: number;
  guard: Guard;
  strength: Strength | "super";
  knockdown: boolean;
  launch?: { vx: number; vy: number };
  juggle: boolean;
  chHitstunBonus: number;
  meterOnHit: number;
  meterOnBlock: number;
  /** x de origen del golpe (sub-unidades) para decidir el lado del bloqueo y el empuje. */
  fromX: number;
  projectile: boolean;
  move?: string;
}

export function strikeFromMove(atk: FighterState, mv: MoveData): Strike {
  const strength = mv.kind === "super" ? "super" : mv.strength;
  return {
    damage: mv.damage,
    chip: mv.chip ?? 0,
    hitstun: mv.hitstun,
    blockstun: mv.blockstun,
    hitstop: mv.hitstop,
    pushback: mv.pushback,
    guard: mv.guard,
    strength,
    knockdown: !!mv.knockdown,
    launch: mv.launch,
    juggle: !!mv.juggle,
    chHitstunBonus: mv.chHitstunBonus ?? TUNING.counterHit.hitstunBonus[mv.strength],
    meterOnHit: mv.meterOnHit,
    meterOnBlock: mv.meterOnBlock,
    fromX: atk.x,
    projectile: false,
    move: mv.id,
  };
}

/** Estados en los que se puede bloquear (si se sostiene atrás). */
const CAN_BLOCK = new Set(["idle", "walkF", "walkB", "crouch", "blockstun"]);

export type Outcome = "hit" | "block" | "parry" | "whiff";

/** Dirección "lejos del golpe" en coordenadas de pantalla. */
function awayMask(def: FighterState, fromX: number): number {
  if (fromX < def.x) return Btn.RIGHT;
  if (fromX > def.x) return Btn.LEFT;
  return def.facing === 1 ? Btn.LEFT : Btn.RIGHT;
}

/** ¿Bloquea el defensor este golpe? Devuelve también si bloquea agachado. */
export function blockCheck(s: GameState, def: FighterState, st: Strike): { ok: boolean; crouch: boolean } {
  if (!CAN_BLOCK.has(def.state) || isAirborne(def)) return { ok: false, crouch: false };
  const mask = inputAt(s.inputs[def.side], 0);
  if (!(mask & awayMask(def, st.fromX))) return { ok: false, crouch: false };
  const crouch = !!(mask & Btn.DOWN);
  if (st.guard === "low" && !crouch) return { ok: false, crouch };
  if (st.guard === "high" && crouch) return { ok: false, crouch };
  return { ok: true, crouch };
}

/** Counter hit: el defensor estaba en el startup/activos de un ataque, o recuperándose de un parry fallido. */
export function isCounterState(def: FighterState): boolean {
  if (def.state === "parryFail" || def.state === "parry") return true;
  if (def.state !== "attack") return false;
  const mv = moveOf(def);
  return !!mv && def.mf <= mv.startup + mv.active - 1;
}

/** % de daño para el golpe número n (1 = primero) del combo. */
export function comboScale(hitNumber: number): number {
  const t = TUNING.combo.damageScaling;
  return t[Math.min(hitNumber - 1, t.length - 1)];
}

/** Reducción de hitstun según el número de golpe del combo. */
export function hitstunDecay(hitNumber: number): number {
  const c = TUNING.combo;
  return Math.min(c.hitstunDecayMax, Math.max(0, hitNumber - c.hitstunDecayFrom + 1));
}

/**
 * Empuje tras golpe/bloqueo. Si el defensor no tiene sitio (esquina), el resto lo absorbe el atacante.
 */
export function pushApart(atk: FighterState | null, def: FighterState, fromX: number, distance: number): void {
  const dir = (sign(def.x - fromX) || (def.facing === 1 ? -1 : 1)) as 1 | -1;
  const want = px(distance);
  const room = dir === 1 ? WALL_MAX - def.x : def.x - WALL_MIN;
  const defPart = Math.max(0, Math.min(want, room));
  applyPush(def, defPart * dir);
  if (atk && want > defPart && !isAirborne(atk)) applyPush(atk, -(want - defPart) * dir);
}

function gainMeter(f: FighterState, amount: number): void {
  f.meter = Math.max(0, Math.min(TUNING.meter.max, f.meter + amount));
}

function enterAirHit(def: FighterState, st: Strike, dir: 1 | -1, reset: boolean): void {
  const l = st.launch ?? (reset ? { vx: 2.5, vy: 7 } : { vx: 3, vy: 9 });
  setState(def, "airHit");
  def.move = null;
  def.mf = 0;
  def.vx = px(l.vx) * dir;
  def.vy = px(l.vy);
  def.y = Math.max(def.y, 1);
  def.airReset = reset;
  def.crouching = false;
  def.stun = 0;
}

/** Aplica un golpe que conectó (no bloqueado). */
export function applyHit(s: GameState, atk: FighterState | null, def: FighterState, st: Strike, counter: boolean): void {
  const juggling = def.state === "airHit";
  const wasAir = isAirborne(def);
  def.comboHits++;
  let dmg = pct(st.damage, comboScale(def.comboHits));
  if (counter) dmg = pct(dmg, TUNING.counterHit.damagePercent);
  dmg = Math.max(1, dmg);
  def.health = Math.max(0, def.health - dmg);
  def.comboDamage += dmg;
  def.lastCounter = counter;
  if (juggling) def.juggles++;

  const dir = (sign(def.x - st.fromX) || (def.facing === 1 ? -1 : 1)) as 1 | -1;
  def.hitstop = st.hitstop + (counter ? 2 : 0);
  if (atk && !st.projectile) atk.hitstop = def.hitstop;
  def.parryWindow = 0;
  def.redParry = 0;
  def.techWindow = 0;

  if (def.health <= 0 && !s.config.infiniteHealth) {
    // KO: sale despedido y cae.
    setState(def, "ko");
    def.move = null;
    def.vx = px(4) * dir;
    def.vy = px(10);
    def.y = Math.max(def.y, 1);
    def.hitstop = Math.max(def.hitstop, 14);
    if (atk && !st.projectile) atk.hitstop = def.hitstop;
    s.events.push({ type: "ko", side: atk ? atk.side : ((1 - def.side) as Side), x: def.x, y: def.y + px(100) });
  } else if (st.knockdown || wasAir) {
    enterAirHit(def, st, dir, !st.knockdown && st.strength === "light");
  } else {
    setState(def, "hitstun");
    def.move = null;
    def.mf = 0;
    def.vx = 0;
    def.stun = Math.max(1, st.hitstun + (counter ? st.chHitstunBonus : 0) - hitstunDecay(def.comboHits));
    pushApart(st.projectile ? null : atk, def, st.fromX, st.pushback);
  }

  if (atk) {
    gainMeter(atk, st.meterOnHit);
    if (!st.projectile) {
      atk.contact = "hit";
      atk.contactMf = atk.mf;
      atk.sinceContact = 0;
    }
  }
  gainMeter(def, pct(st.meterOnHit, TUNING.meter.defenderOnHitPercent));

  s.events.push({
    type: "hit",
    side: atk ? atk.side : ((1 - def.side) as Side),
    x: def.x,
    y: def.y + px(110),
    strength: st.strength,
    counter,
    damage: dmg,
    move: st.move,
  });
}

export function applyBlock(s: GameState, atk: FighterState | null, def: FighterState, st: Strike, crouch: boolean): void {
  setState(def, "blockstun");
  def.t = 0;
  def.move = null;
  def.mf = 0;
  def.vx = 0;
  def.crouching = crouch;
  def.stun = st.blockstun;
  def.hitstop = st.hitstop;
  if (atk && !st.projectile) atk.hitstop = st.hitstop;
  if (st.chip > 0) def.health = Math.max(s.config.infiniteHealth ? 1 : 0, def.health - st.chip);
  pushApart(st.projectile ? null : atk, def, st.fromX, st.pushback);
  if (atk) {
    gainMeter(atk, st.meterOnBlock);
    if (!st.projectile) {
      atk.contact = "block";
      atk.contactMf = atk.mf;
      atk.sinceContact = 0;
    }
  }
  gainMeter(def, pct(st.meterOnBlock, TUNING.meter.defenderOnBlockPercent));
  s.events.push({
    type: "block",
    side: atk ? atk.side : ((1 - def.side) as Side),
    x: def.x,
    y: def.y + px(crouch ? 70 : 110),
    strength: st.strength,
  });
  if (def.health <= 0) {
    // KO por daño de bloqueo (chip).
    setState(def, "ko");
    def.vx = px(3) * (sign(def.x - st.fromX) || 1);
    def.vy = px(8);
    def.y = 1;
    s.events.push({ type: "ko", side: atk ? atk.side : ((1 - def.side) as Side), x: def.x, y: def.y + px(100) });
  }
}

/** ¿Puede este golpe tocar al defensor según su estado (juggles, invulnerabilidad)? */
export function strikeCanTouch(def: FighterState, st: Strike): boolean {
  if (def.state === "ko" || def.state === "knockdown" || def.state === "wakeup") return false;
  if (def.state === "thrown") return false;
  if (def.state === "airHit") return st.juggle && def.juggles < TUNING.combo.maxJuggles;
  if (def.state === "dashB" && def.t <= getChar(def.char).dashB.invuln) return false;
  if (def.state === "attack") {
    const mv = moveOf(def);
    if (mv?.invuln) {
      for (const iv of mv.invuln) {
        if (def.mf >= iv.from && def.mf <= iv.to) {
          if (iv.kind === "all" || iv.kind === "strike") return false;
          if (iv.kind === "projectile" && st.projectile) return false;
        }
      }
    }
  }
  return true;
}

interface PendingStrike {
  atk: Side;
  hit: number;
  strike: Strike;
}

/** Detecta y resuelve los golpes cuerpo a cuerpo de este frame (simultáneos: puede haber intercambio). */
export function resolveStrikes(s: GameState): void {
  const pending: PendingStrike[] = [];
  for (const side of [0, 1] as const) {
    const atk = s.fighters[side];
    const def = s.fighters[side === 0 ? 1 : 0];
    if (atk.hitstop > 0 || atk.state !== "attack") continue;
    const groups = activeHitboxes(atk);
    if (!groups.length) continue;
    const mv = moveOf(atk);
    if (!mv) continue;
    const st = strikeFromMove(atk, mv);
    if (!strikeCanTouch(def, st)) continue;
    const hurt = hurtboxes(def);
    for (const g of groups) {
      if (anyOverlap(g.boxes, hurt)) {
        pending.push({ atk: side, hit: g.hit, strike: st });
        break;
      }
    }
  }
  if (!pending.length) return;

  // Clasificar con el estado previo de ambos (para que un intercambio sea justo), luego aplicar.
  const results = pending.map((p) => {
    const def = s.fighters[p.atk === 0 ? 1 : 0];
    const block = blockCheck(s, def, p.strike);
    const counter = isCounterState(def);
    return { ...p, block, counter };
  });
  for (const r of results) {
    const atk = s.fighters[r.atk];
    const def = s.fighters[r.atk === 0 ? 1 : 0];
    atk.hitMask |= 1 << r.hit;
    if (tryParry(s, atk, def, r.strike)) continue;
    if (r.block.ok) applyBlock(s, atk, def, r.strike, r.block.crouch);
    else applyHit(s, atk, def, r.strike, r.counter && results.length === 1);
  }
}
