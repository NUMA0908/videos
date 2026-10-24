# Plan: personajes con sprites ilustrados

Estado: **propuesta, sin implementar.** Los nombres de archivo y el formato están en
[../ASSETS_NEEDED.md](../ASSETS_NEEDED.md) §2.

## Qué hay hoy y qué hay que cambiar

```
FighterState ─► poseFor() ─► FighterAnimator (enlaces, estiramiento, retroceso) ─► solve() ─► drawFighterBody()
 (simulación)   animator.ts   fighterAnim.ts                                        skeleton.ts (cápsulas)
```

Lo que **ya está bien separado** (no cambia):

- La simulación no sabe nada del dibujo. Hitbox, hurtbox y pushbox son **datos** (`src/data/moves/*`): el arte nuevo no
  cambia cómo se golpea, y el modo debug (F1) sigue dibujando las cajas encima.
- Efectos, sonido, cámara, HUD, hitstop, destello y vibración reaccionan a `state.events` y no dependen del esqueleto.

Lo que **está atado al esqueleto** (hay que abstraer):

1. `drawFighter` llama a `solve()` + `drawFighterBody()` directamente.
2. Varias piezas piden **posiciones de articulaciones**: la estela del golpe (`FightScene.trackSmears`, mano/pie), la
   energía en las manos de los especiales (`renderer.ts`) y el test de arte (puño de la pose de impacto dentro de la hitbox).
3. Las transiciones suaves interpolan **ángulos** (`lerpPose`). Con sprites no se puede interpolar entre dibujos.
4. Destello blanco, contorno de parry/súper y paleta alternativa se hacen **recoloreando las cápsulas**.

## Cambio de arquitectura

Una interfaz de presentación por personaje, con dos implementaciones intercambiables:

```ts
interface FighterView {
  /** Dibuja al personaje en su origen (el llamador ya trasladó, giró por `facing` y aplicó el estiramiento). */
  draw(ctx, f: FighterState, anim: FighterAnimator, opt: { flash: number; tint?: string; alt: boolean }): void;
  /** Punto de la extremidad (mano/pie) en coordenadas locales: estela, energía, QA. */
  limbPoint(f: FighterState, limb: "handF" | "handB" | "footF" | "footB"): { x: number; y: number } | null;
}
```

- **`SkeletonView`**: lo de hoy, movido tal cual (sin cambio visual).
- **`SpriteView`**: nueva. Se elige **por personaje**: si están todos sus sprites, usa sprites; si falta alguno, cae al
  esqueleto. Así se puede pasar **un personaje a la vez** (lo que pide el skill) sin romper los otros.

Piezas nuevas de `SpriteView` (todo en `src/render/sprites/`, fuera de la simulación):

| Pieza | Qué hace |
|---|---|
| `spriteFrameFor(f)` | Igual que `poseFor`, pero devuelve `{ anim, drawing }`: qué carpeta y qué dibujo toca en este frame. Usa `f.state`, `f.move`, `f.mf`, `f.t`, `f.vy`. |
| Tabla de tiempos por personaje (`src/render/sprites/<personaje>.ts`) | Para cada animación de ataque: cuántos frames se sostiene cada dibujo, el índice del primer dibujo de golpe, y el punto de la mano/pie en los dibujos de golpe (para la estela). Es **dato editable**: se re-cronometra sin redibujar. |
| Cargador | `import.meta.glob("/assets/sprites/**/*.png")` (como el audio). Precarga solo los **2 personajes del combate** al entrar en la pantalla de combate, con un "Cargando…" si tarda. |
| Atlas (`npm run sprites`) | Empaqueta los PNG de cada personaje en hojas grandes recortando el transparente (con el ancla guardada en un JSON). Menos memoria y menos archivos. |
| Destello y contornos | Un canvas auxiliar: `source-atop` con blanco para el destello, y la silueta teñida desplazada para el contorno de parry/súper (el mismo truco que hoy con las cápsulas). |
| Paleta alternativa | Si existe `assets/sprites/<personaje>/alt/`, se usa; si no, se genera una vez al cargar con un cambio de tono sobre el atlas (no en cada frame). |

Lo que se conserva de `FighterAnimator` con sprites: estiramiento en el impacto, retroceso (como rotación de todo el
sprite), vibración de hitstop y destello. Las **poses de enlace** dejan de ser interpolación: pasan a ser dibujos
(el primer dibujo de anticipación ya sale de la guardia; los `_01` de `crouch`, `block`, `wakeup`… son el enlace).

## Reglas que verifican los tests

1. **La animación y la lógica no se desfasan:** la suma de frames de cada animación de ataque = startup − 1 + active +
   recovery, y el primer dibujo de golpe cae exactamente en el frame `startup`.
2. **Lo que se ve es lo que pega:** el punto de mano/pie del dibujo de impacto está dentro de la hitbox (el mismo test de
   hoy, con los puntos de la tabla en vez de la IK).
3. **Ancla estable:** todos los dibujos de una animación tienen el mismo tamaño (para no temblar).
4. Personaje completo o fallback: la lista de animaciones requeridas sale del mismo generador que ASSETS_NEEDED.md.
5. La simulación no cambia: los tests de determinismo siguen igual (es solo render).

## Memoria y rendimiento

512 × 512 RGBA = 1 MB por dibujo sin recortar. ~250 dibujos por personaje → ~250 MB sin atlas. Con recorte (la figura
ocupa ~40 % del lienzo) y cargando solo los 2 personajes del combate: ~100–200 MB. Es aceptable en escritorio.
Si hiciera falta menos, se pueden cargar a 1,5× en vez de 2×. Dibujar un sprite por personaje y frame es más barato que
las cápsulas actuales (una sola llamada `drawImage`).

## Fases (cada una cerrable por separado)

1. **Abstracción** (sin cambio visible): `FighterView` + `SkeletonView`. La estela y la energía usan `limbPoint`. Tests en verde.
2. **Tubería de sprites con dibujos provisionales**: un script (`npm run sprites:ref`) que **exporta las poses actuales
   del esqueleto a PNG** con la convención de nombres y los tiempos exactos. Sirve para tres cosas: probar la tubería de
   punta a punta antes de tener arte, darle al ilustrador la referencia de cada dibujo (silueta, alcance y momento del
   golpe, para pintar encima) y validar los tests de arriba.
3. **Atlas, precarga y pantalla de carga.** Medir memoria y FPS (como en DESIGN.md §18).
4. **Un personaje con arte real** (sugerido: Rayo, el equilibrado). Ajustar tiempos jugando con el modo debug.
5. Los otros dos personajes, retratos del HUD y pantalla de selección.

Riesgos: que el ilustrador no respete el ancla o la escala (lo detectan los tests 2 y 3); que el arte "pida" más
alcance del que tiene la hitbox (se decide caso a caso: o se ajusta el dibujo o la hitbox, y la tabla de DESIGN.md).
