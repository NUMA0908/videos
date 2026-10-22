import type { App } from "../app/App";
import { DEFAULT_PAD, DEFAULT_RAW_PAD, keyName, type KeyBindings, type PadAction, type PadBindings } from "../input/bindings";
import { PadButton, type PadReader } from "../input/gamepad";
import { isButtonCode } from "../input/padCodes";
import type { PadKind } from "../input/padKind";
import { padCodeName } from "../input/padNames";
import { FONT } from "../render/view";
import { UI } from "./ui";

/**
 * Íconos de botones dibujados por código (originales, sin arte de terceros):
 *   Xbox: círculos con la letra en su color · PlayStation: ✕ ○ □ △ dibujados como figuras ·
 *   Switch: letras en su posición · genérico: rombo de cuatro puntos con el botón marcado ·
 *   gatillos y botones de hombro con su nombre · cruceta con el brazo marcado · teclado: tecla con su letra.
 * `drawRich` sustituye `{LP}`, `{ACCEPT}`… por el ícono del dispositivo que se esté usando.
 */

/** Con qué se está jugando/navegando: un mando (con su perfil) o un juego de teclas. */
export interface GlyphDevice {
  pad: PadReader | null;
  profile: PadBindings | null;
  keys: KeyBindings;
  /** Solo nombres (LP, HP…): para lados que no maneja nadie, como el muñeco. */
  textOnly?: boolean;
}

export function deviceOf(app: App, pad: PadReader | null, keySet: 0 | 1 = 0): GlyphDevice {
  if (pad && pad.connected) return { pad, profile: app.input.profileOf(pad), keys: app.input.keys[keySet] };
  return { pad: null, profile: null, keys: app.input.keys[keySet] };
}

/** El dispositivo con el que se está navegando (el último que se usó). */
export function menuDevice(app: App): GlyphDevice {
  const i = app.input.lastDevice;
  return deviceOf(app, i >= 0 ? app.input.readers[i] : null, 0);
}

/** El dispositivo de un jugador (su mando si tiene; si no, su juego de teclas). */
export function playerDevice(app: App, player: 0 | 1): GlyphDevice {
  return deviceOf(app, app.input.reader(player), app.input.keySet[player]);
}

const FACE: Record<"xbox" | "switch", [string, string][]> = {
  xbox: [
    ["A", "#6cc04a"],
    ["B", "#e2483d"],
    ["X", "#3d8fe2"],
    ["Y", "#f0c419"],
  ],
  switch: [
    ["B", "#f2f4ff"],
    ["A", "#f2f4ff"],
    ["Y", "#f2f4ff"],
    ["X", "#f2f4ff"],
  ],
};
const PS_COLORS = ["#7aa7ff", "#ff6b6b", "#ff8ad1", "#4fd1a5"];
const SHOULDER: Record<Exclude<PadKind, "raw">, string[]> = {
  xbox: ["LB", "RB", "LT", "RT"],
  playstation: ["L1", "R1", "L2", "R2"],
  switch: ["L", "R", "ZL", "ZR"],
  generic: ["L1", "R1", "L2", "R2"],
};
const MIDDLE: Record<Exclude<PadKind, "raw">, [string, string]> = {
  xbox: ["View", "Menu"],
  playstation: ["Create", "Options"],
  switch: ["−", "+"],
  generic: ["Select", "Start"],
};

