# Estudio de videos (Remotion)

Repositorio solo para videos y publicidad de varias marcas (hoy: Cuadrate; luego otras como Numa Jugos).
Remotion + React + TypeScript. Una composición = un anuncio en un formato.

## Estructura

```
src/
  Root.tsx                  # registra TODAS las composiciones (un <Folder> por marca)
  studio.ts                 # FPS, formatos (9:16, 1:1, 16:9), seconds(), colores de placeholder
  fonts.ts                  # carga las fuentes declaradas en cada brand.ts
  components/               # piezas compartidas: reciben `brand` por props, nunca lo importan
  brands/
    types.ts                # tipo Brand, brandFile(), fontStack()
    index.ts                # lista BRANDS (para precargar fuentes)
    <marca>/brand.ts        # tokens de la marca: colores, fuentes, logo, capturas, formatos
    <marca>/ads/            # anuncios de la marca
public/<marca>/{logo,screenshots,audio,fonts}/
scripts/render-all.mjs      # renderiza todas las composiciones
```

## Reglas

- **Cada marca usa su propio `src/brands/<marca>/brand.ts`.** Nunca colores, degradados ni fuentes
  hardcodeados en componentes o anuncios: todo sale de `brand.colors`, `brand.gradients`,
  `brand.fonts` (con `fontStack()`).
- **Los componentes de `src/components/` son agnósticos de marca:** reciben `brand: Brand` por
  props. Solo los anuncios en `src/brands/<marca>/ads/` importan su `brand.ts`.
- **Textos en español** (para marcas dominicanas: español dominicano, tono directo y cercano).
  Los textos de cada anuncio van como props con valores por defecto, para editarlos desde el Studio.
- **Animaciones solo con `spring()` / `interpolate()` de Remotion** basadas en `useCurrentFrame()`.
  Nunca CSS transitions, `animation`, `@keyframes` ni librerías basadas en tiempo real.
- **Assets siempre desde `public/<marca>/` con `staticFile()`**, vía `brandFile(brand, "ruta")`.
  Nunca URLs externas ni imports de imágenes. Usa `<Img>`, `<Audio>`, `<Video>` de Remotion.
- **Si falta un asset**, deja la ruta en `null` en `brand.ts` y se mostrará `<MissingAsset>`
  (placeholder visible). Nunca lo escondas ni lo sustituyas por algo inventado.
- **No inventes funciones de la app** que no aparezcan en las capturas de `public/<marca>/screenshots/`.
- **Anuncios nuevos** van en `src/brands/<marca>/ads/` y se registran en `Root.tsx` dentro del
  `<Folder>` de la marca. ID: `<Marca>-<Anuncio>-<formato>` (ej. `Cuadrate-Ejemplo-9x16`);
  solo letras, números y guiones. Usa `brand.formats.*` y `brand.fps`, y `seconds()` para tiempos.

## Marca nueva

1. Copia `src/brands/cuadrate/` a `src/brands/<marca>/` y crea `public/<marca>/{logo,screenshots,audio,fonts}/`.
2. En su `brand.ts`: cambia `id` (= nombre de carpeta), `name`, colores, fuentes, logo y capturas.
3. Añádela a `BRANDS` en `src/brands/index.ts`.
4. Borra o adapta los anuncios copiados y regístralos en `Root.tsx` en un `<Folder>` nuevo.

## Comandos

```bash
npm install
npm run dev                 # Remotion Studio (previsualizar y editar props)
npm run render              # anuncio principal → out/Cuadrate-Ejemplo-9x16.mp4
npm run render:all          # todas las composiciones → out/<id>.mp4
npx remotion render <id> out/<id>.mp4      # una composición concreta
npx remotion still <id> out/<id>.png --frame=120   # un fotograma (revisión rápida)
npm run lint                # eslint + tsc
```

Si no se puede descargar el navegador de Remotion (sandbox/CI sin acceso a remotion.media),
usa un Chromium local: `REMOTION_CHROMIUM=/ruta/a/chromium npm run render`.
