import type { InputLog } from "../render/debug";
import { Btn, toNumpad } from "../sim/input";
import type { PadReader } from "../input/gamepad";
import type { PadTuning } from "../input/padTuning";
import { VIEW_W } from "../render/view";
import { drawRich, dpadIcon, type GlyphDevice } from "./glyphs";
import { drawText, UI } from "./ui";

const ARROWS: Record<number, string> = { 1: "↙", 2: "↓", 3: "↘", 4: "←", 5: "·", 6: "→", 7: "↖", 8: "↑", 9: "↗" };
const BUTTONS: [number, string][] = [
  [Btn.LP, "LP"],
  [Btn.HP, "HP"],
  [Btn.LK, "LK"],
  [Btn.HK, "HK"],
  [Btn.PARRY, "PARRY"],
  [Btn.SP, "SP"],
];

/** Una entrada del historial como texto con tokens: flecha relativa al rival + botones. */
export function historyTokens(mask: number, facing: 1 | -1): string {
  let t = ARROWS[toNumpad(mask, facing)];
  for (const [bit, name] of BUTTONS) if (mask & bit) t += ` {${name}}`;
  return t;
}

/**
 * Historial de entrada del entrenamiento con los íconos del dispositivo de cada lado (lo que de verdad llegó
 * a la simulación, frame a frame): frames que duró · dirección · botones.
 */
export function drawInputHistory(ctx: CanvasRenderingContext2D, logs: [InputLog, InputLog], top: number, devices: [GlyphDevice, GlyphDevice], rows: [number, number] = [14, 14]): void {
  for (const side of [0, 1] as const) {
    const log = logs[side];
    const x = side === 0 ? 8 : VIEW_W - 8;
    const n = Math.min(log.entries.length, rows[side]);
    for (let i = 0; i < n; i++) {
      const e = log.entries[i];
      const y = top + i * 19;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(side === 0 ? x : x - 150, y - 9, 150, 18);
      const frames = String(Math.min(e.frames, 99)).padStart(2, " ");
      const text = `${frames}  ${historyTokens(e.mask, e.facing)}`;
      drawRich(ctx, text, side === 0 ? x + 4 : x - 4, y, devices[side], { size: 12, color: i === 0 ? "#ffffff" : "rgba(220,235,255,0.8)", align: side === 0 ? "left" : "right" });
    }
  }
}

/**
 * Entrada en vivo del J1: stick (posición real, zona muerta y dirección resultante), cruceta y botones
 * encendidos al pulsarlos. Sirve para comprobar la zona muerta y los ajustes sin salir del combate.
 */
export function drawLiveInput(ctx: CanvasRenderingContext2D, mask: number, pad: PadReader | null, t: PadTuning, dev: GlyphDevice, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(x, y, 236, 56, 8);
  ctx.fill();
  // Stick: círculo, zona muerta y punto.
  const cx = x + 28;
  const cy = y + 28;
  const r = 22;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,210,63,0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * t.stickDeadzone, 0, Math.PI * 2);
  ctx.fill();
  if (pad && pad.axes.length >= 2) {
    ctx.fillStyle = pad.stickDir ? UI.cyan : "#ffffff";
    ctx.beginPath();
    ctx.arc(cx + Math.max(-1, Math.min(1, pad.axes[0])) * r, cy + Math.max(-1, Math.min(1, pad.axes[1])) * r, 4, 0, Math.PI * 2);
    ctx.fill();
  } else drawText(ctx, "—", cx, cy, { size: 12, color: UI.dim, align: "center" });
  ctx.restore();
  // Dirección final (después de SOCD) en una cruceta.
  const arms = (mask & Btn.UP ? 1 : 0) | (mask & Btn.DOWN ? 2 : 0) | (mask & Btn.LEFT ? 4 : 0) | (mask & Btn.RIGHT ? 8 : 0);
  dpadIcon(ctx, arms, x + 58, cy, 30);
  // Botones: encendidos si llegan a la simulación este frame.
  let bx = x + 96;
  for (const [bit, name] of BUTTONS) {
    ctx.save();
    ctx.globalAlpha = mask & bit ? 1 : 0.28;
    bx += drawRich(ctx, `{${name}}`, bx, cy, dev, { size: 11 }) + 2;
    ctx.restore();
  }
}
