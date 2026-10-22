import { getChar, getMove, getProjectile } from "../data/characters";
import { totalFrames } from "../data/moves/common";
import type { Guard, MoveData } from "../data/types";
import { TUNING } from "../data/tuning";
import { toPx } from "../sim/fixed";
import { Btn } from "../sim/input";
import { Rng } from "../sim/rng";
import type { FighterState, GameState, Side } from "../sim/types";
import { dirMask, motionFrames, waitFrames } from "./macros";

/**
 * IA de la CPU. Reglas para que sea justa y entretenida:
 *  - NO lee los inputs del jugador: solo "ve" el estado del juego con un retraso de reacción
 *    (como un humano que reconoce una animación).
 *  - Varía sus opciones (pesos aleatorios) y comete errores a propósito según la dificultad.
 *  - Ejecuta los especiales con motion inputs reales, frame a frame, igual que un jugador.
 */
export interface CpuLevel {
  name: string;
  /** Frames de retraso de reacción. */
  reaction: number;
  /** Probabilidad de "despistarse" en una decisión. */
  mistake: number;
  block: number;
  antiAir: number;
  parry: number;
  punish: number;
  combo: number;
  tech: number;
  aggression: number;
  /** Frames de pausa entre decisiones (mín., máx.). */
  think: [number, number];
}

export const CPU_LEVELS: CpuLevel[] = [
  { name: "Fácil", reaction: 26, mistake: 0.4, block: 0.35, antiAir: 0.2, parry: 0.02, punish: 0.25, combo: 0.25, tech: 0.1, aggression: 0.35, think: [14, 34] },
  { name: "Normal", reaction: 17, mistake: 0.2, block: 0.65, antiAir: 0.5, parry: 0.07, punish: 0.55, combo: 0.6, tech: 0.3, aggression: 0.5, think: [8, 22] },
  { name: "Difícil", reaction: 11, mistake: 0.08, block: 0.85, antiAir: 0.75, parry: 0.16, punish: 0.85, combo: 0.85, tech: 0.5, aggression: 0.6, think: [4, 14] },
];

/** Cómo juega cada personaje (la IA no "sabe" de frame data; tiene costumbres). */
interface Habits {
  /** Distancia preferida (px). */
  range: number;
  zoner: boolean;
  pokes: { move: "HK" | "LK" | "HP"; crouch: boolean; reach: number }[];
  /** Remate de combo/cadena: [motion, botón]. */
  ender: [number[], number];
  antiAir: [number[], number] | null;
  projectile: [number[], number] | null;
  command: [number[], number] | null;
}

const QCF = [2, 3, 6];
const DP = [6, 2, 3];
const HCB = [6, 3, 2, 1, 4];

const HABITS: Record<string, Habits> = {
  rayo: {
    range: 260,
    zoner: true,
    pokes: [
      { move: "HK", crouch: false, reach: 175 },
      { move: "LK", crouch: true, reach: 140 },
    ],
    ender: [QCF, Btn.HP],
    antiAir: [DP, Btn.HP],
    projectile: [QCF, Btn.HP],
    command: null,
  },
  chispa: {
    range: 120,
    zoner: false,
    pokes: [
      { move: "LK", crouch: true, reach: 128 },
      { move: "HK", crouch: false, reach: 150 },
    ],
    ender: [QCF, Btn.LK],
    antiAir: [DP, Btn.LP],
    projectile: [QCF, Btn.LP],
    command: null,
  },
  muralla: {
    range: 110,
    zoner: false,
    pokes: [
      { move: "HP", crouch: false, reach: 175 },
      { move: "HK", crouch: true, reach: 180 },
    ],
    ender: [QCF, Btn.LK],
    antiAir: [DP, Btn.HP],
    projectile: [QCF, Btn.HP],
    command: [HCB, Btn.LP],
  },
};

