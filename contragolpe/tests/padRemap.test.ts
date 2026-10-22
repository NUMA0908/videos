import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings } from "../src/app/settings";
import { DEFAULT_KEYS, DEFAULT_PAD, DEFAULT_RAW_PAD, PAD_ACTIONS } from "../src/input/bindings";
import { PadButton, PadReader } from "../src/input/gamepad";
import { axisCode, hatCode, hatDirection } from "../src/input/padCodes";
import { detectPadKind, profileKey } from "../src/input/padKind";
import { DEFAULT_PAD_TUNING } from "../src/input/padTuning";
import { assignKey, assignPadInput, findPadConflicts, PadCapture } from "../src/input/remap";
import { DOWN, HK, HP, LEFT, LK, LP, PARRY, RIGHT, SP, UP } from "./helpers";
import { FakePad, makeInput, tick } from "./padHelpers";

const XBOX = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)";
const DUALSENSE = "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)";
const SWITCH = "Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)";
const ARCADE = "Arcade Stick (Vendor: 0f0d Product: 0092)";

describe("diseño por defecto del mando", () => {
  it("X/□=LP, Y/△=HP, A/✕=LK, B/○=HK, LB=agarre, RB=parry, RT=súper, LT=especial simple", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    const expected: [number, number][] = [
      [PadButton.X, LP],
      [PadButton.Y, HP],
      [PadButton.A, LK],
      [PadButton.B, HK],
      [PadButton.LB, LP | LK], // agarre: LP+LK en el mismo frame, lo que ya entiende la simulación
      [PadButton.RB, PARRY],
      [PadButton.RT, HP | HK], // súper: atajo HP+HK
      [PadButton.LT, SP],
      [PadButton.START, 0], // pausa: solo menús, nunca llega a la simulación
    ];
    for (const [b, mask] of expected) {
      pad.releaseAll().press(b);
      expect(tick(input)[0], `botón ${b}`).toBe(mask);
    }
  });

  it("Start abre la pausa (menú) en el tick en que se pulsa", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    input.poll();
    input.endTick();
    pad.press(PadButton.START);
    input.poll();
    expect(input.menu().pause).toBe(true);
    input.endTick();
    input.poll();
    expect(input.menu().pause).toBe(false); // mantenerlo no repite
  });

  it("menús: A/✕ acepta y B/○ vuelve (X ya no acepta)", () => {
    const pad = new FakePad();
    const { input } = makeInput([pad]);
    tick(input);
    pad.press(PadButton.A);
    input.poll();
    expect(input.menu().confirm).toBe(true);
    input.endTick();
    pad.releaseAll().press(PadButton.X);
    input.poll();
    expect(input.menu().confirm).toBe(false);
    input.endTick();
    pad.releaseAll().press(PadButton.B);
    input.poll();
    expect(input.menu().back).toBe(true);
  });
});

describe("tipos de mando y perfiles", () => {
  it("detecta Xbox, PlayStation, Switch, genérico y no estándar", () => {
    expect(detectPadKind(XBOX, "standard")).toBe("xbox");
    expect(detectPadKind(DUALSENSE, "standard")).toBe("playstation");
    expect(detectPadKind("054c-09cc-Wireless Controller", "standard")).toBe("playstation");
    expect(detectPadKind(SWITCH, "standard")).toBe("switch");
    expect(detectPadKind("USB Gamepad (STANDARD GAMEPAD Vendor: 0079)", "standard")).toBe("generic");
    expect(detectPadKind(ARCADE, "")).toBe("raw");
    expect(profileKey(ARCADE, "")).toBe(`raw:${ARCADE}`);
  });

  it("un perfil por tipo: remapear el de Xbox no cambia el de PlayStation", () => {
    const xbox = new FakePad(0, XBOX);
    const ps = new FakePad(1, DUALSENSE);
    const profiles = { xbox: { ...structuredClone(DEFAULT_PAD), LP: [PadButton.A], LK: [PadButton.X] } };
    const { input } = makeInput([xbox, ps], profiles);
    xbox.press(PadButton.A);
    ps.press(PadButton.A);
    expect(tick(input)).toEqual([LP, LK]);
  });
});

describe("remapeo con conflictos", () => {
  it("asignar un botón ocupado intercambia las dos acciones", () => {
    const p = structuredClone(DEFAULT_PAD);
    const { swappedWith } = assignPadInput(p, "LP", PadButton.Y); // Y era HP
    expect(swappedWith).toBe("HP");
    expect(p.LP).toEqual([PadButton.Y]);
    expect(p.HP).toEqual([PadButton.X]);
    expect(findPadConflicts(p)).toEqual([]);
  });

  it("asignar un botón libre no toca nada más", () => {
    const p = structuredClone(DEFAULT_PAD);
    expect(assignPadInput(p, "PARRY", PadButton.R3).swappedWith).toBeNull();
    expect(p.PARRY).toEqual([PadButton.R3]);
  });

  it("detecta conflictos en perfiles guardados a mano", () => {
    const p = structuredClone(DEFAULT_PAD);
    p.HK = [PadButton.X];
    expect(findPadConflicts(p)).toEqual([{ code: PadButton.X, actions: ["LP", "HK"] }]);
  });

  it("el teclado también intercambia en vez de dejar una acción vacía", () => {
    const k = structuredClone(DEFAULT_KEYS[0]);
    expect(assignKey(k, "LP", "KeyK").swappedWith).toBe("HP");
    expect(k.LP).toEqual(["KeyK"]);
    expect(k.HP).toEqual(["KeyJ"]);
  });

  it("restablecer = borrar el perfil: vuelve el diseño de fábrica", () => {
    const pad = new FakePad();
    const profiles: Record<string, typeof DEFAULT_PAD> = { xbox: { ...structuredClone(DEFAULT_PAD), LP: [PadButton.A], LK: [PadButton.X] } };
    const { input } = makeInput([pad], profiles);
    pad.press(PadButton.X);
    expect(tick(input)[0]).toBe(LK);
    delete profiles.xbox;
    expect(tick(input)[0]).toBe(LP);
  });
});

