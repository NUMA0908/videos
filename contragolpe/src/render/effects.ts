import { getChar } from "../data/characters";
import { toPx } from "../sim/fixed";
import { Rng } from "../sim/rng";
import type { GameState, SimEvent } from "../sim/types";
import type { Camera } from "./camera";
import { withAlpha } from "./projectiles";
import { resolvePalette } from "./skeleton";

/**
 * Efectos de "game feel": chispas, polvo, anillos, sacudida de cámara y estelas de golpe.
 * Viven fuera de la simulación y usan su propio RNG: nunca afectan al determinismo.
 * Moderación: pocos elementos y muy cortos; el golpe fuerte tiene que destacar sobre el ligero.
 */

type Kind = "spark" | "ember" | "dust" | "shard";

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Smear {
  side: 0 | 1;
  points: { x: number; y: number }[];
  color: string;
  life: number;
}

export interface FeelSettings {
  shake: boolean;
  flashes: boolean;
  /** Bajo consumo: la mitad de partículas y sin estelas. */
  lowPower: boolean;
}

/**
 * Quita en el sitio los elementos agotados (sin crear arrays nuevos cada tick) y devuelve los que sobran
 * a la reserva para reutilizarlos: en combate no se genera basura para el recolector.
 */
function compact<T extends { life: number }>(list: T[], pool?: T[]): void {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item.life > 0) list[n++] = item;
    else pool?.push(item);
  }
  list.length = n;
}

export class Effects {
  private rng = new Rng(77);
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private smears: Smear[] = [];
  private particlePool: Particle[] = [];
  private ringPool: Ring[] = [];
  private shakeMag = 0;
  private shakeT = 0;
  /** Destello de pantalla (0..1) y su color. */
  flash = 0;
  flashColor = "#ffffff";
  settings: FeelSettings = { shake: true, flashes: true, lowPower: false };

  /** Partículas vivas (para medir y para los tests). */
  get liveParticles(): number {
    return this.particles.length;
  }

  clear(): void {
    for (const p of this.particles) this.particlePool.push(p);
    for (const r of this.rings) this.ringPool.push(r);
    this.particles.length = 0;
    this.rings.length = 0;
    this.smears.length = 0;
    this.shakeMag = 0;
    this.flash = 0;
  }

  shake(mag: number, frames: number): void {
    if (!this.settings.shake) return;
    if (mag >= this.shakeMag) {
      this.shakeMag = mag;
      this.shakeT = frames;
    }
  }

  private screenFlash(alpha: number, color: string): void {
    if (!this.settings.flashes) return;
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = color;
  }

  /** Saca una partícula de la reserva (o crea una si está vacía) y la añade a las vivas. */
  private spawn(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, gravity: number, drag: number): void {
    const p = this.particlePool.pop() ?? ({} as Particle);
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.gravity = gravity;
    p.drag = drag;
    this.particles.push(p);
  }

  /** En bajo consumo se emite la mitad (redondeando hacia arriba: nunca desaparece un efecto). */
  private count(n: number): number {
    return this.settings.lowPower ? Math.ceil(n / 2) : n;
  }

