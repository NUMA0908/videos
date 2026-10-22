import type { App } from "../app/App";
import { DEFAULT_PAD, DEFAULT_RAW_PAD, PAD_ACTION_LABEL, PAD_ACTIONS, PAD_BUTTON_ACTIONS, type PadAction, type PadBindings } from "../input/bindings";
import type { PadReader } from "../input/gamepad";
import { MAX_PADS } from "../input/InputManager";
import { isHatCode } from "../input/padCodes";
import { PAD_KIND_LABEL } from "../input/padKind";
import { padCodeName } from "../input/padNames";
import { assignPadInput, findPadConflicts, PadCapture } from "../input/remap";
import { VIEW_H, VIEW_W } from "../render/view";
import { drawHintBar } from "../ui/glyphs";
import { drawBackdrop, drawFooter, drawMenu, drawPanel, drawText, drawTitle, UI, type MenuItem } from "../ui/ui";
import type { Scene } from "./Scene";

const CAPTURE_TICKS = 6 * 60;
const GUIDED_STEP_TICKS = 8 * 60;
const DIRS: PadAction[] = ["up", "down", "left", "right"];

interface Row extends MenuItem {
  act?: () => void;
  change?: (dir: 1 | -1) => void;
}

/**
 * Opciones → Botones del mando. Edita el perfil del tipo de mando elegido (Xbox, PlayStation, Switch, genérico
 * o el modelo concreto si no es estándar). Remapeo con intercambio en conflicto, restablecer y una
 * configuración guiada paso a paso ("presiona el botón para Puño ligero…") para mandos sin mapeo estándar.
 */
export class PadRemapScene implements Scene {
  readonly kind = "padremap";
  private sel = 0;
  private padIndex: number | null;
  private capture = new PadCapture();
  /** Acción que se está capturando (remapeo de una fila) o null. */
  private capturing: PadAction | null = null;
  private timer = 0;
  /** Configuración guiada: pasos, paso actual y perfil nuevo que se va construyendo. */
  private guided: { steps: PadAction[]; i: number; profile: PadBindings } | null = null;
  private notice = "";
  private noticeT = 0;

  constructor(
    readonly app: App,
    readonly back: () => void,
  ) {
    this.padIndex = app.input.playerPad[0] ?? app.input.playerPad[1] ?? this.firstConnected();
  }

  private firstConnected(): number | null {
    for (let i = 0; i < MAX_PADS; i++) if (this.app.input.readers[i].connected) return i;
    return null;
  }

  private get pad(): PadReader | null {
    if (this.padIndex === null || !this.app.input.readers[this.padIndex].connected) this.padIndex = this.firstConnected();
    return this.padIndex === null ? null : this.app.input.readers[this.padIndex];
  }

  /** Perfil editable de este mando (se crea a partir del de fábrica la primera vez que se toca). */
  private profile(r: PadReader): PadBindings {
    const profiles = this.app.settings.padProfiles;
    if (!profiles[r.profile]) profiles[r.profile] = structuredClone(r.kind === "raw" ? DEFAULT_RAW_PAD : DEFAULT_PAD);
    this.app.input.profiles = profiles;
    return profiles[r.profile];
  }

  private say(text: string): void {
    this.notice = text;
    this.noticeT = 240;
  }

  private actionsFor(r: PadReader): PadAction[] {
    return r.kind === "raw" ? PAD_ACTIONS : PAD_BUTTON_ACTIONS;
  }

  private rows(): Row[] {
    const r = this.pad;
    const rows: Row[] = [];
    if (!r) {
      rows.push({ label: "Conecta un mando y pulsa cualquier botón", disabled: true });
      rows.push({ label: "Volver", act: () => this.leave() });
      return rows;
    }
    const who = this.app.input.playerPad[0] === this.padIndex ? "J1" : this.app.input.playerPad[1] === this.padIndex ? "J2" : "libre";
    rows.push({
      label: "Mando",
      value: `${PAD_KIND_LABEL[r.kind]} (${who})`,
      change: (d) => this.cyclePad(d),
      hint: r.id,
    });
    rows.push({ label: "Configuración guiada (paso a paso)", act: () => this.startGuided(r), hint: "Pulsa cada botón cuando se pida. Para palancas arcade y mandos no estándar." });
    const profile = this.app.settings.padProfiles[r.profile] ?? (r.kind === "raw" ? DEFAULT_RAW_PAD : DEFAULT_PAD);
    for (const a of this.actionsFor(r)) {
      rows.push({
        label: PAD_ACTION_LABEL[a],
        value: profile[a].map((c) => padCodeName(c, r.kind)).join(", ") || "—",
        act: () => this.startCapture(r, a),
        hint: a === "SP" ? "Solo funciona con «Inputs simplificados» activado. No sustituye a los movimientos normales." : undefined,
      });
    }
    rows.push({
      label: "Restablecer este perfil",
      act: () => {
        delete this.app.settings.padProfiles[r.profile];
        this.app.saveSettings();
        this.say(`Perfil ${PAD_KIND_LABEL[r.kind]} restablecido`);
      },
    });
    rows.push({ label: "Volver", act: () => this.leave() });
    return rows;
  }