function pill(ctx: CanvasRenderingContext2D, label: string, x: number, cy: number, h: number, draw: boolean, opts: { fill?: string; text?: string; radius?: number; key?: boolean } = {}): number {
  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.52)}px ${FONT}`;
  const w = Math.max(h, ctx.measureText(label).width + h * 0.6);
  if (draw) {
    ctx.beginPath();
    ctx.roundRect(x, cy - h / 2, w, h, opts.radius ?? h / 2);
    ctx.fillStyle = opts.fill ?? "#1b1e2c";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.key ? "rgba(230,235,255,0.75)" : "rgba(255,255,255,0.35)";
    ctx.stroke();
    if (opts.key) {
      // Borde inferior más grueso: una tecla.
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x + 2, cy + h / 2 - 3, w - 4, 2);
    }
    ctx.fillStyle = opts.text ?? UI.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, cy + 1);
  }
  ctx.restore();
  return w;
}

function faceButton(ctx: CanvasRenderingContext2D, code: number, kind: PadKind, x: number, cy: number, h: number, draw: boolean): number {
  if (!draw) return h;
  const r = h / 2;
  const cx = x + r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#1b1e2c";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  if (kind === "playstation") {
    // Figuras dibujadas (no tipografía): cruz, círculo, cuadrado y triángulo.
    const s = r * 0.48;
    ctx.strokeStyle = PS_COLORS[code];
    ctx.lineWidth = Math.max(1.6, h * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    if (code === 0) {
      ctx.moveTo(cx - s, cy - s);
      ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s);
      ctx.lineTo(cx - s, cy + s);
    } else if (code === 1) ctx.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
    else if (code === 2) ctx.rect(cx - s * 0.9, cy - s * 0.9, s * 1.8, s * 1.8);
    else {
      ctx.moveTo(cx, cy - s * 1.05);
      ctx.lineTo(cx + s * 1.05, cy + s * 0.75);
      ctx.lineTo(cx - s * 1.05, cy + s * 0.75);
      ctx.closePath();
    }
    ctx.stroke();
  } else if (kind === "generic") {
    // Rombo de cuatro puntos: abajo, derecha, izquierda, arriba (mapeo estándar).
    const pos = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ];
    pos.forEach(([dx, dy], i) => {
      ctx.beginPath();
      ctx.arc(cx + dx * r * 0.48, cy + dy * r * 0.48, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = i === code ? UI.accent : "rgba(255,255,255,0.3)";
      ctx.fill();
    });
  } else {
    const [letter, color] = FACE[kind === "switch" ? "switch" : "xbox"][code];
    ctx.font = `bold ${Math.round(h * 0.6)}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, cx, cy + 1);
  }
  ctx.restore();
  return h;
}

/** Cruceta con los brazos indicados resaltados (u=1, d=2, l=4, r=8). */
export function dpadIcon(ctx: CanvasRenderingContext2D, arms: number, x: number, cy: number, h: number, draw = true): number {
  if (!draw) return h;
  const cx = x + h / 2;
  const t = h / 3;
  ctx.save();
  const arm = (bit: number, dx: number, dy: number) => {
    ctx.fillStyle = arms & bit ? UI.accent : "#3a3f55";
    ctx.fillRect(cx + dx * t - t / 2, cy + dy * t - t / 2, t, t);
  };
  ctx.fillStyle = "#3a3f55";
  ctx.fillRect(cx - t / 2, cy - t / 2, t, t);
  arm(1, 0, -1);
  arm(2, 0, 1);
  arm(4, -1, 0);
  arm(8, 1, 0);
  ctx.restore();
  return h;
}

/** Ícono de una entrada del mando (botón, eje o hat). Devuelve el ancho. */
export function padGlyph(ctx: CanvasRenderingContext2D, code: number, kind: PadKind, x: number, cy: number, h: number, draw = true): number {
  if (kind === "raw" || !isButtonCode(code)) return pill(ctx, padCodeName(code, kind).replace("Botón ", "B"), x, cy, h, draw, { radius: 6 });
  if (code <= 3) return faceButton(ctx, code, kind, x, cy, h, draw);
  if (code <= 7) {
    const trigger = code >= 6;
    return pill(ctx, SHOULDER[kind][code - 4], x, cy, h, draw, { radius: trigger ? h / 2 : 4, fill: trigger ? "#2a2236" : "#1b1e2c" });
  }
  if (code <= 9) return pill(ctx, MIDDLE[kind][code - 8], x, cy, h * 0.85, draw);
  if (code <= 11) return pill(ctx, code === 10 ? "L3" : "R3", x, cy, h, draw);
  if (code <= 15) return dpadIcon(ctx, [1, 2, 4, 8][code - 12], x, cy, h, draw);
  return pill(ctx, padCodeName(code, kind), x, cy, h, draw);
}

export function keyGlyph(ctx: CanvasRenderingContext2D, label: string, x: number, cy: number, h: number, draw = true): number {
  return pill(ctx, label, x, cy, h, draw, { radius: 4, key: true, fill: "#262a3a" });
}

const KEY_TOKENS: Record<string, string> = { ACCEPT: "Enter", BACK: "Esc", PAUSE: "Esc", UPDOWN: "↑↓", LEFTRIGHT: "←→" };
const PAD_ACTION_TOKENS = new Set(["LP", "HP", "LK", "HK", "PARRY", "SP", "THROW", "SUPER", "PAUSE"]);

