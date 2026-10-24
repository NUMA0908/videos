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
  /** Frames de retraso de reacción (media). */
  reaction: number;
  /** La reacción varía ±spread frames (la atención de una persona no es constante). */
  reactionSpread: number;
  /** Frames reales (hitstop incluido) que tarda en reconocer si su golpe entró o lo bloquearon (hit-confirm). */
  confirm: number;
  /** Probabilidad de cancelar "a ciegas" (sin confirmar): sale también si se lo bloquean. */
  blindCancel: number;
  /** Probabilidad de cambiar de plan cuando el actual no funciona. */
  adapt: number;
  /** Probabilidad de "despistarse" en una decisión. */
  mistake: number;
  block: number;
  antiAir: number;
  parry: number;
  punish: number;
  combo: number;
  tech: number;
  aggression: number;
  /** Probabilidad de responder a un proyectil (saltarlo o atravesarlo). */
  antiZone: number;
  /** Frames de pausa entre decisiones (mín., máx.). */
  think: [number, number];
}

export const CPU_LEVELS: CpuLevel[] = [
  { name: "Fácil", reaction: 22, reactionSpread: 3, confirm: 22, blindCancel: 0.12, adapt: 0.3, mistake: 0.4, block: 0.35, antiAir: 0.2, parry: 0.02, punish: 0.25, combo: 0.25, tech: 0.1, aggression: 0.35, antiZone: 0.12, think: [14, 34] },
  { name: "Normal", reaction: 16, reactionSpread: 4, confirm: 13, blindCancel: 0.05, adapt: 0.6, mistake: 0.2, block: 0.72, antiAir: 0.5, parry: 0.07, punish: 0.6, combo: 0.6, tech: 0.4, aggression: 0.5, antiZone: 0.4, think: [8, 22] },
  { name: "Difícil", reaction: 12, reactionSpread: 2, confirm: 10, blindCancel: 0.05, adapt: 0.85, mistake: 0.08, block: 0.9, antiAir: 0.75, parry: 0.16, punish: 0.9, combo: 0.85, tech: 0.6, aggression: 0.6, antiZone: 0.6, think: [4, 14] },
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
  /** Movimiento que atraviesa (o encaja) proyectiles y distancia máxima al rival para usarlo. */
  through: { input: [number[], number]; range: number } | null;
  /** Prob. de dash para entrar. */
  dash: number;
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
    through: { input: [[2, 1, 4], Btn.HK], range: 230 },
    dash: 0.1,
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
    through: { input: [[2, 1, 4], Btn.HK], range: 330 },
    dash: 0.4,
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
    through: { input: [QCF, Btn.HK], range: 250 },
    dash: 0.05,
  },
};

/**
 * Planes de juego: modifican las costumbres del personaje. La CPU mantiene un plan mientras le funciona
 * (daño hecho ≥ daño recibido) y lo cambia cuando pierde, como una persona.
 */