  private cyclePad(d: 1 | -1): void {
    const connected: number[] = [];
    for (let i = 0; i < MAX_PADS; i++) if (this.app.input.readers[i].connected) connected.push(i);
    if (!connected.length) return;
    const at = Math.max(0, connected.indexOf(this.padIndex ?? connected[0]));
    this.padIndex = connected[(at + d + connected.length) % connected.length];
  }

  private startCapture(r: PadReader, a: PadAction): void {
    this.capturing = a;
    this.capture.begin(r);
    this.timer = CAPTURE_TICKS;
  }

  private startGuided(r: PadReader): void {
    const steps = r.kind === "raw" ? [...DIRS, ...PAD_BUTTON_ACTIONS] : [...PAD_BUTTON_ACTIONS];
    const empty = Object.fromEntries(PAD_ACTIONS.map((a) => [a, [] as number[]])) as PadBindings;
    // Un mando estándar conserva la cruceta; uno no estándar parte de cero.
    if (r.kind !== "raw") for (const d of DIRS) empty[d] = [...DEFAULT_PAD[d]];
    this.guided = { steps, i: 0, profile: empty };
    this.capture.begin(r);
    this.timer = GUIDED_STEP_TICKS;
  }

  private leave(): void {
    this.app.saveSettings();
    this.back();
  }

  update(): void {
    if (this.noticeT > 0 && --this.noticeT === 0) this.notice = "";
    const r = this.pad;
    if (this.capturing || this.guided) {
      if (!r) {
        this.capturing = null;
        this.guided = null;
        this.say("Mando desconectado: captura cancelada");
        return;
      }
      if (this.app.input.keyPressed("Escape")) {
        this.capturing = null;
        this.guided = null;
        this.say("Cancelado");
        return;
      }
      if (this.guided) this.updateGuided(r);
      else this.updateCapture(r);
      return;
    }
    const m = this.app.input.menu();
    const rows = this.rows();
    if (m.up) this.sel = (this.sel + rows.length - 1) % rows.length;
    if (m.down) this.sel = (this.sel + 1) % rows.length;
    this.sel = Math.min(this.sel, rows.length - 1);
    if (m.up || m.down) this.app.audio.play("select");
    const row = rows[this.sel];
    if ((m.left || m.right) && row.change) row.change(m.right ? 1 : -1);
    if (m.confirm && row.act && !row.disabled) {
      this.app.audio.play("confirm");
      row.act();
    } else if (m.back) this.leave();
  }

  private updateCapture(r: PadReader): void {
    const code = this.capture.poll(r);
    if (code === null) {
      if (--this.timer <= 0) {
        this.capturing = null;
        this.say("Sin respuesta: no se cambió nada");
      }
      return;
    }
    const action = this.capturing as PadAction;
    if (isHatCode(code) && !DIRS.includes(action)) {
      this.say("Esa cruceta solo sirve para direcciones");
      this.capture.begin(r);
      return;
    }
    const { swappedWith } = assignPadInput(this.profile(r), action, code);
    this.capturing = null;
    this.app.audio.play("confirm");
    this.say(swappedWith ? `${padCodeName(code, r.kind)} era de ${PAD_ACTION_LABEL[swappedWith]}: intercambiados` : `${PAD_ACTION_LABEL[action]} → ${padCodeName(code, r.kind)}`);
    this.app.saveSettings();
  }

