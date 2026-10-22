import { TUNING } from "../data/tuning";
import { Rng } from "../sim/rng";
import type { Camera } from "./camera";
import { GROUND_Y, VIEW_H, VIEW_W } from "./view";

/**
 * Escenarios originales dibujados por código, con parallax simple y detalles animados.
 * `time` es un reloj de presentación en segundos (no la simulación).
 */
export interface Stage {
  id: string;
  name: string;
  place: string;
  /** Tema musical (ver audio/music.ts). */
  music: string;
  /** Color dominante para la tarjeta de selección. */
  swatch: [string, string];
  drawBack(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void;
  drawFront?(ctx: CanvasRenderingContext2D, cam: Camera, time: number): void;
}

const STAGE_MID = TUNING.stage.width / 2;

/** Ejecuta `fn` con el contexto desplazado para una capa de profundidad `p` (0 = infinito, 1 = plano del suelo). */
function layer(ctx: CanvasRenderingContext2D, cam: Camera, p: number, fn: () => void): void {
  ctx.save();
  const z = 1 + (cam.zoom - 1) * p;
  ctx.translate(VIEW_W / 2 + cam.shakeX * p, GROUND_Y + cam.y * cam.zoom * p * 0.6 + cam.shakeY * p);
  ctx.scale(z, z);
  ctx.translate(-(cam.x - STAGE_MID) * p - VIEW_W / 2, -GROUND_Y);
  fn();
  ctx.restore();
}

function floorPlanks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  top: string,
  bottom: string,
  line: string,
  spacing: number,
): void {
  const gy = cam.sy(0);
  const g = ctx.createLinearGradient(0, gy, 0, VIEW_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, gy, VIEW_W, VIEW_H - gy + 4);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  const start = Math.floor((cam.x - VIEW_W) / spacing) * spacing;
  ctx.beginPath();
  for (let x = start; x < cam.x + VIEW_W; x += spacing) {
    const sx = cam.sx(x);
    ctx.moveTo(sx, gy);
    ctx.lineTo(VIEW_W / 2 + (sx - VIEW_W / 2) * 1.9, VIEW_H + 4);
  }
  ctx.stroke();
  // Líneas horizontales con perspectiva
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 6; i++) {
    const y = gy + (VIEW_H - gy) * Math.pow(i / 6, 1.6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// 1. Muelle al atardecer
// ---------------------------------------------------------------------------

const harborRng = new Rng(42);
const HARBOR_BOATS = Array.from({ length: 6 }, (_, i) => ({
  x: 120 + i * 300 + harborRng.range(-60, 60),
  y: 405 + harborRng.range(-12, 10),
  w: harborRng.range(70, 120),
  color: harborRng.pick(["#3a2340", "#2c2142", "#432234"]),
  phase: harborRng.range(0, 6),
  sail: harborRng.chance(0.5),
}));
const HARBOR_BIRDS = Array.from({ length: 5 }, () => ({
  x: harborRng.range(0, 1600),
  y: harborRng.range(120, 260),
  speed: harborRng.range(18, 34),
  phase: harborRng.range(0, 6),
}));

export const HARBOR: Stage = {
  id: "muelle",
  name: "Muelle al Atardecer",
  place: "Puerto viejo, final de la tarde",
  music: "muelle",
  swatch: ["#ff8a4c", "#3b1f4a"],
  drawBack(ctx, cam, time) {
    // Cielo
    const sky = ctx.createLinearGradient(0, 0, 0, 360);
    sky.addColorStop(0, "#2a1a4a");
    sky.addColorStop(0.45, "#a33e5c");
    sky.addColorStop(0.8, "#ff8a4c");
    sky.addColorStop(1, "#ffc46b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    layer(ctx, cam, 0.05, () => {
      // Sol con halo
      const sx = 820;
      const sy = 300;
      const halo = ctx.createRadialGradient(sx, sy, 10, sx, sy, 190);
      halo.addColorStop(0, "rgba(255,230,160,0.95)");
      halo.addColorStop(0.25, "rgba(255,170,90,0.5)");
      halo.addColorStop(1, "rgba(255,120,80,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(sx - 200, sy - 200, 400, 400);
      ctx.fillStyle = "#ffe9a8";
      ctx.beginPath();
      ctx.arc(sx, sy, 46, 0, Math.PI * 2);
      ctx.fill();
      // Nubes alargadas
      ctx.fillStyle = "rgba(120,50,90,0.55)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 260 + time * 6) % 1500) - 200;
        ctx.beginPath();
        ctx.ellipse(cx, 120 + i * 32, 140, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    layer(ctx, cam, 0.15, () => {
      // Ciudad lejana en la otra orilla
      ctx.fillStyle = "#5a2f55";
      ctx.beginPath();
      ctx.moveTo(-400, 336);
      const r = new Rng(7);
      for (let x = -400; x < 1400; x += 34) {
        const h = r.range(14, 60);
        ctx.lineTo(x, 336 - h);
        ctx.lineTo(x + 30, 336 - h);
      }
      ctx.lineTo(1400, 336);
      ctx.closePath();
      ctx.fill();
      // Ventanas que se encienden
      const w = new Rng(11);
      for (let i = 0; i < 70; i++) {
        const x = w.range(-380, 1380);
        const y = w.range(286, 330);
        const on = Math.sin(time * 0.7 + i * 1.7) > -0.2;
        if (on) {
          ctx.fillStyle = "rgba(255,214,140,0.8)";
          ctx.fillRect(x, y, 3, 3);
        }
      }
    });

    // Mar
    const sea = ctx.createLinearGradient(0, 336, 0, GROUND_Y);
    sea.addColorStop(0, "#c8607a");
    sea.addColorStop(0.3, "#6b3a6e");
    sea.addColorStop(1, "#2a2050");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 336, VIEW_W, GROUND_Y - 336 + 2);
    layer(ctx, cam, 0.3, () => {
      ctx.strokeStyle = "rgba(255,200,150,0.35)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const y = 344 + i * 5 + (i * i) * 0.35;
        const off = Math.sin(time * 1.3 + i) * 20;
        const len = 30 + (i % 5) * 18;
        for (let k = 0; k < 6; k++) {
          const x = -300 + k * 290 + ((i * 97) % 200) + off;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y);
          ctx.stroke();
        }
      }
      // Reflejo del sol
      ctx.fillStyle = "rgba(255,220,150,0.35)";
      for (let i = 0; i < 12; i++) {
        const y = 340 + i * 9;
        const w2 = 60 - i * 3 + Math.sin(time * 2 + i) * 8;
        ctx.fillRect(1040 - w2 / 2 + Math.sin(time + i) * 6, y, w2, 3);
      }
      // Barcos que se mecen
      for (const b of HARBOR_BOATS) {
        const bob = Math.sin(time * 1.4 + b.phase) * 3;
        const tilt = Math.sin(time * 1.1 + b.phase) * 0.04;
        ctx.save();
        ctx.translate(b.x, b.y + bob);
        ctx.rotate(tilt);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(-b.w / 2, -10);
        ctx.lineTo(b.w / 2, -10);
        ctx.lineTo(b.w / 2 - 12, 6);
        ctx.lineTo(-b.w / 2 + 8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-2, -60, 3, 50);
        if (b.sail) {
          ctx.fillStyle = "#e9b48a";
          ctx.beginPath();
          ctx.moveTo(2, -58);
          ctx.lineTo(30, -16);
          ctx.lineTo(2, -14);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = "#3d2a4d";
          ctx.fillRect(-b.w / 4, -24, b.w / 3, 14);
        }
        ctx.restore();
      }
    });

    // Gaviotas
    layer(ctx, cam, 0.25, () => {
      ctx.strokeStyle = "#2b1830";
      ctx.lineWidth = 2;
      for (const g of HARBOR_BIRDS) {
        const x = ((g.x + time * g.speed) % 1900) - 300;
        const y = g.y + Math.sin(time * 0.8 + g.phase) * 10;
        const flap = Math.sin(time * 9 + g.phase) * 5;
        ctx.beginPath();
        ctx.moveTo(x - 9, y - flap);
        ctx.quadraticCurveTo(x - 4, y - 4, x, y);
        ctx.quadraticCurveTo(x + 4, y - 4, x + 9, y - flap);
        ctx.stroke();
      }
    });

    layer(ctx, cam, 0.7, () => {
      // Grúa portuaria
      ctx.fillStyle = "#2c1a33";
      for (const gx of [-60, 1180]) {
        ctx.fillRect(gx, 200, 14, 260);
        ctx.fillRect(gx + 60, 200, 14, 260);
        ctx.fillRect(gx - 40, 196, 220, 12);
        ctx.strokeStyle = "#2c1a33";
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let y = 210; y < 450; y += 40) {
          ctx.moveTo(gx + 7, y);
          ctx.lineTo(gx + 67, y + 40);
          ctx.moveTo(gx + 67, y);
          ctx.lineTo(gx + 7, y + 40);
        }
        ctx.stroke();
        const sway = Math.sin(time * 0.9) * 4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx + 160, 208);
        ctx.lineTo(gx + 160 + sway, 300);
        ctx.stroke();
        ctx.fillRect(gx + 150 + sway, 300, 22, 16);
      }
    });

    layer(ctx, cam, 0.92, () => {
      // Postes, cajas y bolardos al fondo del muelle
      for (let x = -200; x < 1800; x += 210) {
        ctx.fillStyle = "#3a2430";
        ctx.fillRect(x, 410, 16, 70);
        ctx.fillStyle = "#4e3140";
        ctx.fillRect(x - 3, 404, 22, 8);
      }
      ctx.strokeStyle = "#2a1a24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = -200; x < 1600; x += 210) {
        ctx.moveTo(x + 8, 418);
        ctx.quadraticCurveTo(x + 113, 446, x + 218, 418);
      }
      ctx.stroke();
      const crate = (x: number, w: number, h: number) => {
        ctx.fillStyle = "#7a4a34";
        ctx.fillRect(x, GROUND_Y - h, w, h);
        ctx.strokeStyle = "#4a2a1e";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, GROUND_Y - h + 1.5, w - 3, h - 3);
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - h);
        ctx.lineTo(x + w, GROUND_Y);
        ctx.stroke();
      };
      crate(140, 64, 56);
      crate(196, 44, 40);
      crate(1290, 70, 62);
      crate(1350, 50, 46);
      crate(1320, 46, 40);
    });

    floorPlanks(ctx, cam, "#8a5a40", "#4a2c26", "rgba(40,20,20,0.55)", 70);
  },
};

export const STAGES: Stage[] = [HARBOR];

export function getStage(id: string): Stage {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}
