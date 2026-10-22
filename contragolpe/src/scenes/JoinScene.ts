import type { App } from "../app/App";
import { keyName } from "../input/bindings";
import { PadButton } from "../input/gamepad";
import { PAD_KIND_LABEL } from "../input/padKind";
import { VIEW_W } from "../render/view";
import { drawBackdrop, drawFooter, drawPanel, drawText, drawTitle, UI } from "../ui/ui";
import type { Scene } from "./Scene";

type Seat = { kind: "pad"; index: number } | { kind: "keyboard"; set: 0 | 1 } | null;

/**
 * "Presiona un botón para unirte" (Versus de 2 jugadores). El primero que pulsa es J1 y el segundo J2,
 * con cualquier mezcla: dos mandos, teclado + mando o los dos juegos de teclas del teclado.
 * Con mando: A/✕ para unirse, B/○ para salir. Con teclado: Enter/J (teclas de J1) o Num Enter/Num 4 (teclas de J2);
 * quien se une con un juego de teclas lo conserva aunque sea J2.
 */
export class JoinScene implements Scene {
  readonly kind = "join";
  private seats: [Seat, Seat] = [null, null];
  private ready = 0;

  constructor(
    readonly app: App,
    readonly onDone: () => void,
    readonly onBack: () => void,
  ) {}

  enter(): void {
    const input = this.app.input;
    input.joinMode = "manual";
    input.unassign(0);
    input.unassign(1);
    input.keySet[0] = 0;
    input.keySet[1] = 1;
  }

  exit(): void {
    this.app.input.joinMode = "press";
  }

  private freeSeat(): 0 | 1 | null {
    return this.seats[0] === null ? 0 : this.seats[1] === null ? 1 : null;
  }

  private keyboardSeated(set: 0 | 1): number {
    return this.seats.findIndex((s) => s?.kind === "keyboard" && s.set === set);
  }

  private sit(seat: 0 | 1, who: Exclude<Seat, null>): void {
    const input = this.app.input;
    this.seats[seat] = who;
    if (who.kind === "pad") input.assign(seat, who.index);
    else {
      // El jugador conserva el juego de teclas con el que se unió; el otro jugador usa el otro.
      input.keySet[seat] = who.set;
      input.keySet[(1 - seat) as 0 | 1] = (1 - who.set) as 0 | 1;
    }
    this.app.audio.play("confirm");
  }

  private leave(seat: 0 | 1): void {
    if (this.seats[seat]?.kind === "pad") this.app.input.unassign(seat);
    this.seats[seat] = null;
    this.ready = 0;
    this.app.audio.play("back");
  }

  update(): void {
    const input = this.app.input;
    if (this.ready > 0) {
      if (--this.ready === 0) this.onDone();
      return;
    }
    // Mandos libres: A/✕ (o cualquier botón si no es estándar) para unirse.
    const seat = this.freeSeat();
    const pad = input.unassignedPressed(PadButton.A);
    if (pad !== null && seat !== null) this.sit(seat, { kind: "pad", index: pad });
    // Mandos sentados: B/○ para salir.
    for (const p of [0, 1] as const) {
      const r = this.seats[p]?.kind === "pad" ? input.reader(p) : null;
      if (r && r.kind !== "raw" && r.pressed(PadButton.B)) this.leave(p);
    }
    // Teclado: cada juego de teclas se une una vez.
    const k = input.keys;
    const pressedAny = (codes: string[]) => codes.some((c) => input.keyPressed(c));
    for (const set of [0, 1] as const) {
      const join = pressedAny(set === 0 ? ["Enter", "Space", ...k[0].LP] : ["NumpadEnter", ...k[1].LP]);
      const at = this.keyboardSeated(set);
      const free = this.freeSeat();
      if (join && at < 0 && free !== null) this.sit(free, { kind: "keyboard", set });
    }
    if (input.keyPressed("Escape") || input.keyPressed("Backspace")) {
      const at = [1, 0].find((p) => this.seats[p]?.kind === "keyboard");
      if (at !== undefined) this.leave(at as 0 | 1);
      else {
        this.app.audio.play("back");
        this.onBack();
        return;
      }
    }
    // Un mando sin sentar que pulsa B cuando no hay nadie: volver.
    if (!this.seats[0] && !this.seats[1] && input.unassignedPressed(PadButton.B) !== null) {
      this.onBack();
      return;
    }
    if (this.seats[0] && this.seats[1]) this.ready = 40;
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    drawTitle(ctx, "VERSUS · PRESIONA UN BOTÓN PARA UNIRTE", 52, 30);
    for (const p of [0, 1] as const) this.drawSeat(ctx, p, p === 0 ? 70 : VIEW_W / 2 + 20);
    if (this.ready > 0) drawText(ctx, "¡LISTOS!", VIEW_W / 2, 440, { size: 34, align: "center", impact: true, color: UI.accent, stroke: true });
    drawFooter(ctx, "Mando: A/✕ unirse · B/○ salir   ·   Teclado: Enter/J (teclas J1) o Num Enter/Num 4 (teclas J2) · Esc salir");
  }

  private drawSeat(ctx: CanvasRenderingContext2D, p: 0 | 1, x: number): void {
    const w = VIEW_W / 2 - 90;
    const seat = this.seats[p];
    drawPanel(ctx, x, 110, w, 280, seat ? 0.92 : 0.6);
    const color = p === 0 ? "#ff7a5c" : "#5cc8ff";
    drawText(ctx, `J${p + 1}`, x + w / 2, 160, { size: 44, align: "center", impact: true, color, stroke: true });
    if (!seat) {
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.app.time * 3));
      ctx.save();
      ctx.globalAlpha = pulse;
      drawText(ctx, "Presiona un botón", x + w / 2, 240, { size: 22, align: "center", bold: true });
      ctx.restore();
      drawText(ctx, "A/✕ en un mando, o Enter / Num Enter", x + w / 2, 276, { size: 14, align: "center", color: UI.dim });
      return;
    }
    if (seat.kind === "pad") {
      const r = this.app.input.reader(p);
      drawText(ctx, `Mando ${r ? PAD_KIND_LABEL[r.kind] : ""}`, x + w / 2, 236, { size: 24, align: "center", bold: true, color: UI.cyan });
      if (r) drawText(ctx, r.id.length > 40 ? `${r.id.slice(0, 39)}…` : r.id, x + w / 2, 266, { size: 12, align: "center", color: UI.dim });
      drawText(ctx, "B/○ para salir", x + w / 2, 350, { size: 13, align: "center", color: UI.dim });
    } else {
      const k = this.app.input.keys[seat.set];
      drawText(ctx, "Teclado", x + w / 2, 236, { size: 24, align: "center", bold: true, color: UI.cyan });
      const dirs = [k.up, k.left, k.down, k.right].map((c) => keyName(c[0] ?? "")).join(" ");
      const btns = [k.LP, k.HP, k.LK, k.HK, k.PARRY].map((c) => keyName(c[0] ?? "")).join(" ");
      drawText(ctx, `Mover: ${dirs}`, x + w / 2, 270, { size: 14, align: "center" });
      drawText(ctx, `LP HP LK HK Parry: ${btns}`, x + w / 2, 292, { size: 14, align: "center" });
      drawText(ctx, "Esc para salir", x + w / 2, 350, { size: 13, align: "center", color: UI.dim });
    }
  }
}