/** Lo que la CPU "ve" del rival en un frame. */
interface Seen {
  state: FighterState["state"];
  move: string | null;
  mf: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  contact: FighterState["contact"];
  projectiles: { x: number; vx: number; kind: string; owner: Side }[];
}

function snapshot(s: GameState, side: Side): Seen {
  const o = s.fighters[side === 0 ? 1 : 0];
  return {
    state: o.state,
    move: o.move,
    mf: o.mf,
    x: toPx(o.x),
    y: toPx(o.y),
    vx: toPx(o.vx),
    vy: toPx(o.vy),
    contact: o.contact,
    projectiles: s.projectiles.filter((p) => p.owner !== side).map((p) => ({ x: toPx(p.x), vx: toPx(p.vx), kind: p.kind, owner: p.owner })),
  };
}

const ACTIONABLE = new Set(["idle", "walkF", "walkB", "crouch"]);

export class Cpu {
  private queue: number[] = [];
  private hold = 0;
  private holdFrames = 0;
  private wait = 0;
  private seen: Seen[] = [];
  private rng: Rng;
  private techArmed = -1;

  constructor(
    public level: CpuLevel,
    readonly side: Side,
    seed = 1234,
  ) {
    this.rng = new Rng(seed + side * 7919);
  }

  reset(): void {
    this.queue = [];
    this.hold = 0;
    this.holdFrames = 0;
    this.wait = 0;
    this.seen = [];
  }

  /** Input de este frame. */
  input(s: GameState): number {
    this.seen.push(snapshot(s, this.side));
    if (this.seen.length > 64) this.seen.shift();
    if (s.round.phase !== "fight") {
      this.reset();
      return 0;
    }
    const me = s.fighters[this.side];

    // Escapar de agarres (adivinando: la ventana es más corta que cualquier reacción humana).
    if (me.state === "thrown" && me.techWindow > 0) {
      if (this.techArmed < 0) this.techArmed = this.rng.chance(this.level.tech) ? this.rng.int(5) : 99;
      if (this.techArmed === 0) {
        this.techArmed = 99;
        return Btn.LP | Btn.LK;
      }
      this.techArmed--;
      return 0;
    }
    this.techArmed = -1;

    if (this.queue.length) return this.queue.shift() as number;
    if (this.holdFrames > 0) {
      this.holdFrames--;
      return this.refreshHold(s, me);
    }
    if (this.wait > 0) {
      this.wait--;
      // Mientras "piensa", si le atacan bloquea (según el nivel).
      return this.defend(s, me, true) ?? 0;
    }
    return this.decide(s, me);
  }

  /** Mientras bloquea, ajusta la altura a lo que ve. */
  private refreshHold(s: GameState, me: FighterState): number {
    if (this.hold & Btn.PARRY) return this.hold;
    const g = this.threatGuard(s, me);
    const back = dirMask(4, me.facing);
    if (g === "low") return back | Btn.DOWN;
    if (g === "high") return back;
    return this.hold;
  }

  private perceived(): Seen {
    const i = Math.max(0, this.seen.length - 1 - this.level.reaction);
    return this.seen[i];
  }

  private dist(s: GameState): number {
    return Math.abs(toPx(s.fighters[0].x - s.fighters[1].x));
  }

  private push(frames: number[], think = true): number {
    this.queue.push(...frames);
    if (think) this.wait = Math.round(this.rng.range(this.level.think[0], this.level.think[1]));
    return this.queue.shift() ?? 0;
  }

  /** Altura del ataque que la CPU cree que viene (con retraso), o null si no ve amenaza. */
  private threatGuard(s: GameState, me: FighterState): Guard | null {
    const o = this.perceived();
    const d = Math.abs(o.x - toPx(me.x));
    for (const p of o.projectiles) {
      const toward = (p.x - toPx(me.x)) * p.vx < 0;
      if (toward && Math.abs(p.x - toPx(me.x)) < 260) return getProjectile(s.fighters[p.owner].char, p.kind).guard;
    }
    if ((o.state === "attack" || o.state === "air") && d < 230) {
      if (!o.move) return o.y > 0 && d < 160 ? "high" : null;
      const mv = getMove(s.fighters[this.side === 0 ? 1 : 0].char, o.move);
      if (mv.kind === "throw") return null;
      if (o.mf <= mv.startup + mv.active + 2) return mv.guard;
    }
    return null;
  }

