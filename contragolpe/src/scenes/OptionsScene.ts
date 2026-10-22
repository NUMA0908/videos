import type { App } from "../app/App";
import { CPU_LEVELS } from "../ai/cpu";
import { defaultSettings } from "../app/settings";
import { TUNING, type ParryDifficulty } from "../data/tuning";
import { ACTION_LABEL, ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, keyName, padName, type Action } from "../input/bindings";
import { VIEW_W } from "../render/view";
import { drawBackdrop, drawFooter, drawMenu, drawPanel, drawText, drawTitle, UI, type MenuItem } from "../ui/ui";
import type { Scene } from "./Scene";

interface Opt extends MenuItem {
  change?: (dir: 1 | -1) => void;
  act?: () => void;
}

const PARRY_LABEL: Record<ParryDifficulty, string> = {
  easy: `Fácil (${TUNING.parry.windows.easy} f)`,
  normal: `Normal (${TUNING.parry.windows.normal} f)`,
  hardcore: `Hardcore (${TUNING.parry.windows.hardcore} f)`,
};
const PARRY_ORDER: ParryDifficulty[] = ["easy", "normal", "hardcore"];
const pct = (v: number) => `${Math.round(v * 100)} %`;

export class OptionsScene implements Scene {
  readonly kind = "options";
  private sel = 0;
  private controlsFor: 0 | 1 | null = null;
  private ctrlSel = 0;
  private waiting = false;

  constructor(
    readonly app: App,
    readonly back: () => void,
  ) {}

  private items(): Opt[] {
    const s = this.app.settings;
    const vol = (key: "musicVolume" | "sfxVolume") => (dir: 1 | -1) => {
      s[key] = Math.round(Math.max(0, Math.min(1, s[key] + dir * 0.1)) * 10) / 10;
      this.app.audio.setVolumes(s.sfxVolume, s.musicVolume);
    };
    return [
      { label: "Volumen de la música", value: pct(s.musicVolume), change: vol("musicVolume") },
      { label: "Volumen de efectos", value: pct(s.sfxVolume), change: vol("sfxVolume") },
      {
        label: "Dificultad del parry",
        value: PARRY_LABEL[s.parry],
        change: (d) => (s.parry = PARRY_ORDER[(PARRY_ORDER.indexOf(s.parry) + d + 3) % 3]),
        hint: "Ventana para acertar el parry. Normal = 8 frames (~133 ms).",
      },
      {
        label: "Inputs simplificados (botón SP)",
        value: s.simple ? "Sí" : "No",
        change: () => (s.simple = !s.simple),
        hint: "SP = proyectil · SP+↓ anti-aéreo · SP+→ avance · SP+← otro especial. Los motion inputs siguen funcionando.",
      },
      { label: "Dificultad de la CPU", value: CPU_LEVELS[s.cpuLevel].name, change: (d) => (s.cpuLevel = ((s.cpuLevel + d + 3) % 3) as 0 | 1 | 2) },
      { label: "Sacudida de pantalla", value: s.shake ? "Sí" : "No", change: () => (s.shake = !s.shake), hint: "Accesibilidad: desactívala si te marea." },
      { label: "Destellos", value: s.flashes ? "Sí" : "No", change: () => (s.flashes = !s.flashes), hint: "Accesibilidad: sin destellos de pantalla ni flash blanco en los golpes." },
      { label: "Controles del Jugador 1", act: () => this.openControls(0) },
      { label: "Controles del Jugador 2", act: () => this.openControls(1) },
      {
        label: "Restaurar valores por defecto",
        act: () => {
          const d = defaultSettings();
          Object.assign(s, d);
          this.app.input.keys = s.keys;
          this.app.input.pads = s.pads;
          this.app.audio.setVolumes(s.sfxVolume, s.musicVolume);
        },
      },
      { label: "Volver", act: () => this.leave() },
    ];
  }

  private openControls(p: 0 | 1): void {
    this.controlsFor = p;
    this.ctrlSel = 0;
  }

  private leave(): void {
    this.app.saveSettings();
    this.back();
  }

  update(): void {
    if (this.waiting) return;
    const m = this.app.input.menu();
    if (this.controlsFor !== null) {
      this.updateControls(m);
      return;
    }
    const items = this.items();
    if (m.up) this.sel = (this.sel + items.length - 1) % items.length;
    if (m.down) this.sel = (this.sel + 1) % items.length;
    if (m.up || m.down) this.app.audio.play("select");
    const it = items[this.sel];
    if ((m.left || m.right) && it.change) {
      it.change(m.right ? 1 : -1);
      this.app.audio.play("select");
    }
    if (m.confirm) {
      this.app.audio.play("confirm");
      if (it.act) it.act();
      else it.change?.(1);
    }
    if (m.back) this.leave();
  }

