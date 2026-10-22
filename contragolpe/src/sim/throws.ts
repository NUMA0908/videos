import { getMove } from "../data/characters";
import type { MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import { moveOf } from "./actions";
import { isAirborne } from "./boxes";
import { setState, toNeutral } from "./fighter";
import { px, sign } from "./fixed";
import { applyPush, WALL_MAX, WALL_MIN } from "./physics";
import type { FighterState, GameState, Side } from "./types";

/** Estados en los que no te pueden agarrar. */
const THROW_IMMUNE = new Set(["hitstun", "blockstun", "knockdown", "wakeup", "airHit", "thrown", "throw", "throwTech", "ko", "intro", "win"]);

export function throwInvulnerable(def: FighterState): boolean {
  if (THROW_IMMUNE.has(def.state)) return true;
  if (def.throwProtect > 0) return true;
  if (def.state === "dashB") return true;
  if (def.state === "attack") {
    const mv = moveOf(def);
    for (const iv of mv?.invuln ?? []) {
      if (def.mf >= iv.from && def.mf <= iv.to && (iv.kind === "throw" || iv.kind === "all")) return true;
    }
  }
  return false;
}

function throwConnects(atk: FighterState, def: FighterState, mv: MoveData): boolean {
  const spec = mv.throw;
  if (!spec) return false;
  if (atk.mf < mv.startup || atk.mf > mv.startup + mv.active - 1) return false;
  if (throwInvulnerable(def)) return false;
  const dx = Math.abs(def.x - atk.x);
  if (spec.air) {
    if (!isAirborne(def) || def.state === "airHit") return false;
    return dx <= px(spec.range) && def.y - atk.y <= px(170);
  }
  if (isAirborne(def) || def.y > 0) return false;
  return dx <= px(spec.range);
}

/** Coloca al agarrado delante (respetando la pared: si no cabe, se mueve el atacante). */
function holdPosition(atk: FighterState, def: FighterState, hold: number): void {
  let x = atk.x + px(hold) * atk.facing;
  if (x < WALL_MIN) {
    atk.x += WALL_MIN - x;
    x = WALL_MIN;
  } else if (x > WALL_MAX) {
    atk.x -= x - WALL_MAX;
    x = WALL_MAX;
  }
  def.x = x;
}

function grab(s: GameState, atk: FighterState, def: FighterState, mv: MoveData): void {
  const spec = mv.throw!;
  setState(atk, "throw");
  atk.vx = 0;
  setState(def, "thrown");
  def.move = null;
  def.mf = 0;
  def.vx = 0;
  def.vy = 0;
  def.heldBy = atk.side;
  def.crouching = false;
  def.parryWindow = 0;
  def.techWindow = spec.techable ? TUNING.throw.techWindow : 0;
  if (spec.air) {
    // Agarre aéreo: ambos quedan a media altura y caen juntos.
    def.y = Math.max(def.y, px(60));
  } else def.y = 0;
  holdPosition(atk, def, spec.hold);
  s.events.push({ type: "throw", side: atk.side, x: def.x, y: def.y + px(100), move: mv.id });
}

function tech(s: GameState, atk: FighterState, def: FighterState): void {
  for (const f of [atk, def]) {
    toNeutral(f);
    setState(f, "throwTech");
    f.hitstop = TUNING.throw.techFreeze;
    f.y = 0;
    f.vy = 0;
    f.heldBy = -1;
    f.techWindow = 0;
  }
  const dir = (sign(def.x - atk.x) || atk.facing) as 1 | -1;
  applyPush(def, px(TUNING.throw.techPush) * dir);
  applyPush(atk, -px(TUNING.throw.techPush) * dir);
  s.events.push({ type: "tech", side: def.side, x: (atk.x + def.x) >> 1, y: px(110) });
}

/** Detecta agarres que conectan este frame. Si ambos agarran a la vez: escape automático. */
export function resolveThrows(s: GameState): void {
  const grabs: Side[] = [];
  for (const side of [0, 1] as const) {
    const atk = s.fighters[side];
    if (atk.state !== "attack" || atk.hitstop > 0) continue;
    const mv = moveOf(atk);
    if (!mv || mv.kind !== "throw" || !mv.throw) continue;
    if (throwConnects(atk, s.fighters[side === 0 ? 1 : 0], mv)) grabs.push(side);
  }
  if (grabs.length === 2) {
    const a = s.fighters[0];
    const b = s.fighters[1];
    const bothTechable = getMove(a.char, a.move!).throw!.techable && getMove(b.char, b.move!).throw!.techable;
    if (bothTechable) {
      tech(s, a, b);
      return;
    }
  }
  if (grabs.length) {
    const side = grabs[0];
    const atk = s.fighters[side];
    grab(s, atk, s.fighters[side === 0 ? 1 : 0], moveOf(atk)!);
  }
}

/** Animación de agarre (atacante): sujeta, aplica daño en `damageFrame` y suelta. */
export function updateThrower(s: GameState, atk: FighterState): void {
  const def = s.fighters[atk.side === 0 ? 1 : 0];
  const mv = moveOf(atk);
  if (!mv?.throw) {
    toNeutral(atk);
    return;
  }
  const spec = mv.throw;
  if (def.state === "thrown" && def.heldBy === atk.side && atk.t < spec.damageFrame) {
    holdPosition(atk, def, spec.hold);
    if (spec.air) def.y = Math.max(def.y, px(40));
  }
  if (atk.t === spec.damageFrame && def.state === "thrown") {
    const dmg = mv.damage;
    def.health = Math.max(s.config.infiniteHealth ? 1 : 0, def.health - dmg);
    def.comboHits++;
    def.comboDamage += dmg;
    def.heldBy = -1;
    def.techWindow = 0;
    // Lanzamiento hacia delante, o hacia atrás si se pidió (el atacante pasa al otro lado).
    let dir = atk.facing as 1 | -1;
    if (atk.throwBack) {
      const ax = atk.x;
      atk.x = def.x;
      def.x = ax;
      atk.facing = (-atk.facing) as 1 | -1;
      dir = atk.facing;
    }
    def.vx = px(spec.toss.vx) * dir;
    def.vy = px(spec.toss.vy);
    def.y = Math.max(def.y, 1);
    def.hitstop = mv.hitstop;
    atk.hitstop = mv.hitstop;
    if (atk.meter < TUNING.meter.max) atk.meter = Math.min(TUNING.meter.max, atk.meter + mv.meterOnHit);
    s.events.push({ type: "throwHit", side: atk.side, x: def.x, y: def.y + px(90), damage: dmg, strength: "heavy", move: mv.id });
    if (def.health <= 0) {
      setState(def, "ko");
      s.events.push({ type: "ko", side: atk.side, x: def.x, y: px(100) });
    }
  }
  if (atk.t >= spec.duration) {
    atk.y = 0;
    toNeutral(atk);
    atk.throwBack = false;
  }
}

/** Mientras te agarran: ventana para escapar pulsando LP+LK. */
export function updateThrown(s: GameState, def: FighterState, techPressed: boolean): void {
  if (def.heldBy === -1) return;
  const atk = s.fighters[def.heldBy];
  if (def.techWindow > 0) {
    if (techPressed) {
      tech(s, atk, def);
      return;
    }
    def.techWindow--;
  }
}
