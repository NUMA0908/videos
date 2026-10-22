import { getChar } from "../data/characters";
import { activeHitboxes, hurtboxes, pushbox, type WorldBox } from "../sim/boxes";
import { toPx } from "../sim/fixed";
import { Btn, toNumpad } from "../sim/input";
import type { GameState, Side } from "../sim/types";
import type { Camera } from "./camera";
import { FONT, VIEW_W } from "./view";

const ARROWS: Record<number, string> = { 1: "↙", 2: "↓", 3: "↘", 4: "←", 5: "•", 6: "→", 7: "↖", 8: "↑", 9: "↗" };

/** Notación legible de un bitmask (relativa a hacia dónde mira el personaje). */
export function inputLabel(mask: number, facing: 1 | -1): string {
  const parts = [ARROWS[toNumpad(mask, facing)]];
  if (mask & Btn.LP) parts.push("LP");
  if (mask & Btn.HP) parts.push("HP");
  if (mask & Btn.LK) parts.push("LK");
  if (mask & Btn.HK) parts.push("HK");
  if (mask & Btn.PARRY) parts.push("PY");
  if (mask & Btn.SP) parts.push("SP");
  return parts.join(" ");
}

/**
 * Registro de inputs para pantalla (debug y entrenamiento). Vive en el render, no en la simulación,
 * así puede guardar historial ilimitado sin engordar el estado.
 */
export class InputLog {
  entries: { mask: number; facing: 1 | -1; frames: number }[] = [];
  push(mask: number, facing: 1 | -1): void {
    const last = this.entries[0];
    if (last && last.mask === mask) {
      last.frames++;
      return;
    }
    this.entries.unshift({ mask, facing, frames: 1 });
    if (this.entries.length > 40) this.entries.pop();
  }
  clear(): void {
    this.entries = [];
  }
}

function strokeBox(ctx: CanvasRenderingContext2D, cam: Camera, b: WorldBox, stroke: string, fill: string): void {
  const x0 = cam.sx(toPx(b.x0));
  const x1 = cam.sx(toPx(b.x1));
  const y0 = cam.sy(toPx(b.y1));
  const y1 = cam.sy(toPx(b.y0));
  ctx.fillStyle = fill;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
}

export function drawDebugBoxes(ctx: CanvasRenderingContext2D, s: GameState, cam: Camera, projectileBoxes: (s: GameState) => WorldBox[]): void {
  for (const f of s.fighters) {
    strokeBox(ctx, cam, pushbox(f), "rgba(255,230,0,0.9)", "rgba(255,230,0,0.08)");
    for (const b of hurtboxes(f)) strokeBox(ctx, cam, b, "rgba(60,160,255,0.95)", "rgba(60,160,255,0.18)");
    for (const g of activeHitboxes(f)) for (const b of g.boxes) strokeBox(ctx, cam, b, "rgba(255,40,40,1)", "rgba(255,40,40,0.3)");
    // Origen
    const ox = cam.sx(toPx(f.x));
    const oy = cam.sy(toPx(f.y));
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox - 6, oy);
    ctx.lineTo(ox + 6, oy);
    ctx.moveTo(ox, oy - 6);
    ctx.lineTo(ox, oy + 6);
    ctx.stroke();
  }
  for (const b of projectileBoxes(s)) strokeBox(ctx, cam, b, "rgba(255,80,200,1)", "rgba(255,80,200,0.25)");
}

function fighterLines(s: GameState, side: Side): string[] {
  const f = s.fighters[side];
  const ch = getChar(f.char);
  return [
    `${ch.nickname}  ${f.state}  t=${f.t}`,
    `move ${f.move ?? "-"}  mf=${f.mf}  stun=${f.stun}  stop=${f.hitstop}`,
    `x=${toPx(f.x).toFixed(1)} y=${toPx(f.y).toFixed(1)} vx=${toPx(f.vx).toFixed(2)} vy=${toPx(f.vy).toFixed(2)}`,
    `vida ${f.health}/${f.maxHealth}  medidor ${f.meter}  combo ${f.comboHits}`,
    `parry ${f.parryWindow}/${f.parryCooldown}  tech ${f.techWindow}  buf ${f.buf.map((v) => (v === 99 ? "·" : v)).join(" ")}`,
  ];
}

export function drawDebugPanel(ctx: CanvasRenderingContext2D, s: GameState, logs: [InputLog, InputLog]): void {
  ctx.save();
  ctx.font = `12px ${FONT}`;
  ctx.textBaseline = "top";
  const panel = (x: number, lines: string[], align: CanvasTextAlign) => {
    ctx.textAlign = align;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(align === "left" ? x - 4 : x - 330, 92, 334, lines.length * 15 + 8);
    ctx.fillStyle = "#e8f6ff";
    lines.forEach((l, i) => ctx.fillText(l, x, 96 + i * 15));
  };
  panel(10, fighterLines(s, 0), "left");
  panel(VIEW_W - 10, fighterLines(s, 1), "right");

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(VIEW_W / 2 - 120, 92, 240, 20);
  ctx.fillStyle = "#ffe066";
  ctx.fillText(`frame ${s.frame}  ${s.round.phase}  congelado ${s.freeze}`, VIEW_W / 2, 96);
  ctx.restore();
  drawInputLogs(ctx, logs, 180);
}

export function drawInputLogs(ctx: CanvasRenderingContext2D, logs: [InputLog, InputLog], top: number): void {
  ctx.save();
  ctx.font = `13px ${FONT}`;
  ctx.textBaseline = "top";
  for (const side of [0, 1] as const) {
    const log = logs[side];
    const x = side === 0 ? 12 : VIEW_W - 12;
    ctx.textAlign = side === 0 ? "left" : "right";
    log.entries.slice(0, 16).forEach((e, i) => {
      const y = top + i * 16;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(side === 0 ? x - 4 : x - 120, y - 1, 124, 16);
      ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(220,235,255,0.8)";
      const label = `${String(Math.min(e.frames, 99)).padStart(2, " ")}  ${inputLabel(e.mask, e.facing)}`;
      ctx.fillText(label, x, y);
    });
  }
  ctx.restore();
}
