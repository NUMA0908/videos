import { AudioEngine } from "../audio/Audio";
import { InputManager } from "../input/InputManager";
import { fitCanvas } from "../render/renderer";
import { VIEW_H, VIEW_W } from "../render/view";
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
  }

  setScene(scene: Scene): void {
    this.scene?.exit?.();
    this.scene = scene;
    scene.enter?.();
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
    const gameplay = this.scene?.kind === "match" || this.scene?.kind === "fight" || this.scene?.kind === "trial";
    if (++this.mouseIdle === 120 && gameplay) this.canvas.style.cursor = "none";
    if (!gameplay && this.canvas.style.cursor === "none") this.canvas.style.cursor = "default";
    if (this.input.anyPadPressed()) this.audio.unlock();
    if (this.input.keyPressed("F3")) this.showFps = !this.showFps;
    this.scene?.update();
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
