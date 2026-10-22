import { getProjectile } from "../data/characters";
import type { ProjectileData, ProjectileSpawn } from "../data/types";
import { TUNING } from "../data/tuning";
import { anyOverlap, hurtboxes, overlaps, toWorld, type WorldBox } from "./boxes";
import { applyBlock, applyHit, blockCheck, isCounterState, strikeCanTouch, tryArmor, type Strike } from "./combat";
import { px } from "./fixed";
import type { FighterState, GameState, ProjectileState, Side } from "./types";

export function projectileData(s: GameState, p: ProjectileState): ProjectileData {
  return getProjectile(s.fighters[p.owner].char, p.kind);
}

export function hasProjectile(s: GameState, side: Side): boolean {
  return s.projectiles.some((p) => p.owner === side && !p.dead);
}

export function spawnProjectile(s: GameState, f: FighterState, spawn: ProjectileSpawn): void {
  const pd = getProjectile(f.char, spawn.kind);
  const p: ProjectileState = {
    id: s.nextId++,
    owner: f.side,
    kind: spawn.kind,
    x: f.x + px(spawn.x) * f.facing,
    y: f.y + px(spawn.y),
    vx: px(pd.speed) * f.facing,
    facing: f.facing,
    t: 0,
    hits: pd.hits,
    cooldown: 0,
    hitstop: 0,
    dead: false,
  };
  s.projectiles.push(p);
  s.events.push({ type: "projectile", side: f.side, x: p.x, y: p.y, move: spawn.kind });
}

export function projectileBox(s: GameState, p: ProjectileState): WorldBox {
  return toWorld(p, projectileData(s, p).hitbox);
}

export function allProjectileBoxes(s: GameState): WorldBox[] {
  return s.projectiles.filter((p) => !p.dead).map((p) => projectileBox(s, p));
}

export function strikeFromProjectile(p: ProjectileState, pd: ProjectileData): Strike {
  const last = p.hits === 1;
  return {
    damage: pd.damage,
    chip: pd.chip,
    hitstun: pd.hitstun,
    blockstun: pd.blockstun,
    // El golpe final de un multi-hit "truena": más congelamiento.
    hitstop: pd.finalKnockdown && last ? pd.hitstop + 12 : pd.hitstop,
    pushback: pd.pushback,
    guard: pd.guard,
    strength: pd.hits > 1 ? "super" : "heavy",
    knockdown: !!pd.knockdown || (!!pd.finalKnockdown && last),
    launch: pd.launch,
    juggle: !!pd.juggle,
    chHitstunBonus: TUNING.counterHit.hitstunBonus.heavy,
    meterOnHit: pd.meterOnHit,
    meterOnBlock: pd.meterOnBlock,
    fromX: p.x,
    projectile: true,
    move: p.kind,
  };
}

/** Mueve los proyectiles (los congelados por impacto esperan). */
export function updateProjectiles(s: GameState): void {
  const maxX = px(TUNING.stage.width + 120);
  for (const p of s.projectiles) {
    if (p.dead) continue;
    if (p.hitstop > 0) {
      p.hitstop--;
      continue;
    }
    p.t++;
    p.x += p.vx;
    if (p.cooldown > 0) p.cooldown--;
    const pd = projectileData(s, p);
    if (p.t > pd.life || p.x < -px(120) || p.x > maxX) p.dead = true;
  }
}

/** Choques entre proyectiles y golpes de proyectil a personajes. */
export function resolveProjectiles(s: GameState, parry: (s: GameState, def: FighterState, st: Strike) => boolean): void {
  const live = s.projectiles.filter((p) => !p.dead);
  // Proyectil contra proyectil: se anulan golpe a golpe; el de mayor prioridad gana el empate.
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.owner === b.owner || a.dead || b.dead || a.hitstop > 0 || b.hitstop > 0) continue;
      if (!overlaps(projectileBox(s, a), projectileBox(s, b))) continue;
      const pa = projectileData(s, a);
      const pb = projectileData(s, b);
      const ha = a.hits;
      a.hits -= pb.priority >= pa.priority ? b.hits : 1;
      b.hits -= pa.priority >= pb.priority ? ha : 1;
      if (a.hits <= 0) a.dead = true;
      if (b.hits <= 0) b.dead = true;
      if (!a.dead) a.hitstop = 6;
      if (!b.dead) b.hitstop = 6;
      s.events.push({ type: "projectileClash", side: a.owner, x: (a.x + b.x) >> 1, y: (a.y + b.y) >> 1 });
    }
  }
  for (const p of live) {
    if (p.dead || p.hitstop > 0 || p.cooldown > 0 || p.hits <= 0) continue;
    const def = s.fighters[p.owner === 0 ? 1 : 0];
    const owner = s.fighters[p.owner];
    const pd = projectileData(s, p);
    const st = { ...strikeFromProjectile(p, pd), at: { x: p.x, y: p.y } };
    if (!strikeCanTouch(def, st)) continue;
    if (!anyOverlap([projectileBox(s, p)], hurtboxes(def))) continue;
    p.hits--;
    p.cooldown = pd.hitInterval;
    if (parry(s, def, st)) {
      p.hitstop = TUNING.parry.freeze;
    } else {
      const block = blockCheck(s, def, st);
      if (block.ok) applyBlock(s, owner, def, st, block.crouch);
      else if (!tryArmor(s, owner, def, st)) applyHit(s, owner, def, st, isCounterState(def));
      p.hitstop = def.hitstop;
    }
    if (p.hits <= 0) p.dead = true;
  }
  s.projectiles = s.projectiles.filter((p) => !p.dead);
}
