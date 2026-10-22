/**
 * Ajustes globales del sistema de combate (el "archivo de configuración" del diseño).
 * Valores en frames (60 por segundo) salvo que se indique. Ver DESIGN.md para el porqué de cada número.
 */
export const TUNING = {
  /** Frames que un botón presionado "espera" a que el personaje pueda actuar. */
  inputBuffer: 6,
  /** Ventana para completar un cuarto de círculo / Z / medio círculo. */
  motionWindow: 18,
  /** Ventana para el doble cuarto de círculo del súper. */
  superMotionWindow: 30,
  /** El último paso de un motion debe ser reciente (evita especiales "fantasma"). */
  motionFinalWithin: 10,
  /** Ventana del doble toque para dash. */
  dashWindow: 12,
  /** Frames iniciales de un normal en los que todavía se puede convertir en throw/especial/súper. */
  karaWindow: 2,
  /** Diferencia máxima entre LP y LK (o HP y HK) para contar como pulsación simultánea. */
  simultaneousGap: 3,
  /** Frames (no congelados) tras el contacto en los que se puede cancelar un normal. */
  cancelWindow: 10,
  /** Máximo de ligeros encadenados (chain) seguidos. */
  maxChain: 3,

  combo: {
    /** % de daño según el número de golpe dentro del combo (el último valor se repite). */
    damageScaling: [100, 100, 85, 75, 65, 55, 45, 35, 30],
    /** A partir de este golpe el hitstun empieza a bajar... */
    hitstunDecayFrom: 4,
    /** ...1 frame por golpe, hasta este máximo. */
    hitstunDecayMax: 6,
    /** Golpes de juggle permitidos sobre un rival en el aire. */
    maxJuggles: 2,
  },

  counterHit: {
    damagePercent: 120,
    hitstunBonus: { light: 3, heavy: 6 },
  },

  parry: {
    /** Ventana (frames) según la dificultad elegida en el menú. */
    windows: { easy: 11, normal: 8, hardcore: 5 },
    /** En el aire la ventana es más corta. */
    airPenalty: 3,
    /** Congelamiento dramático al acertar. */
    freeze: 8,
    /** Recuperación extra para el atacante parriado. */
    attackerExtraRecovery: 10,
    /** Recuperación al fallar (el personaje queda expuesto a counter hit). */
    failRecovery: 20,
    /** Tras fallar, frames sin poder volver a intentar parry. */
    cooldown: 14,
    meterGain: 60,
    /** Red parry: parry durante el blockstun. */
    red: { window: 3, cost: 250 },
  },

  throw: {
    techWindow: 7,
    /** Tras salir de hitstun/blockstun no te pueden agarrar estos frames. */
    protectAfterStun: 4,
    techPush: 7,
    techFreeze: 10,
    techRecovery: 14,
  },

  meter: {
    max: 1000,
    /** El defensor también gana medidor (las remontadas son posibles). */
    defenderOnHitPercent: 60,
    defenderOnBlockPercent: 40,
  },

  knockdown: {
    groundFrames: 32,
    wakeupFrames: 14,
    landingAfterReset: 8,
  },

  round: {
    seconds: 99,
    roundsToWin: 2,
    introFrames: 110,
    koFrames: 170,
    endFrames: 100,
    /** Frames de cámara lenta (en el bucle de la app) tras un KO. */
    koSlowFrames: 50,
  },

  stage: {
    /** Ancho del escenario (px). */
    width: 1600,
    /** Distancia inicial entre personajes (px). */
    startDistance: 300,
    /** Máxima separación (la cámara muestra 960 px). */
    maxSeparation: 820,
  },

  /** Desplazamiento del empuje (los empujes duran N frames con frenado lineal). */
  pushbackFrames: 8,
} as const;

export type ParryDifficulty = keyof typeof TUNING.parry.windows;