  private burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed: [number, number]; angle?: [number, number] }): void {
    const a0 = opts.angle ? opts.angle[0] : 0;
    const a1 = opts.angle ? opts.angle[1] : Math.PI * 2;
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(a0, a1);
      const sp = this.rng.range(opts.speed[0], opts.speed[1]);
      const life = Math.round((opts.max ?? 16) * this.rng.range(0.7, 1.2));
      const size = (opts.size ?? 3) * this.rng.range(0.7, 1.3);
      this.spawn(opts.kind ?? "spark", x, y, Math.cos(a) * sp, Math.sin(a) * sp, life, size, opts.color ?? "#ffffff", opts.gravity ?? 0, opts.drag ?? 0.88);
    }
  }

  private ring(x: number, y: number, r: number, grow: number, frames: number, color: string, width = 3): void {
    const g = this.ringPool.pop() ?? ({} as Ring);
    g.x = x;
    g.y = y;
    g.r = r;
    g.grow = grow;
    g.life = frames;
    g.max = frames;
    g.color = color;
    g.width = width;
    this.rings.push(g);
  }

  /** Traduce los eventos de la simulación de este tick en efectos. Coordenadas en px de mundo (y hacia arriba). */
  onEvents(s: GameState, events: SimEvent[]): void {
    for (const e of events) {
      const x = toPx(e.x);
      const y = toPx(e.y);
      const energy = resolvePalette(getChar(s.fighters[e.side].char).look, false).energy;
      // Las chispas salen hacia el lado contrario al atacante.
      const away = s.fighters[e.side].facing;
      const cone: [number, number] = away === 1 ? [-0.9, 0.9] : [Math.PI - 0.9, Math.PI + 0.9];
      switch (e.type) {
        case "hit": {
          const heavy = e.strength === "heavy";
          const sup = e.strength === "super";
          const n = sup ? 22 : heavy ? 14 : 7;
          this.burst(x, y, n, { speed: sup ? [5, 13] : heavy ? [4, 11] : [3, 7], kind: "spark", max: heavy || sup ? 16 : 11, size: heavy ? 3.4 : 2.6, color: "#fff4c2", angle: cone });
          this.burst(x, y, Math.ceil(n / 2), { speed: [1, 4], kind: "ember", max: 20, size: heavy ? 5 : 3.5, color: e.counter ? "#ff6a3c" : "#ffd23f", drag: 0.9 });
          this.ring(x, y, heavy || sup ? 14 : 8, heavy || sup ? 4.5 : 3, heavy || sup ? 12 : 8, e.counter ? "#ff6a3c" : "#ffffff", heavy ? 4 : 2.5);
          if (e.counter) this.ring(x, y, 6, 7, 14, "#ff6a3c", 5);
          this.shake(sup ? 9 : heavy ? 6 : 2.5, sup ? 14 : heavy ? 10 : 5);
          break;
        }
        case "block":
          this.burst(x, y, e.strength === "heavy" ? 9 : 5, { speed: [2, 6], kind: "spark", max: 9, size: 2.4, color: "#9fd7ff", angle: cone });
          this.ring(x, y, 10, 2.2, 9, "#7fc8ff", 3);
          this.shake(e.strength === "heavy" ? 2.5 : 1, 4);
          break;
        case "parry":
        case "redParry": {
          const c = e.type === "redParry" ? "#ff5a5a" : "#bff3ff";
          this.ring(x, y, 6, 9, 16, c, 5);
          this.ring(x, y, 20, 4, 20, "#ffffff", 2);
          this.burst(x, y, 12, { speed: [5, 12], kind: "shard", max: 18, size: 6, color: c });
          this.screenFlash(0.35, c);
          this.shake(2, 4);
          break;
        }
        case "projectile":
          this.burst(x, y, 8, { speed: [1, 4], kind: "ember", max: 16, size: 4, color: energy });
          this.ring(x, y, 10, 3, 10, energy, 3);
          break;
        case "projectileClash":
          this.burst(x, y, 16, { speed: [3, 9], kind: "spark", max: 14, size: 3, color: "#ffffff" });
          this.ring(x, y, 10, 6, 14, "#ffffff", 4);
          this.shake(3, 6);
          break;
        case "super":
          this.ring(x, y, 20, 10, 24, energy, 6);
          this.burst(x, y, 20, { speed: [2, 8], kind: "ember", max: 30, size: 5, color: energy, drag: 0.93 });
          this.screenFlash(0.5, "#ffffff");
          break;
        case "ko":
          this.burst(x, y, 30, { speed: [5, 16], kind: "spark", max: 24, size: 4, color: "#fff4c2" });
          this.ring(x, y, 20, 12, 26, "#ffffff", 6);
          this.screenFlash(0.7, "#ffffff");
          this.shake(12, 22);
          break;
        case "land":
        case "jump":
        case "dash":
          this.dust(x, 0, e.type === "land" ? 5 : 3, e.type === "dash" ? s.fighters[e.side].facing : 0);
          break;
        case "knockdown":
          this.dust(x, 0, 10, 0);
          this.shake(4, 8);
          break;
        case "throw":
          this.ring(x, y, 8, 3, 8, "#ffffff", 3);
          break;
        case "throwHit":
          this.dust(x, 0, 12, 0);
          this.burst(x, y, 10, { speed: [3, 8], kind: "spark", max: 14, size: 3, color: "#fff4c2" });
          this.shake(7, 12);
          break;
        case "tech":
          this.ring(x, y, 10, 6, 14, "#ffffff", 4);
          this.burst(x, y, 10, { speed: [3, 7], kind: "shard", max: 12, size: 4, color: "#ffffff" });
          break;
        default:
          break;
      }
    }
  }

  private dust(x: number, y: number, n: number, dir: number): void {
    n = this.count(n);
    for (let i = 0; i < n; i++) {
      const life = Math.round(this.rng.range(18, 30));
      const px = x + this.rng.range(-20, 20);
      const py = y + this.rng.range(0, 6);
      const vx = this.rng.range(-1.6, 1.6) - dir * 1.8;
      const vy = this.rng.range(0.2, 1.4);
      this.spawn("dust", px, py, vx, vy, life, this.rng.range(6, 12), "rgba(230,215,190,0.55)", 0, 0.92);
    }
  }

  /** Estela del golpe: el renderer registra dónde está la extremidad que golpea en cada frame activo. */
  trackSmear(side: 0 | 1, active: boolean, point: { x: number; y: number } | null, color: string): void {
    if (this.settings.lowPower) return;
    let sm: Smear | undefined;
    for (const m of this.smears) if (m.side === side && m.life === 6) sm = m;
    if (active && point) {
      if (!sm) {
        sm = { side, points: [], color, life: 6 };
        this.smears.push(sm);
      }
      sm.points.push(point);
      if (sm.points.length > 5) sm.points.shift();
    } else if (sm) {
      sm.life = 5; // deja de crecer y se desvanece
    }
  }

  update(): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag - p.gravity;
      p.life--;
      if (p.kind === "dust") p.size *= 1.03;
    }
    compact(this.particles, this.particlePool);
    for (const r of this.rings) {
      r.r += r.grow;
      r.grow *= 0.88;
      r.life--;
    }
    compact(this.rings, this.ringPool);
    for (const m of this.smears) if (m.life < 6) m.life--;
    compact(this.smears);
    if (this.shakeT > 0) this.shakeT--;
    else this.shakeMag *= 0.6;
    this.flash *= 0.8;
    if (this.flash < 0.02) this.flash = 0;
  }

  applyShake(cam: Camera, time: number): void {
    const m = this.shakeT > 0 ? this.shakeMag * (0.4 + (0.6 * this.shakeT) / 10) : 0;
    cam.shakeX = m ? Math.sin(time * 91) * m : 0;
    cam.shakeY = m ? Math.cos(time * 77) * m * 0.6 : 0;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera): void {
    ctx.save();
    // Estelas
    for (const m of this.smears) {
      if (m.points.length < 2) continue;
      const a = (m.life / 6) * 0.45;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < m.points.length; i++) {
        const p0 = m.points[i - 1];
        const p1 = m.points[i];
        ctx.strokeStyle = withAlpha(m.color, (a * i) / m.points.length);
        ctx.lineWidth = (10 * i) / m.points.length * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(cam.sx(p0.x), cam.sy(p0.y));
        ctx.lineTo(cam.sx(p1.x), cam.sy(p1.y));
        ctx.stroke();
      }
    }
    for (const p of this.particles) {
      const k = p.life / p.max;
      const x = cam.sx(p.x);
      const y = cam.sy(p.y);
      if (p.kind === "dust") {
        ctx.globalAlpha = k * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y - p.size * 0.5, p.size * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "spark") {
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * k + 0.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 2.4 * cam.zoom, y + p.vy * 2.4 * cam.zoom);
        ctx.stroke();
      } else if (p.kind === "ember") {
        ctx.globalAlpha = k;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.5 + k * 0.5) * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        const ang = Math.atan2(-p.vy, p.vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(p.size * 1.6, 0);
        ctx.lineTo(-p.size, p.size * 0.5);
        ctx.lineTo(-p.size, -p.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      ctx.globalAlpha = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (r.life / r.max) + 0.5;
      ctx.beginPath();
      ctx.arc(cam.sx(r.x), cam.sy(r.y), r.r * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
