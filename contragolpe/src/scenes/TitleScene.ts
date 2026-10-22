import type { App } from "../app/App";
import { CHARACTERS } from "../data/characters";
import { FONT_IMPACT, VIEW_H, VIEW_W } from "../render/view";
import { drawBackdrop, drawCharacter, drawFooter, drawMenu, drawText, UI, type MenuItem } from "../ui/ui";
import { nav } from "./nav";
import type { Scene } from "./Scene";

const ITEMS: (MenuItem & { go: (app: App) => void })[] = [
  { label: "Arcade", hint: "Tres combates seguidos contra la CPU.", go: (a) => nav.select(a, "arcade") },
  { label: "Versus (2 jugadores)", hint: "J1 contra J2 en el mismo teclado o con mandos.", go: (a) => nav.select(a, "versus") },
  { label: "Versus contra CPU", hint: "Un combate libre eligiendo personajes y escenario.", go: (a) => nav.select(a, "vscpu") },
  { label: "Entrenamiento", hint: "Frame data, cajas, historial de inputs, muñeco configurable y grabación.", go: (a) => nav.select(a, "training") },
  { label: "Trial de parry", hint: "Aprende el parry paso a paso con lecciones guiadas.", go: (a) => nav.select(a, "trial") },
  { label: "Lista de movimientos", hint: "Todos los golpes de cada personaje.", go: (a) => nav.moveList(a, "rayo", () => nav.title(a, 5)) },
  { label: "Opciones", hint: "Controles, volumen, dificultad del parry y accesibilidad.", go: (a) => nav.options(a, () => nav.title(a, 6)) },
];

export class TitleScene implements Scene {
  readonly kind = "title";
  private sel: number;
  private t = 0;
  constructor(readonly app: App, index = 0) {
    this.sel = index;
  }

  enter(): void {
    this.app.audio.playMusic("menu");
  }

  update(): void {
    this.t++;
    const m = this.app.input.menu();
    if (m.up) {
      this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
      this.app.audio.play("select");
    }
    if (m.down) {
      this.sel = (this.sel + 1) % ITEMS.length;
      this.app.audio.play("select");
    }
    if (m.confirm) {
      this.app.audio.play("confirm");
      ITEMS[this.sel].go(this.app);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const time = this.app.time;
    drawBackdrop(ctx, time);
    // Los tres luchadores en silueta de color detrás del menú
    CHARACTERS.forEach((c, i) => {
      const x = 640 + i * 110;
      const bob = Math.sin(time * 2 + i) * 3;
      drawCharacter(ctx, c.id, "stance", x, 440 + bob, 1.45, -1, false);
    });
    ctx.fillStyle = "rgba(11,13,31,0.35)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Logotipo
    ctx.save();
    ctx.translate(262, 92);
    ctx.rotate(-0.04);
    ctx.font = `64px ${FONT_IMPACT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#000";
    ctx.strokeText("CONTRAGOLPE", 0, 0);
    const g = ctx.createLinearGradient(0, -36, 0, 36);
    g.addColorStop(0, "#fff7c2");
    g.addColorStop(0.5, UI.accent);
    g.addColorStop(1, "#ff7a1a");
    ctx.fillStyle = g;
    ctx.fillText("CONTRAGOLPE", 0, 0);
    // Rayo
    ctx.fillStyle = UI.cyan;
    ctx.beginPath();
    const bx = 186 + Math.sin(time * 3) * 2;
    ctx.moveTo(bx, -54);
    ctx.lineTo(bx - 20, -6);
    ctx.lineTo(bx - 4, -6);
    ctx.lineTo(bx - 16, 34);
    ctx.lineTo(bx + 16, -16);
    ctx.lineTo(bx, -16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawText(ctx, "Juego de peleas 2D · parry, combos y mucho contragolpe", 262, 140, { size: 15, color: UI.dim, align: "center" });

    drawMenu(ctx, ITEMS, this.sel, 80, 205, 330, time, 40);
    drawFooter(ctx, "↑↓ elegir · Enter / J confirmar · F1 debug en combate · F3 FPS");
  }
}
