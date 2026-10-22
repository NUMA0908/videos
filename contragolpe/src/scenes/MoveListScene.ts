import type { App } from "../app/App";
import { CHARACTERS, getChar } from "../data/characters";
import type { MoveData } from "../data/types";
import { blockAdvantage, fmtAdv } from "../sim/frameData";
import { VIEW_H, VIEW_W } from "../render/view";
import { CHAR_STATS, CHAR_TIPS } from "../ui/charInfo";
import { drawBackdrop, drawCharacter, drawFooter, drawPanel, drawText, UI } from "../ui/ui";
import type { Scene } from "./Scene";

function section(moves: MoveData[], kinds: MoveData["kind"][], filter?: (m: MoveData) => boolean): MoveData[] {
  return moves.filter((m) => kinds.includes(m.kind) && (!filter || filter(m)));
}

/** Lista de movimientos de un personaje (se usa a pantalla completa y desde la pausa). */
export function drawMoveList(ctx: CanvasRenderingContext2D, charId: string, withData: boolean): void {
  const ch = getChar(charId);
  const st = CHAR_STATS[charId];
  ctx.fillStyle = "rgba(6,8,22,0.93)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, `${ch.nickname} · LISTA DE MOVIMIENTOS`, 30, 34, { size: 28, impact: true, color: st.color });
  drawText(ctx, `${ch.name} · ${ch.archetype} · Vida ${ch.health}`, 32, 60, { size: 13, color: UI.dim });
  const all = Object.values(ch.moves);
  // Agrupa las versiones L/H del mismo especial en una sola fila.
  const uniq = (ms: MoveData[]) => {
    const seen = new Set<string>();
    return ms.filter((m) => {
      const key = m.name.replace(/\s*\(.*\)$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const groups: [string, MoveData[]][] = [
    ["SÚPER (medidor lleno)", section(all, ["super"])],
    ["ESPECIALES", uniq(section(all, ["special", "throw"], (m) => m.id !== ch.throw))],
    ["AGARRE", all.filter((m) => m.id === ch.throw)],
    ["NORMALES DE COMANDO", (ch.normals.command ?? []).map((c) => ch.moves[c.move])],
  ];
  let y = 92;
  const col = (label: string, x: number, yy: number, color: string = UI.text, size = 14) => drawText(ctx, label, x, yy, { size, color });
  for (const [title, ms] of groups) {
    if (!ms.length) continue;
    col(title, 30, y, UI.accent, 13);
    y += 20;
    for (const m of ms) {
      const notation = m.notation.replace(/ \+ (LP|HP)$/, " + P").replace(/ \+ (LK|HK)$/, " + K");
      col(m.name.replace(/\s*\(.*\)$/, ""), 44, y);
      col(notation, 330, y, UI.cyan);
      if (withData && m.hitboxes.length && m.stance !== "air") col(`S${m.startup} · bloq ${m.knockdown ? "—" : fmtAdv(blockAdvantage(m))}`, 560, y, UI.dim, 12);
      y += 20;
    }
    y += 6;
  }
  // Normales en dos columnas
  col("NORMALES", 30, y, UI.accent, 13);
  y += 20;
  const normals = [
    ...(["LP", "HP", "LK", "HK"] as const).map((b) => ch.moves[ch.normals.stand[b]]),
    ...(["LP", "HP", "LK", "HK"] as const).map((b) => ch.moves[ch.normals.crouch[b]]),
  ];
  normals.forEach((m, i) => {
    const x = i < 4 ? 44 : 360;
    const yy = y + (i % 4) * 18;
    drawText(ctx, `${m.notation}`, x, yy, { size: 12, color: UI.cyan });
    drawText(ctx, `${m.name}${m.guard === "low" ? " (bajo)" : ""}`, x + 62, yy, { size: 12 });
  });
  y += 80;
  const tips = CHAR_TIPS[charId] ?? [];
  drawPanel(ctx, 24, Math.min(y, VIEW_H - 112), 640, 76, 0.8);
  tips.forEach((t, i) => drawText(ctx, `• ${t}`, 36, Math.min(y, VIEW_H - 112) + 18 + i * 20, { size: 12, color: UI.text }));
  drawCharacter(ctx, charId, "win", VIEW_W - 150, VIEW_H - 40, 1.5, -1);
  drawText(ctx, "P = puño (LP/HP) · K = patada (LK/HK) · → = hacia el rival · SP = especial simple", VIEW_W - 20, 36, {
    size: 11,
    color: UI.dim,
    align: "right",
  });
}

export class MoveListScene implements Scene {
  readonly kind = "movelist";
  private idx: number;
  constructor(
    readonly app: App,
    charId: string,
    readonly back: () => void,
  ) {
    this.idx = Math.max(0, CHARACTERS.findIndex((c) => c.id === charId));
  }

  update(): void {
    const m = this.app.input.menu();
    if (m.left) this.idx = (this.idx + CHARACTERS.length - 1) % CHARACTERS.length;
    if (m.right) this.idx = (this.idx + 1) % CHARACTERS.length;
    if (m.left || m.right) this.app.audio.play("select");
    if (m.back || m.confirm) {
      this.app.audio.play("back");
      this.back();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    drawMoveList(ctx, CHARACTERS[this.idx].id, true);
    drawFooter(ctx, "←→ cambiar de personaje · Esc volver");
  }
}
