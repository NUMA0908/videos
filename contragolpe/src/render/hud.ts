import { getChar } from "../data/characters";
import { TUNING } from "../data/tuning";
import type { GameState, Side } from "../sim/types";
import { FONT, FONT_IMPACT, VIEW_H, VIEW_W } from "./view";

interface ComboView {
  hits: number;
  damage: number;
  /** Frames que sigue visible tras terminar. */
  linger: number;
  counter: number;
  active: boolean;
}

interface Popup {
  text: string;
  color: string;
  side: Side;
  life: number;
  max: number;
}

/** Estado propio del HUD (rastro de daño, contador de combo): presentación, no simulación. */
export class Hud {
  private trail: [number, number] = [1, 1];
  private trailDelay: [number, number] = [0, 0];
  private combo: [ComboView, ComboView] = [
    { hits: 0, damage: 0, linger: 0, counter: 0, active: false },
    { hits: 0, damage: 0, linger: 0, counter: 0, active: false },
  ];
  private popups: Popup[] = [];
  private banner: { text: string; sub: string; life: number; max: number; color: string } | null = null;
  /** Nombres a mostrar (p. ej. "CPU"). */
  labels: [string, string] = ["J1", "J2"];
  showTimer = true;

  reset(s: GameState): void {
    this.trail = [1, 1];
    for (const c of this.combo) Object.assign(c, { hits: 0, damage: 0, linger: 0, active: false, counter: 0 });
    this.popups = [];
    this.banner = null;
    void s;
  }

  popup(side: Side, text: string, color: string, frames = 60): void {
    this.popups.push({ side, text, color, life: frames, max: frames });
  }

  setBanner(text: string, sub = "", frames = 90, color = "#ffd23f"): void {
    this.banner = { text, sub, life: frames, max: frames, color };
  }

  /** Un tick: lee los eventos de la simulación. */
  update(s: GameState): void {
    for (const side of [0, 1] as const) {
      const f = s.fighters[side];
      const ratio = f.health / f.maxHealth;
      if (ratio < this.trail[side]) {
        if (this.trailDelay[side] > 0) this.trailDelay[side]--;
        else this.trail[side] = Math.max(ratio, this.trail[side] - 0.006);
      } else {
        this.trail[side] = ratio;
      }
    }
    for (const e of s.events) {
      if (e.type === "hit") {
        const def = (1 - e.side) as Side;
        this.trailDelay[def] = 40;
        const c = this.combo[e.side];
        if (!c.active) {
          c.hits = 0;
          c.damage = 0;
        }
        c.active = true;
        c.hits = s.fighters[def].comboHits;
        c.damage = s.fighters[def].comboDamage;
        c.linger = 70;
        if (e.counter) {
          c.counter = 50;
          this.popup(e.side, "COUNTER", "#ff5a3c", 50);
        }
      } else if (e.type === "round") {
        const final = s.round.wins[0] === s.config.roundsToWin - 1 && s.round.wins[1] === s.config.roundsToWin - 1;
        this.setBanner(final ? "RONDA FINAL" : `RONDA ${s.round.num}`, "", 60);
      } else if (e.type === "fight") {
        this.setBanner("¡PELEA!", "", 45, "#ffffff");
      } else if (e.type === "ko") {
        this.setBanner("K.O.", "", 110, "#ff4b3a");
      } else if (e.type === "timeOver") {
        this.setBanner("¡TIEMPO!", "", 110, "#ffffff");
      } else if (e.type === "roundWin") {
        const name = getChar(s.fighters[e.side].char).nickname;
        this.setBanner(`GANA ${name}`, s.round.perfect ? "¡PERFECTO!" : "", 80, "#ffd23f");
      }
    }
    for (const side of [0, 1] as const) {
      const c = this.combo[side];
      const def = s.fighters[(1 - side) as Side];
      if (c.active && def.comboHits === 0) c.active = false;
      if (!c.active && c.linger > 0) c.linger--;
      if (c.counter > 0) c.counter--;
    }
    this.popups = this.popups.filter((p) => --p.life > 0);
    if (this.banner && --this.banner.life <= 0) this.banner = null;
  }

