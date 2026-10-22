import { getChar } from "../data/characters";
import { toPx } from "../sim/fixed";
import type { FighterState, GameState } from "../sim/types";
import { poseFor } from "./animator";
import { Camera } from "./camera";
import { drawDebugBoxes, drawDebugPanel, type InputLog } from "./debug";
import { drawFighterBody, resolvePalette, solve } from "./skeleton";
import type { Stage } from "./stages";
import { GROUND_Y, VIEW_H, VIEW_W } from "./view";

export interface FighterFx {
  /** 0..1 destello blanco. */
  flash: number;
  /** Vibración horizontal del sprite (px). */
  jitter: number;
  /** Contorno de color (parry, súper). */
  glow: string | null;
  glowAlpha: number;
}

export interface RenderOptions {
  debug: boolean;
  /** El jugador 2 usa la paleta alternativa (espejos). */
  altPalette: [boolean, boolean];
  fx: [FighterFx, FighterFx];
  time: number;
}

export const NO_FX: FighterFx = { flash: 0, jitter: 0, glow: null, glowAlpha: 0 };

/** Ajusta el canvas a la ventana manteniendo 16:9 y la nitidez en pantallas HiDPI. Devuelve la escala base. */
export function fitCanvas(canvas: HTMLCanvasElement): number {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  canvas.width = Math.floor(VIEW_W * scale * dpr);
  canvas.height = Math.floor(VIEW_H * scale * dpr);
  return scale * dpr;
}

export function drawShadow(ctx: CanvasRenderingContext2D, cam: Camera, f: FighterState): void {
  const h = toPx(f.y);
  const k = Math.max(0.35, 1 - h / 300);
  ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
  ctx.beginPath();
  ctx.ellipse(cam.sx(toPx(f.x)), cam.sy(0) + 2, 46 * k * cam.zoom, 9 * k * cam.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  s: GameState,
  f: FighterState,
  alt: boolean,
  fx: FighterFx,
): void {
  const ch = getChar(f.char);
  const pose = poseFor(f, s.frame);
  const joints = solve(pose, ch.look);
  const pal = resolvePalette(ch.look, alt);
  ctx.save();
  ctx.translate(cam.sx(toPx(f.x)) + fx.jitter, cam.sy(toPx(f.y)));
  ctx.scale(f.facing * cam.zoom, cam.zoom);
  if (fx.glow && fx.glowAlpha > 0) {
    // Contorno brillante: se dibuja la silueta ampliada en un color sólido.
    ctx.save();
    ctx.globalAlpha = fx.glowAlpha;
    ctx.shadowColor = fx.glow;
    ctx.shadowBlur = 18;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
      ctx.save();
      ctx.translate(dx, dy);
      drawFighterBody(ctx, joints, ch.look, pal, { flash: 0, tint: fx.glow });
      ctx.restore();
    }
    ctx.restore();
  }
  drawFighterBody(ctx, joints, ch.look, pal, { flash: fx.flash });
  ctx.restore();
}

/** Dibuja escenario + personajes. HUD, proyectiles y efectos se añaden por capas desde la escena. */
export class GameRenderer {
  readonly cam = new Camera();
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  drawWorld(s: GameState, stage: Stage, opt: RenderOptions): void {
    const ctx = this.ctx;
    stage.drawBack(ctx, this.cam, opt.time);
    for (const f of s.fighters) drawShadow(ctx, this.cam, f);
    // El personaje que ataca se dibuja encima.
    const order = drawOrder(s);
    for (const i of order) drawFighter(ctx, this.cam, s, s.fighters[i], opt.altPalette[i], opt.fx[i]);
    stage.drawFront?.(ctx, this.cam, opt.time);
  }

  drawDebug(s: GameState, logs: [InputLog, InputLog], projectileBoxes: Parameters<typeof drawDebugBoxes>[3]): void {
    drawDebugBoxes(this.ctx, s, this.cam, projectileBoxes);
    drawDebugPanel(this.ctx, s, logs);
    // Línea del suelo
    this.ctx.strokeStyle = "rgba(255,255,255,0.3)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.cam.sy(0));
    this.ctx.lineTo(VIEW_W, this.cam.sy(0));
    this.ctx.stroke();
  }
}

export function drawOrder(s: GameState): [0 | 1, 0 | 1] {
  const [a, b] = s.fighters;
  const attacking = (f: FighterState) => f.state === "attack" || f.state === "throw";
  if (attacking(b) && !attacking(a)) return [0, 1];
  if (attacking(a) && !attacking(b)) return [1, 0];
  return [1, 0];
}

export { GROUND_Y };
