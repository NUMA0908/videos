import type { ParryDifficulty } from "../data/tuning";
import { ACTIONS, DEFAULT_KEYS, DEFAULT_PAD, type KeyBindings, type PadBindings } from "../input/bindings";
import { desktop } from "./desktop";

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
  /** Escritorio: pedir confirmación al cerrar en mitad de una partida. */
  confirmQuit: boolean;
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
    confirmQuit: true,
    keys: structuredClone(DEFAULT_KEYS),
    pads: [structuredClone(DEFAULT_PAD), structuredClone(DEFAULT_PAD)],
  };
}

function bindingsOk<T>(v: unknown, item: (x: unknown) => boolean): v is Record<string, T[]> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return ACTIONS.every((a) => Array.isArray(o[a]) && (o[a] as unknown[]).every(item));
}

/**
 * Mezcla lo guardado con los valores por defecto descartando todo lo que no tenga el tipo esperado:
 * un archivo manipulado o de otra versión nunca rompe el juego.
 */
export function parseSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    if (key === "keys" || key === "pads") continue;
    const v = r[key];
    if (typeof v === typeof base[key]) out[key] = v;
  }
  const s = out as unknown as Settings;
  s.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
  s.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
  if (!["easy", "normal", "hardcore"].includes(s.parry)) s.parry = base.parry;
  if (![0, 1, 2].includes(s.cpuLevel)) s.cpuLevel = base.cpuLevel;
  const keys = r.keys;
  if (Array.isArray(keys) && keys.length === 2 && keys.every((k) => bindingsOk<string>(k, (x) => typeof x === "string"))) {
    s.keys = keys as [KeyBindings, KeyBindings];
  }
  const pads = r.pads;
  if (Array.isArray(pads) && pads.length === 2 && pads.every((p) => bindingsOk<number>(p, (x) => typeof x === "number"))) {
    s.pads = pads as [PadBindings, PadBindings];
  }
  return s;
}

/** Navegador: localStorage. (En escritorio se cargan antes de crear la app; ver `loadDesktopSettings`.) */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseSettings(JSON.parse(raw)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export async function loadDesktopSettings(): Promise<Settings | null> {
  if (!desktop?.loadSettings) return null;
  try {
    const json = await desktop.loadSettings();
    return json ? parseSettings(JSON.parse(json)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  if (desktop?.saveSettings) {
    void desktop.saveSettings(JSON.stringify(s));
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento (modo privado): los ajustes duran solo esta sesión.
  }
}
