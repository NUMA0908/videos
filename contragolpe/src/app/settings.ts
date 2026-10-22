import type { ParryDifficulty } from "../data/tuning";
import { DEFAULT_KEYS, DEFAULT_PAD, type KeyBindings, type PadBindings } from "../input/bindings";

export type CpuLevel = 0 | 1 | 2;

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  parry: ParryDifficulty;
  /** Inputs simplificados (botón SP). */
  simple: boolean;
  /** Accesibilidad. */
  shake: boolean;
  flashes: boolean;
  cpuLevel: CpuLevel;
  /** Pantalla y ventana. */
  startFullscreen: boolean;
  pixelPerfect: boolean;
  pauseOnBlur: boolean;
  keys: [KeyBindings, KeyBindings];
  pads: [PadBindings, PadBindings];
}

const STORAGE_KEY = "contragolpe.settings.v1";

export function defaultSettings(): Settings {
  return {
    musicVolume: 0.5,
    sfxVolume: 0.8,
    parry: "normal",
    simple: true,
    shake: true,
    flashes: true,
    cpuLevel: 1,
    startFullscreen: false,
    pixelPerfect: false,
    pauseOnBlur: true,
    keys: structuredClone(DEFAULT_KEYS),
    pads: [structuredClone(DEFAULT_PAD), structuredClone(DEFAULT_PAD)],
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...base, ...saved, keys: saved.keys ?? base.keys, pads: saved.pads ?? base.pads };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento (modo privado): los ajustes duran solo esta sesión.
  }
}
