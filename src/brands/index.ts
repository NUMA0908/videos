import { cuadrate } from "./cuadrate/brand";
import type { Brand } from "./types";

// Todas las marcas del estudio (se usa para precargar sus fuentes).
// Marca nueva: copia src/brands/cuadrate/, edita su brand.ts y añádela aquí.
export const BRANDS: Brand[] = [cuadrate];
