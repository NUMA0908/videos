import { Btn } from "../sim/input";
import type { Rng } from "../sim/rng";
import { dirMask, motionFrames, waitFrames } from "./macros";

/**
 * Lecciones del Trial de parry. El muñeco (J2) repite un patrón; el jugador tiene que parriarlo
 * `goal` veces. Cada lección añade una idea: tiempo, proyectiles, altura, saltos, mezcla, multi-golpe y red parry.
 */
export interface TrialLesson {
  title: string;
  lines: string[];
  hint: string;
  goal: number;
  /** Separación al reiniciar cada intento (px). */
  gap: number;
  /** Parries necesarios en un mismo intento (súper = 5). */
  hitsPerAttempt: number;
  /** Lección de red parry: el éxito es un red parry (bloquear primero está bien). */
  red?: boolean;
  dummyMeter?: number;
  playerMeter?: number;
  /** Frames de espera entre intentos. */
  pause: number;
  script(facing: 1 | -1, rng: Rng): number[];
}

export const TRIAL_LESSONS: TrialLesson[] = [
  {
    title: "El tiempo del parry",
    lines: [
      "El parry desvía un golpe sin recibir daño y te deja contraatacar.",
      "Pulsa PARRY justo antes de que el golpe te toque: tienes una ventana corta.",
      "Si lo pulsas demasiado pronto, quedas expuesto un momento.",
    ],
    hint: "Espera a que el puño arranque y pulsa PARRY",
    goal: 3,
    gap: 100,
    hitsPerAttempt: 1,
    pause: 50,
    script: () => [Btn.HP],
  },
  {
    title: "Proyectiles",
    lines: [
      "El parry también desvía proyectiles.",
      "La Onda lenta da tiempo de sobra: no te precipites.",
      "Fíjate en la distancia, no en el momento en que la lanzan.",
    ],
    hint: "Pulsa PARRY cuando la onda esté a punto de tocarte",
    goal: 3,
    gap: 320,
    hitsPerAttempt: 1,
    pause: 40,
    script: (f) => motionFrames([2, 3, 6], Btn.LP, f),
  },
  {
    title: "Ataques bajos",
    lines: [
      "De pie solo desvías golpes altos y medios.",
      "Contra un ataque bajo (barrida, patada rastrera) usa ↓ + PARRY.",
      "Un parry con la altura equivocada es un counter hit para el rival.",
    ],
    hint: "Barrida = ↓ + PARRY",
    goal: 3,
    gap: 110,
    hitsPerAttempt: 1,
    pause: 50,
    script: () => [Btn.DOWN | Btn.HK, ...waitFrames(12, Btn.DOWN)],
  },
  {
    title: "Ataques en salto",
    lines: [
      "Los ataques en salto son altos: se parrian DE PIE.",
      "Calcula cuándo cae: pulsa cuando el pie esté encima de tu cabeza.",
      "Parriar un salto deja al rival aterrizando sin defensa.",
    ],
    hint: "Salto = PARRY de pie (sin ↓)",
    goal: 3,
    gap: 170,
    hitsPerAttempt: 1,
    pause: 50,
    script: (f) => [...waitFrames(3, Btn.UP | dirMask(6, f)), ...waitFrames(31), Btn.HK],
  },
  {
    title: "¿Alto o bajo?",
    lines: [
      "Ahora el muñeco mezcla: Martillo (alto, se levanta el brazo) o Barrida (bajo, se agacha).",
      "Mira la animación de anticipación y elige: PARRY de pie o ↓ + PARRY.",
      "Así funciona el juego mental: el parry gana a lo predecible.",
    ],
    hint: "Brazo arriba = de pie · Se agacha = ↓ + PARRY",
    goal: 4,
    gap: 100,
    hitsPerAttempt: 1,
    pause: 55,
    script: (f, rng) => (rng.chance(0.5) ? [dirMask(6, f) | Btn.HP] : [Btn.DOWN | Btn.HK, ...waitFrames(12, Btn.DOWN)]),
  },
  {
    title: "Desviar una súper",
    lines: [
      "La Tormenta Final golpea 5 veces: hay que parriar CADA golpe.",
      "Tras cada parry quedas libre: vuelve a pulsar al ritmo de los golpes.",
      "Si lo consigues, no recibes ni un punto de daño.",
    ],
    hint: "Pulsa PARRY en cada golpe (5 veces)",
    goal: 1,
    gap: 280,
    hitsPerAttempt: 5,
    dummyMeter: 1000,
    pause: 70,
    script: () => [Btn.HP | Btn.HK],
  },
  {
    title: "Red parry",
    lines: [
      "Si ya estás bloqueando, aún puedes salir de la presión: el RED PARRY.",
      "Bloquea agachado (↙) el primer golpe y pulsa PARRY justo antes del siguiente.",
      "Cuesta 1/4 de medidor y la ventana es mínima (3 frames).",
    ],
    hint: "Sostén ↙ y pulsa PARRY antes del 2.º o 3.er golpe",
    goal: 2,
    gap: 72,
    hitsPerAttempt: 1,
    red: true,
    playerMeter: 1000,
    pause: 60,
    script: () => [
      Btn.DOWN | Btn.LP,
      ...waitFrames(6, Btn.DOWN),
      Btn.DOWN | Btn.LP,
      ...waitFrames(6, Btn.DOWN),
      Btn.DOWN | Btn.LK,
      ...waitFrames(10, Btn.DOWN),
    ],
  },
];
