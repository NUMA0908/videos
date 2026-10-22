import type { App } from "../app/App";
import { CPU_LEVELS } from "../ai/cpu";
import { CHARACTERS } from "../data/characters";
import { VIEW_H, VIEW_W } from "../render/view";
import { CHAR_STATS } from "../ui/charInfo";
import { drawBackdrop, drawCharacter, drawFooter, drawPanel, drawStat, drawText, drawTitle, UI } from "../ui/ui";
import { nav } from "./nav";
import type { Scene } from "./Scene";

export type SelectMode = "arcade" | "versus" | "vscpu" | "training" | "trial";

const MODE_TITLE: Record<SelectMode, string> = {
  arcade: "ARCADE · ELIGE A TU LUCHADOR",
  versus: "VERSUS · ELEGID LUCHADORES",
  vscpu: "VERSUS CPU · ELIGE LUCHADORES",
  training: "ENTRENAMIENTO · TÚ Y EL MUÑECO",
  trial: "TRIAL DE PARRY · ELIGE LUCHADOR",
};

export class CharSelectScene implements Scene {
  readonly kind = "select";
  private cursor: [number, number] = [0, 1];
  private locked: [boolean, boolean] = [false, false];
  /** Modos de un jugador: 0 = eligiendo el propio, 1 = eligiendo el rival, 2 = dificultad (arcade). */
  private step = 0;
  private leaving = 0;
  private flash: [number, number] = [0, 0];

  constructor(readonly app: App, readonly mode: SelectMode) {}

  enter(): void {
    this.app.audio.playMusic("menu");
  }

  private get twoPlayers(): boolean {
    return this.mode === "versus";
  }

  private get needsOpponentPick(): boolean {
    return this.mode === "vscpu" || this.mode === "training";
  }

  update(): void {
    if (this.leaving > 0) {
      if (--this.leaving === 0) this.go();
      return;
    }
    for (const side of [0, 1] as const) if (this.flash[side] > 0) this.flash[side]--;
    if (this.twoPlayers) {
      for (const p of [0, 1] as const) this.handle(p, this.app.input.menuFor(p), p);
      if (this.locked[0] && this.locked[1]) this.leaving = 30;
      return;
    }
    const m = this.app.input.menu();
    if (this.step === 2) {
      // Dificultad de la CPU (arcade)
      if (m.left || m.right) {
        const n = CPU_LEVELS.length;
        this.app.settings.cpuLevel = ((this.app.settings.cpuLevel + (m.right ? 1 : n - 1)) % n) as 0 | 1 | 2;
        this.app.audio.play("select");
      }
      if (m.confirm) {
        this.app.saveSettings();
        this.app.audio.play("confirm");
        this.leaving = 20;
      }
      if (m.back) {
        this.step = 0;
        this.locked[0] = false;
      }
      return;
    }
    const slot: 0 | 1 = this.step === 1 ? 1 : 0;
    this.handle(0, m, slot);
  }

  /** Procesa la entrada del jugador `p` moviendo el cursor `slot`. */
  private handle(p: 0 | 1, m: ReturnType<App["input"]["menu"]>, slot: 0 | 1): void {
    if (m.back) {
      this.app.audio.play("back");
      if (this.locked[slot]) this.locked[slot] = false;
      else if (slot === 1 && !this.twoPlayers) {
        this.step = 0;
        this.locked[0] = false;
      } else nav.title(this.app);
      return;
    }
    if (this.locked[slot]) return;
    const n = CHARACTERS.length;
    if (m.left) {
      this.cursor[slot] = (this.cursor[slot] + n - 1) % n;
      this.app.audio.play("select");
    }
    if (m.right) {
      this.cursor[slot] = (this.cursor[slot] + 1) % n;
      this.app.audio.play("select");
    }
    if (m.confirm) {
      this.locked[slot] = true;
      this.flash[slot] = 14;
      this.app.audio.play("confirm");
      void p;
      if (!this.twoPlayers) {
        if (this.mode === "trial") this.leaving = 20;
        else if (this.mode === "arcade") this.step = 2;
        else if (this.step === 0 && this.needsOpponentPick) this.step = 1;
        else this.leaving = 24;
      }
    }
  }