  /** Defensa reactiva. `passive` = solo bloquear (no parry). Devuelve el input o null si no ve peligro. */
  private defend(s: GameState, me: FighterState, passive = false): number | null {
    if (!ACTIONABLE.has(me.state) && me.state !== "blockstun") return null;
    const g = this.threatGuard(s, me);
    if (!g) return null;
    const roll = this.rng.next();
    if (!passive && roll < this.level.parry) {
      const o = this.perceived();
      // Parry de "lectura": funciona contra lo predecible (proyectiles y saltos), si acierta el momento.
      const projClose = o.projectiles.some((p) => Math.abs(p.x - toPx(me.x)) < 80);
      if (projClose || (o.y > 30 && o.vy < 0)) {
        this.hold = Btn.PARRY | (g === "low" ? Btn.DOWN : 0);
        this.holdFrames = 0;
        return this.push([this.hold], true);
      }
    }
    if (roll < this.level.block + (passive ? 0 : this.level.parry)) {
      const back = dirMask(4, me.facing);
      // Error de altura ocasional.
      const wrong = this.rng.chance(this.level.mistake * 0.5);
      const low = (g === "low" || g === "mid") !== wrong;
      this.hold = back | (low && g !== "high" ? Btn.DOWN : 0);
      this.holdFrames = 8 + this.rng.int(8);
      return this.hold;
    }
    return null;
  }

