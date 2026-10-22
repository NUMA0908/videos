export interface Scene {
  /** Un tick lógico (60 Hz). */
  update(): void;
  /** Dibuja en coordenadas lógicas (960×540). */
  render(ctx: CanvasRenderingContext2D): void;
  enter?(): void;
  exit?(): void;
}
