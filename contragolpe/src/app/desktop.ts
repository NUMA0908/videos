/**
 * Puente con la app de escritorio (Electron). En el navegador no existe y todo funciona como siempre.
 * Debe coincidir con lo que expone electron/preload.ts.
 */
export interface DesktopApi {
  isDesktop: true;
  platform: string;
  toggleFullscreen(): Promise<boolean>;
  setFullscreen(on: boolean): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  quit(): Promise<void>;
  onFocusChange?(cb: (focused: boolean) => void): () => void;
  loadSettings?(): Promise<string | null>;
  saveSettings?(json: string): Promise<boolean>;
  log?(level: "info" | "warn" | "error", message: string): void;
  setInMatch?(on: boolean): void;
  reportMetric?(name: string, value: number): void;
}

export const desktop: DesktopApi | undefined = (globalThis as { contragolpeDesktop?: DesktopApi }).contragolpeDesktop;
