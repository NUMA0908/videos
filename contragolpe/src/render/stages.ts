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

// Geometría "aleatoria" fija de los escenarios: se calcula una vez al cargar, no en cada frame.
const harborCityRng = new Rng(7);
const HARBOR_SKYLINE: number[] = [];
for (let x = -400; x < 1400; x += 34) HARBOR_SKYLINE.push(harborCityRng.range(14, 60));
const harborLightsRng = new Rng(11);
const HARBOR_LIGHTS = Array.from({ length: 70 }, () => ({ x: harborLightsRng.range(-380, 1380), y: harborLightsRng.range(286, 330) }));

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
      for (let i = 0; i < HARBOR_SKYLINE.length; i++) {
        const x = -400 + i * 34;
        const h = HARBOR_SKYLINE[i];
        ctx.lineTo(x, 336 - h);
        ctx.lineTo(x + 30, 336 - h);
      }
      ctx.lineTo(1400, 336);
      ctx.closePath();
      ctx.fill();
      // Ventanas que se encienden
      ctx.fillStyle = "rgba(255,214,140,0.8)";
      for (let i = 0; i < HARBOR_LIGHTS.length; i++) {
        if (Math.sin(time * 0.7 + i * 1.7) > -0.2) ctx.fillRect(HARBOR_LIGHTS[i].x, HARBOR_LIGHTS[i].y, 3, 3);
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

// ---------------------------------------------------------------------------
// 2. Azotea Neón
// ---------------------------------------------------------------------------

const roofRng = new Rng(9);
const ROOF_STARS = Array.from({ length: 70 }, () => ({ x: roofRng.range(-400, 1400), y: roofRng.range(10, 220), p: roofRng.range(0, 6), r: roofRng.range(0.6, 1.8) }));
const ROOF_FAR = Array.from({ length: 34 }, (_, i) => ({ x: -500 + i * 60 + roofRng.range(-10, 10), w: roofRng.range(40, 70), h: roofRng.range(80, 220) }));
const roofWinRng = new Rng(5);
const ROOF_WINDOWS = Array.from({ length: 160 }, (_, i) => {
  const b = ROOF_FAR[i % ROOF_FAR.length];
  return {
    x: b.x + 6 + roofWinRng.int(Math.max(1, Math.floor(b.w - 12))),
    y: 400 - b.h + 10 + roofWinRng.int(Math.max(1, Math.floor(b.h - 20))),
  };
});
const ROOF_MID = Array.from({ length: 12 }, (_, i) => ({
  x: -420 + i * 180 + roofRng.range(-20, 20),
  w: roofRng.range(110, 160),
  h: roofRng.range(140, 260),
  sign: roofRng.int(4),
  color: roofRng.pick(["#ff3fa4", "#3ff0ff", "#ffd23f", "#9b5cff"]),
  phase: roofRng.range(0, 10),
}));
const RAIN = Array.from({ length: 90 }, () => ({ x: roofRng.range(0, 960), y: roofRng.range(0, 540), s: roofRng.range(9, 15), l: roofRng.range(8, 16) }));

function neonText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, on: boolean, size = 22): void {
  ctx.save();
  ctx.font = `bold ${size}px 'Trebuchet MS', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (on) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
  } else ctx.fillStyle = "rgba(60,40,70,0.9)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

export const ROOFTOP: Stage = {
  id: "azotea",
  name: "Azotea Neón",
  place: "Edificio del centro, medianoche",
  music: "azotea",
  swatch: ["#ff3fa4", "#0b0f2a"],
  drawBack(ctx, cam, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, "#05061a");
    sky.addColorStop(0.6, "#1a1240");
    sky.addColorStop(1, "#3a1a55");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    layer(ctx, cam, 0.03, () => {
      for (const st of ROOF_STARS) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 2 + st.p);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(180, 90, 10, 180, 90, 90);
      g.addColorStop(0, "rgba(255,250,230,1)");
      g.addColorStop(0.25, "rgba(255,240,210,0.9)");
      g.addColorStop(1, "rgba(160,140,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(90, 0, 180, 180);
    });
    layer(ctx, cam, 0.12, () => {
      ctx.fillStyle = "#14102e";
      for (const b of ROOF_FAR) ctx.fillRect(b.x, 400 - b.h, b.w, b.h + 80);
      for (let i = 0; i < ROOF_WINDOWS.length; i++) {
        if (Math.sin(time * 0.5 + i * 2.3) > -0.3) {
          ctx.fillStyle = i % 5 === 0 ? "rgba(120,220,255,0.8)" : "rgba(255,210,140,0.75)";
          ctx.fillRect(ROOF_WINDOWS[i].x, ROOF_WINDOWS[i].y, 4, 5);
        }
      }
    });
    layer(ctx, cam, 0.35, () => {
      const labels = ["LUZ", "24H", "ABIERTO", "★"];
      for (const b of ROOF_MID) {
        ctx.fillStyle = "#0d0a22";
        ctx.fillRect(b.x, 420 - b.h, b.w, b.h + 80);
        ctx.fillStyle = "#1c1640";
        ctx.fillRect(b.x + 4, 420 - b.h, 6, b.h);
        // Ventanas
        for (let wy = 420 - b.h + 20; wy < 410; wy += 26) {
          for (let wx = b.x + 16; wx < b.x + b.w - 16; wx += 24) {
            const lit = Math.sin(wx * 0.37 + wy * 0.91 + time * 0.2) > 0.35;
            ctx.fillStyle = lit ? "rgba(255,200,120,0.55)" : "rgba(40,30,80,0.8)";
            ctx.fillRect(wx, wy, 10, 12);
          }
        }
        // Letrero de neón que parpadea
        const flick = Math.sin(time * 13 + b.phase) > -0.85 && !(Math.sin(time * 0.7 + b.phase) > 0.97);
        neonText(ctx, labels[b.sign], b.x + b.w / 2, 420 - b.h - 18, b.color, flick, 24);
      }
    });
    layer(ctx, cam, 0.8, () => {
      // Depósito de agua, antenas y aparatos de aire acondicionado
      ctx.fillStyle = "#1b1530";
      ctx.fillRect(-80, 300, 140, 100);
      ctx.fillRect(-70, 400, 10, 80);
      ctx.fillRect(40, 400, 10, 80);
      ctx.beginPath();
      ctx.moveTo(-90, 300);
      ctx.lineTo(-10, 262);
      ctx.lineTo(70, 300);
      ctx.fill();
      for (const ax of [1240, 1330]) {
        ctx.fillStyle = "#25204a";
        ctx.fillRect(ax, 420, 80, 60);
        ctx.strokeStyle = "#3d3670";
        ctx.lineWidth = 3;
        const a = time * 8 + ax;
        ctx.beginPath();
        ctx.arc(ax + 40, 450, 20, 0, Math.PI * 2);
        ctx.moveTo(ax + 40 + Math.cos(a) * 18, 450 + Math.sin(a) * 18);
        ctx.lineTo(ax + 40 - Math.cos(a) * 18, 450 - Math.sin(a) * 18);
        ctx.moveTo(ax + 40 + Math.cos(a + 1.57) * 18, 450 + Math.sin(a + 1.57) * 18);
        ctx.lineTo(ax + 40 - Math.cos(a + 1.57) * 18, 450 - Math.sin(a + 1.57) * 18);
        ctx.stroke();
      }
      ctx.strokeStyle = "#2c2550";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1180, 480);
      ctx.lineTo(1180, 250);
      ctx.moveTo(1160, 290);
      ctx.lineTo(1200, 290);
      ctx.moveTo(1166, 320);
      ctx.lineTo(1194, 320);
      ctx.stroke();
      if (Math.sin(time * 3) > 0) {
        ctx.fillStyle = "#ff3030";
        ctx.shadowColor = "#ff3030";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(1180, 248, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      // Barandilla
      ctx.strokeStyle = "#2a2348";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-200, 440);
      ctx.lineTo(1700, 440);
      for (let x = -200; x < 1700; x += 60) {
        ctx.moveTo(x, 440);
        ctx.lineTo(x, 478);
      }
      ctx.stroke();
    });
    // Suelo de hormigón mojado con reflejos de neón
    floorPlanks(ctx, cam, "#2a2440", "#120f22", "rgba(0,0,0,0.35)", 120);
    const gy = cam.sy(0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const x = ((i * 233 - (cam.x - STAGE_MID) * 1.0) % 1100) - 70;
      const col = ["#ff3fa4", "#3ff0ff", "#9b5cff"][i % 3];
      const g = ctx.createLinearGradient(0, gy, 0, VIEW_H);
      g.addColorStop(0, withAlphaHex(col, 0.18 + 0.06 * Math.sin(time * 3 + i)));
      g.addColorStop(1, withAlphaHex(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, gy, 60, VIEW_H - gy);
    }
    ctx.restore();
  },
  drawFront(ctx, _cam, time) {
    // Lluvia fina (delante de todo, muy tenue)
    ctx.save();
    ctx.strokeStyle = "rgba(170,190,255,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of RAIN) {
      const y = (r.y + time * r.s * 60) % 560;
      const x = (r.x - time * 60 + 2000) % 980;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + r.l);
    }
    ctx.stroke();
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// 3. Plaza Colonial
// ---------------------------------------------------------------------------

const plazaRng = new Rng(31);
const HOUSE_COLORS = ["#f6c945", "#3cc6c0", "#f28aa0", "#f59a3c", "#8fd16a", "#79a7ff"];
const HOUSES = Array.from({ length: 11 }, (_, i) => ({
  x: -380 + i * 170,
  w: 168,
  h: plazaRng.range(150, 200),
  color: HOUSE_COLORS[i % HOUSE_COLORS.length],
  balcony: plazaRng.chance(0.6),
  doors: plazaRng.int(2) + 1,
}));
const CROWD = Array.from({ length: 40 }, (_, i) => ({
  x: -300 + i * 52 + plazaRng.range(-12, 12),
  h: plazaRng.range(40, 58),
  color: plazaRng.pick(["#3b2b4f", "#4a2f3a", "#2f3d4f", "#51402b", "#3a4a35"]),
  phase: plazaRng.range(0, 6),
}));
const CLOUDS = Array.from({ length: 7 }, () => ({ x: plazaRng.range(0, 1600), y: plazaRng.range(30, 160), s: plazaRng.range(0.6, 1.3) }));

function palm(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, time: number, phase: number): void {
  const sway = Math.sin(time * 0.9 + phase) * 8;
  ctx.strokeStyle = "#7a5634";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + 12, base - h / 2, x + sway, base - h);
  ctx.stroke();
  ctx.fillStyle = "#2f8a4a";
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.48 + Math.sin(time * 1.6 + phase + i) * 0.06;
    const tx = x + sway;
    const ty = base - h;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a - 0.3) * 50, ty + Math.sin(a - 0.3) * 50 - 10, tx + Math.cos(a) * 82, ty + Math.sin(a) * 60 + 30);
    ctx.quadraticCurveTo(tx + Math.cos(a + 0.2) * 40, ty + Math.sin(a + 0.2) * 40, tx, ty);
    ctx.fill();
  }
}

export const PLAZA: Stage = {
  id: "plaza",
  name: "Plaza Colonial",
  place: "Casco antiguo, mediodía de fiesta",
  music: "plaza",
  swatch: ["#3cc6c0", "#f6c945"],
  drawBack(ctx, cam, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, 380);
    sky.addColorStop(0, "#3f8fe6");
    sky.addColorStop(1, "#bfe8ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    layer(ctx, cam, 0.05, () => {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const c of CLOUDS) {
        const x = ((c.x + time * 8 * c.s) % 1900) - 400;
        for (const [dx, dy, r] of [[0, 0, 30], [30, -10, 36], [64, 0, 28], [34, 10, 30]] as const) {
          ctx.beginPath();
          ctx.arc(x + dx * c.s, c.y + dy * c.s, r * c.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    layer(ctx, cam, 0.15, () => {
      // Colinas y torre de una iglesia lejana
      ctx.fillStyle = "#7fb7a0";
      ctx.beginPath();
      ctx.moveTo(-400, 330);
      for (let x = -400; x <= 1400; x += 100) ctx.lineTo(x, 300 + Math.sin(x * 0.01) * 20);
      ctx.lineTo(1400, 360);
      ctx.lineTo(-400, 360);
      ctx.fill();
      ctx.fillStyle = "#d9c7a3";
      ctx.fillRect(700, 170, 46, 160);
      ctx.beginPath();
      ctx.moveTo(694, 172);
      ctx.lineTo(723, 128);
      ctx.lineTo(752, 172);
      ctx.fill();
      ctx.fillStyle = "#6b5a44";
      ctx.beginPath();
      ctx.arc(723, 205, 10, Math.PI, 0);
      ctx.fillRect(713, 205, 20, 18);
      ctx.fill();
    });
    layer(ctx, cam, 0.45, () => {
      for (const h of HOUSES) {
        const top = 400 - h.h;
        ctx.fillStyle = h.color;
        ctx.fillRect(h.x, top, h.w - 4, h.h + 80);
        // Cornisa
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillRect(h.x - 4, top - 8, h.w + 4, 10);
        // Ventanas con persianas
        for (let k = 0; k < 2; k++) {
          const wx = h.x + 26 + k * 70;
          ctx.fillStyle = "#3e2a20";
          ctx.fillRect(wx, top + 30, 34, 46);
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillRect(wx - 6, top + 30, 6, 46);
          ctx.fillRect(wx + 34, top + 30, 6, 46);
        }
        if (h.balcony) {
          ctx.strokeStyle = "#2b2b2b";
          ctx.lineWidth = 2;
          ctx.strokeRect(h.x + 16, top + 80, h.w - 36, 16);
          for (let bx = h.x + 22; bx < h.x + h.w - 22; bx += 8) {
            ctx.beginPath();
            ctx.moveTo(bx, top + 80);
            ctx.lineTo(bx, top + 96);
            ctx.stroke();
          }
          // Macetas con flores
          ctx.fillStyle = "#e0463c";
          ctx.beginPath();
          ctx.arc(h.x + 30, top + 76, 6, 0, Math.PI * 2);
          ctx.arc(h.x + h.w - 40, top + 76, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let d = 0; d < h.doors; d++) {
          const dx = h.x + 40 + d * 60;
          ctx.fillStyle = "#5a3a26";
          ctx.fillRect(dx, 400 - 70, 34, 80);
          ctx.beginPath();
          ctx.arc(dx + 17, 400 - 70, 17, Math.PI, 0);
          ctx.fill();
        }
      }
      // Banderines que se mecen
      const colors = ["#e0463c", "#ffd23f", "#2f6fe0", "#ffffff", "#3cc6c0"];
      for (let row = 0; row < 2; row++) {
        const y0 = 200 + row * 40;
        ctx.strokeStyle = "rgba(60,40,30,0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = -380; x < 1500; x += 20) {
          const y = y0 + Math.sin((x + row * 90) * 0.012) * 26 + 26;
          if (x === -380) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let x = -380, i = 0; x < 1500; x += 34, i++) {
          const y = y0 + Math.sin((x + row * 90) * 0.012) * 26 + 26;
          const sw = Math.sin(time * 3 + i) * 3;
          ctx.fillStyle = colors[i % colors.length];
          ctx.beginPath();
          ctx.moveTo(x - 8, y);
          ctx.lineTo(x + 8, y);
          ctx.lineTo(x + sw, y + 18);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
    layer(ctx, cam, 0.7, () => {
      palm(ctx, -20, 470, 230, time, 0);
      palm(ctx, 1260, 470, 250, time, 2);
      palm(ctx, 1420, 470, 210, time, 4);
    });
    layer(ctx, cam, 0.88, () => {
      // Público detrás de un murete: se mece y salta con los golpes
      for (const p of CROWD) {
        const bob = Math.abs(Math.sin(time * 4 + p.phase)) * 5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, 440 - p.h - bob, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(p.x - 13, 440 - p.h + 8 - bob, 26, p.h);
        if (Math.sin(time * 2 + p.phase) > 0.75) {
          ctx.fillRect(p.x + 8, 440 - p.h - 22 - bob, 5, 22);
        }
      }
      ctx.fillStyle = "#e8d6b0";
      ctx.fillRect(-400, 438, 2400, 42);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let x = -400; x < 2000; x += 48) ctx.fillRect(x, 438, 2, 42);
      // Carrito de helados con sombrilla
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(1120, 400, 70, 40);
      ctx.fillStyle = "#e0463c";
      ctx.beginPath();
      ctx.moveTo(1105, 360);
      ctx.quadraticCurveTo(1155, 320, 1205, 360);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(1153, 360, 4, 40);
    });
    // Adoquines
    const gy = cam.sy(0);
    const g = ctx.createLinearGradient(0, gy, 0, VIEW_H);
    g.addColorStop(0, "#b9a27e");
    g.addColorStop(1, "#7d6a52");
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, VIEW_W, VIEW_H - gy + 4);
    ctx.strokeStyle = "rgba(70,55,40,0.45)";
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 8; r++) {
      const y0 = gy + (VIEW_H - gy) * Math.pow(r / 8, 1.5);
      const y1 = gy + (VIEW_H - gy) * Math.pow((r + 1) / 8, 1.5);
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(VIEW_W, y1);
      ctx.stroke();
      const spacing = 30 + r * 8;
      const off = ((cam.x * (0.9 + r * 0.06)) % spacing) + (r % 2) * spacing * 0.5;
      ctx.beginPath();
      for (let x = -off; x < VIEW_W + spacing; x += spacing) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x + (x - VIEW_W / 2) * 0.05, y1);
      }
      ctx.stroke();
    }
  },
};

function withAlphaHex(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, a)})`;
}

export const STAGES: Stage[] = [HARBOR, ROOFTOP, PLAZA];

export function getStage(id: string): Stage {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}
