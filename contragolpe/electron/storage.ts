import fs from "node:fs";
import path from "node:path";

/**
 * Guardado local de la app de escritorio (carpeta de datos de usuario). Sin dependencias de Electron
 * para poder probarlo con Vitest.
 *  - Escritura atómica: se escribe a un temporal, se fuerza a disco y se renombra (nunca queda a medias).
 *  - Archivo dañado: se usan los valores por defecto y se conserva una copia con la fecha.
 *  - Versión de esquema con migración simple.
 */
export const SETTINGS_FILE = "settings.json";
export const SCHEMA_VERSION = 2;

export interface SettingsEnvelope {
  version: number;
  savedAt: string;
  settings: Record<string, unknown>;
}

export type ReadStatus = "ok" | "missing" | "corrupt" | "migrated";

export function writeAtomic(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Migra cualquier versión anterior al esquema actual.
 * v1 = el objeto de ajustes tal cual (como lo guardaba la versión web en localStorage), sin sobre.
 */
export function migrate(raw: unknown): { settings: Record<string, unknown>; migrated: boolean } | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.version !== "number") return { settings: { ...raw }, migrated: true };
  if (!isPlainObject(raw.settings)) return null;
  const settings = { ...raw.settings };
  let v = raw.version;
  let migrated = false;
  if (v < 2) {
    // v1 con sobre: el nombre antiguo de "inputs simplificados" pasa a `simple`.
    if ("simpleInputs" in settings && !("simple" in settings)) settings.simple = settings.simpleInputs;
    delete settings.simpleInputs;
    v = 2;
    migrated = true;
  }
  // Versiones futuras: se leen los campos conocidos tal cual (el juego ignora los que no entiende).
  return { settings, migrated };
}

export function readSettings(dir: string, now = new Date()): { settings: Record<string, unknown> | null; status: ReadStatus; backup?: string } {
  const file = path.join(dir, SETTINGS_FILE);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { settings: null, status: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const m = parsed === undefined ? null : migrate(parsed);
  if (!m) {
    const backup = path.join(dir, `settings.corrupt-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    try {
      fs.copyFileSync(file, backup);
    } catch {
      // Si ni siquiera se puede copiar, seguimos con los valores por defecto.
    }
    return { settings: null, status: "corrupt", backup };
  }
  return { settings: m.settings, status: m.migrated ? "migrated" : "ok" };
}

export function writeSettings(dir: string, settings: Record<string, unknown>, now = new Date()): void {
  const env: SettingsEnvelope = { version: SCHEMA_VERSION, savedAt: now.toISOString(), settings };
  writeAtomic(path.join(dir, SETTINGS_FILE), JSON.stringify(env, null, 2));
}

// ---------------------------------------------------------------- estado de la ventana

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  fullscreen: boolean;
  maximized: boolean;
}

export const DEFAULT_WINDOW: WindowState = { width: 1280, height: 720, fullscreen: false, maximized: false };

export function readWindowState(dir: string): WindowState {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "window-state.json"), "utf8")) as Partial<WindowState>;
    const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
    return {
      x: num(raw.x, -20000, 20000),
      y: num(raw.y, -20000, 20000),
      width: num(raw.width, 640, 16000) ?? DEFAULT_WINDOW.width,
      height: num(raw.height, 360, 16000) ?? DEFAULT_WINDOW.height,
      fullscreen: raw.fullscreen === true,
      maximized: raw.maximized === true,
    };
  } catch {
    return { ...DEFAULT_WINDOW };
  }
}

export function writeWindowState(dir: string, st: WindowState): void {
  writeAtomic(path.join(dir, "window-state.json"), JSON.stringify(st));
}

/** ¿El rectángulo guardado sigue siendo visible en alguna pantalla? (si no, se centra). */
export function visibleOnSomeDisplay(st: WindowState, displays: { x: number; y: number; width: number; height: number }[]): boolean {
  if (st.x === undefined || st.y === undefined) return false;
  return displays.some((d) => st.x! + 100 > d.x && st.x! < d.x + d.width - 100 && st.y! >= d.y - 20 && st.y! < d.y + d.height - 100);
}
