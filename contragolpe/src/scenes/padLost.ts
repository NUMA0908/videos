import type { App } from "../app/App";
import { VIEW_W } from "../render/view";
import { drawPanel, drawText, UI } from "../ui/ui";

/**
 * Vigila los mandos de los jugadores humanos durante una partida. Si uno se desconecta, la escena se pausa
 * y muestra el aviso hasta que el mando vuelva (recupera su jugador solo) o se pulse una tecla (ese jugador
 * sigue con teclado).
 */
export class PadLostWatcher {
  /** Jugador cuyo mando se perdió (null = todo bien). */
  lost: 0 | 1 | null = null;

  constructor(private readonly app: App) {}

  /**
   * Llamar al principio de cada tick. Devuelve true el tick en que se pierde un mando (la escena abre su pausa).
   * `humans`: jugadores controlados por personas.
   */
  update(humans: readonly (0 | 1)[]): boolean {
    const input = this.app.input;
    if (this.lost !== null) {
      if (!input.isLost(this.lost)) this.lost = null; // reconectado: recupera su jugador
      else if (input.anyKeyPressed()) {
        input.releaseToKeyboard(this.lost);
        this.lost = null;
        input.consume(); // la tecla solo quita el aviso
      }
      return false;
    }
    for (const p of humans) {
      if (input.isLost(p)) {
        this.lost = p;
        return true;
      }
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.lost === null) return;
    drawPanel(ctx, VIEW_W / 2 - 330, 60, 660, 84, 0.97);
    drawText(ctx, `Mando desconectado (J${this.lost + 1})`, VIEW_W / 2, 88, { size: 22, align: "center", bold: true, color: "#ff8a7a" });
    drawText(ctx, "Reconéctalo o presiona una tecla para continuar con teclado", VIEW_W / 2, 120, { size: 16, align: "center", color: UI.text });
  }
}
