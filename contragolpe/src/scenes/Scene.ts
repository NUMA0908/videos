export interface Scene {
  /** Identificador estable (los nombres de clase se minifican en producción). */
  readonly kind?: string;
  /** Un tick lógico (60 Hz). */
  update(): void;
  /** Dibuja en coordenadas lógicas (960×540). */
  render(ctx: CanvasRenderingContext2D): void;
  enter?(): void;
  exit?(): void;
  /** La ventana perdió el foco (pausa automática). */
  onBlur?(): void;
}
