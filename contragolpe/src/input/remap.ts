import { ACTIONS, PAD_ACTIONS, type Action, type KeyBindings, type PadAction, type PadBindings } from "./bindings";
import type { PadReader } from "./gamepad";
import { AXIS_THRESHOLD, axisCode, hatCode, isHatCode } from "./padCodes";

/**
 * Remapeo con detección de conflictos. Regla: una entrada física pertenece a **una sola** acción.
 * Si el jugador asigna a A un botón que ya usa B, se **intercambian** (B se queda con el botón que tenía A)
 * y se avisa; así nunca quedan dos acciones en el mismo botón ni una acción sin querer vacía.
 */
export interface RemapResult {
  /** Acción con la que se intercambió (o null si el botón estaba libre). */
  swappedWith: PadAction | null;
}

export function assignPadInput(profile: PadBindings, action: PadAction, code: number): RemapResult {
  // El hat mueve las cuatro direcciones a la vez: asignarlo a una dirección lo asigna a todas.
  if (isHatCode(code)) {
    for (const a of ["up", "down", "left", "right"] as const) profile[a] = [code];
    return { swappedWith: null };
  }
  let swappedWith: PadAction | null = null;
  const previous = profile[action].filter((c) => !isHatCode(c));
  for (const other of PAD_ACTIONS) {
    if (other === action || !profile[other].includes(code)) continue;
    profile[other] = profile[other].filter((c) => c !== code);
    if (profile[other].length === 0 && previous.length) profile[other] = [previous[0]];
    swappedWith = other;
  }
  profile[action] = [code];
  return { swappedWith };
}

export function assignKey(keys: KeyBindings, action: Action, code: string): { swappedWith: Action | null } {
  let swappedWith: Action | null = null;
  const previous = keys[action];
  for (const other of ACTIONS) {
    if (other === action || !keys[other].includes(code)) continue;
    keys[other] = keys[other].filter((c) => c !== code);
    if (keys[other].length === 0 && previous.length) keys[other] = [previous[0]];
    swappedWith = other;
  }
  keys[action] = [code];
  return { swappedWith };
}

/** Entradas usadas por más de una acción (el hat compartido por las cuatro direcciones no cuenta). */
export function findPadConflicts(profile: PadBindings): { code: number; actions: PadAction[] }[] {
  const by = new Map<number, PadAction[]>();
  for (const a of PAD_ACTIONS) {
    for (const c of profile[a]) {
      if (isHatCode(c)) continue;
      by.set(c, [...(by.get(c) ?? []), a]);
    }
  }
  return [...by].filter(([, acts]) => acts.length > 1).map(([code, actions]) => ({ code, actions }));
}

/**
 * Captura de la próxima entrada de un mando (remapeo y configuración guiada). Funciona con mandos sin
 * mapeo estándar: detecta botones, ejes (por su desplazamiento desde el reposo, así un gatillo en eje que
 * descansa en −1 también vale) y hats (ejes cuyo reposo está fuera de [−1, 1]).
 * Antes de aceptar nada exige que el mando vuelva a reposo: el botón con el que se abrió la captura no cuenta.
 */
export class PadCapture {
  /** Reposo de cada eje, aprendido una vez por mando (no en cada paso: el paso siguiente empieza con el eje aún movido). */
  private rest: number[] = [];
  private restFor = "";
  private armed = false;

  begin(r: PadReader): void {
    if (this.restFor !== r.id) {
      this.rest = [];
      this.restFor = r.id;
    }
    for (let i = 0; i < r.axes.length; i++) {
      const v = r.axes[i];
      // Un valor fuera de [−1, 1] solo lo da un hat en reposo: se apunta siempre.
      if (Math.abs(v) > 1.05) this.rest[i] = v;
      else if (this.rest[i] === undefined) this.rest[i] = Math.abs(v) < 0.35 ? 0 : v;
    }
    this.armed = false;
  }

  private atRest(r: PadReader): boolean {
    if (r.buttons.some((b) => b)) return false;
    return r.axes.every((v, i) => Math.abs(v - (this.rest[i] ?? 0)) < 0.35);
  }

  /** Devuelve el código capturado en este tick o null. */
  poll(r: PadReader): number | null {
    if (!r.connected) return null;
    if (!this.armed) {
      this.armed = this.atRest(r);
      return null;
    }
    for (let b = 0; b < r.buttons.length; b++) if (r.pressed(b)) return b;
    for (let i = 0; i < r.axes.length; i++) {
      const v = r.axes[i];
      const rest = this.rest[i] ?? 0;
      if (Math.abs(rest) > 1.05) {
        if (Math.abs(v) <= 1.05) return hatCode(i);
        continue;
      }
      if (Math.abs(v - rest) > 0.6 && Math.abs(v) > AXIS_THRESHOLD) return axisCode(i, v > 0 ? 1 : -1);
    }
    return null;
  }
}