/** Dibuja (o mide) el ícono de un token para un dispositivo. */
function tokenGlyph(ctx: CanvasRenderingContext2D, token: string, dev: GlyphDevice, x: number, cy: number, h: number, draw: boolean): number {
  if (token === "P" || token === "K") {
    // Cualquier puño / cualquier patada: los dos iconos separados por una barra.
    const [a, b] = token === "P" ? ["LP", "HP"] : ["LK", "HK"];
    let w = tokenGlyph(ctx, a, dev, x, cy, h, draw);
    if (draw) {
      ctx.save();
      ctx.font = `${Math.round(h * 0.6)}px ${FONT}`;
      ctx.fillStyle = UI.dim;
      ctx.textBaseline = "middle";
      ctx.fillText("/", x + w + 2, cy);
      ctx.restore();
    }
    w += h * 0.45;
    return w + tokenGlyph(ctx, b, dev, x + w, cy, h, draw);
  }
  if (dev.textOnly) return pill(ctx, token === "PARRY" ? "PY" : token, x, cy, h, draw, { radius: 4 });
  const r = dev.pad;
  if (r) {
    const kind = r.kind;
    if (token === "ACCEPT") return padGlyph(ctx, kind === "raw" ? (dev.profile?.LK[0] ?? 0) : PadButton.A, kind, x, cy, h, draw);
    if (token === "BACK") return padGlyph(ctx, kind === "raw" ? (dev.profile?.HK[0] ?? 1) : PadButton.B, kind, x, cy, h, draw);
    if (token === "UPDOWN") return dpadIcon(ctx, 3, x, cy, h, draw);
    if (token === "LEFTRIGHT") return dpadIcon(ctx, 12, x, cy, h, draw);
    if (PAD_ACTION_TOKENS.has(token)) {
      const profile = dev.profile ?? (kind === "raw" ? DEFAULT_RAW_PAD : DEFAULT_PAD);
      const code = profile[token as PadAction][0];
      return code === undefined ? pill(ctx, "—", x, cy, h, draw) : padGlyph(ctx, code, kind, x, cy, h, draw);
    }
  }
  if (KEY_TOKENS[token]) return keyGlyph(ctx, KEY_TOKENS[token], x, cy, h, draw);
  // Atajos de teclado: agarre y súper son dos teclas a la vez.
  if (token === "THROW") return keyGlyph(ctx, `${keyName(dev.keys.LP[0] ?? "")}+${keyName(dev.keys.LK[0] ?? "")}`, x, cy, h, draw);
  if (token === "SUPER") return keyGlyph(ctx, `${keyName(dev.keys.HP[0] ?? "")}+${keyName(dev.keys.HK[0] ?? "")}`, x, cy, h, draw);
  const k = (dev.keys as Record<string, string[]>)[token];
  return keyGlyph(ctx, k?.[0] ? keyName(k[0]) : token, x, cy, h, draw);
}

const TOKEN = /\{([A-Z]+)\}/g;

/** Notación de la lista de movimientos → texto con tokens ("↓↘→ + P" → "↓↘→ + {P}"). */
export function notationTokens(n: string): string {
  return n.replace(/\b(LP|HP|LK|HK|PARRY|SP|P|K)\b/g, "{$1}");
}

/**
 * Texto con íconos: `{LP}`, `{P}`, `{PARRY}`, `{ACCEPT}`, `{BACK}`, `{PAUSE}`, `{UPDOWN}`… se dibujan como el
 * botón del dispositivo dado. Devuelve el ancho total.
 */
export function drawRich(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  dev: GlyphDevice,
  opts: { size?: number; color?: string; align?: "left" | "center" | "right"; bold?: boolean } = {},
): number {
  const size = opts.size ?? 14;
  const h = Math.round(size * 1.45);
  const parts = text.split(TOKEN);
  ctx.save();
  ctx.font = `${opts.bold ? "bold " : ""}${size}px ${FONT}`;
  const measure = () => {
    let w = 0;
    parts.forEach((p, i) => {
      if (i % 2) w += tokenGlyph(ctx, p, dev, 0, y, h, false) + 3;
      else w += ctx.measureText(p).width;
    });
    return w;
  };
  const total = measure();
  let cx = opts.align === "center" ? x - total / 2 : opts.align === "right" ? x - total : x;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  parts.forEach((p, i) => {
    if (i % 2) {
      cx += tokenGlyph(ctx, p, dev, cx + 1, y, h, true) + 3;
    } else if (p) {
      ctx.font = `${opts.bold ? "bold " : ""}${size}px ${FONT}`;
      ctx.fillStyle = opts.color ?? UI.text;
      ctx.fillText(p, cx, y);
      cx += ctx.measureText(p).width;
    }
  });
  ctx.restore();
  return total;
}

/** Barra de ayuda inferior con íconos del dispositivo con el que se navega. */
export function drawHintBar(ctx: CanvasRenderingContext2D, app: App, text: string, viewW: number, viewH: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, viewH - 30, viewW, 30);
  ctx.restore();
  drawRich(ctx, text, viewW / 2, viewH - 15, menuDevice(app), { size: 13, color: UI.dim, align: "center" });
}
