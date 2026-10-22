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

const STICK_DEADZONE = 0.5;
const MENU_REPEAT_DELAY = 18;
const MENU_REPEAT_RATE = 5;

/**
 * Traduce teclado y gamepads a bitmasks por jugador (para la simulación) y a eventos de menú.
 * Se muestrea una vez por tick de simulación.
 */
export class InputManager {
  keys: [KeyBindings, KeyBindings];
  pads: [PadBindings, PadBindings];
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Teclas pulsadas desde el último tick (aunque ya se hayan soltado): ningún toque rápido se pierde. */
  private tapped = new Set<string>();
  /** Captura de la próxima tecla/botón (pantalla de remapeo). */
  private capture: ((code: string | null, pad: number | null, player: 0 | 1 | null) => void) | null = null;
  private padPrev: boolean[][] = [[], [], [], []];
  private padNow: boolean[][] = [[], [], [], []];
  private padAxes: number[][] = [[], [], [], []];
  private menuHold: Record<string, number> = {};

  constructor(keys: [KeyBindings, KeyBindings], pads: [PadBindings, PadBindings]) {
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

  /** Lee el estado de los gamepads. Llamar una vez por tick antes de `sample`. */
  poll(): void {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this.padPrev[i] = this.padNow[i];
      const p = pads[i];
      this.padNow[i] = p ? p.buttons.map((b) => b.pressed || b.value > 0.5) : [];
      this.padAxes[i] = p ? Array.from(p.axes) : [];
    }
    if (this.capture) {
      for (let i = 0; i < 2; i++) {
        const now = this.padNow[i];
        const prev = this.padPrev[i];
        for (let b = 0; b < now.length; b++) {
          if (now[b] && !prev[b]) {
            const cb = this.capture;
            this.capture = null;
            cb(null, b, i as 0 | 1);
            return;
          }
        }
      }
    }
  }

  anyPadPressed(): boolean {
    for (let i = 0; i < 4; i++) for (let b = 0; b < (this.padNow[i]?.length ?? 0); b++) if (this.padPressed(i, b)) return true;
    return false;
  }

  padConnected(i: number): boolean {
    return this.padNow[i]?.length > 0;
  }

  private padDown(i: number, b: number): boolean {
    return !!this.padNow[i]?.[b];
  }
  private padPressed(i: number, b: number): boolean {
    return !!this.padNow[i]?.[b] && !this.padPrev[i]?.[b];
  }

  keyDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Pulsación nueva de una tecla concreta desde el último `endTick`. */
  keyPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Bitmask del jugador para este tick. */
  sample(player: 0 | 1): number {
    let mask = 0;
    const kb = this.keys[player];
    for (const a of ACTIONS) if (kb[a].some((c) => this.down.has(c) || this.tapped.has(c))) mask |= ACTION_BIT[a];
    const pb = this.pads[player];
    for (const a of ACTIONS) if (pb[a].some((b) => this.padDown(player, b))) mask |= ACTION_BIT[a];
    for (const m of PAD_MACROS) if (this.padDown(player, m.button)) mask |= m.mask;
    const ax = this.padAxes[player];
    if (ax && ax.length >= 2) {
      if (ax[0] < -STICK_DEADZONE) mask |= Btn.LEFT;
      if (ax[0] > STICK_DEADZONE) mask |= Btn.RIGHT;
      if (ax[1] < -STICK_DEADZONE) mask |= Btn.UP;
      if (ax[1] > STICK_DEADZONE) mask |= Btn.DOWN;
    }
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
  menu(): MenuInput {
    const m0 = this.sample(0);
    const m1 = this.sample(1);
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