  private updateControls(m: ReturnType<App["input"]["menu"]>): void {
    const p = this.controlsFor as 0 | 1;
    const rows = ACTIONS.length + 2;
    if (m.up) this.ctrlSel = (this.ctrlSel + rows - 1) % rows;
    if (m.down) this.ctrlSel = (this.ctrlSel + 1) % rows;
    if (m.back) {
      this.controlsFor = null;
      this.app.saveSettings();
      return;
    }
    if (!m.confirm) return;
    if (this.ctrlSel === ACTIONS.length) {
      // Restaurar los de este jugador
      this.app.settings.keys[p] = structuredClone(DEFAULT_KEYS[p]);
      this.app.settings.pads[p] = structuredClone(DEFAULT_PAD);
      this.app.input.keys = this.app.settings.keys;
      this.app.input.pads = this.app.settings.pads;
      return;
    }
    if (this.ctrlSel === ACTIONS.length + 1) {
      this.controlsFor = null;
      this.app.saveSettings();
      return;
    }
    const action: Action = ACTIONS[this.ctrlSel];
    this.waiting = true;
    // La tecla de confirmar sigue pulsada: esperamos al siguiente evento.
    setTimeout(() => {
      this.app.input.captureNext((code, pad) => {
        this.waiting = false;
        if (code) {
          // Quitar esa tecla de cualquier otra acción del mismo jugador para evitar conflictos.
          for (const a of ACTIONS) this.app.settings.keys[p][a] = this.app.settings.keys[p][a].filter((c) => c !== code);
          this.app.settings.keys[p][action] = [code];
        } else if (pad !== null) {
          for (const a of ACTIONS) this.app.settings.pads[p][a] = this.app.settings.pads[p][a].filter((b) => b !== pad);
          this.app.settings.pads[p][action] = [pad];
        }
        this.app.input.keys = this.app.settings.keys;
        this.app.input.pads = this.app.settings.pads;
        this.app.saveSettings();
      });
    }, 120);
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    if (this.controlsFor !== null) {
      this.renderControls(ctx);
      return;
    }
    drawTitle(ctx, "OPCIONES", 44, 38);
    const items = this.items();
    drawPanel(ctx, VIEW_W / 2 - 300, 80, 600, items.length * 36 + 24, 0.85);
    drawMenu(ctx, items, this.sel, VIEW_W / 2 - 270, 110, 540, this.app.time, 36);
    drawFooter(ctx, "↑↓ elegir · ←→ cambiar · Enter confirmar · Esc guardar y volver");
  }

  private renderControls(ctx: CanvasRenderingContext2D): void {
    const p = this.controlsFor as 0 | 1;
    drawTitle(ctx, `CONTROLES · JUGADOR ${p + 1}`, 40, 34);
    const keys = this.app.settings.keys[p];
    const pads = this.app.settings.pads[p];
    const items: MenuItem[] = ACTIONS.map((a) => ({ label: ACTION_LABEL[a], value: `${keys[a].map(keyName).join(", ") || "—"}  ·  ${pads[a].map(padName).join(", ") || "—"}` }));
    items.push({ label: "Restaurar controles de este jugador" }, { label: "Volver" });
    drawPanel(ctx, VIEW_W / 2 - 320, 70, 640, items.length * 34 + 22, 0.85);
    drawMenu(ctx, items, this.ctrlSel, VIEW_W / 2 - 290, 98, 580, this.app.time, 34);
    if (this.waiting) {
      drawPanel(ctx, VIEW_W / 2 - 220, 220, 440, 90, 0.95);
      drawText(ctx, `Pulsa una tecla o botón para`, VIEW_W / 2, 248, { size: 16, align: "center" });
      drawText(ctx, ACTION_LABEL[ACTIONS[this.ctrlSel]], VIEW_W / 2, 276, { size: 20, align: "center", bold: true, color: UI.accent });
      drawText(ctx, "(Esc cancela)", VIEW_W / 2, 298, { size: 12, align: "center", color: UI.dim });
    }
    drawFooter(ctx, "Enter: cambiar la tecla/botón · Esc volver · Gatillos del mando: LT = agarre, RT = súper");
  }
}
