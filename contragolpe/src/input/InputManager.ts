import { Btn } from "../sim/input";
import {
  ACTION_BIT,
  ACTIONS,
  DEFAULT_PAD,
  DEFAULT_RAW_PAD,
  PAD_ACTION_BIT,
  PAD_ACTIONS,
  type KeyBindings,
  type PadAction,
  type PadBindings,
} from "./bindings";
import { PadButton, PadReader, type GamepadLike } from "./gamepad";
import { codeActive } from "./padCodes";
import { DEFAULT_PAD_TUNING, type PadTuning } from "./padTuning";
import { resolveSOCD } from "./socd";

export interface MenuInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  pause: boolean;
  /** Qué jugador (0/1) pulsó confirmar, o -1. */
  who: -1 | 0 | 1;
}

/** Cuántos mandos a la vez se leen (el Gamepad API expone hasta 4 en casi todos los navegadores). */
export const MAX_PADS = 4;
const MENU_REPEAT_DELAY = 18;
const MENU_REPEAT_RATE = 5;

/** Perfiles de botones del mando por tipo (`xbox`, `playstation`, `switch`, `generic`, `raw:<id>`). */
export type PadProfiles = Record<string, PadBindings>;

type PadSource = () => ArrayLike<GamepadLike | null>;

const browserPads: PadSource = () =>
  typeof navigator !== "undefined" && navigator.getGamepads ? (navigator.getGamepads() as ArrayLike<GamepadLike | null>) : [];

const DIR_ACTIONS = new Set<PadAction>(["up", "down", "left", "right"]);

/**
 * Traduce teclado y mandos a bitmasks por jugador (para la simulación) y a eventos de menú.
 * Un solo camino para todos los dispositivos: acciones → máscara → SOCD. El teclado y el mando nunca
 * tienen reglas propias; la simulación (buffer, motion inputs) ve exactamente lo mismo venga de donde venga.
 * Los mandos se sondean una vez por tick (`poll`), justo antes de que la escena muestree la entrada.
 */
export class InputManager {
  keys: [KeyBindings, KeyBindings];
  /** Perfiles guardados; si un tipo no tiene, se usa el de fábrica (estándar o vacío para no estándar). */
  profiles: PadProfiles;
  tuning: PadTuning = { ...DEFAULT_PAD_TUNING };
  /** Estado de cada mando por índice del Gamepad API. */
  readonly readers: PadReader[] = Array.from({ length: MAX_PADS }, () => new PadReader());
  /** Qué mando (índice) usa cada jugador; null = ninguno (solo teclado). */
  readonly playerPad: [number | null, number | null] = [null, null];
  /** Asignación automática: el primer mando conectado es J1 y el segundo J2. */
  autoAssign = true;
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Teclas pulsadas desde el último tick (aunque ya se hayan soltado): ningún toque rápido se pierde. */
  private tapped = new Set<string>();
  /** Captura de la próxima tecla (pantalla de remapeo del teclado). */
  private capture: ((code: string | null) => void) | null = null;
  private menuHold: Record<string, number> = {};
  private menuHoldP: Record<string, number> = {};

  constructor(keys: [KeyBindings, KeyBindings], profiles: PadProfiles = {}, private readonly padSource: PadSource = browserPads) {
    this.keys = keys;
    this.profiles = profiles;
  }

