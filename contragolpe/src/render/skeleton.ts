import type { CharacterLook } from "../data/types";

/**
 * Esqueleto 2D del render procedural.
 * Coordenadas locales: x hacia donde mira el personaje, y hacia arriba, origen entre los pies.
 * Ángulos de extremidades ABSOLUTOS en grados: 0 = colgando hacia abajo, 90 = al frente, 180 = arriba, -90 = atrás.
 * Torso/cabeza: 0 = vertical, + = inclinado hacia adelante.
 *
 * Este módulo es lo único que habría que cambiar para pasar a spritesheets: el resto del render
 * solo pide "dibuja este personaje con esta pose".
 */
export interface Pose {
  /** Desplazamiento horizontal de la cadera. */
  hx: number;
  torso: number;
  head: number;
  aF: [number, number];
  aB: [number, number];
  lF: [number, number];
  lB: [number, number];
  /** Rotación de todo el cuerpo alrededor de la cadera (+ = hacia adelante). */
  rot: number;
  /** Altura extra sobre el suelo (si ground = 0) o desplazamiento vertical adicional. */
  hy: number;
  /** 1 = el punto más bajo del cuerpo toca el suelo; 0 = usar hy tal cual. */
  ground: number;
  /** 1 = mano abierta (palma), 0 = puño. */
  open: number;
}

export type Vec = { x: number; y: number };

export interface Joints {
  hip: Vec;
  neck: Vec;
  head: Vec;
  shF: Vec;
  shB: Vec;
  elF: Vec;
  elB: Vec;
  haF: Vec;
  haB: Vec;
  hiF: Vec;
  hiB: Vec;
  knF: Vec;
  knB: Vec;
  ftF: Vec;
  ftB: Vec;
  /** Ángulo absoluto de cada espinilla (para orientar los pies). */
  shinF: number;
  shinB: number;
  torsoAngle: number;
  headAngle: number;
  /** 0..1 mano abierta. */
  open: number;
}

const RAD = Math.PI / 180;
const limbDir = (a: number): Vec => ({ x: Math.sin(a * RAD), y: -Math.cos(a * RAD) });
const upDir = (a: number): Vec => ({ x: Math.sin(a * RAD), y: Math.cos(a * RAD) });
const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  const l2 = (x: [number, number], y: [number, number]): [number, number] => [l(x[0], y[0]), l(x[1], y[1])];
  return {
    hx: l(a.hx, b.hx),
    torso: l(a.torso, b.torso),
    head: l(a.head, b.head),
    aF: l2(a.aF, b.aF),
    aB: l2(a.aB, b.aB),
    lF: l2(a.lF, b.lF),
    lB: l2(a.lB, b.lB),
    rot: l(a.rot, b.rot),
    hy: l(a.hy, b.hy),
    ground: l(a.ground, b.ground),
    open: l(a.open, b.open),
  };
}

