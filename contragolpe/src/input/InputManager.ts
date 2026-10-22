import { Btn } from "../sim/input";
import {
  ACTION_BIT,
  ACTIONS,
  PAD_BACK,
  PAD_MACROS,
  PAD_START,
  type KeyBindings,
  type PadBindings,
} from "./bindings";
import { PadReader, type GamepadLike } from "./gamepad";
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

type PadSource = () => ArrayLike<GamepadLike | null>;

const browserPads: PadSource = () =>
  typeof navigator !== "undefined" && navigator.getGamepads ? (navigator.getGamepads() as ArrayLike<GamepadLike | null>) : [];

/**
 * Traduce teclado y mandos a bitmasks por jugador (para la simulación) y a eventos de menú.
 * Un solo camino para todos los dispositivos: acciones → máscara → SOCD. El teclado y el mando nunca
 * tienen reglas propias; la simulación (buffer, motion inputs) ve exactamente lo mismo venga de donde venga.
 * Los mandos se sondean una vez por tick (`poll`), justo antes de que la escena muestree la entrada.
 */
export class InputManager {
  keys: [KeyBindings, KeyBindings];
  pads: [PadBindings, PadBindings];
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
  /** Captura de la próxima tecla/botón (pantalla de remapeo). */
  private capture: ((code: string | null, pad: number | null, player: 0 | 1 | null) => void) | null = null;
  private menuHold: Record<string, number> = {};

  constructor(
    keys: [KeyBindings, KeyBindings],
    pads: [PadBindings, PadBindings],
    private readonly padSource: PadSource = browserPads,
  ) {
    this.keys = keys;
    this.pads = pads;
  }

  attach(target: Window): void {
    target.addEventListener("keydown", (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code === "Escape" ? null : e.code, null, null);
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
    if (this.capture) {
      for (const p of [0, 1] as const) {
        const r = this.reader(p);
        if (!r) continue;
        for (let b = 0; b < r.buttons.length; b++) {
          if (r.pressed(b)) {
            const cb = this.capture;
            this.capture = null;
            cb(null, b, p);
            return;
          }
        }
      }
    }
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

  anyPadPressed(): boolean {
    for (const r of this.readers) if (r.connected && r.anyPressed()) return true;
    return false;
  }

  padConnected(i: number): boolean {
    return this.readers[i]?.connected ?? false;
  }

  private padPressed(player: 0 | 1, b: number): boolean {
    return this.reader(player)?.pressed(b) ?? false;
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
    if (r) mask |= this.padMask(r, this.pads[player], withStick);
    return resolveSOCD(mask);
  }

  /** Máscara de un mando con unas asignaciones (botones remapeables, macros, cruceta y stick). */
  padMask(r: PadReader, pb: PadBindings, withStick = true): number {
    let mask = withStick ? r.dir : r.dpadDir;
    for (const a of ACTIONS) {
      for (const b of pb[a]) if (r.down(b)) mask |= ACTION_BIT[a];
    }
    for (const m of PAD_MACROS) if (r.down(m.button)) mask |= m.mask;
    return mask;
  }

  private repeat(id: string, held: boolean): boolean {
    if (!held) {
      this.menuHold[id] = 0;
      return false;
    }
    const n = (this.menuHold[id] ?? 0) + 1;
    this.menuHold[id] = n;
    return n === 1 || (n > MENU_REPEAT_DELAY && (n - MENU_REPEAT_DELAY) % MENU_REPEAT_RATE === 0);
  }

  /** Navegación de menús con cualquier dispositivo (con auto-repetición al mantener). */
  menu(withStick = true): MenuInput {
    const m0 = this.sample(0, withStick);
    const m1 = this.sample(1, withStick);
    const any = m0 | m1;
    const pk = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    const padAny = (b: number) => this.padPressed(0, b) || this.padPressed(1, b);
    const confirm0 = pk(["Enter", "Space", ...this.keys[0].LP]) || this.padPressed(0, 0) || this.padPressed(0, 2);
    const confirm1 = pk(["NumpadEnter", ...this.keys[1].LP]) || this.padPressed(1, 0) || this.padPressed(1, 2);
    return {
      up: this.repeat("up", !!(any & Btn.UP)),
      down: this.repeat("down", !!(any & Btn.DOWN)),
      left: this.repeat("left", !!(any & Btn.LEFT)),
      right: this.repeat("right", !!(any & Btn.RIGHT)),
      confirm: confirm0 || confirm1,
      back: pk(["Escape", "Backspace", ...this.keys[0].HP, ...this.keys[1].HP]) || padAny(1) || padAny(PAD_BACK),
      pause: pk(["Escape", "Enter", "KeyP"]) || padAny(PAD_START),
      who: confirm0 ? 0 : confirm1 ? 1 : -1,
    };
  }

  private menuHoldP: Record<string, number> = {};

  private repeatP(id: string, held: boolean): boolean {
    if (!held) {
      this.menuHoldP[id] = 0;
      return false;
    }
    const n = (this.menuHoldP[id] ?? 0) + 1;
    this.menuHoldP[id] = n;
    return n === 1 || (n > MENU_REPEAT_DELAY && (n - MENU_REPEAT_DELAY) % MENU_REPEAT_RATE === 0);
  }

  /** Navegación de menú de un jugador concreto (selección de personaje a dos). */
  menuFor(player: 0 | 1): MenuInput {
    const m = this.sample(player);
    const pk = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    const extraConfirm = player === 0 ? ["Enter", "Space"] : ["NumpadEnter"];
    const confirm = pk([...extraConfirm, ...this.keys[player].LP]) || this.padPressed(player, 0) || this.padPressed(player, 2);
    return {
      up: this.repeatP(`${player}u`, !!(m & Btn.UP)),
      down: this.repeatP(`${player}d`, !!(m & Btn.DOWN)),
      left: this.repeatP(`${player}l`, !!(m & Btn.LEFT)),
      right: this.repeatP(`${player}r`, !!(m & Btn.RIGHT)),
      confirm,
      back: pk([...(player === 0 ? ["Escape", "Backspace"] : []), ...this.keys[player].HP]) || this.padPressed(player, 1),
      pause: false,
      who: confirm ? player : -1,
    };
  }

  /** Espera la próxima tecla o botón (remapeo). `null` = cancelado con Escape. */
  captureNext(cb: (code: string | null, pad: number | null, player: 0 | 1 | null) => void): void {
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
