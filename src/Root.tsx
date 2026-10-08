import React from "react";
import { Composition, Folder, cancelRender, continueRender, delayRender } from "remotion";
import { BRANDS } from "./brands";
import { cuadrate } from "./brands/cuadrate/brand";
import {
  CUADRATE_EJEMPLO_DURATION,
  CuadrateEjemplo,
  cuadrateEjemploDefaults,
} from "./brands/cuadrate/ads/CuadrateEjemplo";
import { loadBrandFonts } from "./fonts";

// Bloquea el render hasta que las fuentes de todas las marcas estén cargadas.
const fontHandle = delayRender("Cargando fuentes de marca");
loadBrandFonts(BRANDS)
  .then(() => continueRender(fontHandle))
  .catch((err) => cancelRender(err));

// Un <Folder> por marca. Anuncio nuevo: créalo en src/brands/<marca>/ads/ y regístralo aquí.
// IDs: <Marca>-<Anuncio>-<formato>, solo letras, números y guiones.
export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Cuadrate">
      <Composition
        id="Cuadrate-Ejemplo-9x16"
        component={CuadrateEjemplo}
        durationInFrames={CUADRATE_EJEMPLO_DURATION}
        fps={cuadrate.fps}
        {...cuadrate.formats.vertical}
        defaultProps={cuadrateEjemploDefaults}
      />
    </Folder>
  </>
);
