import type { PadReader } from "../input/gamepad";
import { PadButton } from "../input/gamepad";
import type { PadTuning } from "../input/padTuning";
import { Btn } from "../sim/input";
import { drawText, UI } from "./ui";

/** Flecha de una máscara de dirección (pantalla, no relativa al personaje). */
export function dirArrow(mask: number): string {
  const u = mask & Btn.UP, d = mask & Btn.DOWN, l = mask & Btn.LEFT, r = mask & Btn.RIGHT;
  if (u && l) return "↖";
  if (u && r) return "↗";
  if (d && l) return "↙";
  if (d && r) return "↘";
  if (u) return "↑";
  if (d) return "↓";
  if (l) return "←";
  if (r) return "→";
  return "·";
}

/**
 * Vista del stick izquierdo para calibrar: círculo completo, zona muerta (activar), radio de soltar
 * (histéresis), fronteras de los 8 sectores y la posición real del stick. Dibujado por código.
 */
export function drawStickView(ctx: CanvasRenderingContext2D, r: PadReader | null, t: PadTuning, cx: number, cy: number, radius: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Fronteras de sector: cada diagonal ocupa `diagonalArc` grados centrados en 45°, 135°…
  ctx.strokeStyle = "rgba(127,227,255,0.25)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    for (const side of [-1, 1]) {
      const a = ((45 + k * 90 + (side * t.diagonalArc) / 2) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * radius * t.stickRelease, cy + Math.sin(a) * radius * t.stickRelease);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.stroke();
    }
  }
  // Zona muerta (rellena) y radio de soltar (discontinuo).
  ctx.fillStyle = "rgba(255,210,63,0.16)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * t.stickDeadzone, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = UI.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(255,210,63,0.6)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * t.stickRelease, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (r && r.axes.length >= 2) {
    const x = Math.max(-1, Math.min(1, r.axes[0]));
    const y = Math.max(-1, Math.min(1, r.axes[1]));
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + x * radius, cy + y * radius);
    ctx.stroke();
    ctx.fillStyle = r.stickDir ? UI.cyan : "#ffffff";
    ctx.beginPath();
    ctx.arc(cx + x * radius, cy + y * radius, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Barra de un gatillo analógico con la línea del umbral. */
export function drawTriggerBar(ctx: CanvasRenderingContext2D, label: string, r: PadReader | null, button: number, t: PadTuning, x: number, y: number, w: number): void {
  const value = r?.pad?.buttons[button]?.value ?? 0;
  const on = r?.down(button) ?? false;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = on ? UI.cyan : "rgba(255,255,255,0.45)";
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, value)), 10);
  ctx.fillStyle = UI.accent;
  ctx.fillRect(x + w * t.triggerThreshold - 1, y - 3, 2, 16);
  drawText(ctx, label, x - 8, y + 5, { size: 12, color: UI.dim, align: "right" });
}

/** Panel en vivo de un mando: stick, dirección resultante y gatillos. */
export function drawPadLive(ctx: CanvasRenderingContext2D, title: string, r: PadReader | null, t: PadTuning, x: number, y: number): void {
  drawText(ctx, title, x, y, { size: 16, bold: true, align: "center" });
  if (!r) {
    drawText(ctx, "Sin mando", x, y + 90, { size: 14, color: UI.dim, align: "center" });
    return;
  }
  drawText(ctx, r.id.length > 28 ? `${r.id.slice(0, 27)}…` : r.id, x, y + 20, { size: 11, color: UI.dim, align: "center" });
  drawStickView(ctx, r, t, x, y + 100, 66);
  drawText(ctx, `Stick ${dirArrow(r.stickDir)}   Cruceta ${dirArrow(r.dpadDir)}`, x, y + 186, { size: 14, align: "center" });
  if (r.mapping === "standard") {
    drawTriggerBar(ctx, "LT", r, PadButton.LT, t, x - 50, y + 204, 100);
    drawTriggerBar(ctx, "RT", r, PadButton.RT, t, x - 50, y + 222, 100);
  } else {
    drawText(ctx, "Mapeo no estándar", x, y + 212, { size: 12, color: UI.dim, align: "center" });
  }
}