export function solve(p: Pose, look: CharacterLook): Joints {
  const s = look.scale;
  const hip: Vec = { x: p.hx, y: 0 };
  const tDir = upDir(p.torso);
  const neck = add(hip, tDir, look.torso * s);
  const shoulder = add(hip, tDir, (look.torso - 7) * s);
  const head = add(neck, upDir(p.torso + p.head), (look.headR + 2) * s);
  const shF = add(shoulder, { x: 3, y: 0 });
  const shB = add(shoulder, { x: -3, y: 0 });
  const elF = add(shF, limbDir(p.aF[0]), look.upperArm * s);
  const haF = add(elF, limbDir(p.aF[1]), look.foreArm * s);
  const elB = add(shB, limbDir(p.aB[0]), look.upperArm * s);
  const haB = add(elB, limbDir(p.aB[1]), look.foreArm * s);
  const hiF = add(hip, { x: 3 * s, y: 0 });
  const hiB = add(hip, { x: -3 * s, y: 0 });
  const knF = add(hiF, limbDir(p.lF[0]), look.thigh * s);
  const ftF = add(knF, limbDir(p.lF[1]), look.shin * s);
  const knB = add(hiB, limbDir(p.lB[0]), look.thigh * s);
  const ftB = add(knB, limbDir(p.lB[1]), look.shin * s);

  const j: Joints = {
    hip, neck, head, shF, shB, elF, elB, haF, haB, hiF, hiB, knF, knB, ftF, ftB,
    shinF: p.lF[1], shinB: p.lB[1], torsoAngle: p.torso + p.rot, headAngle: p.torso + p.head + p.rot, open: p.open,
  };

  const pts: Vec[] = [j.hip, j.neck, j.head, j.shF, j.shB, j.elF, j.elB, j.haF, j.haB, j.hiF, j.hiB, j.knF, j.knB, j.ftF, j.ftB];
  if (p.rot !== 0) {
    const c = Math.cos(-p.rot * RAD);
    const sn = Math.sin(-p.rot * RAD);
    for (const v of pts) {
      const dx = v.x - hip.x;
      const dy = v.y - hip.y;
      v.x = hip.x + dx * c - dy * sn;
      v.y = hip.y + dx * sn + dy * c;
    }
    // Las extremidades miden el ángulo en sentido antihorario; la rotación del cuerpo es horaria.
    j.shinF -= p.rot;
    j.shinB -= p.rot;
  }

  // Apoyo en el suelo: el punto más bajo del cuerpo (tobillos con su grosor, rodillas, cadera, cabeza) toca y = 0.
  const r = look.headR * s;
  const lowest = Math.min(
    j.ftF.y - 6 * s,
    j.ftB.y - 6 * s,
    j.knF.y - 7 * s,
    j.knB.y - 7 * s,
    j.hip.y - 12 * s,
    j.head.y - r,
    j.neck.y - 10 * s,
  );
  const shift = -lowest * p.ground + p.hy;
  for (const v of pts) v.y += shift;
  return j;
}

/** Colores efectivos (con paleta alternativa y destello blanco de impacto). */
export type Palette = CharacterLook["colors"];