  private decide(s: GameState, me: FighterState): number {
    const ch = getChar(me.char);
    const habits = HABITS[me.char] ?? HABITS.rayo;
    const lv = this.level;
    const o = this.perceived();
    const d = this.dist(s);
    const f = me.facing;
    const fwd = dirMask(6, f);
    const back = dirMask(4, f);
    const meX = toPx(me.x);

    // Cancelar en combo si nuestro golpe conectó (la CPU ve su propio contacto al instante).
    if (me.state === "attack" && me.contact === "hit" && me.move) {
      const mv = getMove(me.char, me.move);
      if (mv.cancels?.includes("special") && me.sinceContact <= 2 && this.rng.chance(lv.combo)) {
        if (me.meter >= TUNING.meter.max && this.rng.chance(0.5)) return this.push([Btn.HP | Btn.HK]);
        return this.push(motionFrames(habits.ender[0], habits.ender[1], f, 1));
      }
      return 0;
    }

    // En el aire: ataque aéreo si el rival está debajo/cerca.
    if (me.state === "air") {
      if (!me.airUsed && me.vy < 0 && toPx(me.y) < 120 && toPx(me.y) > 40 && d < 130 && this.rng.chance(0.7 - lv.mistake)) {
        return this.push([this.rng.chance(0.5) ? Btn.HK : Btn.HP], false);
      }
      return 0;
    }

    if (!ACTIONABLE.has(me.state)) return me.state === "blockstun" ? back | (me.crouching ? Btn.DOWN : 0) : 0;

    // Despiste: no hace nada útil un rato.
    if (this.rng.chance(lv.mistake * 0.15)) {
      this.wait = 10 + this.rng.int(20);
      return 0;
    }

    // Anti-aéreo
    const oppAir = o.y > 20 && (o.state === "air" || o.state === "attack");
    const approaching = (o.x - meX) * o.vx < 0 || Math.abs(o.x - meX) < 90;
    if (oppAir && approaching && d < 230) {
      if (this.rng.chance(lv.antiAir)) {
        if (habits.antiAir && d < 150 && o.vy < 0) return this.push(motionFrames(habits.antiAir[0], habits.antiAir[1], f, 1));
        if (d < 120) return this.push([Btn.DOWN | Btn.HP]);
      }
      const def = this.defend(s, me);
      if (def !== null) return def;
    }

    // Defensa contra golpes/proyectiles que ve venir
    const def = this.defend(s, me);
    if (def !== null) return def;

    // Castigo: el rival está recuperándose de algo que falló o le bloquearon.
    if (this.punishable(s, o) && this.rng.chance(lv.punish)) {
      if (d < 115) return this.push([Btn.HP | (me.meter >= TUNING.meter.max && this.rng.chance(0.3) ? Btn.HK : 0)]);
      if (d < 175) return this.push([Btn.HK]);
    }

    // Juego neutro según distancia y personalidad
    const r = this.rng.next();
    const aggr = lv.aggression;
    const myProj = s.projectiles.some((p) => p.owner === this.side);

    if (d > 330) {
      if (habits.zoner && !myProj && r < 0.45 && habits.projectile) return this.push(motionFrames(habits.projectile[0], habits.projectile[1], f, 1));
      if (me.char === "chispa" && r < 0.35) return this.push([fwd, 0, fwd]);
      if (r < 0.75) return this.walk(fwd, 18 + this.rng.int(18));
      return this.walk(0, 10);
    }

    if (d > 150) {
      if (habits.zoner && !myProj && r < 0.25 && habits.projectile) return this.push(motionFrames(habits.projectile[0], habits.projectile[1], f, 1));
      for (const p of habits.pokes) {
        if (d < p.reach + 10 && r < 0.4) return this.push([(p.crouch ? Btn.DOWN : 0) | Btn[p.move]]);
      }
      if (r < 0.4 + aggr * 0.25 && d < 260) return this.push([Btn.UP | fwd, Btn.UP | fwd, Btn.UP | fwd]);
      if (d > habits.range) return this.walk(fwd, 12 + this.rng.int(16));
      if (r < 0.85) return this.walk(back, 8 + this.rng.int(10));
      return this.walk(0, 12);
    }

    // Cerca: presión, agarres y mezclas
    if (habits.command && d < 110 && r < 0.3) return this.push(motionFrames(habits.command[0], habits.command[1], f, 1));
    if (d < 92 && r < 0.22) return this.push([Btn.LP | Btn.LK]);
    if (r < 0.5) {
      // Cadena baja → especial (si conecta, la parte de combo arriba decide cancelar)
      return this.push([Btn.DOWN | Btn.LK, ...waitFrames(6, Btn.DOWN), Btn.DOWN | Btn.LK, ...waitFrames(5, Btn.DOWN)]);
    }
    if (r < 0.62) return this.push([Btn.LP]);
    if (r < 0.7) return this.push([back, 0, back]);
    if (r < 0.8 && ch.normals.command?.length) {
      const c = ch.normals.command[0];
      return this.push([dirMask(c.dir, f) | Btn[c.button]]);
    }
    return this.walk(back | Btn.DOWN, 10 + this.rng.int(10));
  }

  private walk(mask: number, frames: number): number {
    this.hold = mask;
    this.holdFrames = frames;
    return mask;
  }

  /** ¿El rival (visto con retraso) está en una recuperación castigable? */
  private punishable(s: GameState, o: Seen): boolean {
    if (o.state === "parryFail" || o.state === "fall") return true;
    if (o.state === "land") return true;
    if (o.state !== "attack" || !o.move) return false;
    const mv: MoveData = getMove(s.fighters[this.side === 0 ? 1 : 0].char, o.move);
    if (mv.stance === "air") return false;
    const remaining = totalFrames(mv) - o.mf;
    return o.mf > mv.startup + mv.active - 1 && remaining > 8 + this.level.reaction / 2 && o.contact !== "hit";
  }
}
