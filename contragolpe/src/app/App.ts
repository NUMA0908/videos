import { AudioEngine } from "../audio/Audio";
import { InputManager } from "../input/InputManager";
import { fitCanvas } from "../render/renderer";
import { VIEW_H, VIEW_W } from "../render/view";
import type { Scene } from "../scenes/Scene";
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

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
    this.settings = loadSettings();
    this.input = new InputManager(this.settings.keys, this.settings.pads);
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
    const resize = () => (this.scale = fitCanvas(canvas));
    window.addEventListener("resize", resize);
    resize();
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
    this.time += 1 / 60;
    this.input.poll();
    if (this.input.anyPadPressed()) this.audio.unlock();
    if (this.input.keyPressed("F3")) this.showFps = !this.showFps;
    this.scene?.update();
    this.input.endTick();
  }

  private draw(): void {
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
