import type { ParryDifficulty } from "../data/tuning";
import { ACTIONS, DEFAULT_KEYS, PAD_ACTIONS, type KeyBindings, type PadBindings } from "../input/bindings";
import type { PadProfiles } from "../input/InputManager";
import { isValidCode } from "../input/padCodes";
import { DEFAULT_PAD_TUNING, sanitizePadTuning, type PadTuning } from "../input/padTuning";
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
  /** Bajo consumo: menos partículas, sin brillos caros y lienzo a 1× (portátiles, equipos modestos). */
  lowPower: boolean;
  /** Vibración del mando y su intensidad (0..1). */
  rumble: boolean;
  rumbleIntensity: number;
  /** Zona muerta, histéresis, diagonales y gatillos del mando (ver `input/padTuning.ts`). */
  padTuning: PadTuning;
  keys: [KeyBindings, KeyBindings];
  /**
   * Botones del mando: un perfil por tipo de dispositivo (`xbox`, `playstation`, `switch`, `generic`) y uno por
   * modelo para los no estándar (`raw:<id>`). Sin entrada = diseño de fábrica.
   */
  padProfiles: PadProfiles;
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
    lowPower: false,
    rumble: true,
    rumbleIntensity: 0.8,
    padTuning: { ...DEFAULT_PAD_TUNING },
    keys: structuredClone(DEFAULT_KEYS),
    padProfiles: {},
  };
}

function bindingsOk<T>(v: unknown, item: (x: unknown) => boolean): v is Record<string, T[]> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return ACTIONS.every((a) => Array.isArray(o[a]) && (o[a] as unknown[]).every(item));
}

function padProfileOk(v: unknown): v is PadBindings {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return PAD_ACTIONS.every((a) => Array.isArray(o[a]) && (o[a] as unknown[]).length <= 4 && (o[a] as unknown[]).every(isValidCode));
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
    if (key === "keys" || key === "padProfiles" || key === "padTuning") continue;
    const v = r[key];
    if (typeof v === typeof base[key]) out[key] = v;
  }
  const s = out as unknown as Settings;
  s.musicVolume = Math.max(0, Math.min(1, s.musicVolume));
  s.sfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
  s.rumbleIntensity = Number.isFinite(s.rumbleIntensity) ? Math.round(Math.max(0, Math.min(1, s.rumbleIntensity)) * 10) / 10 : base.rumbleIntensity;
  if (!["easy", "normal", "hardcore"].includes(s.parry)) s.parry = base.parry;
  if (![0, 1, 2].includes(s.cpuLevel)) s.cpuLevel = base.cpuLevel;
  s.padTuning = sanitizePadTuning(r.padTuning);
  const keys = r.keys;
  if (Array.isArray(keys) && keys.length === 2 && keys.every((k) => bindingsOk<string>(k, (x) => typeof x === "string"))) {
    s.keys = keys as [KeyBindings, KeyBindings];
  }
  // Perfiles de mando: solo claves conocidas y listas de códigos válidos. (El formato antiguo `pads`, por
  // jugador y con otro diseño por defecto, se descarta: se vuelve al diseño de fábrica nuevo.)
  const profiles = r.padProfiles;
  if (typeof profiles === "object" && profiles !== null && !Array.isArray(profiles)) {
    for (const [k, v] of Object.entries(profiles).slice(0, 24)) {
      const keyOk = ["xbox", "playstation", "switch", "generic"].includes(k) || (k.startsWith("raw:") && k.length <= 124);
      if (keyOk && padProfileOk(v)) s.padProfiles[k] = v;
    }
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
