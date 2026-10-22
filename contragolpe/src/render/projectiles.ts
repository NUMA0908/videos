import { getChar, getProjectile } from "../data/characters";
import { toPx } from "../sim/fixed";
import type { GameState, ProjectileState } from "../sim/types";
import type { Camera } from "./camera";
import { resolvePalette } from "./skeleton";

/** Dibuja los proyectiles (orbes de energía, chispas, ondas de suelo y la súper). Solo presentación. */
export function drawProjectiles(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, time: number, alt: [boolean, boolean]): void {
  for (const p of s.projectiles) drawProjectile(ctx, cam, s, p, time, alt[p.owner]);
}

function drawProjectile(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, p: ProjectileState, time: number, alt: boolean): void {
  const owner = s.fighters[p.owner];
  const ch = getChar(owner.char);
  const pd = getProjectile(owner.char, p.kind);
  const pal = resolvePalette(ch.look, alt);
  const x = cam.sx(toPx(p.x));
  const y = cam.sy(toPx(p.y));
  const r = pd.radius * cam.zoom;
  const dir = p.facing;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Estela
  for (let i = 4; i >= 1; i--) {
    const tx = x - dir * i * r * 0.55;
    const a = 0.12 * (5 - i);
    const g = ctx.createRadialGradient(tx, y, 0, tx, y, r * (1 - i * 0.12));
    g.addColorStop(0, withAlpha(pal.energy, a));
    g.addColorStop(1, withAlpha(pal.energy, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, y, r * (1 - i * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }

  if (pd.look === "wave") {
    // Onda de tierra: arco bajo que ondula
    ctx.fillStyle = withAlpha(pal.energy, 0.75);
    ctx.beginPath();
    const w = r * 1.6;
    ctx.moveTo(x - w, cam.sy(0));
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const hh = Math.sin(k * Math.PI) * r * 1.4 * (0.85 + 0.15 * Math.sin(time * 30 + i));
      ctx.lineTo(x - w + k * w * 2, cam.sy(0) - hh);
    }
    ctx.closePath();
    ctx.fill();
  }

  const pulse = 1 + Math.sin(time * 40 + p.id) * 0.08;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.7 * pulse);
  halo.addColorStop(0, withAlpha(pal.energyCore, 0.95));
  halo.addColorStop(0.35, withAlpha(pal.energy, 0.85));
  halo.addColorStop(1, withAlpha(pal.energy, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.7 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Rayos eléctricos alrededor
  ctx.strokeStyle = withAlpha(pal.energyCore, 0.9);
  ctx.lineWidth = pd.look === "beam" ? 3 : 2;
  const arcs = pd.look === "beam" ? 7 : 4;
  for (let i = 0; i < arcs; i++) {
    const a0 = time * 9 + (i * Math.PI * 2) / arcs + p.id;
    ctx.beginPath();
    let px0 = x + Math.cos(a0) * r * 0.4;
    let py0 = y + Math.sin(a0) * r * 0.4;
    ctx.moveTo(px0, py0);
    for (let k = 1; k <= 3; k++) {
      const rr = r * (0.4 + k * 0.3);
      const jit = Math.sin(time * 60 + i * 7 + k * 3) * 0.35;
      px0 = x + Math.cos(a0 + jit) * rr;
      py0 = y + Math.sin(a0 + jit) * rr;
      ctx.lineTo(px0, py0);
    }
    ctx.stroke();
  }
  ctx.fillStyle = pal.energyCore;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  if (pd.look === "beam") {
    ctx.strokeStyle = withAlpha(pal.energy, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.1 + Math.sin(time * 20) * 0.1), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** "#rrggbb" + alfa → rgba() */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
