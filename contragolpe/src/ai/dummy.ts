import { getMove, getProjectile } from "../data/characters";
import { Btn, toNumpad } from "../sim/input";
import type { GameState, Side } from "../sim/types";
import { Cpu, CPU_LEVELS } from "./cpu";
import { dirMask } from "./macros";

/** Comportamientos del muñeco del modo Entrenamiento. */
export type DummyMode = "stand" | "crouch" | "block" | "parry" | "jump" | "cpu" | "playback";

export const DUMMY_MODES: { id: DummyMode; label: string }[] = [
  { id: "stand", label: "Quieto" },
  { id: "crouch", label: "Agachado" },
  { id: "block", label: "Bloquea todo" },
  { id: "parry", label: "Parry perfecto" },
  { id: "jump", label: "Salta" },
  { id: "cpu", label: "CPU" },
  { id: "playback", label: "Reproducir grabación" },
];

/** Grabación relativa a hacia dónde mira (sirve en cualquier lado de la pantalla). */
export interface Recording {
  frames: { dir: number; buttons: number }[];
}

export class Dummy {
  mode: DummyMode = "stand";
  recording: Recording = { frames: [] };
  private playIdx = 0;
  private cpu: Cpu;
  private parryHeld = false;

  constructor(readonly side: Side, cpuLevel = 1) {
    this.cpu = new Cpu(CPU_LEVELS[cpuLevel], side, 99);
  }

  setCpuLevel(level: number): void {
    this.cpu.level = CPU_LEVELS[level];
  }

  restartPlayback(): void {
    this.playIdx = 0;
  }

  record(mask: number, facing: 1 | -1): void {
    this.recording.frames.push({ dir: toNumpad(mask, facing), buttons: mask & ~(Btn.UP | Btn.DOWN | Btn.LEFT | Btn.RIGHT) });
  }

  input(s: GameState): number {
    const me = s.fighters[this.side];
    const o = s.fighters[this.side === 0 ? 1 : 0];
    const back = dirMask(4, me.facing);
    switch (this.mode) {
      case "stand":
        return 0;
      case "crouch":
        return Btn.DOWN;
      case "jump":
        return Btn.UP;
      case "cpu":
        return this.cpu.input(s);
      case "playback": {
        const fr = this.recording.frames;
        if (!fr.length) return 0;
        const f = fr[this.playIdx % fr.length];
        this.playIdx++;
        return dirMask(f.dir, me.facing) | f.buttons;
      }
      case "block": {
        // Ve el golpe al instante (es un muñeco de práctica, no la CPU).
        const g = this.incomingGuard(s);
        // Medios de pie (así el jugador ve su golpe bloqueado); bajos agachado.
        if (g === "low") return back | Btn.DOWN;
        if (g === "high" || g === "mid") return back;
        return me.state === "blockstun" ? back | (me.crouching ? Btn.DOWN : 0) : 0;
      }
      case "parry": {
        const imminent = this.imminent(s);
        if (imminent && !this.parryHeld) {
          this.parryHeld = true;
          return Btn.PARRY | (imminent === "low" ? Btn.DOWN : 0);
        }
        if (!imminent) this.parryHeld = false;
        void o;
        return imminent === "low" ? Btn.DOWN : 0;
      }
    }
  }

  private incomingGuard(s: GameState): "low" | "mid" | "high" | null {
    const me = s.fighters[this.side];
    const o = s.fighters[this.side === 0 ? 1 : 0];
    for (const p of s.projectiles) {
      if (p.owner === this.side) continue;
      if (Math.abs(p.x - me.x) < 30000) return getProjectile(o.char, p.kind).guard;
    }
    if (o.state === "attack" && o.move && Math.abs(o.x - me.x) < 26000) {
      const mv = getMove(o.char, o.move);
      if (mv.kind !== "throw" && o.mf <= mv.startup + mv.active) return mv.guard;
    }
    if (o.y > 0 && Math.abs(o.x - me.x) < 18000) return "high";
    return null;
  }

  /** Altura del golpe que llegará en 1–2 frames (para pulsar parry en el momento justo), o null. */
  private imminent(s: GameState): "low" | "mid" | "high" | null {
    const me = s.fighters[this.side];
    const o = s.fighters[this.side === 0 ? 1 : 0];
    for (const p of s.projectiles) {
      if (p.owner === this.side || p.cooldown > 0) continue;
      const pd = getProjectile(o.char, p.kind);
      const gap = Math.abs(p.x - me.x) - (pd.hitbox.w / 2 + 26) * 100;
      if ((p.x - me.x) * p.vx < 0 && gap <= Math.abs(p.vx) * 2) return pd.guard;
    }
    if (o.state === "attack" && o.move) {
      const mv = getMove(o.char, o.move);
      if (mv.kind === "throw") return null;
      // El golpe sale en los próximos 2 frames (cada golpe de un multi-hit cuenta).
      for (const tb of mv.hitboxes) {
        const until = tb.from - o.mf;
        if (until >= 0 && until <= 2 && Math.abs(o.x - me.x) < 26000) return mv.guard;
      }
    }
    return null;
  }
}