  draw(ctx: CanvasRenderingContext2D, s: GameState): void {
    ctx.save();
    this.drawBars(ctx, s);
    if (this.showTimer) this.drawTimer(ctx, s);
    this.drawMeters(ctx, s);
    this.drawCombos(ctx);
    this.drawPopups(ctx);
    this.drawBanner(ctx);
    ctx.restore();
  }

  private drawBars(ctx: CanvasRenderingContext2D, s: GameState): void {
    const W = 380;
    const H = 22;
    const top = 22;
    for (const side of [0, 1] as const) {
      const f = s.fighters[side];
      const ch = getChar(f.char);
      const x0 = side === 0 ? 30 : VIEW_W - 30 - W;
      const ratio = f.health / f.maxHealth;
      // Marco
      ctx.fillStyle = "rgba(10,10,20,0.85)";
      ctx.beginPath();
      ctx.roundRect(x0 - 4, top - 4, W + 8, H + 8, 6);
      ctx.fill();
      ctx.fillStyle = "#2a1120";
      ctx.fillRect(x0, top, W, H);
      // Rastro de daño (rojo) y vida (amarillo → naranja al estar baja)
      const trailW = W * this.trail[side];
      const lifeW = W * ratio;
      ctx.fillStyle = "#e0313a";
      if (side === 0) ctx.fillRect(x0, top, trailW, H);
      else ctx.fillRect(x0 + W - trailW, top, trailW, H);
      const grad = ctx.createLinearGradient(0, top, 0, top + H);
      const low = ratio < 0.25;
      grad.addColorStop(0, low ? "#ffb347" : "#fff27a");
      grad.addColorStop(1, low ? "#ff7a1a" : "#f2b705");
      ctx.fillStyle = grad;
      if (side === 0) ctx.fillRect(x0, top, lifeW, H);
      else ctx.fillRect(x0 + W - lifeW, top, lifeW, H);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      if (side === 0) ctx.fillRect(x0, top + 2, lifeW, 4);
      else ctx.fillRect(x0 + W - lifeW, top + 2, lifeW, 4);
      // Nombre
      ctx.font = `bold 16px ${FONT_IMPACT}`;
      ctx.textBaseline = "top";
      ctx.textAlign = side === 0 ? "left" : "right";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      const label = `${ch.nickname}`;
      const nx = side === 0 ? x0 : x0 + W;
      ctx.strokeText(label, nx, top + H + 6);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, nx, top + H + 6);
      const tw = ctx.measureText(label).width + 8;
      ctx.font = `bold 12px ${FONT}`;
      const tag = this.labels[side];
      ctx.strokeText(tag, side === 0 ? nx + tw : nx - tw, top + H + 9);
      ctx.fillStyle = side === 0 ? "#7fd3ff" : "#ff9a8a";
      ctx.fillText(tag, side === 0 ? nx + tw : nx - tw, top + H + 9);
      // Rondas ganadas
      for (let i = 0; i < s.config.roundsToWin; i++) {
        const cx = side === 0 ? x0 + W - 10 - i * 22 : x0 + 10 + i * 22;
        const cy = top + H + 16;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = s.round.wins[side] > i ? "#ffd23f" : "rgba(0,0,0,0.6)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  private drawTimer(ctx: CanvasRenderingContext2D, s: GameState): void {
    const secs = s.config.timer ? Math.ceil(s.round.timer / 60) : 99;
    ctx.fillStyle = "rgba(10,10,20,0.9)";
    ctx.beginPath();
    ctx.roundRect(VIEW_W / 2 - 34, 12, 68, 50, 8);
    ctx.fill();
    ctx.font = `40px ${FONT_IMPACT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = s.config.timer ? (secs <= 10 ? "#ff5a3c" : "#ffffff") : "#7fd3ff";
    ctx.fillText(s.config.timer ? String(secs).padStart(2, "0") : "∞", VIEW_W / 2, 39);
  }

  private drawMeters(ctx: CanvasRenderingContext2D, s: GameState): void {
    const W = 220;
    const H = 12;
    const y = VIEW_H - 30;
    for (const side of [0, 1] as const) {
      const f = s.fighters[side];
      const x0 = side === 0 ? 30 : VIEW_W - 30 - W;
      const k = f.meter / TUNING.meter.max;
      ctx.fillStyle = "rgba(10,10,20,0.85)";
      ctx.beginPath();
      ctx.roundRect(x0 - 3, y - 3, W + 6, H + 6, 5);
      ctx.fill();
      const full = k >= 1;
      const g = ctx.createLinearGradient(x0, 0, x0 + W, 0);
      g.addColorStop(0, full ? "#ffe066" : "#2f8cff");
      g.addColorStop(1, full ? "#ff9f1a" : "#74e1ff");
      ctx.fillStyle = g;
      if (side === 0) ctx.fillRect(x0, y, W * k, H);
      else ctx.fillRect(x0 + W * (1 - k), y, W * k, H);
      // Marcas de cuarto (el red parry cuesta un cuarto)
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + (W * i) / 4, y);
        ctx.lineTo(x0 + (W * i) / 4, y + H);
        ctx.stroke();
      }
      ctx.font = `bold 13px ${FONT_IMPACT}`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = side === 0 ? "left" : "right";
      ctx.fillStyle = full ? "#ffe066" : "#9fdcff";
      const label = full ? "SÚPER ¡LISTO!" : "SÚPER";
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeText(label, side === 0 ? x0 : x0 + W, y - 4);
      ctx.fillText(label, side === 0 ? x0 : x0 + W, y - 4);
    }
  }

  private drawCombos(ctx: CanvasRenderingContext2D): void {
    for (const side of [0, 1] as const) {
      const c = this.combo[side];
      if (c.hits < 2 || (!c.active && c.linger <= 0)) continue;
      const alpha = c.active ? 1 : Math.min(1, c.linger / 20);
      const x = side === 0 ? 40 : VIEW_W - 40;
      ctx.globalAlpha = alpha;
      ctx.textAlign = side === 0 ? "left" : "right";
      ctx.textBaseline = "top";
      ctx.font = `46px ${FONT_IMPACT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(`${c.hits}`, x, 150);
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(`${c.hits}`, x, 150);
      const w = ctx.measureText(`${c.hits}`).width;
      ctx.font = `22px ${FONT_IMPACT}`;
      const hx = side === 0 ? x + w + 6 : x - w - 6;
      ctx.strokeText("GOLPES", hx, 168);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("GOLPES", hx, 168);
      ctx.font = `bold 14px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeText(`${c.damage} de daño`, x, 200);
      ctx.fillStyle = "#ffc0a0";
      ctx.fillText(`${c.damage} de daño`, x, 200);
      ctx.globalAlpha = 1;
    }
  }

  private drawPopups(ctx: CanvasRenderingContext2D): void {
    const stacks: [number, number] = [0, 0];
    for (const p of this.popups) {
      const t = 1 - p.life / p.max;
      const x = p.side === 0 ? 40 : VIEW_W - 40;
      const y = 228 + stacks[p.side] * 28 - t * 6;
      stacks[p.side]++;
      ctx.globalAlpha = p.life < 15 ? p.life / 15 : 1;
      ctx.font = `24px ${FONT_IMPACT}`;
      ctx.textAlign = p.side === 0 ? "left" : "right";
      ctx.textBaseline = "top";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    const b = this.banner;
    if (!b) return;
    const t = 1 - b.life / b.max;
    const appear = Math.min(1, t * 6);
    const scale = 1.6 - 0.6 * (1 - Math.pow(1 - appear, 3));
    const alpha = b.life < 12 ? b.life / 12 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(VIEW_W / 2, VIEW_H / 2 - 40);
    ctx.scale(scale, scale);
    ctx.font = `76px ${FONT_IMPACT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(b.text, 0, 0);
    const g = ctx.createLinearGradient(0, -36, 0, 36);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, b.color);
    g.addColorStop(1, b.color);
    ctx.fillStyle = g;
    ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = `34px ${FONT_IMPACT}`;
      ctx.lineWidth = 7;
      ctx.strokeText(b.sub, 0, 62);
      ctx.fillStyle = "#7fd3ff";
      ctx.fillText(b.sub, 0, 62);
    }
    ctx.restore();
  }
}
