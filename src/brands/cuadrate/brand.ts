import { FORMATS, FPS } from "../../studio";
import type { Brand } from "../types";

// Tokens de marca de Cuadrate.
// ⚠️ Colores y fuentes PROVISIONALES: public/cuadrate/logo/ está vacío.
// Reemplázalos con los oficiales cuando tengas el logo / manual de marca.

const colors = {
  primary: "#1E3A8A", // provisional — azul principal
  primaryLight: "#3B82F6", // provisional — azul claro para degradados
  accent: "#F59E0B", // provisional — ámbar para CTA y resaltados
  dark: "#0F172A", // provisional — fondos oscuros
  light: "#FFFFFF",
  muted: "#CBD5E1",
  shadow: "rgba(0,0,0,0.45)",
};

export const cuadrate: Brand = {
  id: "cuadrate",
  name: "Cuadrate",
  colors,
  gradients: {
    main: { from: colors.primary, to: colors.primaryLight },
    dark: { from: colors.dark, to: colors.primary },
  },
  // Pon los archivos en public/cuadrate/fonts/ y lístalos en `files`,
  // p. ej. { file: "fonts/Poppins-Bold.ttf", weight: "700" }.
  fonts: {
    heading: {
      family: "Cuadrate Heading",
      fallback: "'Helvetica Neue', Arial, sans-serif",
      files: [],
    },
    body: {
      family: "Cuadrate Body",
      fallback: "'Helvetica Neue', Arial, sans-serif",
      files: [],
    },
  },
  logo: null, // esperado: "logo/cuadrate-logo.png"
  screenshots: {
    inicio: null, // esperado: "screenshots/inicio.png"
  },
  fps: FPS,
  formats: FORMATS,
};