  private go(): void {
    const a = this.app;
    const c0 = CHARACTERS[this.cursor[0]].id;
    const c1 = CHARACTERS[this.cursor[1]].id;
    switch (this.mode) {
      case "trial":
        nav.trial(a, c0);
        break;
      case "arcade": {
        const others = CHARACTERS.map((c) => c.id).filter((id) => id !== c0);
        const level = a.settings.cpuLevel;
        nav.match(a, {
          mode: "arcade",
          chars: [c0, others[0]],
          stage: "muelle",
          p2: "cpu",
          cpuLevel: level,
          arcade: { ladder: [...others, c0], stages: ["muelle", "azotea", "plaza"], index: 0, level },
        });
        break;
      }
      case "versus":
        nav.stage(a, { mode: "versus", chars: [c0, c1], p2: "human" });
        break;
      case "vscpu":
        nav.stage(a, { mode: "versus", chars: [c0, c1], p2: "cpu", cpuLevel: a.settings.cpuLevel });
        break;
      case "training":
        nav.stage(a, { mode: "training", chars: [c0, c1], p2: "dummy" });
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const time = this.app.time;
    drawBackdrop(ctx, time);
    drawTitle(ctx, MODE_TITLE[this.mode], 34, 30);

    const showP2 = this.twoPlayers || this.needsOpponentPick;
    const same = showP2 && this.cursor[0] === this.cursor[1];
    // Vista previa grande
    this.preview(ctx, 0, 170, false);
    if (showP2) this.preview(ctx, 1, VIEW_W - 170, same);

    // Tarjetas
    const cw = 118;
    const x0 = VIEW_W / 2 - ((CHARACTERS.length - 1) * (cw + 14)) / 2;
    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * (cw + 14);
      const y = 300;
      drawPanel(ctx, x - cw / 2, y - 70, cw, 140, 0.85);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x - cw / 2, y - 70, cw, 140, 10);
      ctx.clip();
      ctx.fillStyle = CHAR_STATS[c.id].color + "33";
      ctx.fillRect(x - cw / 2, y - 70, cw, 140);
      drawCharacter(ctx, c.id, "stance", x, y + 98, 0.78, 1);
      ctx.restore();
      drawText(ctx, c.nickname, x, y + 56, { size: 16, align: "center", bold: true, stroke: true });
      const sel0 = this.cursor[0] === i;
      const sel1 = showP2 && this.cursor[1] === i;
      if (sel0 || sel1) {
        ctx.save();
        ctx.lineWidth = 4;
        if (sel0) {
          ctx.strokeStyle = this.locked[0] ? "#ffffff" : "#3fa9ff";
          ctx.strokeRect(x - cw / 2 - 3, y - 73, cw + 6, 146);
          drawText(ctx, this.twoPlayers ? "J1" : "TÚ", x - cw / 2 + 4, y - 84, { size: 14, color: "#3fa9ff", bold: true, stroke: true });
        }
        if (sel1) {
          ctx.strokeStyle = this.locked[1] ? "#ffffff" : "#ff5a4a";
          ctx.strokeRect(x - cw / 2 - 8, y - 78, cw + 16, 156);
          const tag = this.mode === "versus" ? "J2" : this.mode === "training" ? "MUÑECO" : "CPU";
          drawText(ctx, tag, x + cw / 2 - 4, y - 84, { size: 14, color: "#ff5a4a", bold: true, align: "right", stroke: true });
        }
        ctx.restore();
      }
    });

    // Instrucción del paso actual
    let msg = "←→ elegir · Enter/J confirmar · Esc/K volver";
    if (this.twoPlayers) msg = "J1: A/D + J · J2: ←/→ + Num4 · Esc volver";
    else if (this.step === 1) msg = this.mode === "training" ? "Ahora elige al MUÑECO (←→, Enter)" : "Ahora elige al rival de la CPU (←→, Enter)";
    if (this.step === 2) {
      drawPanel(ctx, VIEW_W / 2 - 170, 400, 340, 70, 0.9);
      drawText(ctx, "Dificultad de la CPU", VIEW_W / 2, 420, { size: 15, color: UI.dim, align: "center" });
      drawText(ctx, `◀ ${CPU_LEVELS[this.app.settings.cpuLevel].name} ▶`, VIEW_W / 2, 448, { size: 24, color: UI.accent, align: "center", bold: true });
      msg = "←→ cambiar · Enter empezar";
    }
    drawFooter(ctx, msg);
    if (this.leaving > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - this.leaving / 30})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private preview(ctx: CanvasRenderingContext2D, slot: 0 | 1, x: number, alt: boolean): void {
    const c = CHARACTERS[this.cursor[slot]];
    const st = CHAR_STATS[c.id];
    const facing = slot === 0 ? 1 : -1;
    const pose = this.locked[slot] ? "win" : "stance";
    if (this.flash[slot] > 0) drawCharacter(ctx, c.id, pose, x, 452, 1.55, facing, alt, "#ffffff");
    else drawCharacter(ctx, c.id, pose, x, 452, 1.55, facing, alt);
    const px = slot === 0 ? 14 : VIEW_W - 254;
    drawPanel(ctx, px, 62, 240, 168, 0.82);
    drawText(ctx, c.nickname, px + 14, 84, { size: 26, impact: true, color: st.color });
    drawText(ctx, `${c.name} · ${c.archetype}`, px + 14, 108, { size: 13, color: UI.dim });
    drawStat(ctx, "Vida", st.vida, px + 14, 130, st.color);
    drawStat(ctx, "Velocidad", st.velocidad, px + 14, 148, st.color);
    drawStat(ctx, "Daño", st.dano, px + 14, 166, st.color);
    drawStat(ctx, "Alcance", st.alcance, px + 14, 184, st.color);
    drawStat(ctx, "Dificultad", st.dificultad, px + 14, 202, st.color);
    const words = c.description;
    drawText(ctx, words.length > 40 ? words.slice(0, 40) + "…" : words, px + 14, 220, { size: 11, color: UI.text });
  }
}