export function resolvePalette(look: CharacterLook, alt: boolean): Palette {
  return alt ? { ...look.colors, ...look.altColors } : look.colors;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

export interface DrawOptions {
  /** 0..1 mezcla hacia blanco (flash de impacto). */
  flash: number;
  /** Silueta de color sólido (p. ej. contorno de parry). */
  tint?: string;
  alpha?: number;
}

function capsule(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, w: number, color: string, outline: string, ow: number): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = outline;
  ctx.lineWidth = w + ow * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, -a.y);
  ctx.lineTo(b.x, -b.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, -a.y);
  ctx.lineTo(b.x, -b.y);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, c: Vec, r: number, color: string, outline: string, ow: number): void {
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.arc(c.x, -c.y, r + ow, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(c.x, -c.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function foot(ctx: CanvasRenderingContext2D, ankle: Vec, shinAngle: number, len: number, w: number, color: string, outline: string): void {
  const d = limbDir(shinAngle + 90);
  const toe = add(ankle, d, len);
  capsule(ctx, ankle, toe, w, color, outline, 2);
}

/**
 * Dibuja al personaje en coordenadas locales (el llamador ya trasladó al origen y aplicó el espejo por `facing`).
 * El eje y del canvas apunta hacia abajo, por eso se niega y.
 */
export function drawFighterBody(ctx: CanvasRenderingContext2D, j: Joints, look: CharacterLook, pal: Palette, opt: DrawOptions): void {
  const s = look.scale;
  const fl = opt.flash;
  const col = (c: string, k = 1) => (opt.tint ? opt.tint : fl > 0.5 ? "#ffffff" : shade(c, k));
  const outline = opt.tint ? opt.tint : fl > 0.5 ? "#ffffff" : pal.outline;
  const ow = 2;
  const lw = look.limbW * s;
  const backK = 0.78;
  const sleeves = look.sleeves;
  const armUpper = (back: boolean) => col(sleeves === "none" ? pal.skin : pal.top, back ? backK : 1);

  // Brazo trasero
  capsule(ctx, j.shB, j.elB, lw * 1.05, armUpper(true), outline, ow);
  capsule(ctx, j.elB, j.haB, lw * 0.95, col(pal.skin, backK), outline, ow);
  hand(ctx, j.elB, j.haB, lw * 0.62, j.open, col(pal.gloves, backK), outline, ow);

  // Pierna trasera
  capsule(ctx, j.hiB, j.knB, lw * 1.45, col(pal.pantsShade), outline, ow);
  capsule(ctx, j.knB, j.ftB, lw * 1.2, col(pal.pantsShade), outline, ow);
  foot(ctx, j.ftB, j.shinB, 15 * s, lw * 0.8, col(pal.shoes, backK), outline);

  // Pierna delantera
  capsule(ctx, j.hiF, j.knF, lw * 1.5, col(pal.pants), outline, ow);
  capsule(ctx, j.knF, j.ftF, lw * 1.25, col(pal.pants), outline, ow);
  foot(ctx, j.ftF, j.shinF, 16 * s, lw * 0.85, col(pal.shoes), outline);

  // Torso (trapecio redondeado de la cintura a los hombros)
  const t = j.torsoAngle * RAD;
  const perp = { x: Math.cos(t), y: -Math.sin(t) };
  const hw = (look.waistW * s) / 2;
  const sw = (look.shoulderW * s) / 2;
  const sh = add(j.neck, upDir(j.torsoAngle), -6 * s);
  const p1 = add(j.hip, perp, -hw);
  const p2 = add(j.hip, perp, hw);
  const p3 = add(sh, perp, sw);
  const p4 = add(sh, perp, -sw);
  const torsoPath = () => {
    ctx.beginPath();
    ctx.moveTo(p1.x, -p1.y);
    ctx.lineTo(p2.x, -p2.y);
    ctx.quadraticCurveTo((p2.x + p3.x) / 2 + perp.x * 4, -((p2.y + p3.y) / 2 + perp.y * 4), p3.x, -p3.y);
    ctx.quadraticCurveTo(j.neck.x, -j.neck.y - 4, p4.x, -p4.y);
    ctx.quadraticCurveTo((p4.x + p1.x) / 2 - perp.x * 4, -((p4.y + p1.y) / 2 - perp.y * 4), p1.x, -p1.y);
    ctx.closePath();
  };
  ctx.lineJoin = "round";
  torsoPath();
  ctx.strokeStyle = outline;
  ctx.lineWidth = ow * 2;
  ctx.stroke();
  ctx.fillStyle = col(pal.top);
  ctx.fill();
  if (!opt.tint && fl <= 0.5) {
    // Sombra lateral para dar volumen
    ctx.save();
    torsoPath();
    ctx.clip();
    ctx.fillStyle = shade(pal.topShade, 1);
    const q = add(j.hip, perp, -hw * 0.2);
    ctx.beginPath();
    ctx.moveTo(p1.x, -p1.y);
    ctx.lineTo(q.x, -q.y);
    const q2 = add(sh, perp, -sw * 0.25);
    ctx.lineTo(q2.x, -q2.y);
    ctx.lineTo(p4.x, -p4.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Cinturón
  const b1 = add(j.hip, upDir(j.torsoAngle), 8 * s);
  capsule(ctx, add(b1, perp, -hw - 1), add(b1, perp, hw + 1), 7 * s, col(pal.accent), outline, 1.5);

  // Cabeza
  const r = look.headR * s;
  const ha = j.headAngle * RAD;
  circle(ctx, j.head, r, col(pal.skin), outline, ow);
  const fwd = { x: Math.cos(ha), y: -Math.sin(ha) };
  const up = { x: Math.sin(ha), y: Math.cos(ha) };
  if (!opt.tint && fl <= 0.5) {
    // Ojo
    const eye = add(add(j.head, fwd, r * 0.55), up, r * 0.15);
    ctx.fillStyle = "#101018";
    ctx.beginPath();
    ctx.ellipse(eye.x, -eye.y, 2.2 * s, 3 * s, -ha, 0, Math.PI * 2);
    ctx.fill();
    drawHair(ctx, j.head, r, fwd, up, look, col(pal.hair), col(pal.accent), outline);
  }

  // Brazo delantero (encima de todo)
  const armF = col(sleeves === "none" ? pal.skin : pal.top);
  capsule(ctx, j.shF, j.elF, lw * 1.1, armF, outline, ow);
  capsule(ctx, j.elF, j.haF, lw, col(pal.skin), outline, ow);
  hand(ctx, j.elF, j.haF, lw * 0.68, j.open, col(pal.gloves), outline, ow);
}

/** Puño (círculo) o palma abierta (cápsula plana en la dirección del antebrazo). */
function hand(ctx: CanvasRenderingContext2D, elbow: Vec, wrist: Vec, r: number, open: number, color: string, outline: string, ow: number): void {
  if (open < 0.5) {
    circle(ctx, wrist, r, color, outline, ow);
    return;
  }
  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const tip = { x: wrist.x + (dx / len) * r * 1.9, y: wrist.y + (dy / len) * r * 1.9 };
  capsule(ctx, wrist, tip, r * 1.25, color, outline, ow);
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  c: Vec,
  r: number,
  fwd: Vec,
  up: Vec,
  look: CharacterLook,
  hair: string,
  accent: string,
  outline: string,
): void {
  const P = (f: number, u: number) => {
    const v = add(add(c, fwd, f * r), up, u * r);
    return [v.x, -v.y] as const;
  };
  ctx.fillStyle = hair;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (look.hairStyle === "spiky") {
    ctx.moveTo(...P(0.9, 0.2));
    ctx.lineTo(...P(0.8, 1.05));
    ctx.lineTo(...P(0.35, 0.95));
    ctx.lineTo(...P(0.2, 1.5));
    ctx.lineTo(...P(-0.25, 1.05));
    ctx.lineTo(...P(-0.6, 1.45));
    ctx.lineTo(...P(-0.85, 0.85));
    ctx.lineTo(...P(-1.45, 0.9));
    ctx.lineTo(...P(-1.05, 0.2));
    ctx.lineTo(...P(-1.1, -0.35));
    ctx.lineTo(...P(-0.5, 0.25));
    ctx.lineTo(...P(0.3, 0.45));
  } else if (look.hairStyle === "ponytail") {
    ctx.moveTo(...P(0.95, 0.25));
    ctx.quadraticCurveTo(...P(0.6, 1.35), ...P(-0.3, 1.1));
    ctx.quadraticCurveTo(...P(-1.1, 0.9), ...P(-1.05, 0.0));
    ctx.quadraticCurveTo(...P(-1.9, 0.3), ...P(-2.4, -0.9));
    ctx.quadraticCurveTo(...P(-1.6, -0.2), ...P(-0.9, -0.5));
    ctx.quadraticCurveTo(...P(-0.4, 0.4), ...P(0.4, 0.55));
  } else if (look.hairStyle === "short") {
    ctx.moveTo(...P(0.95, 0.2));
    ctx.quadraticCurveTo(...P(0.7, 1.25), ...P(-0.3, 1.12));
    ctx.quadraticCurveTo(...P(-1.15, 0.9), ...P(-1.05, -0.2));
    ctx.lineTo(...P(-0.6, 0.3));
    ctx.quadraticCurveTo(...P(0.1, 0.6), ...P(0.6, 0.45));
  }
  if (look.hairStyle !== "bald") {
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
  if (look.extra === "headband") {
    ctx.strokeStyle = accent;
    ctx.lineWidth = r * 0.32;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...P(0.98, 0.45));
    ctx.lineTo(...P(-0.98, 0.45));
    ctx.stroke();
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(...P(-0.95, 0.45));
    ctx.quadraticCurveTo(...P(-1.6, 0.6), ...P(-2.2, 0.1));
    ctx.moveTo(...P(-0.95, 0.4));
    ctx.quadraticCurveTo(...P(-1.5, 0.2), ...P(-1.9, -0.45));
    ctx.stroke();
  } else if (look.extra === "beard") {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(...P(0.95, -0.15));
    ctx.quadraticCurveTo(...P(0.8, -1.05), ...P(0.0, -1.0));
    ctx.quadraticCurveTo(...P(-0.5, -0.8), ...P(-0.6, -0.3));
    ctx.lineTo(...P(0.4, -0.35));
    ctx.closePath();
    ctx.fill();
  } else if (look.extra === "scarf") {
    ctx.strokeStyle = accent;
    ctx.lineCap = "round";
    ctx.lineWidth = r * 0.45;
    ctx.beginPath();
    ctx.moveTo(...P(0.5, -0.95));
    ctx.lineTo(...P(-0.7, -0.95));
    ctx.stroke();
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(...P(-0.7, -0.95));
    ctx.quadraticCurveTo(...P(-1.8, -0.7), ...P(-2.6, -1.4));
    ctx.stroke();
  }
}
