import type { App } from "../app/App";
import { DEFAULT_PAD_TUNING, PAD_TUNING_LIMITS, sanitizePadTuning, type PadTuning } from "../input/padTuning";
import { drawPadLive } from "../ui/padView";
import { VIEW_H, VIEW_W } from "../render/view";
import { drawHintBar } from "../ui/glyphs";
import { drawBackdrop, drawMenu, drawPanel, drawTitle, type MenuItem } from "../ui/ui";
import type { Scene } from "./Scene";

interface Opt extends MenuItem {
  change?: (dir: 1 | -1) => void;
  act?: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Opciones → Mando: zona muerta, histéresis, diagonales y gatillos, con la vista del stick en vivo. */
export class PadSettingsScene implements Scene {
  readonly kind = "padsettings";
  private sel = 0;

  constructor(
    readonly app: App,
    readonly back: () => void,
  ) {}

  private step(key: keyof PadTuning, delta: number): (dir: 1 | -1) => void {
    return (dir) => {
      const t = this.app.settings.padTuning;
      const [lo, hi] = PAD_TUNING_LIMITS[key];
      t[key] = Math.round(Math.max(lo, Math.min(hi, t[key] + dir * delta)) * 100) / 100;
      // La zona de soltar siempre por debajo de la de activar (si no, no hay histéresis).
      Object.assign(t, sanitizePadTuning(t));
    };
  }

  private items(): Opt[] {
    const t = this.app.settings.padTuning;
    return [
      { label: "Zona muerta del stick", value: pct(t.stickDeadzone), change: this.step("stickDeadzone", 0.05), hint: "Cuánto hay que inclinar el stick para marcar una dirección (círculo amarillo)." },
      { label: "Soltar por debajo de", value: pct(t.stickRelease), change: this.step("stickRelease", 0.05), hint: "Histéresis: la dirección se suelta al volver dentro del círculo discontinuo. Evita parpadeos en el borde." },
      { label: "Amplitud de diagonales", value: `${t.diagonalArc}°`, change: this.step("diagonalArc", 2), hint: "Más grados = diagonales más fáciles (cuartos de círculo cómodos); menos = cardinales más estables." },
      { label: "Margen entre sectores", value: `${t.sectorHysteresis}°`, change: this.step("sectorHysteresis", 1), hint: "Cuánto hay que pasarse de la frontera para cambiar de dirección." },
      { label: "Umbral de gatillos (LT/RT)", value: pct(t.triggerThreshold), change: this.step("triggerThreshold", 0.05), hint: "A partir de qué presión cuentan los gatillos analógicos (línea amarilla)." },
      { label: "Restaurar valores de fábrica", act: () => Object.assign(t, DEFAULT_PAD_TUNING) },
      { label: "Volver", act: () => this.leave() },
    ];
  }

  private leave(): void {
    this.app.saveSettings();
    this.back();
  }

  update(): void {
    // El stick se mueve para ver la zona muerta: aquí el menú solo responde a cruceta y teclado.
    const m = this.app.input.menu(false);
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
    }
    if (m.back) this.leave();
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    drawTitle(ctx, "MANDO: SENSIBILIDAD", 44, 34);
    const items = this.items();
    drawPanel(ctx, 40, 84, 470, items.length * 38 + 22, 0.85);
    drawMenu(ctx, items, this.sel, 70, 112, 410, this.app.time, 38);
    const t = this.app.settings.padTuning;
    drawPanel(ctx, 530, 84, 390, 300, 0.85);
    drawPadLive(ctx, "J1", this.app.input.reader(0), t, 628, 104);
    drawPadLive(ctx, "J2", this.app.input.reader(1), t, 822, 104);
    drawHintBar(ctx, this.app, "{UPDOWN} elegir · {LEFTRIGHT} ajustar · {BACK} volver · el stick solo se muestra (no mueve el menú)", VIEW_W, VIEW_H);
  }
}