export type PlanId = "costumbre" | "presion" | "distancia" | "paciencia";
interface Plan {
  /** Suma a la agresividad del nivel. */
  aggr: number;
  /** Multiplica la distancia preferida. */
  range: number;
  /** Multiplica las ganas de lanzar proyectiles. */
  zone: number;
  /** Multiplica las ganas de esperar bloqueando para castigar. */
  bait: number;
  /** Suma a la probabilidad de dash. */
  dash: number;
}
const PLANS: Record<PlanId, Plan> = {
  costumbre: { aggr: 0, range: 1, zone: 1, bait: 1, dash: 0 },
  presion: { aggr: 0.25, range: 0.65, zone: 0.4, bait: 0.6, dash: 0.2 },
  distancia: { aggr: -0.15, range: 1.45, zone: 1.5, bait: 1.2, dash: -0.05 },
  paciencia: { aggr: -0.2, range: 1, zone: 0.8, bait: 1.8, dash: 0 },
};
const PLAN_IDS = Object.keys(PLANS) as PlanId[];
/** Cada cuántos frames de combate revisa si el plan funciona. */
const PLAN_REVIEW = 300;

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
  /** Memoria simple: si le castigan algo, lo hace menos (y lo va olvidando poco a poco). */
  private jumpTrust = 1;
  private pokeTrust = 1;
  private prevState: FighterState["state"] = "idle";
  /** Cuántos reversals (movimientos invencibles) le ha visto al rival: si abusa, la CPU espera y castiga. */
  private reversalSeen = 0;
  /** Fracción reciente de frames en los que el rival estaba atacando (media móvil). */
  private oppAttackRate = 0;
  private lastSeenMove: string | null = null;
  /** Retraso de reacción actual (cambia poco a poco hacia `delayTarget`). */
  private delay: number;
  private delayTarget: number;
  private delayTimer = 0;
  /** Hit-confirm: frames que faltan para "ver" si su golpe entró (−1 = nada pendiente). */
  private confirmT = -1;
  /** Ya vio entrar un golpe en esta cadena: el siguiente contacto se cancela sin esperar. */
  private confirmedString = false;
  private prevContact: FighterState["contact"] = "none";
  /** Castigo en curso: sabe que va a pegar, así que mete el combo entero sin esperar a confirmar (frames). */
  private committed = 0;
  /** Plan de juego actual y su marcador (daño hecho − recibido). */
  plan: PlanId = "costumbre";
  private planScore: Record<PlanId, number> = { costumbre: 0, presion: 0, distancia: 0, paciencia: 0 };
  private planT = 0;
  private planDealt = 0;
  private planTaken = 0;
  private lastHp: [number, number] = [-1, -1];

  constructor(
    public level: CpuLevel,
    readonly side: Side,
    seed = 1234,
  ) {
    this.rng = new Rng(seed + side * 7919);
    this.delay = this.delayTarget = level.reaction;
  }

  /** Retraso de reacción de este frame (para la depuración y los tests). */
  get reactionNow(): number {
    return this.delay;
  }

  reset(): void {
    this.queue = [];
    this.hold = 0;
    this.holdFrames = 0;
    this.wait = 0;
    this.seen = [];
    this.confirmT = -1;
    this.confirmedString = false;
    this.prevContact = "none";
    this.committed = 0;
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
    this.learn(me, s);
    this.drift();
    this.reviewPlan(s);

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

    const confirm = this.hitConfirm(s, me);
    if (confirm !== null) return confirm;

    if (this.queue.length) return this.queue.shift() as number;
    if (this.holdFrames > 0) {
      this.holdFrames--;
      return this.refreshHold(s, me);
    }
    if (this.wait > 0) {
      this.hurry(s);
      this.wait--;
      // Aunque esté "pensando", un error claro del rival se castiga.
      const o = this.perceived();
      if (ACTIONABLE.has(me.state) && this.punishable(s, o) && this.rng.chance(this.level.punish * 0.6)) {
        const pin = this.punishInput(s, o);
        if (pin) return this.commit(pin);
      }
      // Mientras "piensa", si le atacan bloquea (según el nivel).
      return this.defend(s, me, true) ?? 0;
    }
    return this.decide(s, me);
  }

  private learn(me: FighterState, s?: GameState): void {
    if (s) {
      const o = this.perceived();
      if (o && o.state === "attack" && o.move && o.mf <= 2 && o.move !== this.lastSeenMove) {
        const mv = getMove(s.fighters[this.side === 0 ? 1 : 0].char, o.move);
        if (mv.invuln?.some((iv) => iv.from <= 2 && (iv.kind === "all" || iv.kind === "strike"))) this.reversalSeen++;
      }
      this.lastSeenMove = o?.state === "attack" ? o.move : null;
      const attacking = o && (o.state === "attack" || o.state === "throw") ? 1 : 0;
      this.oppAttackRate += (attacking - this.oppAttackRate) * 0.01;
    }
    this.reversalSeen = Math.max(0, this.reversalSeen - 0.0008);
    const wasAir = this.prevState === "air" || (this.prevState === "attack" && me.y > 0);
    const hitNow = me.state === "airHit" || me.state === "hitstun" || me.state === "ko";
    const wasHit = this.prevState === "airHit" || this.prevState === "hitstun" || this.prevState === "ko";
    if (hitNow && !wasHit) {
      if (wasAir) this.jumpTrust = Math.max(0.1, this.jumpTrust * 0.5);
      else if (this.prevState === "attack" && me.lastCounter) this.pokeTrust = Math.max(0.25, this.pokeTrust * 0.6);
    }
    this.prevState = me.state;
    this.jumpTrust = Math.min(1, this.jumpTrust + 0.0015);
    this.pokeTrust = Math.min(1, this.pokeTrust + 0.002);
  }

  /** La atención varía: el retraso de reacción se mueve poco a poco dentro de reaction ± spread. */
  private drift(): void {
    const lv = this.level;
    if (--this.delayTimer <= 0) {
      this.delayTarget = lv.reaction - lv.reactionSpread + this.rng.int(lv.reactionSpread * 2 + 1);
      this.delayTimer = 20 + this.rng.int(40);
    }
    if (this.delay < this.delayTarget) this.delay++;
    else if (this.delay > this.delayTarget) this.delay--;
  }

  /**
   * Cancelar en combo como una persona: ve su golpe conectar, tarda `confirm` frames reales (el hitstop cuenta,
   * por eso los golpes fuertes se confirman mejor) y solo cancela si aún queda ventana. Un ligero suelto casi
   * nunca se confirma; en una cadena, el segundo golpe ya va "confirmado" por el primero. A veces cancela a
   * ciegas (también si se lo bloquean: eso se puede castigar).
   */
  private hitConfirm(s: GameState, me: FighterState): number | null {
    if (this.committed > 0) this.committed--;
    if (me.state !== "attack" || !me.move) {
      this.confirmT = -1;
      this.confirmedString = false;
      this.prevContact = "none";
      return null;
    }
    const newContact = me.contact !== "none" && this.prevContact === "none";
    this.prevContact = me.contact;
    const mv = getMove(me.char, me.move);
    if (!mv.cancels?.includes("special")) {
      // Un golpe sin cancel no termina la cuenta del confirm de la cadena (p. ej. tras un salto).
      if (this.confirmT > 0) this.confirmT--;
      return null;
    }
    const lv = this.level;
    if (newContact) {
      if (this.committed > 0 && this.rng.chance(lv.combo)) return this.cancelInto(me);
      if (this.confirmedString && me.contact === "hit" && this.rng.chance(lv.combo)) return this.cancelInto(me);
      if (this.rng.chance(lv.blindCancel * lv.combo)) return this.cancelInto(me);
      this.confirmT = Math.max(1, lv.confirm - 2 + this.rng.int(5));
      return null;
    }
    if (this.confirmT > 0 && --this.confirmT === 0) {
      this.confirmT = -1;
      // Lo que ve una persona: ¿el rival está en hitstun? (si ya salió el siguiente golpe de la cadena, el
      // contacto de ese golpe aún no existe, pero el rival sigue aturdido por el anterior).
      const op = s.fighters[this.side === 0 ? 1 : 0];
      if (op.state !== "hitstun" && op.state !== "airHit") return null;
      this.confirmedString = true;
      if (me.contact !== "hit") return null;
      // Hace falta tiempo para el motion (3 direcciones + botón) dentro de la ventana de cancel.
      if (TUNING.cancelWindow - me.sinceContact >= 4 && this.rng.chance(lv.combo)) return this.cancelInto(me);
    }
    return null;
  }

  private cancelInto(me: FighterState): number {
    const habits = HABITS[me.char] ?? HABITS.rayo;
    this.committed = 0;
    this.queue = [];
    this.holdFrames = 0;
    if (me.meter >= TUNING.meter.max && this.rng.chance(0.5)) return this.push([Btn.HP | Btn.HK]);
    return this.push(motionFrames(habits.ender[0], habits.ender[1], me.facing, 1));
  }

  /**
   * Adaptación: cada PLAN_REVIEW frames mira el daño hecho y recibido (lo que se ve en las barras de vida).
   * Si va perdiendo, cambia de plan (prefiriendo los que le funcionaron); si va ganando, insiste.
   */
  private reviewPlan(s: GameState): void {
    const me = s.fighters[this.side];
    const op = s.fighters[this.side === 0 ? 1 : 0];
    const [hpMe, hpOp] = this.lastHp;
    // Entre rondas la vida se rellena: solo cuentan las bajadas.
    if (hpMe >= 0) {
      this.planTaken += Math.max(0, hpMe - me.health);
      this.planDealt += Math.max(0, hpOp - op.health);
    }
    this.lastHp = [me.health, op.health];
    if (++this.planT < PLAN_REVIEW) return;
    const diff = this.planDealt - this.planTaken;
    this.planScore[this.plan] = this.planScore[this.plan] * 0.5 + diff;
    const losing = this.planTaken > this.planDealt * 1.25 + 40;
    if (losing && this.rng.chance(this.level.adapt)) {
      const others = PLAN_IDS.filter((p) => p !== this.plan);
      const best = others.reduce((a, b) => (this.planScore[b] > this.planScore[a] ? b : a));
      this.plan = this.planScore[best] > 0 && this.rng.chance(0.6) ? best : others[this.rng.int(others.length)];
    }
    this.planT = 0;
    this.planDealt = 0;
    this.planTaken = 0;
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
    const i = Math.max(0, this.seen.length - 1 - this.delay);
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

  /** Pegado al rival no hay tiempo para pensar tanto (bloquear sin más pierde contra agarres). */
  private hurry(s: GameState): void {
    if (this.dist(s) < 120) this.wait = Math.min(this.wait, 3 + this.rng.int(4));
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
    const extra = Math.min(0.2, Math.max(0, this.oppAttackRate - 0.25));
    if (roll < this.level.block + extra + (passive ? 0 : this.level.parry)) {
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
    const plan = PLANS[this.plan];
    const o = this.perceived();
    const d = this.dist(s);
    const f = me.facing;
    const fwd = dirMask(6, f);
    const back = dirMask(4, f);
    const meX = toPx(me.x);

    // Atacando: el hit-confirm (arriba, en `input`) decide si cancela; aquí no hay nada más que hacer.
    if (me.state === "attack") return 0;

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

    // Ve al rival empezar a lanzar un proyectil a media distancia: salta para castigar la recuperación.
    if (o.state === "attack" && o.move && d > 150 && d < 330 && this.jumpTrust > 0.3) {
      const omv = getMove(s.fighters[this.side === 0 ? 1 : 0].char, o.move);
      if (omv.projectile && this.rng.chance(lv.antiZone)) return this.push([Btn.UP | fwd, Btn.UP | fwd, Btn.UP | fwd], false);
    }

    // Proyectil acercándose: atravesarlo, saltarlo, anularlo o quedarse bloqueando hasta que pase.
    const proj = o.projectiles.find((p) => (p.x - meX) * p.vx < 0);
    if (proj) {
      const pd = Math.abs(proj.x - meX);
      const speed = Math.max(1, Math.abs(proj.vx));
      const r0 = this.rng.next();
      if (pd > 70 && pd < 300 && r0 < lv.antiZone) {
        if (habits.through && d < habits.through.range && this.rng.chance(0.6)) return this.push(motionFrames(habits.through.input[0], habits.through.input[1], f, 1));
        if (pd > 120 && pd < 250 && d < 420 && this.jumpTrust > 0.3) return this.push([Btn.UP | fwd, Btn.UP | fwd, Btn.UP | fwd], false);
        if (habits.zoner && habits.projectile && !s.projectiles.some((p) => p.owner === this.side)) return this.push(motionFrames(habits.projectile[0], habits.projectile[1], f, 1));
      }
      if (pd < 420 && this.rng.chance(Math.min(0.95, lv.block + 0.25))) {
        const pdData = getProjectile(s.fighters[proj.owner].char, proj.kind);
        this.hold = back | (pdData.guard === "high" ? 0 : Btn.DOWN);
        this.holdFrames = Math.min(40, Math.ceil(pd / speed) + 6);
        return this.hold;
      }
    }

    // Defensa contra golpes/proyectiles que ve venir
    const def = this.defend(s, me);
    if (def !== null) return def;

    // Castigo: el rival está recuperándose de algo que falló o le bloquearon.
    if (this.punishable(s, o) && this.rng.chance(lv.punish)) {
      const pin = this.punishInput(s, o);
      if (pin) return this.commit(pin);
    }

    // Juego neutro según distancia y personalidad
    const r = this.rng.next();
    const aggr = Math.max(0, Math.min(1, lv.aggression + plan.aggr));
    const myProj = s.projectiles.some((p) => p.owner === this.side);
    const dash = Math.max(0, habits.dash + plan.dash);
    const range = habits.range * plan.range;

    if (d > 330) {
      if (habits.zoner && !myProj && r < 0.45 * plan.zone && habits.projectile) return this.push(motionFrames(habits.projectile[0], habits.projectile[1], f, 1));
      if (r < dash) return this.push([fwd, 0, fwd]);
      if (r < 0.75 || range < d - 60) return this.walk(fwd, 18 + this.rng.int(18));
      return this.walk(0, 10);
    }

    if (d > 150) {
      if (habits.zoner && !myProj && r < 0.25 * plan.zone && habits.projectile) return this.push(motionFrames(habits.projectile[0], habits.projectile[1], f, 1));
      for (const p of habits.pokes) {
        if (d < p.reach + 10 && r < 0.4) return this.push([(p.crouch ? Btn.DOWN : 0) | Btn[p.move]]);
      }
      if (r < (0.4 + aggr * 0.25) * this.jumpTrust && d < 260) return this.push([Btn.UP | fwd, Btn.UP | fwd, Btn.UP | fwd]);
      if (r < 0.5 + dash && d > 170) return this.push([fwd, 0, fwd]);
      if (d > range) return this.walk(fwd, 12 + this.rng.int(16));
      if (r < 0.85) return this.walk(back, 8 + this.rng.int(10));
      return this.walk(0, 12);
    }

    // Cerca: a veces espera bloqueando para castigar (más si le han ganado a golpes o abusa de reversals).
    // Contra quien no para de apretar botones: bloquear y castigar lo que falle.
    const masher = Math.max(0, this.oppAttackRate - 0.25) * 1.6;
    const bait = (0.12 + (1 - this.pokeTrust) * 0.3 + Math.min(0.55, this.reversalSeen * 0.09) + Math.min(0.45, masher)) * plan.bait;
    if (r < bait) {
      // Contra un agarre de comando no sirve esperar agachado: mejor retroceder fuera de su alcance.
      const grabber = !!HABITS[s.fighters[this.side === 0 ? 1 : 0].char]?.command;
      return this.walk(grabber ? back : back | Btn.DOWN, 10 + this.rng.int(14));
    }
    // Presión, agarres y mezclas
    if (habits.command && d < 110 && r < 0.3) return this.push(motionFrames(habits.command[0], habits.command[1], f, 1));
    // Un rival que se queda agachado bloqueando pide un agarre.
    const turtle = o.state === "crouch" || o.state === "blockstun";
    if (d < 92 && r < (turtle ? 0.45 : 0.22)) return this.push([Btn.LP | Btn.LK]);
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

  /** Castigo: el combo va "comprometido" (cancela en el primer contacto sin esperar a confirmarlo). */
  private commit(frames: number[]): number {
    this.committed = 30;
    return this.push(frames);
  }

  private walk(mask: number, frames: number): number {
    this.hold = mask;
    this.holdFrames = frames;
    return mask;
  }

  /**
   * Frames que (estimamos) le quedan al rival de recuperación ahora mismo: lo que vemos con retraso
   * menos nuestro propio retraso de reacción. 0 = nada que castigar.
   */
  private punishWindow(s: GameState, o: Seen): number {
    const lag = this.delay;
    if (o.state === "parryFail") return Math.max(0, TUNING.parry.failRecovery - lag + 4);
    if (o.state === "fall") return 18;
    if (o.state === "land") return Math.max(0, 10 - lag);
    if (o.state !== "attack" || !o.move || o.contact === "hit") return 0;
    const mv: MoveData = getMove(s.fighters[this.side === 0 ? 1 : 0].char, o.move);
    if (mv.stance === "air" || o.mf <= mv.startup + mv.active - 1) return 0;
    return Math.max(0, totalFrames(mv) - o.mf - lag);
  }

  private punishable(s: GameState, o: Seen): boolean {
    return this.punishWindow(s, o) >= 5;
  }

  /** Elige el castigo que cabe en la ventana y a esa distancia (null si ninguno). */
  private punishInput(s: GameState, o: Seen): number[] | null {
    const w = this.punishWindow(s, o);
    const d = this.dist(s);
    const me = s.fighters[this.side];
    const jab = getChar(me.char).moves.st_lp.startup;
    if (w >= 12 && d < 115) return [Btn.HP | (me.meter >= TUNING.meter.max && this.rng.chance(0.3) ? Btn.HK : 0)];
    if (w >= 14 && d < 175) return [Btn.HK];
    if (w >= jab + 1 && d < 95) return [this.rng.chance(0.5) ? Btn.DOWN | Btn.LK : Btn.LP];
    return null;
  }
}