  attach(target: Window): void {
    target.addEventListener("keydown", (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code === "Escape" ? null : e.code);
        return;
      }
      if (this.isGameKey(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        this.tapped.add(e.code);
      }
      this.down.add(e.code);
    });
    target.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener("blur", () => this.down.clear());
  }

  private isGameKey(code: string): boolean {
    if (code.startsWith("Arrow") || code === "Space" || code === "F1" || code === "Tab") return true;
    for (const k of this.keys) for (const a of ACTIONS) if (k[a].includes(code)) return true;
    return false;
  }

  /** Lee el estado de los mandos. Una vez por tick, justo antes de muestrear (`sample`). */
  poll(): void {
    const pads = this.padSource();
    for (let i = 0; i < MAX_PADS; i++) {
      const gp = i < pads.length ? pads[i] : null;
      this.readers[i].update(gp && gp.connected ? gp : null, this.tuning);
    }
    if (this.autoAssign) this.assignPads();
  }

  /** Asignación automática: suelta los mandos desconectados y da los libres a los jugadores sin mando. */
  private assignPads(): void {
    for (const p of [0, 1] as const) {
      const i = this.playerPad[p];
      if (i !== null && !this.readers[i].connected) this.playerPad[p] = null;
    }
    for (let i = 0; i < MAX_PADS; i++) {
      if (!this.readers[i].connected || this.playerPad.includes(i)) continue;
      const free = this.playerPad.indexOf(null);
      if (free < 0) break;
      this.playerPad[free] = i;
    }
  }

  /** Mando del jugador (si tiene uno conectado). */
  reader(player: 0 | 1): PadReader | null {
    const i = this.playerPad[player];
    const r = i === null ? null : this.readers[i];
    return r && r.connected ? r : null;
  }

  /** Perfil de botones de un mando (el guardado para su tipo o el de fábrica). */
  profileOf(r: PadReader): PadBindings {
    return this.profiles[r.profile] ?? (r.kind === "raw" ? DEFAULT_RAW_PAD : DEFAULT_PAD);
  }

  anyPadPressed(): boolean {
    for (const r of this.readers) if (r.connected && r.anyPressed()) return true;
    return false;
  }

  padConnected(i: number): boolean {
    return this.readers[i]?.connected ?? false;
  }

  keyDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Pulsación nueva de una tecla concreta desde el último `endTick`. */
  keyPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /**
   * Bitmask del jugador para este tick: teclado + mando (botones, cruceta y stick), con SOCD.
   * `withStick = false` ignora el stick (menús donde el stick se usa para otra cosa, como la calibración).
   */
  sample(player: 0 | 1, withStick = true): number {
    let mask = 0;
    const kb = this.keys[player];
    // Bucles simples (sin cierres): se llama varias veces por tick.
    for (const a of ACTIONS) {
      for (const c of kb[a]) if (this.down.has(c) || this.tapped.has(c)) mask |= ACTION_BIT[a];
    }
    const r = this.reader(player);
    if (r) mask |= this.padMask(r, this.profileOf(r), withStick);
    return resolveSOCD(mask);
  }

  /** Máscara de un mando con un perfil: botones (incluidos los atajos agarre/súper), direcciones y stick. */
  padMask(r: PadReader, profile: PadBindings, withStick = true): number {
    let mask = withStick ? r.stickDir : 0;
    for (const a of PAD_ACTIONS) {
      const bit = PAD_ACTION_BIT[a];
      if (!bit) continue;
      const dirBit = DIR_ACTIONS.has(a) ? bit : 0;
      for (const c of profile[a]) if (codeActive(r, c, dirBit)) mask |= bit;
    }
    return mask;
  }

  /** ¿Alguna entrada de esta acción del perfil está activa / se acaba de pulsar? */
  padAction(r: PadReader, a: PadAction): boolean {
    for (const c of this.profileOf(r)[a]) if (codeActive(r, c)) return true;
    return false;
  }

  /**
   * Botones fijos de menú: el de abajo acepta (A en Xbox, ✕ en PlayStation) y el de la derecha vuelve
   * (B/○). Con mandos no estándar se usan sus botones de LK/LP para aceptar y HK para volver.
   */
  private padMenuButton(player: 0 | 1, which: "confirm" | "back" | "pause"): boolean {
    const r = this.reader(player);
    if (!r) return false;
    if (which === "pause") return this.newly(r, "PAUSE");
    if (r.kind !== "raw") return r.pressed(which === "confirm" ? PadButton.A : PadButton.B);
    return which === "confirm" ? this.newly(r, "LK") || this.newly(r, "LP") : this.newly(r, "HK");
  }

  /** Pulsación nueva de una acción del perfil (botón que no estaba pulsado en el tick anterior). */
  private newly(r: PadReader, a: PadAction): boolean {
    for (const c of this.profileOf(r)[a]) if (c < 100 ? r.pressed(c) : false) return true;
    return false;
  }

  private repeatIn(store: Record<string, number>, id: string, held: boolean): boolean {
    if (!held) {
      store[id] = 0;
      return false;
    }
    const n = (store[id] ?? 0) + 1;
    store[id] = n;
    return n === 1 || (n > MENU_REPEAT_DELAY && (n - MENU_REPEAT_DELAY) % MENU_REPEAT_RATE === 0);
  }

  /** Navegación de menús con cualquier dispositivo (con auto-repetición al mantener). */
  menu(withStick = true): MenuInput {
    const any = this.sample(0, withStick) | this.sample(1, withStick);
    const pk = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    const confirm0 = pk(["Enter", "Space", ...this.keys[0].LP]) || this.padMenuButton(0, "confirm");
    const confirm1 = pk(["NumpadEnter", ...this.keys[1].LP]) || this.padMenuButton(1, "confirm");
    return {
      up: this.repeatIn(this.menuHold, "up", !!(any & Btn.UP)),
      down: this.repeatIn(this.menuHold, "down", !!(any & Btn.DOWN)),
      left: this.repeatIn(this.menuHold, "left", !!(any & Btn.LEFT)),
      right: this.repeatIn(this.menuHold, "right", !!(any & Btn.RIGHT)),
      confirm: confirm0 || confirm1,
      back: pk(["Escape", "Backspace", ...this.keys[0].HP, ...this.keys[1].HP]) || this.padMenuButton(0, "back") || this.padMenuButton(1, "back"),
      pause: pk(["Escape", "Enter", "KeyP"]) || this.padMenuButton(0, "pause") || this.padMenuButton(1, "pause"),
      who: confirm0 ? 0 : confirm1 ? 1 : -1,
    };
  }

  /** Navegación de menú de un jugador concreto (selección de personaje a dos). */
  menuFor(player: 0 | 1): MenuInput {
    const m = this.sample(player);
    const pk = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    const extraConfirm = player === 0 ? ["Enter", "Space"] : ["NumpadEnter"];
    const confirm = pk([...extraConfirm, ...this.keys[player].LP]) || this.padMenuButton(player, "confirm");
    return {
      up: this.repeatIn(this.menuHoldP, `${player}u`, !!(m & Btn.UP)),
      down: this.repeatIn(this.menuHoldP, `${player}d`, !!(m & Btn.DOWN)),
      left: this.repeatIn(this.menuHoldP, `${player}l`, !!(m & Btn.LEFT)),
      right: this.repeatIn(this.menuHoldP, `${player}r`, !!(m & Btn.RIGHT)),
      confirm,
      back: pk([...(player === 0 ? ["Escape", "Backspace"] : []), ...this.keys[player].HP]) || this.padMenuButton(player, "back"),
      pause: false,
      who: confirm ? player : -1,
    };
  }

  /** Espera la próxima tecla (remapeo del teclado). `null` = cancelado con Escape. */
  captureNext(cb: (code: string | null) => void): void {
    this.capture = cb;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  /** Fin de tick: olvida las pulsaciones "nuevas". */
  endTick(): void {
    this.pressed.clear();
    this.tapped.clear();
  }
}
