import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Logger } from "../electron/logger";
import { readSettings, readWindowState, SCHEMA_VERSION, visibleOnSomeDisplay, writeAtomic, writeSettings, writeWindowState } from "../electron/storage";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "contragolpe-"));

describe("guardado de configuración (escritorio)", () => {
  it("configuración válida: se escribe y se lee igual, con versión de esquema", () => {
    const dir = tmp();
    writeSettings(dir, { musicVolume: 0.3, parry: "hardcore" });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    expect(raw.version).toBe(SCHEMA_VERSION);
    const r = readSettings(dir);
    expect(r.status).toBe("ok");
    expect(r.settings).toEqual({ musicVolume: 0.3, parry: "hardcore" });
  });

  it("sin archivo: valores por defecto", () => {
    expect(readSettings(tmp())).toEqual({ settings: null, status: "missing" });
  });

  it("archivo dañado: valores por defecto y copia de seguridad del dañado", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "settings.json"), '{"version": 2, "settings": {"musicVol');
    const r = readSettings(dir, new Date("2026-01-02T03:04:05Z"));
    expect(r.status).toBe("corrupt");
    expect(r.settings).toBeNull();
    expect(fs.existsSync(r.backup!)).toBe(true);
    expect(fs.readFileSync(r.backup!, "utf8")).toContain("musicVol");
    // Y al guardar de nuevo, todo vuelve a funcionar.
    writeSettings(dir, { sfxVolume: 1 });
    expect(readSettings(dir).status).toBe("ok");
  });

  it("estructura inválida (JSON correcto pero sin sentido) también cuenta como dañado", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "settings.json"), "[1, 2, 3]");
    expect(readSettings(dir).status).toBe("corrupt");
    fs.writeFileSync(path.join(dir, "settings.json"), '{"version": 2, "settings": "hola"}');
    expect(readSettings(dir).status).toBe("corrupt");
  });

  it("archivo de una versión anterior (v1 sin sobre, como el localStorage de la web): se migra", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ musicVolume: 0.7, shake: false }));
    const r = readSettings(dir);
    expect(r.status).toBe("migrated");
    expect(r.settings).toEqual({ musicVolume: 0.7, shake: false });
  });

  it("v1 con sobre: renombra campos antiguos", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ version: 1, settings: { simpleInputs: false } }));
    const r = readSettings(dir);
    expect(r.status).toBe("migrated");
    expect(r.settings).toEqual({ simple: false });
  });

  it("la escritura atómica no deja temporales y reemplaza el archivo entero", () => {
    const dir = tmp();
    const f = path.join(dir, "x.json");
    writeAtomic(f, "a".repeat(10000));
    writeAtomic(f, "b");
    expect(fs.readFileSync(f, "utf8")).toBe("b");
    expect(fs.readdirSync(dir)).toEqual(["x.json"]);
  });

  it("estado de ventana: valida valores y detecta posiciones fuera de pantalla", () => {
    const dir = tmp();
    expect(readWindowState(dir).width).toBe(1280);
    writeWindowState(dir, { x: 100, y: 50, width: 1600, height: 900, fullscreen: true, maximized: false });
    const st = readWindowState(dir);
    expect(st).toMatchObject({ width: 1600, height: 900, fullscreen: true });
    expect(visibleOnSomeDisplay(st, [{ x: 0, y: 0, width: 1920, height: 1080 }])).toBe(true);
    expect(visibleOnSomeDisplay({ ...st, x: 5000 }, [{ x: 0, y: 0, width: 1920, height: 1080 }])).toBe(false);
    fs.writeFileSync(path.join(dir, "window-state.json"), '{"width": -5, "height": "mucho"}');
    expect(readWindowState(dir)).toMatchObject({ width: 1280, height: 720 });
  });
});

describe("registro de errores", () => {
  it("escribe líneas con fecha y nivel, y rota por tamaño", () => {
    const dir = tmp();
    const log = new Logger(dir, 300, 3);
    for (let i = 0; i < 40; i++) log.log("error", `fallo número ${i} ${"x".repeat(20)}`);
    const files = fs.readdirSync(dir).sort();
    expect(files).toContain("main.log");
    expect(files).toContain("main.1.log");
    expect(files.length).toBeLessThanOrEqual(4);
    expect(fs.readFileSync(path.join(dir, "main.log"), "utf8")).toMatch(/\[error\] fallo número 39/);
  });
});
