import type { App } from "../app/App";
import { Camera } from "../render/camera";
import { STAGES } from "../render/stages";
import { VIEW_H, VIEW_W } from "../render/view";
import { drawBackdrop, drawFooter, drawText, drawTitle, UI } from "../ui/ui";
import type { MatchSetup } from "./MatchScene";
import { nav } from "./nav";
import type { Scene } from "./Scene";

/** Miniaturas dibujadas una sola vez en lienzos aparte. */
const thumbs = new Map<string, HTMLCanvasElement>();

function thumbnail(id: string): HTMLCanvasElement {
  const cached = thumbs.get(id);
  if (cached) return cached;
  const stage = STAGES.find((s) => s.id === id)!;
  const c = document.createElement("canvas");
  c.width = VIEW_W / 2;
  c.height = VIEW_H / 2;
  const ctx = c.getContext("2d")!;
  ctx.scale(0.5, 0.5);
  const cam = new Camera();
  stage.drawBack(ctx, cam, 3);
  stage.drawFront?.(ctx, cam, 3);
  thumbs.set(id, c);
  return c;
}

export class StageSelectScene implements Scene {
  private sel = 0;
  constructor(readonly app: App, readonly setup: Omit<MatchSetup, "stage">) {}

  update(): void {
    const m = this.app.input.menu();
    const n = STAGES.length + 1;
    if (m.left || m.up) {
      this.sel = (this.sel + n - 1) % n;
      this.app.audio.play("select");
    }
    if (m.right || m.down) {
      this.sel = (this.sel + 1) % n;
      this.app.audio.play("select");
    }
    if (m.back) {
      this.app.audio.play("back");
      nav.select(this.app, this.setup.mode === "training" ? "training" : this.setup.p2 === "cpu" ? "vscpu" : "versus");
      return;
    }
    if (m.confirm) {
      this.app.audio.play("confirm");
      const idx = this.sel === STAGES.length ? Math.floor(Math.random() * STAGES.length) : this.sel;
      nav.match(this.app, { ...this.setup, stage: STAGES[idx].id });
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    drawTitle(ctx, "ELIGE ESCENARIO", 40, 32);
    const w = 400;
    const h = 225;
    const cur = this.sel < STAGES.length ? STAGES[this.sel] : null;
    if (cur) {
      ctx.drawImage(thumbnail(cur.id), VIEW_W / 2 - w / 2, 80, w, h);
    } else {
      ctx.fillStyle = "#202040";
      ctx.fillRect(VIEW_W / 2 - w / 2, 80, w, h);
      drawText(ctx, "?", VIEW_W / 2, 80 + h / 2, { size: 90, align: "center", impact: true, color: UI.accent });
    }
    ctx.strokeStyle = UI.accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(VIEW_W / 2 - w / 2, 80, w, h);
    drawText(ctx, cur ? cur.name : "Aleatorio", VIEW_W / 2, 330, { size: 26, align: "center", impact: true });
    drawText(ctx, cur ? cur.place : "Que decida la suerte", VIEW_W / 2, 356, { size: 14, align: "center", color: UI.dim });
    const n = STAGES.length + 1;
    for (let i = 0; i < n; i++) {
      const x = VIEW_W / 2 - ((n - 1) * 170) / 2 + i * 170;
      const y = 430;
      if (i < STAGES.length) ctx.drawImage(thumbnail(STAGES[i].id), x - 75, y - 42, 150, 84);
      else {
        ctx.fillStyle = "#202040";
        ctx.fillRect(x - 75, y - 42, 150, 84);
        drawText(ctx, "?", x, y, { size: 40, align: "center", impact: true, color: UI.accent });
      }
      ctx.strokeStyle = i === this.sel ? UI.accent : "rgba(255,255,255,0.25)";
      ctx.lineWidth = i === this.sel ? 4 : 2;
      ctx.strokeRect(x - 75, y - 42, 150, 84);
    }
    drawFooter(ctx, "←→ elegir · Enter confirmar · Esc volver");
  }
}
