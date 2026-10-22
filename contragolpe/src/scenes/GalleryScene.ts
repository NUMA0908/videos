import type { App } from "../app/App";
import { CHARACTERS } from "../data/characters";
import "../render/movePoses";
import { getPose, POSES } from "../render/poses";
import { drawFighterBody, resolvePalette, solve } from "../render/skeleton";
import { FONT, VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "./Scene";

/** Herramienta de arte: muestra todas las poses en cuadrícula (?modo=galeria&pj=rayo&pag=0). */
export class GalleryScene implements Scene {
  private page = 0;
  private charIdx = 0;
  constructor(readonly app: App, charId: string, page: number) {
    this.charIdx = Math.max(0, CHARACTERS.findIndex((c) => c.id === charId));
    this.page = page;
  }

  private keys(): string[] {
    const id = CHARACTERS[this.charIdx].id;
    return Object.keys(POSES).filter((k) => !k.includes(".") || k.startsWith(`${id}.`));
  }

  update(): void {
    const i = this.app.input;
    if (i.keyPressed("ArrowRight")) this.page++;
    if (i.keyPressed("ArrowLeft")) this.page = Math.max(0, this.page - 1);
    if (i.keyPressed("ArrowDown")) this.charIdx = (this.charIdx + 1) % CHARACTERS.length;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#26283a";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const ch = CHARACTERS[this.charIdx];
    const pal = resolvePalette(ch.look, false);
    const keys = this.keys();
    const cols = 6;
    const rows = 3;
    const per = cols * rows;
    const start = this.page * per;
    keys.slice(start, start + per).forEach((k, n) => {
      const cx = 80 + (n % cols) * 160;
      const gy = 165 + Math.floor(n / cols) * 178;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.moveTo(cx - 70, gy);
      ctx.lineTo(cx + 70, gy);
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, gy);
      ctx.scale(0.78, 0.78);
      drawFighterBody(ctx, solve(getPose(k), ch.look), ch.look, pal, { flash: 0 });
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(k, cx, gy + 14);
    });
    ctx.fillStyle = "#ffd23f";
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(`${ch.nickname} · página ${this.page + 1}/${Math.ceil(keys.length / per)} (← → página, ↓ personaje)`, 10, 18);
  }
}
