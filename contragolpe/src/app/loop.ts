/** Duración de un tick de simulación: 60 ticks por segundo fijos. */
export const TICK_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5;

/**
 * Bucle de paso fijo con acumulador: la lógica corre exactamente a 60 Hz sin importar los FPS de pantalla.
 * El render dibuja el último estado.
 */
export class FixedLoop {
  private acc = 0;
  private last = -1;
  private raf = 0;
  /** < 1 = cámara lenta (KO). Afecta solo a cuántos ticks se ejecutan, nunca a la lógica de cada tick. */
  timeScale = 1;
  /** Estadísticas para el contador de rendimiento. */
  fps = 60;
  tps = 60;
  private frames = 0;
  private ticks = 0;
  private statT = 0;

  constructor(
    private readonly tick: () => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    const frame = (now: number) => {
      if (this.last < 0) this.last = now;
      const dt = Math.min(now - this.last, 100);
      this.last = now;
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
        this.tick();
        this.acc -= TICK_MS;
        steps++;
        this.ticks++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      this.render();
      this.frames++;
      this.statT += dt;
      if (this.statT >= 1000) {
        this.fps = Math.round((this.frames * 1000) / this.statT);
        this.tps = Math.round((this.ticks * 1000) / this.statT);
        this.frames = 0;
        this.ticks = 0;
        this.statT = 0;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
