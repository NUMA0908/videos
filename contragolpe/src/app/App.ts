import { AudioEngine } from "../audio/Audio";
import { InputManager, type PadEvent } from "../input/InputManager";
import { PAD_KIND_LABEL, detectPadKind } from "../input/padKind";
import { RUMBLE, Rumbler } from "../input/rumble";
import { fitCanvas } from "../render/renderer";
import { FONT, VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "../scenes/Scene";
import { desktop } from "./desktop";
import { FixedLoop } from "./loop";
import { loadSettings, saveSettings, type Settings } from "./settings";

/** Contenedor de la aplicación: canvas, bucle, entrada, ajustes y escena activa. */
export class App {
  readonly ctx: CanvasRenderingContext2D;
  readonly input: InputManager;
  readonly settings: Settings;
  readonly loop: FixedLoop;
  readonly audio = new AudioEngine();
  /** Vibración de los mandos (capa de efectos, fuera de la simulación). */
  readonly rumble = new Rumbler();
  scene: Scene | null = null;
  /** Reloj de presentación (segundos) para animaciones de fondo. */
  time = 0;
  private scale = 1;
  showFps = false;
  private mouseIdle = 0;
  focused = true;

  resize(): void {
    this.scale = fitCanvas(this.canvas, this.settings.pixelPerfect, this.settings.lowPower ? 1 : 2);
  }

  async toggleFullscreen(): Promise<void> {
    if (desktop) {
      await desktop.toggleFullscreen();
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // El navegador puede negarlo (p. ej. sin gesto del usuario): no pasa nada.
    }
  }

  private onFocus(focused: boolean): void {
    if (this.focused === focused) return;
    this.focused = focused;
    this.audio.duck(!focused);
    if (!focused && this.settings.pauseOnBlur) this.scene?.onBlur?.();
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    initial: Settings | null = null,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
    this.settings = initial ?? loadSettings();
    this.input = new InputManager(this.settings.keys, this.settings.padProfiles);
    // Misma referencia: lo que se ajuste en Opciones se aplica al instante.
    this.input.tuning = this.settings.padTuning;
    this.applyRumbleSettings();
    this.input.attach(window);
    this.loop = new FixedLoop(
      () => this.tick(),
      () => this.draw(),
    );
    // El audio solo puede arrancar tras un gesto del usuario.
    const unlock = () => {
      this.audio.unlock();
      this.audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    };
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("resize", () => this.resize());
    this.resize();
    // F11 y Alt+Enter alternan pantalla completa. En escritorio el proceso principal intercepta las teclas reales
    // antes (y las consume), así que esto solo actúa en el navegador o con teclas inyectadas por pruebas.
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" && e.altKey) || e.code === "F11") {
        e.preventDefault();
        void this.toggleFullscreen();
      }
    });
    // Cursor: visible en menús; en partida se oculta tras 2 s sin mover el ratón.
    window.addEventListener("mousemove", () => {
      this.mouseIdle = 0;
      this.canvas.style.cursor = "default";
    });
    // Perder el foco: pausa (opcional) y baja el volumen.
    window.addEventListener("blur", () => this.onFocus(false));
    window.addEventListener("focus", () => this.onFocus(true));
    desktop?.onFocusChange?.((focused) => this.onFocus(focused));
    // Altas y bajas de mandos: solo para el registro (el juego las detecta sondeando en cada tick).
    window.addEventListener("gamepadconnected", (e) => desktop?.log?.("info", `Mando conectado: ${(e as GamepadEvent).gamepad.id}`));
    window.addEventListener("gamepaddisconnected", (e) => desktop?.log?.("info", `Mando desconectado: ${(e as GamepadEvent).gamepad.id}`));
  }

  applyRumbleSettings(): void {
    this.rumble.enabled = this.settings.rumble;
    this.rumble.intensity = this.settings.rumbleIntensity;
  }

  /** Vibración de prueba en el mando con el que se navega (Opciones). */
  testRumble(): void {
    const i = this.input.lastDevice;
    if (i >= 0) this.rumble.play(this.input.readers[i].pad, 0, RUMBLE.hitHeavy, this.time * 1000, true);
  }

  setScene(scene: Scene): void {
    this.scene?.exit?.();
    this.scene = scene;
    // La pulsación que cambió de pantalla no puede disparar también algo en la nueva.
    this.input.consume();
    scene.enter?.();
  }

  private isGameplay(): boolean {
    const k = this.scene?.kind;
    return k === "match" || k === "fight" || k === "trial";
  }

  /** Aviso breve encima de todo (altas y bajas de mandos). */
  private toastText = "";
  private toastT = 0;

  toast(text: string, ticks = 150): void {
    this.toastText = text;
    this.toastT = ticks;
  }

  private onPadEvent(e: PadEvent): void {
    const who = `J${e.player + 1}`;
    const kind = PAD_KIND_LABEL[detectPadKind(e.id, "standard")];
    const playing = this.isGameplay();
    if (e.type === "joined") this.toast(`${who}: mando ${kind} listo`);
    // En partida la escena ya muestra el aviso grande de desconexión.
    else if (e.type === "lost") (playing ? desktop?.log?.("warn", `Mando de ${who} desconectado en partida`) : this.toast(`Mando de ${who} desconectado`, 240));
    else if (e.type === "reconnected") this.toast(`Mando de ${who} reconectado`);
    else this.toast(`${who} sigue con teclado`);
  }

  saveSettings(): void {
    saveSettings(this.settings);
  }

  private tick(): void {
    const t0 = performance.now();
    this.tickInner();
    this.perf.tickMs = this.perf.tickMs * 0.95 + (performance.now() - t0) * 0.05;
  }

  private tickInner(): void {
    this.time += 1 / 60;
    this.input.poll();
    const gameplay = this.isGameplay();
    if (++this.mouseIdle === 120 && gameplay) this.canvas.style.cursor = "none";
    if (!gameplay && this.canvas.style.cursor === "none") this.canvas.style.cursor = "default";
    if (this.input.anyPadPressed()) this.audio.unlock();
    if (this.input.keyPressed("F3")) this.showFps = !this.showFps;
    this.scene?.update();
    for (const e of this.input.events) this.onPadEvent(e);
    if (this.toastT > 0) this.toastT--;
    this.input.endTick();
  }

  /** Estadísticas de coste por frame (ms) para medir rendimiento. */
  readonly perf = { tickMs: 0, drawMs: 0, maxDrawMs: 0, frames: 0 };

  private draw(): void {
    const t0 = performance.now();
    this.drawInner();
    const dt = performance.now() - t0;
    const p = this.perf;
    p.drawMs = p.drawMs * 0.95 + dt * 0.05;
    p.maxDrawMs = Math.max(p.maxDrawMs * 0.999, dt);
    p.frames++;
  }

  private drawInner(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = "#07070c";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.scene?.render(ctx);
    if (this.toastT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastT / 20);
      ctx.font = `bold 15px ${FONT}`;
      const w = ctx.measureText(this.toastText).width + 32;
      // En partida, bajo el marcador; en los menús, sobre la barra de ayuda inferior.
      const playing = this.isGameplay();
      const y = playing ? 150 : VIEW_H - 30;
      ctx.fillStyle = "rgba(8,10,28,0.96)";
      if (playing) ctx.fillRect(VIEW_W / 2 - w / 2, y, w, 30);
      else ctx.fillRect(0, y, VIEW_W, 30);
      ctx.fillStyle = "#7fe3ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.toastText, VIEW_W / 2, y + 15);
      ctx.restore();
    }
    if (this.showFps) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(VIEW_W - 120, VIEW_H - 22, 116, 18);
      ctx.fillStyle = "#9f9";
      ctx.font = "12px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`${this.loop.fps} fps · ${this.loop.tps} tps`, VIEW_W - 8, VIEW_H - 19);
    }
  }

  start(): void {
    this.loop.start();
  }
}
