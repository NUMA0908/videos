import { staticFile } from "remotion";
import type { FORMATS } from "../studio";

export type Gradient = { from: string; to: string };

export type FontDef = {
  family: string; // nombre con el que se registra la fuente
  fallback: string; // pila de respaldo mientras no haya archivos
  files: { file: string; weight: string }[]; // rutas relativas a public/<marca>/
};

// Contrato que cumple cada src/brands/<marca>/brand.ts.
export type Brand = {
  id: string; // slug; igual al nombre de la carpeta en src/brands/ y public/
  name: string;
  colors: {
    primary: string;
    primaryLight: string;
    accent: string;
    dark: string;
    light: string;
    muted: string;
    shadow: string;
  };
  gradients: { main: Gradient; dark: Gradient };
  fonts: { heading: FontDef; body: FontDef };
  logo: string | null; // relativo a public/<marca>/; null → placeholder
  screenshots: Record<string, string | null>; // relativos a public/<marca>/
  fps: number;
  formats: typeof FORMATS;
};

// Resuelve un asset de la marca desde public/<marca>/.
export const brandFile = (brand: Brand, path: string) =>
  staticFile(`${brand.id}/${path}`);

export const fontStack = (font: FontDef) => `'${font.family}', ${font.fallback}`;
