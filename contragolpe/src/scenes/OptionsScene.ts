import type { App } from "../app/App";
import { CPU_LEVELS } from "../ai/cpu";
import { defaultSettings } from "../app/settings";
import { TUNING, type ParryDifficulty } from "../data/tuning";
import { ACTION_LABEL, ACTIONS, DEFAULT_KEYS, keyName, type Action } from "../input/bindings";
import { assignKey } from "../input/remap";
import { VIEW_W } from "../render/view";
import { drawBackdrop, drawFooter, drawMenu, drawPanel, drawText, drawTitle, UI, type MenuItem } from "../ui/ui";
import { PadRemapScene } from "./PadRemapScene";
import { PadSettingsScene } from "./PadSettingsScene";
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
  private notice = "";

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
      { label: "Pantalla completa (F11 / Alt+Enter)", act: () => void this.app.toggleFullscreen() },
      { label: "Iniciar en pantalla completa", value: s.startFullscreen ? "Sí" : "No", change: () => (s.startFullscreen = !s.startFullscreen) },
      {
        label: "Escalado por enteros",
        value: s.pixelPerfect ? "Sí" : "No",
        change: () => {
          s.pixelPerfect = !s.pixelPerfect;
          this.app.resize();
        },
        hint: "Solo múltiplos exactos de la resolución del juego (bordes negros, imagen más nítida).",
      },
      {
        label: "Modo bajo consumo",
        value: s.lowPower ? "Sí" : "No",
        change: () => {
          s.lowPower = !s.lowPower;
          this.app.resize();
        },
        hint: "Menos partículas, sin estelas ni brillos y lienzo a resolución 1×. Para portátiles o equipos modestos.",
      },
      { label: "Pausar al perder el foco", value: s.pauseOnBlur ? "Sí" : "No", change: () => (s.pauseOnBlur = !s.pauseOnBlur) },
      { label: "Confirmar al salir en partida", value: s.confirmQuit ? "Sí" : "No", change: () => (s.confirmQuit = !s.confirmQuit), hint: "App de escritorio: pregunta antes de cerrar la ventana en mitad de un combate." },
      {
        label: "Mando: sensibilidad y calibración",
        act: () => this.app.setScene(new PadSettingsScene(this.app, () => this.app.setScene(this))),
        hint: "Zona muerta e histéresis del stick, diagonales y umbral de los gatillos, con vista en vivo.",
      },
      {
        label: "Botones del mando",
        act: () => this.app.setScene(new PadRemapScene(this.app, () => this.app.setScene(this))),
        hint: "Remapeo por tipo de mando (Xbox, PlayStation…) y configuración guiada para mandos no estándar.",
      },
      { label: "Teclado del Jugador 1", act: () => this.openControls(0) },
      { label: "Teclado del Jugador 2", act: () => this.openControls(1) },
      {
        label: "Restaurar valores por defecto",
        act: () => {
          const d = defaultSettings();
          Object.assign(s, d);
          this.app.input.keys = s.keys;
          this.app.input.tuning = s.padTuning;
          this.app.input.profiles = s.padProfiles;
          this.app.resize();
          this.app.audio.setVolumes(s.sfxVolume, s.musicVolume);
        },
      },
      { label: "Volver", act: () => this.leave() },
    ];
  }

  private openControls(p: 0 | 1): void {
    this.notice = "";
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
      this.app.input.keys = this.app.settings.keys;
      this.notice = "Teclado restaurado";
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
      this.app.input.captureNext((code) => {
        this.waiting = false;
        if (!code) return;
        // Conflicto: si la tecla ya era de otra acción, se intercambian (y se avisa).
        const { swappedWith } = assignKey(this.app.settings.keys[p], action, code);
        this.notice = swappedWith ? `${keyName(code)} era de ${ACTION_LABEL[swappedWith]}: intercambiadas` : "";
        this.app.input.keys = this.app.settings.keys;
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
    // Caben 10 filas sobre la línea de ayuda; el resto se desplaza con la selección.
    const rows = Math.min(items.length, 10);
    drawPanel(ctx, VIEW_W / 2 - 300, 80, 600, rows * 36 + 24, 0.85);
    drawMenu(ctx, items, this.sel, VIEW_W / 2 - 270, 110, 540, this.app.time, 36, rows);
    drawFooter(ctx, "↑↓ elegir · ←→ cambiar · Enter confirmar · Esc guardar y volver");
  }

  private renderControls(ctx: CanvasRenderingContext2D): void {
    const p = this.controlsFor as 0 | 1;
    drawTitle(ctx, `TECLADO · JUGADOR ${p + 1}`, 40, 34);
    const keys = this.app.settings.keys[p];
    const items: MenuItem[] = ACTIONS.map((a) => ({ label: ACTION_LABEL[a], value: keys[a].map(keyName).join(", ") || "—" }));
    items.push({ label: "Restaurar controles de este jugador" }, { label: "Volver" });
    drawPanel(ctx, VIEW_W / 2 - 320, 70, 640, items.length * 34 + 22, 0.85);
    drawMenu(ctx, items, this.ctrlSel, VIEW_W / 2 - 290, 98, 580, this.app.time, 34);
    if (this.waiting) {
      drawPanel(ctx, VIEW_W / 2 - 220, 220, 440, 90, 0.95);
      drawText(ctx, `Pulsa una tecla para`, VIEW_W / 2, 248, { size: 16, align: "center" });
      drawText(ctx, ACTION_LABEL[ACTIONS[this.ctrlSel]], VIEW_W / 2, 276, { size: 20, align: "center", bold: true, color: UI.accent });
      drawText(ctx, "(Esc cancela)", VIEW_W / 2, 298, { size: 12, align: "center", color: UI.dim });
    }
    if (this.notice) drawText(ctx, this.notice, VIEW_W / 2, 486, { size: 15, align: "center", color: UI.accent });
    drawFooter(ctx, "Enter: cambiar la tecla · Esc volver · Los botones del mando están en Opciones → Botones del mando");
  }
}