  private updateGuided(r: PadReader): void {
    const g = this.guided!;
    const action = g.steps[g.i];
    const skip = this.app.input.keyPressed("Backspace") || --this.timer <= 0;
    const code = skip ? null : this.capture.poll(r);
    if (code === null && !skip) return;
    if (code !== null) {
      // Conflicto: dentro de la guía no se intercambia, se pide otro botón.
      const owner = PAD_ACTIONS.find((a) => a !== action && g.profile[a].includes(code) && !isHatCode(code));
      if (owner) {
        this.say(`${padCodeName(code, r.kind)} ya es ${PAD_ACTION_LABEL[owner]}: pulsa otro`);
        this.capture.begin(r);
        return;
      }
      if (isHatCode(code) && !DIRS.includes(action)) {
        this.say("Esa cruceta solo sirve para direcciones");
        this.capture.begin(r);
        return;
      }
      assignPadInput(g.profile, action, code);
      this.app.audio.play("select");
      // Un hat cubre las cuatro direcciones: se saltan las que quedan.
      if (isHatCode(code)) while (g.i + 1 < g.steps.length && DIRS.includes(g.steps[g.i + 1])) g.i++;
    }
    g.i++;
    this.capture.begin(r);
    this.timer = GUIDED_STEP_TICKS;
    if (g.i >= g.steps.length) {
      this.app.settings.padProfiles[r.profile] = g.profile;
      this.app.input.profiles = this.app.settings.padProfiles;
      this.guided = null;
      this.app.saveSettings();
      this.app.audio.play("confirm");
      const conflicts = findPadConflicts(g.profile).length;
      this.say(conflicts ? "Guardado (revisa los conflictos)" : `Perfil ${PAD_KIND_LABEL[r.kind]} guardado`);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawBackdrop(ctx, this.app.time);
    drawTitle(ctx, "BOTONES DEL MANDO", 40, 34);
    const r = this.pad;
    const rows = this.rows();
    const visible = Math.min(rows.length, 10);
    drawPanel(ctx, VIEW_W / 2 - 320, 74, 640, visible * 34 + 22, 0.85);
    drawMenu(ctx, rows, Math.min(this.sel, rows.length - 1), VIEW_W / 2 - 290, 102, 580, this.app.time, 34, visible);
    if (r) {
      const conflicts = findPadConflicts(this.app.input.profileOf(r));
      const scope = r.kind === "raw" ? "este modelo de mando" : `todos los mandos ${PAD_KIND_LABEL[r.kind]}`;
      drawText(ctx, conflicts.length ? `⚠ ${conflicts.length} botón(es) con dos acciones: reasígnalos` : `Perfil para ${scope}`, VIEW_W / 2, 462, {
        size: 13,
        align: "center",
        color: conflicts.length ? "#ff8a7a" : UI.dim,
      });
      if (r.kind === "raw" && !this.app.settings.padProfiles[r.profile]) {
        drawText(ctx, "Mando sin mapeo estándar: usa la configuración guiada", VIEW_W / 2, 444, { size: 14, align: "center", color: UI.accent });
      }
    }
    if (this.notice) drawText(ctx, this.notice, VIEW_W / 2, 488, { size: 15, align: "center", color: UI.accent, bold: true });
    if ((this.capturing || this.guided) && r) this.renderCapture(ctx, r);
    if (this.capturing || this.guided) drawFooter(ctx, "Esc cancela · Retroceso omite (guía)");
    else drawHintBar(ctx, this.app, "{UPDOWN} elegir · {LEFTRIGHT} cambiar de mando · {ACCEPT} asignar · {BACK} volver", VIEW_W, VIEW_H);
  }

  private renderCapture(ctx: CanvasRenderingContext2D, r: PadReader): void {
    const g = this.guided;
    const action = g ? g.steps[g.i] : (this.capturing as PadAction);
    drawPanel(ctx, VIEW_W / 2 - 250, 190, 500, 130, 0.97);
    drawText(ctx, g ? `Paso ${g.i + 1} de ${g.steps.length}` : `Mando ${PAD_KIND_LABEL[r.kind]}`, VIEW_W / 2, 214, { size: 13, align: "center", color: UI.dim });
    drawText(ctx, DIRS.includes(action) ? "Presiona la dirección" : "Presiona el botón para", VIEW_W / 2, 240, { size: 16, align: "center" });
    drawText(ctx, PAD_ACTION_LABEL[action], VIEW_W / 2, 270, { size: 22, align: "center", bold: true, color: UI.accent });
    const secs = Math.ceil(this.timer / 60);
    drawText(ctx, g ? `Se omite en ${secs} s` : `Se cancela en ${secs} s`, VIEW_W / 2, 302, { size: 12, align: "center", color: UI.dim });
  }
}
