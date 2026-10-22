/**
 * Entrada de la simulación: un bitmask por jugador y por frame.
 * Los dispositivos (teclado, gamepad, IA, grabaciones) solo producen estos números;
 * la simulación nunca toca el DOM.
 */
export const Btn = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  LP: 1 << 4,
  HP: 1 << 5,
  LK: 1 << 6,
  HK: 1 << 7,
  PARRY: 1 << 8,
  /** Botón de especial simplificado (solo activo con "inputs simplificados"). */
  SP: 1 << 9,
} as const;

export const DIR_MASK = Btn.UP | Btn.DOWN | Btn.LEFT | Btn.RIGHT;
export const ATTACK_MASK = Btn.LP | Btn.HP | Btn.LK | Btn.HK;
export const PUNCH_MASK = Btn.LP | Btn.HP;
export const KICK_MASK = Btn.LK | Btn.HK;

/** Botones con buffer, en orden de índice (para `FighterState.buf`). */
export const BUFFERED_BUTTONS = [Btn.LP, Btn.HP, Btn.LK, Btn.HK, Btn.PARRY, Btn.SP] as const;
export type ButtonName = "LP" | "HP" | "LK" | "HK" | "PARRY" | "SP";
export const BUTTON_INDEX: Record<ButtonName, number> = { LP: 0, HP: 1, LK: 2, HK: 3, PARRY: 4, SP: 5 };
export const NO_PRESS = 99;

/**
 * Limpieza SOCD: izquierda+derecha = neutral, arriba+abajo = neutral.
 * Se aplica antes de guardar el input en el historial.
 */
export function cleanSOCD(mask: number): number {
  let m = mask;
  if ((m & Btn.LEFT) && (m & Btn.RIGHT)) m &= ~(Btn.LEFT | Btn.RIGHT);
  if ((m & Btn.UP) && (m & Btn.DOWN)) m &= ~(Btn.UP | Btn.DOWN);
  return m;
}

/**
 * Dirección en notación numpad relativa al lado al que mira el personaje.
 *   7 8 9      ↖ ↑ ↗
 *   4 5 6  =   ← · →   (6 = hacia el rival)
 *   1 2 3      ↙ ↓ ↘
 */
export function toNumpad(mask: number, facing: 1 | -1): number {
  const fwd = facing === 1 ? Btn.RIGHT : Btn.LEFT;
  const back = facing === 1 ? Btn.LEFT : Btn.RIGHT;
  const h = mask & fwd ? 1 : mask & back ? -1 : 0;
  const v = mask & Btn.UP ? 1 : mask & Btn.DOWN ? -1 : 0;
  return 5 + h + v * 3;
}

export const isDown = (d: number): boolean => d === 1 || d === 2 || d === 3;
export const isUp = (d: number): boolean => d === 7 || d === 8 || d === 9;
export const isBack = (d: number): boolean => d === 1 || d === 4 || d === 7;
export const isForward = (d: number): boolean => d === 3 || d === 6 || d === 9;

// ---------------------------------------------------------------------------
// Historial circular (forma parte del estado serializable)
// ---------------------------------------------------------------------------

export const HISTORY_LEN = 64;

export interface InputHistory {
  /** Bitmasks ya limpios (SOCD). `buf[head]` es el frame actual. */
  buf: number[];
  /** 1 si ese frame el personaje estaba congelado (hitstop / súper). Los frames congelados no cuentan para las ventanas de tiempo. */
  frozen: number[];
  head: number;
}

export function createHistory(): InputHistory {
  return { buf: new Array(HISTORY_LEN).fill(0), frozen: new Array(HISTORY_LEN).fill(0), head: 0 };
}

export function pushInput(h: InputHistory, mask: number, frozen: boolean): void {
  h.head = (h.head + 1) % HISTORY_LEN;
  h.buf[h.head] = mask;
  h.frozen[h.head] = frozen ? 1 : 0;
}

/** Input de hace `ago` frames (0 = actual). */
export function inputAt(h: InputHistory, ago: number): number {
  return h.buf[(h.head - ago + HISTORY_LEN * 4) % HISTORY_LEN];
}

function frozenAt(h: InputHistory, ago: number): boolean {
  return h.frozen[(h.head - ago + HISTORY_LEN * 4) % HISTORY_LEN] === 1;
}

/** Botones que pasaron de suelto a presionado en el frame `ago`. */
export function pressedAt(h: InputHistory, ago = 0): number {
  return inputAt(h, ago) & ~inputAt(h, ago + 1);
}

// ---------------------------------------------------------------------------
// Movimientos de palanca (motion inputs)
// ---------------------------------------------------------------------------

/** Cada paso es la lista de direcciones (numpad) aceptadas en ese punto de la secuencia. */
export type MotionSeq = readonly (readonly number[])[];

export const MOTIONS = {
  /** ↓↘→ cuarto de círculo adelante */
  qcf: [[2], [3], [6]],
  /** ↓↙← cuarto de círculo atrás */
  qcb: [[2], [1], [4]],
  /** →↓↘ "Z" (dragon punch) */
  dp: [[6], [2, 1], [3]],
  /** →↘↓↙← medio círculo atrás */
  hcb: [[6], [3, 2], [1, 2], [4]],
  /** ↓↘→↓↘→ doble cuarto de círculo */
  qcf2: [[2], [3], [6], [2], [3], [6]],
  /** →·→ y ←·← (dash) */
  dashF: [[6], [5], [6]],
  dashB: [[4], [5], [4]],
} as const satisfies Record<string, MotionSeq>;

export type MotionId = keyof typeof MOTIONS;

/**
 * ¿Aparece la secuencia en orden dentro de los últimos `window` frames no congelados?
 * Se recorre el historial hacia atrás buscando primero el último paso, luego el anterior, etc.
 * `finalWithin` exige que el último paso haya ocurrido hace como mucho ese número de frames.
 */
export function matchMotion(
  h: InputHistory,
  facing: 1 | -1,
  seq: MotionSeq,
  window: number,
  finalWithin = window,
): boolean {
  let step = seq.length - 1;
  let counted = 0;
  for (let ago = 0; ago < HISTORY_LEN - 1; ago++) {
    if (!frozenAt(h, ago)) counted++;
    if (counted > window) return false;
    const d = toNumpad(inputAt(h, ago), facing);
    if (seq[step].includes(d)) {
      if (step === seq.length - 1 && counted > finalWithin) return false;
      step--;
      if (step < 0) return true;
    }
  }
  return false;
}
