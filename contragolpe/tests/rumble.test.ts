import { describe, expect, it } from "vitest";
import { RUMBLE, rumbleFor, Rumbler } from "../src/input/rumble";
import type { SimEvent } from "../src/sim/types";
import { notationTokens } from "../src/ui/glyphs";
import { PadButton } from "../src/input/gamepad";
import { FakePad, makeInput, tick } from "./padHelpers";

const ev = (type: SimEvent["type"], side: 0 | 1, extra: Partial<SimEvent> = {}): SimEvent => ({ type, side, x: 0, y: 0, ...extra });

/** Mando con actuador falso que registra lo que se le pide. */
function rumblePad() {
  const calls: Record<string, number>[] = [];
  let resets = 0;
  return {
    calls,
    get resets() {
      return resets;
    },
    vibrationActuator: {
      playEffect: (_type: string, p: Record<string, number>) => {
        calls.push(p);
        return Promise.resolve("complete");
      },
      reset: () => {
        resets++;
        return Promise.resolve();
      },
    },
  };
}

describe("vibración: qué vibra y para quién", () => {
  it("el golpe vibra en quien lo recibe, proporcional a su fuerza", () => {
    expect(rumbleFor(ev("hit", 0, { strength: "light" }), 1)).toBe(RUMBLE.hitLight);
    expect(rumbleFor(ev("hit", 0, { strength: "light" }), 0)).toBeNull();
    expect(rumbleFor(ev("hit", 0, { strength: "heavy" }), 1)).toBe(RUMBLE.hitHeavy);
    expect(rumbleFor(ev("hit", 0, { strength: "super" }), 1)).toBe(RUMBLE.hitSuper);
    expect(RUMBLE.hitHeavy.strong).toBeGreaterThan(RUMBLE.hitLight.strong);
    expect(RUMBLE.hitHeavy.ms).toBeGreaterThan(RUMBLE.hitLight.ms);
  });

  it("bloqueo (defensor), parry (quien lo hace), súper (quien la lanza) y KO (los dos, más fuerte el que cae)", () => {
    expect(rumbleFor(ev("block", 0), 1)).toBe(RUMBLE.block);
    expect(rumbleFor(ev("parry", 1), 1)).toBe(RUMBLE.parry);
    expect(rumbleFor(ev("parry", 1), 0)).toBeNull();
    expect(rumbleFor(ev("super", 0), 0)).toBe(RUMBLE.super);
    expect(rumbleFor(ev("ko", 0), 1)).toBe(RUMBLE.ko);
    expect(rumbleFor(ev("ko", 0), 0)).toBe(RUMBLE.koWin);
    expect(rumbleFor(ev("jump", 0), 0)).toBeNull();
  });
});

describe("Rumbler", () => {
  it("usa dual-rumble con la intensidad del ajuste", () => {
    const pad = rumblePad();
    const r = new Rumbler();
    r.intensity = 0.5;
    r.onEvents([ev("hit", 0, { strength: "heavy" })], [null, pad], 0);
    expect(pad.calls).toEqual([{ startDelay: 0, duration: RUMBLE.hitHeavy.ms, strongMagnitude: RUMBLE.hitHeavy.strong * 0.5, weakMagnitude: RUMBLE.hitHeavy.weak * 0.5 }]);
  });

  it("no se acumula: golpes seguidos durante una vibración no la repiten; uno más fuerte sí la sustituye", () => {
    const pad = rumblePad();
    const r = new Rumbler();
    r.onEvents([ev("hit", 0, { strength: "light" })], [null, pad], 0);
    r.onEvents([ev("hit", 0, { strength: "light" })], [null, pad], 16); // hitstop: otro impacto ligero
    r.onEvents([ev("hit", 0, { strength: "light" })], [null, pad], 33);
    expect(pad.calls.length).toBe(1);
    r.onEvents([ev("hit", 0, { strength: "heavy" })], [null, pad], 50);
    expect(pad.calls.length).toBe(2);
    r.onEvents([ev("hit", 0, { strength: "light" })], [null, pad], 50 + RUMBLE.hitHeavy.ms + 1); // terminó
    expect(pad.calls.length).toBe(3);
  });

  it("desactivada, sin actuador o con un actuador que falla: no vibra y no lanza errores", () => {
    const r = new Rumbler();
    r.enabled = false;
    const pad = rumblePad();
    r.onEvents([ev("ko", 0)], [pad, pad], 0);
    expect(pad.calls.length).toBe(0);
    r.enabled = true;
    expect(() => r.onEvents([ev("ko", 0)], [{}, { vibrationActuator: {} }], 0)).not.toThrow();
    const broken = { vibrationActuator: { playEffect: () => { throw new Error("no admitido"); } } };
    expect(() => r.onEvents([ev("ko", 0)], [broken, null], 0)).not.toThrow();
    const rejecting = { vibrationActuator: { playEffect: () => Promise.reject(new Error("no")) } };
    expect(() => r.onEvents([ev("ko", 0)], [rejecting, null], 0)).not.toThrow();
  });

  it("stop() corta la vibración (pausa) y permite vibrar de nuevo al momento", () => {
    const pad = rumblePad();
    const r = new Rumbler();
    r.onEvents([ev("ko", 0)], [null, pad], 0);
    r.stop([null, pad]);
    expect(pad.resets).toBe(1);
    r.onEvents([ev("hit", 0, { strength: "light" })], [null, pad], 10);
    expect(pad.calls.length).toBe(2);
  });
});

describe("íconos por dispositivo", () => {
  it("la notación se convierte en tokens de botones (P y K = cualquier puño/patada)", () => {
    expect(notationTokens("↓↘→ + P")).toBe("↓↘→ + {P}");
    expect(notationTokens("→ + HK")).toBe("→ + {HK}");
    expect(notationTokens("LP+LK")).toBe("{LP}+{LK}");
    expect(notationTokens("↓↘→↓↘→ + P")).toBe("↓↘→↓↘→ + {P}");
  });

  it("el último dispositivo usado decide los íconos de los menús", () => {
    const pad = new FakePad();
    const { input, kb } = makeInput([pad]);
    expect(input.lastDevice).toBe(-1);
    pad.press(PadButton.A);
    tick(input);
    expect(input.lastDevice).toBe(0);
    kb.down("Enter");
    tick(input);
    expect(input.lastDevice).toBe(-1);
  });
});

describe("historial de entrada del entrenamiento", () => {
  it("cada entrada: dirección relativa al rival + botones como íconos", async () => {
    const { historyTokens } = await import("../src/ui/inputHistory");
    const { Btn } = await import("../src/sim/input");
    expect(historyTokens(Btn.DOWN | Btn.RIGHT | Btn.LP, 1)).toBe("↘ {LP}");
    expect(historyTokens(Btn.DOWN | Btn.RIGHT | Btn.LP, -1)).toBe("↙ {LP}"); // mirando a la izquierda, → es atrás
    expect(historyTokens(Btn.HP | Btn.HK, 1)).toBe("· {HP} {HK}");
    expect(historyTokens(Btn.PARRY, 1)).toBe("· {PARRY}");
  });
});