describe("mandos no estándar y configuración guiada", () => {
  const rawPad = () => {
    const p = new FakePad(0, ARCADE, "");
    p.axes = [0, 0, -1, 3.2857]; // eje 2 = gatillo en reposo (−1), eje 3 = hat en reposo
    return p;
  };

  it("el hat decodifica las 8 direcciones y el reposo", () => {
    const dirs = [UP, UP | RIGHT, RIGHT, DOWN | RIGHT, DOWN, DOWN | LEFT, LEFT, UP | LEFT];
    dirs.forEach((d, k) => expect(hatDirection(-1 + (k * 2) / 7)).toBe(d));
    expect(hatDirection(3.2857)).toBe(0);
    expect(hatDirection(1.2857)).toBe(0);
  });

  it("la captura espera el reposo y detecta botón, gatillo en eje y hat", () => {
    const p = rawPad().press(5); // el botón con el que se abrió la captura sigue pulsado
    const r = new PadReader();
    const cap = new PadCapture();
    const read = () => {
      r.update(p, DEFAULT_PAD_TUNING);
      return cap.poll(r);
    };
    r.update(p, DEFAULT_PAD_TUNING);
    cap.begin(r);
    expect(read()).toBeNull(); // todavía no ha vuelto a reposo
    p.releaseAll();
    expect(read()).toBeNull(); // ahora sí: armado
    p.press(3);
    expect(read()).toBe(3);
    p.releaseAll();
    cap.begin(r);
    read();
    p.axes[2] = 0.9; // gatillo en eje: de −1 a +0.9
    expect(read()).toBe(axisCode(2, 1));
    p.axes[2] = -1;
    r.update(p, DEFAULT_PAD_TUNING); // la escena siempre empieza la captura tras leer el mando
    cap.begin(r);
    read();
    p.axes[3] = -1; // hat arriba
    expect(read()).toBe(hatCode(3));
  });

  it("el paso siguiente puede empezar con el hat o el gatillo aún pulsados sin capturar el regreso", () => {
    const p = rawPad();
    const r = new PadReader();
    const cap = new PadCapture();
    const read = () => {
      r.update(p, DEFAULT_PAD_TUNING);
      return cap.poll(r);
    };
    r.update(p, DEFAULT_PAD_TUNING);
    cap.begin(r); // reposo aprendido aquí
    read();
    p.axes[3] = -1;
    expect(read()).toBe(hatCode(3));
    cap.begin(r); // siguiente paso con el hat todavía arriba
    expect(read()).toBeNull();
    p.axes[3] = 3.2857; // vuelve a reposo: no es una entrada
    expect(read()).toBeNull();
    p.axes[2] = 1;
    expect(read()).toBe(axisCode(2, 1));
    cap.begin(r);
    p.axes[2] = -1; // el gatillo vuelve a su reposo (−1): tampoco cuenta
    expect(read()).toBeNull();
    expect(read()).toBeNull();
    p.press(4);
    expect(read()).toBe(4);
  });

  it("perfil no estándar configurado: hat, botones y gatillo en eje producen las mismas máscaras", () => {
    const p = rawPad();
    const profile = structuredClone(DEFAULT_RAW_PAD);
    assignPadInput(profile, "up", hatCode(3)); // el hat cubre las cuatro direcciones
    assignPadInput(profile, "LP", 0);
    assignPadInput(profile, "HP", 1);
    assignPadInput(profile, "SUPER", axisCode(2, 1));
    expect(profile.right).toEqual([hatCode(3)]);
    const { input } = makeInput([p], { [`raw:${ARCADE}`]: profile });
    p.axes[3] = -1 + (3 * 2) / 7; // ↘
    p.press(0);
    expect(tick(input)[0]).toBe(DOWN | RIGHT | LP);
    p.releaseAll();
    p.axes[3] = 3.2857;
    p.axes[2] = 1;
    expect(tick(input)[0]).toBe(HP | HK);
  });

  it("un mando no estándar sin configurar no inventa botones (solo el stick de los ejes 0/1)", () => {
    const p = rawPad().press(0, 1, 2);
    const { input } = makeInput([p]);
    expect(tick(input)[0]).toBe(0);
    p.stick(0.9, 0);
    expect(tick(input)[0]).toBe(RIGHT);
  });
});

describe("ajustes guardados", () => {
  it("perfiles válidos se cargan; claves o códigos inválidos y el formato antiguo se descartan", () => {
    const good = structuredClone(DEFAULT_PAD);
    good.LP = [PadButton.A];
    const s = parseSettings({
      ...defaultSettings(),
      pads: [{ LP: [1] }, {}],
      padProfiles: {
        xbox: good,
        playstation: { ...structuredClone(DEFAULT_PAD), LP: [-3] },
        "raw:Arcade": structuredClone(DEFAULT_RAW_PAD),
        hacker: structuredClone(DEFAULT_PAD),
      },
    });
    expect(Object.keys(s.padProfiles).sort()).toEqual(["raw:Arcade", "xbox"]);
    expect(s.padProfiles.xbox.LP).toEqual([PadButton.A]);
    expect("pads" in s).toBe(false);
    expect(PAD_ACTIONS.every((a) => Array.isArray(s.padProfiles.xbox[a]))).toBe(true);
  });
});
