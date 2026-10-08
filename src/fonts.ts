import { loadFont } from "@remotion/fonts";
import { brandFile, type Brand } from "./brands/types";

// Carga las fuentes declaradas en el brand.ts de cada marca.
export const loadBrandFonts = (brands: Brand[]) =>
  Promise.all(
    brands.flatMap((brand) =>
      Object.values(brand.fonts).flatMap((font) =>
        font.files.map(({ file, weight }) =>
          loadFont({ family: font.family, url: brandFile(brand, file), weight }),
        ),
      ),
    ),
  );
