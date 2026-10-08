// Constantes compartidas por todas las marcas del estudio.

export const FPS = 30;

export const FORMATS = {
  vertical: { width: 1080, height: 1920 }, // 9:16
  square: { width: 1080, height: 1080 }, // 1:1
  horizontal: { width: 1920, height: 1080 }, // 16:9
} as const;

export type FormatName = keyof typeof FORMATS;

// Colores del placeholder de assets faltantes: llamativos a propósito, no son de ninguna marca.
export const PLACEHOLDER = {
  border: "#FF00AA",
  stripeA: "#0F172A",
  stripeB: "#1E293B",
  text: "#FFFFFF",
} as const;

export const seconds = (s: number, fps: number = FPS) => Math.round(s * fps);
