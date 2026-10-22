import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings } from "../src/app/settings";

describe("ajustes del juego", () => {
  it("lo desconocido o con tipo incorrecto se descarta y se usan los valores por defecto", () => {
    const s = parseSettings({ musicVolume: "alto", sfxVolume: 3, parry: "imposible", cpuLevel: 7, shake: false, extra: 1, keys: [{}, {}] });
    const d = defaultSettings();
    expect(s.musicVolume).toBe(d.musicVolume);
    expect(s.sfxVolume).toBe(1);
    expect(s.parry).toBe("normal");
    expect(s.cpuLevel).toBe(d.cpuLevel);
    expect(s.shake).toBe(false);
    expect(s.keys).toEqual(d.keys);
    expect("extra" in s).toBe(false);
  });

  it("basura total → valores por defecto", () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings([1, 2])).toEqual(defaultSettings());
  });

  it("controles válidos se conservan", () => {
    const d = defaultSettings();
    d.keys[0].LP = ["KeyG"];
    expect(parseSettings(JSON.parse(JSON.stringify(d))).keys[0].LP).toEqual(["KeyG"]);
  });
});

describe("menús con desplazamiento", () => {
  it("la fila seleccionada siempre es visible y la ventana no se sale de la lista", async () => {
    const { menuScroll } = await import("../src/ui/ui");
    for (const count of [3, 10, 16, 25]) {
      for (let sel = 0; sel < count; sel++) {
        const rows = 10;
        const first = menuScroll(count, sel, rows);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(sel).toBeGreaterThanOrEqual(first);
        expect(sel).toBeLessThan(first + rows);
        expect(first + Math.min(rows, count)).toBeLessThanOrEqual(count);
      }
    }
  });
});
