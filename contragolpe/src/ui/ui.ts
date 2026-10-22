import { getChar } from "../data/characters";
import { getPose } from "../render/poses";
import "../render/movePoses";
import { POSES } from "../render/poses";
import { drawFighterBody, resolvePalette, solve } from "../render/skeleton";
import { FONT, FONT_IMPACT, VIEW_H, VIEW_W } from "../render/view";

/** Piezas de interfaz dibujadas por código (sin assets). */

export const UI = {
  bg0: "#0b0d1f",
  bg1: "#1d1440",
  accent: "#ffd23f",
  cyan: "#7fe3ff",
  text: "#f2f4ff",
  dim: "rgba(220,225,255,0.55)",
  panel: "rgba(8,10,28,0.78)",
};

/** Fondo animado: degradado, rayas diagonales que se desplazan y un brillo. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, time: number, tint = UI.bg1): void {
  const g = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  g.addColorStop(0, UI.bg0);
  g.addColorStop(1, tint);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  const off = (time * 40) % 80;
  for (let x = -VIEW_H + off; x < VIEW_W + VIEW_H; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 34, 0);
    ctx.lineTo(x + 34 - VIEW_H, VIEW_H);
    ctx.lineTo(x - VIEW_H, VIEW_H);
    ctx.fill();
  }
  ctx.restore();
}

export function drawTitle(ctx: CanvasRenderingContext2D, text: string, y: number, size = 40, color = UI.accent): void {
  ctx.save();
  ctx.font = `${size}px ${FONT_IMPACT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(text, VIEW_W / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW_W / 2, y);
  ctx.restore();
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; impact?: boolean; stroke?: boolean } = {},
): void {
  ctx.save();
  ctx.font = `${opts.bold ? "bold " : ""}${opts.size ?? 16}px ${opts.impact ? FONT_IMPACT : FONT}`;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "middle";
  if (opts.stroke) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = opts.color ?? UI.text;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.78): void {
  ctx.save();
  ctx.fillStyle = `rgba(8,10,28,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(127,227,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export interface MenuItem {
  label: string;
  /** Valor a la derecha (opciones). */
  value?: string;
  hint?: string;
  disabled?: boolean;
}

/** Lista vertical de opciones con la seleccionada resaltada. */
/** Primera fila visible de una lista con desplazamiento (la seleccionada queda centrada cuando se puede). */
export function menuScroll(count: number, selected: number, maxRows: number): number {
  if (count <= maxRows) return 0;
  return Math.max(0, Math.min(count - maxRows, selected - Math.floor(maxRows / 2)));
}

export function drawMenu(
  ctx: CanvasRenderingContext2D,
  items: MenuItem[],
  selected: number,
  x: number,
  y: number,
  w: number,
  time: number,
  rowH = 38,
  maxRows = Infinity,
): void {
  const first = menuScroll(items.length, selected, maxRows);
  const last = Math.min(items.length, first + maxRows);
  // Flechas cuando hay más opciones por encima o por debajo.
  if (first > 0) drawText(ctx, "▲", x + w / 2, y - rowH / 2 - 4, { size: 12, color: UI.dim, align: "center" });
  if (last < items.length) drawText(ctx, "▼", x + w / 2, y + (last - first) * rowH - rowH / 2 + 2, { size: 12, color: UI.dim, align: "center" });
  items.forEach((it, i) => {
    if (i < first || i >= last) return;
    const yy = y + (i - first) * rowH;
    const sel = i === selected;
    if (sel) {
      ctx.save();
      const pulse = 0.65 + 0.2 * Math.sin(time * 6);
      ctx.fillStyle = `rgba(255,210,63,${0.18 * pulse + 0.08})`;
      ctx.beginPath();
      ctx.roundRect(x - 12, yy - rowH / 2 + 3, w + 24, rowH - 6, 8);
      ctx.fill();
      ctx.fillStyle = UI.accent;
      ctx.beginPath();
      ctx.moveTo(x - 6, yy - 7);
      ctx.lineTo(x + 4, yy);
      ctx.lineTo(x - 6, yy + 7);
      ctx.fill();
      ctx.restore();
    }
    const color = it.disabled ? "rgba(200,200,220,0.35)" : sel ? "#ffffff" : "rgba(230,235,255,0.82)";
    drawText(ctx, it.label, x + 14, yy, { size: 19, color, bold: sel });
    if (it.value !== undefined) {
      drawText(ctx, sel ? `◀ ${it.value} ▶` : it.value, x + w, yy, { size: 17, color: sel ? UI.accent : UI.cyan, align: "right", bold: true });
    }
  });
  const hint = items[selected]?.hint;
  if (hint) drawText(ctx, hint, VIEW_W / 2, VIEW_H - 54, { size: 14, color: UI.dim, align: "center" });
}

export function drawFooter(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, VIEW_H - 30, VIEW_W, 30);
  ctx.restore();
  drawText(ctx, text, VIEW_W / 2, VIEW_H - 15, { size: 13, color: UI.dim, align: "center" });
}

/** Dibuja a un personaje (pose por clave) centrado en x con los pies en y. */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  charId: string,
  pose: string,
  x: number,
  y: number,
  scale: number,
  facing: 1 | -1,
  alt = false,
  silhouette?: string,
): void {
  const ch = getChar(charId);
  const key = POSES[`${charId}.${pose}`] ? `${charId}.${pose}` : pose;
  const j = solve(getPose(key), ch.look);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  drawFighterBody(ctx, j, ch.look, resolvePalette(ch.look, alt), { flash: 0, tint: silhouette });
  ctx.restore();
}

/** Barra de estadística (1..5). */
export function drawStat(ctx: CanvasRenderingContext2D, label: string, value: number, x: number, y: number, color = UI.cyan): void {
  drawText(ctx, label, x, y, { size: 13, color: UI.dim });
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < value ? color : "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 92 + i * 22, y - 6, 18, 12);
  }
}
