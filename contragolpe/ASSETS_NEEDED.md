# CONTRAGOLPE — Assets que hay que conseguir

<!-- Generado con `npm run assets` a partir de la frame data y del catálogo de audio. No editar a mano. -->

Lista exacta de animaciones y sonidos, con los nombres de archivo que espera el juego.
Los números de frames salen de `src/data/` (60 frames = 1 segundo).

## Estado

- **Sonido: listo para recibir archivos.** Si un archivo existe en `assets/audio/`, el juego lo usa en lugar del
  sonido sintetizado (tras `npm run build`, o al recargar en `npm run dev`). Lo que falte sigue sintetizado.
- **Sprites: todavía no se cargan.** Los personajes se dibujan con código. Los nombres de abajo son los que usará
  el sistema de sprites propuesto en [docs/sprites-plan.md](docs/sprites-plan.md); conviene producirlos ya con
  esta convención.
- **Licencia:** solo material propio o con licencia clara (CC0 o equivalente). Anota cada archivo en
  [assets/CREDITS.md](assets/CREDITS.md) (fuente, autor, licencia). Personajes y arte 100 % originales.

## 1. Sonido

**Formato:** `.ogg` (Vorbis, recomendado), `.mp3` o `.wav`. Efectos y voces en mono, 44,1 o 48 kHz; música en estéreo.
**El sonido debe empezar en la primera muestra** (sin silencio inicial: cada milisegundo de silencio es retraso
respecto al golpe). Picos a −1 dBFS; los efectos importantes (parry, KO) deben destacar sobre la música.
Variantes: `nombre_1.ogg`, `nombre_2.ogg`… El juego elige una al azar sin repetir la anterior y varía el tono ±3 %;
con una sola variante también funciona.

### Efectos — `assets/audio/sfx/`

| Grupo | Archivos | Variantes | Qué debe sonar |
|---|---|---|---|
| **Golpes: swing** | `swingPunchL_1.ogg` … `swingPunchL_4.ogg` | 4 | Silbido corto de un puño ligero (suena al lanzarlo, conecte o no) |
|  | `swingPunchH_1.ogg` … `swingPunchH_4.ogg` | 4 | Silbido de un puño fuerte: más aire y más grave |
|  | `swingKickL_1.ogg` … `swingKickL_4.ogg` | 4 | Silbido de una patada ligera |
|  | `swingKickH_1.ogg` … `swingKickH_4.ogg` | 4 | Silbido largo y grave de una patada fuerte |
|  | `swingSpecial_1.ogg` … `swingSpecial_3.ogg` | 3 | Silbido con energía (especiales con puño o patada) |
| **Golpes: impacto** | `hitPunchL_1.ogg` … `hitPunchL_4.ogg` | 4 | Impacto seco de puño ligero |
|  | `hitPunchH_1.ogg` … `hitPunchH_4.ogg` | 4 | Impacto pesado de puño fuerte, con cuerpo |
|  | `hitKickL_1.ogg` … `hitKickL_4.ogg` | 4 | Impacto de patada ligera (más 'carnoso' que el puño) |
|  | `hitKickH_1.ogg` … `hitKickH_4.ogg` | 4 | Impacto grave de patada fuerte |
|  | `hitSpecial_1.ogg` … `hitSpecial_3.ogg` | 3 | Impacto de especial o proyectil: golpe + chasquido de energía |
|  | `hitSuper_1.ogg` … `hitSuper_3.ogg` | 3 | Impacto de cada golpe de la súper (grande, con cola) |
|  | `counter_1.ogg` | 1 | Campanita del counter hit (se suma al impacto) |
| **Defensa** | `block_1.ogg` … `block_4.ogg` | 4 | Golpe ligero bloqueado: sordo y apagado |
|  | `blockHeavy_1.ogg` … `blockHeavy_3.ogg` | 3 | Golpe fuerte o especial bloqueado |
|  | `parry_1.ogg` … `parry_3.ogg` | 3 | Parry: 'ting' metálico agudo e inconfundible |
|  | `redParry_1.ogg` | 1 | Red parry: como el parry pero más grave |
|  | `parryFail_1.ogg` | 1 | Parry fallado: nota corta descendente |
|  | `tech_1.ogg` | 1 | Escape de agarre |
|  | `throw_1.ogg` | 1 | Agarre que conecta (agarrón de ropa) |
|  | `throwHit_1.ogg` … `throwHit_3.ogg` | 3 | Caída al suelo tras un agarre |
| **Movimiento** | `jump_1.ogg` … `jump_3.ogg` | 3 | Despegue del salto (suave) |
|  | `land_1.ogg` … `land_3.ogg` | 3 | Aterrizaje (pasos) |
|  | `dash_1.ogg` … `dash_3.ogg` | 3 | Dash (arrastre rápido) |
|  | `knockdown_1.ogg` … `knockdown_3.ogg` | 3 | Cuerpo que cae al suelo (derribo) |
| **Especiales y súper** | `projectile_1.ogg` … `projectile_3.ogg` | 3 | Lanzamiento de proyectil |
|  | `clash_1.ogg` | 1 | Dos proyectiles que se anulan |
|  | `super_1.ogg` | 1 | Inicio de la súper (pantalla congelada): barrido largo |
| **Ronda** | `ko_1.ogg` | 1 | KO: estruendo grave con eco (debe destacar sobre la música) |
|  | `round_1.ogg` | 1 | Anuncio de ronda (gong/acorde) |
|  | `fight_1.ogg` | 1 | ¡A pelear! |
|  | `win_1.ogg` | 1 | Fanfarria de ronda ganada |
| **Menús** | `select_1.ogg` | 1 | Mover el cursor |
|  | `confirm_1.ogg` | 1 | Aceptar |
|  | `back_1.ogg` | 1 | Volver / cancelar |

Capas de un golpe: **swing** al lanzarlo (conecte o no) → **impacto** al conectar → **voz** (opcional).
Puño, patada, especial, bloqueo y parry deben distinguirse con los ojos cerrados.

### Voces — `assets/audio/voice/<personaje>/`

Una carpeta por personaje: `rayo/`, `chispa/`, `muralla/`. Voces cortas (< 0,6 s), sin palabras largas.

| Grupo | Archivos | Variantes | Qué debe sonar |
|---|---|---|---|
| **Golpes: swing** | `attack_1.ogg` … `attack_3.ogg` | 3 | Exhalación corta al lanzar un ligero (suena el 12 % de las veces) |
|  | `heavy_1.ogg` … `heavy_3.ogg` | 3 | Grito corto de esfuerzo en un golpe fuerte (35 %) |
| **Especiales y súper** | `special_1.ogg` … `special_3.ogg` | 3 | Grito del especial (60 %) |
|  | `super_1.ogg` | 1 | Frase/grito de la súper (siempre) |
| **Golpes: impacto** | `hurt_1.ogg` … `hurt_3.ogg` | 3 | Queja al recibir un golpe fuerte (50 %) |
| **Ronda** | `ko_1.ogg` … `ko_2.ogg` | 2 | Grito de KO |
|  | `win_1.ogg` … `win_2.ogg` | 2 | Frase de victoria |

Total: 17 archivos por personaje.

### Música — `assets/audio/music/`

| Archivo | Uso |
|---|---|
| `menu.ogg` | Menús (bucle tranquilo). Bucle sin cortes (el final empalma con el principio). |
| `muelle.ogg` | Muelle al Atardecer: aire de merengue, güira constante. Bucle sin cortes (el final empalma con el principio). |
| `azotea.ogg` | Azotea Neón: synthwave. Bucle sin cortes (el final empalma con el principio). |
| `plaza.ogg` | Plaza Colonial: guitarra arpegiada, fiesta. Bucle sin cortes (el final empalma con el principio). |

## 2. Sprites de personajes

**Formato:** PNG con transparencia, un archivo por dibujo:
`assets/sprites/<personaje>/<animación>/<animación>_<NN>.png` (NN = 01, 02…), p. ej.
`assets/sprites/rayo/st_hp/st_hp_03.png`.

- **Lienzo 512 × 512 px**, personaje mirando a la **derecha**. **Ancla** (punto entre los pies, en el suelo) en
  **(256, 480)** en TODOS los dibujos: así no tiembla al cambiar de dibujo. Si una pose no cabe (tumbado, patada
  muy larga), usa 1024 × 512 con el ancla en (512, 480) para **toda** esa animación.
- **Escala 2×:** 1 px del juego = 2 px del dibujo. Un personaje mide ~190 px en el juego → ~380 px de alto.
- Los golpes no se deciden por el dibujo (las cajas de golpe son datos), pero **el puño/pie del dibujo de impacto
  debe caer dentro de la hitbox** (un test lo comprobará). Usa el modo debug (F1) como referencia de alcance.
- **Fases** = frames de juego de anticipación / golpe (activos) / recuperación. El primer dibujo de golpe se muestra
  exactamente en el primer frame activo. La anticipación debe leerse (cuerpo cargado), el golpe ser el dibujo más
  estirado, y la recuperación volver visiblemente a la guardia.
- **Dibujos sugeridos** = anticipación + golpe + recuperación. Cada dibujo se sostiene varios frames (la duración se
  ajusta en código sin redibujar). Más dibujos = más fluido, pero estos bastan.
- Paleta alternativa (espejos): opcional, misma estructura en `assets/sprites/<personaje>/alt/`.

### RAYO — Tomás Valdez · `assets/sprites/rayo/`

**Estados básicos**

| Animación (carpeta) | Duración en el juego | Dibujos | Notas |
|---|---|---|---|
| `idle` | bucle (~60 f) | 6 | respiración sutil; nunca quieto del todo |
| `walk_f` | bucle de 30 f | 8 | caminar hacia delante |
| `walk_b` | bucle de 34 f | 8 | caminar hacia atrás (guardia alta) |
| `crouch` | 3 f de bajada + bucle | 2 + 2 | `_01`–`_02` = bajar (pose de enlace), `_03`–`_04` = agachado con respiración |
| `prejump` | 4 f | 1 | flexiona rodillas antes de saltar |
| `jump` | ~44 f en el aire | 4 | `_01` despegue, `_02` subida, `_03` ápice recogido, `_04` caída (el juego elige según la velocidad) |
| `land` | 3 f | 1–2 | aterrizaje (rodillas flexionadas) |
| `dash_f` | 18 f | 3 | impulso hacia delante, frena al final |
| `dash_b` | 22 f | 3 | salto corto hacia atrás |
| `block` | variable (blockstun) | 2 | `_01` impacto en la guardia, `_02` guardia sostenida |
| `block_crouch` | variable (blockstun) | 2 | igual, agachado |
| `hit_high` | 11–28 f (hitstun) | 3 | golpe en la cabeza: `_01` impacto (pose más extrema), `_02` sostenida, `_03` vuelta a la guardia |
| `hit_mid` | 11–28 f (hitstun) | 3 | golpe en el cuerpo (también counter hit): se dobla hacia delante |
| `hit_crouch` | 11–28 f (hitstun) | 3 | golpe estando agachado |
| `air_hit` | variable | 3 | lanzado o golpeado en el aire: `_01` subida, `_02` giro, `_03` caída |
| `knockdown` | 32 f | 2 | `_01` choque con el suelo, `_02` tumbado |
| `wakeup` | 14 f | 3 | levantarse hasta la guardia |
| `parry` | 8 f congelado | 2 | desvío de pie (palma abierta), muy legible |
| `parry_low` | 8 f congelado | 2 | desvío agachado |
| `parry_air` | 8 f congelado | 2 | desvío en el aire |
| `parry_fail` | 20 f | 2 | desequilibrado, expuesto |
| `thrown` | según el agarre del rival | 2 | agarrado (luego usa `air_hit`) |
| `throw_tech` | 14 f | 2 | se zafa del agarre |
| `intro` | 110 f | 4–6 | entrada a la ronda, con personalidad |
| `win` | 18 f de transición + bucle | 4–6 | pose de victoria |
| `lose` | bucle | 2–4 | derrota por tiempo (de pie, agotado) — **nuevo**, hoy no existe |
| `ko` | 170 f | 3–4 | sale despedido y queda tumbado |

**Ataques** (fases en frames: anticipación / golpe / recuperación)

| Animación (carpeta) | Movimiento | Fases | Dibujos | Notas |
|---|---|---|---|---|
| `st_lp` | Jab | 3 / 2 / 6 | 2 + 1 + 2 |  |
| `st_lk` | Patada baja al muslo | 5 / 3 / 8 | 2 + 1 + 2 |  |
| `st_hp` | Directo | 9 / 3 / 16 | 3 + 1 + 3 |  |
| `st_hk` | Patada circular | 11 / 4 / 20 | 3 + 2 + 4 |  |
| `oh` | Martillo (overhead) | 19 / 3 / 14 | 4 + 1 + 3 |  |
| `cr_lp` | Jab agachado | 3 / 2 / 7 | 2 + 1 + 2 |  |
| `cr_lk` | Patada rastrera | 4 / 2 / 8 | 2 + 1 + 2 |  |
| `cr_hp` | Gancho ascendente | 6 / 4 / 18 | 2 + 2 + 3 |  |
| `cr_hk` | Barrida | 8 / 3 / 22 | 3 + 1 + 4 |  |
| `j_lp` | Puño en salto | 3 / 7 / hasta aterrizar + aterrizaje 2 | 2 + 2 + 1 |  |
| `j_lk` | Rodilla cruzada | 4 / 9 / hasta aterrizar + aterrizaje 3 | 2 + 2 + 1 |  |
| `j_hp` | Martillo aéreo | 6 / 5 / hasta aterrizar + aterrizaje 4 | 2 + 2 + 1 |  |
| `j_hk` | Patada voladora | 7 / 5 / hasta aterrizar + aterrizaje 4 | 3 + 2 + 1 |  |
| `throw` | Llave de cadera | 4 / 2 / 23 | 2 + 1 + 4 | agarre: si conecta, la animación de lanzamiento dura 32 f (daño en el f16) → `throw_hit` |
| `fb` | Onda Rayo (lenta) / Onda Rayo (rápida) | fb_l: 11 / 1 / 40<br>fb_h: 11 / 1 / 40 | 3 + 1 + 4 | el proyectil sale en el f12: las manos deben estar extendidas ahí |
| `dp` | Puño Ascendente (ligero) / Puño Ascendente (fuerte) | dp_l: 2 / 8 / 18 + aterrizaje 12<br>dp_h: 3 / 10 / 20 + aterrizaje 16 | 2 + 2 + 4 | deja el suelo: incluir caída |
| `rush` | Embestida (corta) / Embestida (larga) | rush_l: 9 / 6 / 16<br>rush_h: 12 / 7 / 18 | 3 + 2 + 3 |  |
| `super` | Tormenta Final | 9 / 1 / 38 | 3 + 1 + 4 | el proyectil sale en el f10: las manos deben estar extendidas ahí; pantalla de súper: el f1 se congela 40 f (pose de carga espectacular) |
| `throw_hit` | Llave de cadera: lanzamiento | 32 f (daño en f16) | 4 | el rival usa `thrown` y luego `air_hit` |

**Proyectiles**

| Animación (carpeta) | Proyectil | Dibujos | Notas |
|---|---|---|---|
| `proj_fb_l` | fb_l (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_l_end`) | centrado en (256, 256); hoy se dibuja con código |
| `proj_fb_h` | fb_h (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_h_end`) | centrado en (256, 256); hoy se dibuja con código |
| `proj_super` | super (5 golpes) | 4 en bucle + 3 al desaparecer (`proj_super_end`) | centrado en (256, 256); hoy se dibuja con código |

Total Tomás Valdez: 27 animaciones básicas + 19 de ataque + 3 proyectiles.

### CHISPA — Luna Reyes · `assets/sprites/chispa/`

**Estados básicos**

| Animación (carpeta) | Duración en el juego | Dibujos | Notas |
|---|---|---|---|
| `idle` | bucle (~60 f) | 6 | respiración sutil; nunca quieto del todo |
| `walk_f` | bucle de 30 f | 8 | caminar hacia delante |
| `walk_b` | bucle de 34 f | 8 | caminar hacia atrás (guardia alta) |
| `crouch` | 3 f de bajada + bucle | 2 + 2 | `_01`–`_02` = bajar (pose de enlace), `_03`–`_04` = agachado con respiración |
| `prejump` | 3 f | 1 | flexiona rodillas antes de saltar |
| `jump` | ~38 f en el aire | 4 | `_01` despegue, `_02` subida, `_03` ápice recogido, `_04` caída (el juego elige según la velocidad) |
| `land` | 3 f | 1–2 | aterrizaje (rodillas flexionadas) |
| `dash_f` | 15 f | 3 | impulso hacia delante, frena al final |
| `dash_b` | 18 f | 3 | salto corto hacia atrás |
| `block` | variable (blockstun) | 2 | `_01` impacto en la guardia, `_02` guardia sostenida |
| `block_crouch` | variable (blockstun) | 2 | igual, agachado |
| `hit_high` | 11–32 f (hitstun) | 3 | golpe en la cabeza: `_01` impacto (pose más extrema), `_02` sostenida, `_03` vuelta a la guardia |
| `hit_mid` | 11–32 f (hitstun) | 3 | golpe en el cuerpo (también counter hit): se dobla hacia delante |
| `hit_crouch` | 11–32 f (hitstun) | 3 | golpe estando agachado |
| `air_hit` | variable | 3 | lanzado o golpeado en el aire: `_01` subida, `_02` giro, `_03` caída |
| `knockdown` | 32 f | 2 | `_01` choque con el suelo, `_02` tumbado |
| `wakeup` | 14 f | 3 | levantarse hasta la guardia |
| `parry` | 8 f congelado | 2 | desvío de pie (palma abierta), muy legible |
| `parry_low` | 8 f congelado | 2 | desvío agachado |
| `parry_air` | 8 f congelado | 2 | desvío en el aire |
| `parry_fail` | 20 f | 2 | desequilibrado, expuesto |
| `thrown` | según el agarre del rival | 2 | agarrado (luego usa `air_hit`) |
| `throw_tech` | 14 f | 2 | se zafa del agarre |
| `intro` | 110 f | 4–6 | entrada a la ronda, con personalidad |
| `win` | 18 f de transición + bucle | 4–6 | pose de victoria |
| `lose` | bucle | 2–4 | derrota por tiempo (de pie, agotado) — **nuevo**, hoy no existe |
| `ko` | 170 f | 3–4 | sale despedido y queda tumbado |

**Ataques** (fases en frames: anticipación / golpe / recuperación)

| Animación (carpeta) | Movimiento | Fases | Dibujos | Notas |
|---|---|---|---|---|
| `st_lp` | Jab relámpago | 2 / 2 / 6 | 1 + 1 + 2 |  |
| `st_lk` | Patada al tobillo | 4 / 2 / 8 | 2 + 1 + 2 |  |
| `st_hp` | Codazo giratorio | 7 / 3 / 14 | 3 + 1 + 3 |  |
| `st_hk` | Patada de látigo | 9 / 3 / 18 | 3 + 1 + 3 |  |
| `oh` | Salto de gata (overhead) | 15 / 3 / 14 | 4 + 1 + 3 |  |
| `cr_lp` | Jab bajo | 2 / 2 / 7 | 1 + 1 + 2 |  |
| `cr_lk` | Barrido corto | 3 / 2 / 8 | 2 + 1 + 2 |  |
| `cr_hp` | Codo al cielo | 5 / 3 / 15 | 2 + 1 + 3 |  |
| `cr_hk` | Deslizamiento | 7 / 6 / 18 | 3 + 2 + 3 |  |
| `j_lp` | Puño en salto | 2 / 6 / hasta aterrizar + aterrizaje 2 | 1 + 2 + 1 |  |
| `j_lk` | Rodilla cruzada | 3 / 9 / hasta aterrizar + aterrizaje 2 | 2 + 2 + 1 |  |
| `j_hp` | Garra en picado | 5 / 5 / hasta aterrizar + aterrizaje 3 | 2 + 2 + 1 |  |
| `j_hk` | Patada en picado | 6 / 6 / hasta aterrizar + aterrizaje 3 | 2 + 2 + 1 |  |
| `throw` | Voltereta | 4 / 2 / 22 | 2 + 1 + 4 | agarre: si conecta, la animación de lanzamiento dura 30 f (daño en el f15) → `throw_hit` |
| `fb` | Chispazo (corto) / Chispazo (largo) | fb_l: 12 / 1 / 28<br>fb_h: 14 / 1 / 28 | 4 + 1 + 4 | el proyectil sale en el f15: las manos deben estar extendidas ahí |
| `dp` | Gancho Relámpago (ligero) / Gancho Relámpago (fuerte) | dp_l: 2 / 7 / 16 + aterrizaje 12<br>dp_h: 3 / 8 / 18 + aterrizaje 14 | 2 + 2 + 4 | deja el suelo: incluir caída |
| `rush` | Ráfaga (corta) / Ráfaga (larga) | rush_l: 8 / 6 / 14<br>rush_h: 11 / 7 / 16 | 3 + 2 + 3 |  |
| `roll` | Rodada (corta) / Rodada (larga) | roll_l: 17 / 1 / 8<br>roll_h: 21 / 1 / 9 | 4 + 1 + 3 | keyframes: f1, f5, f10, f15, f20, f27 |
| `super` | Mil Chispas | 5 / 22 / 30 | 2 + 2 + 4 | pantalla de súper: el f1 se congela 40 f (pose de carga espectacular); keyframes: f1, f6, f9, f12, f15, f18, f21, f25, f40, f57 |
| `throw_hit` | Voltereta: lanzamiento | 30 f (daño en f15) | 4 | el rival usa `thrown` y luego `air_hit` |

**Proyectiles**

| Animación (carpeta) | Proyectil | Dibujos | Notas |
|---|---|---|---|
| `proj_fb_l` | fb_l (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_l_end`) | centrado en (256, 256); hoy se dibuja con código |
| `proj_fb_h` | fb_h (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_h_end`) | centrado en (256, 256); hoy se dibuja con código |

Total Luna Reyes: 27 animaciones básicas + 20 de ataque + 2 proyectiles.

### MURALLA — Bruno Ortega · `assets/sprites/muralla/`

**Estados básicos**

| Animación (carpeta) | Duración en el juego | Dibujos | Notas |
|---|---|---|---|
| `idle` | bucle (~60 f) | 6 | respiración sutil; nunca quieto del todo |
| `walk_f` | bucle de 30 f | 8 | caminar hacia delante |
| `walk_b` | bucle de 34 f | 8 | caminar hacia atrás (guardia alta) |
| `crouch` | 3 f de bajada + bucle | 2 + 2 | `_01`–`_02` = bajar (pose de enlace), `_03`–`_04` = agachado con respiración |
| `prejump` | 5 f | 1 | flexiona rodillas antes de saltar |
| `jump` | ~47 f en el aire | 4 | `_01` despegue, `_02` subida, `_03` ápice recogido, `_04` caída (el juego elige según la velocidad) |
| `land` | 5 f | 1–2 | aterrizaje (rodillas flexionadas) |
| `dash_f` | 22 f | 3 | impulso hacia delante, frena al final |
| `dash_b` | 26 f | 3 | salto corto hacia atrás |
| `block` | variable (blockstun) | 2 | `_01` impacto en la guardia, `_02` guardia sostenida |
| `block_crouch` | variable (blockstun) | 2 | igual, agachado |
| `hit_high` | 12–30 f (hitstun) | 3 | golpe en la cabeza: `_01` impacto (pose más extrema), `_02` sostenida, `_03` vuelta a la guardia |
| `hit_mid` | 12–30 f (hitstun) | 3 | golpe en el cuerpo (también counter hit): se dobla hacia delante |
| `hit_crouch` | 12–30 f (hitstun) | 3 | golpe estando agachado |
| `air_hit` | variable | 3 | lanzado o golpeado en el aire: `_01` subida, `_02` giro, `_03` caída |
| `knockdown` | 32 f | 2 | `_01` choque con el suelo, `_02` tumbado |
| `wakeup` | 14 f | 3 | levantarse hasta la guardia |
| `parry` | 8 f congelado | 2 | desvío de pie (palma abierta), muy legible |
| `parry_low` | 8 f congelado | 2 | desvío agachado |
| `parry_air` | 8 f congelado | 2 | desvío en el aire |
| `parry_fail` | 20 f | 2 | desequilibrado, expuesto |
| `thrown` | según el agarre del rival | 2 | agarrado (luego usa `air_hit`) |
| `throw_tech` | 14 f | 2 | se zafa del agarre |
| `intro` | 110 f | 4–6 | entrada a la ronda, con personalidad |
| `win` | 18 f de transición + bucle | 4–6 | pose de victoria |
| `lose` | bucle | 2–4 | derrota por tiempo (de pie, agotado) — **nuevo**, hoy no existe |
| `ko` | 170 f | 3–4 | sale despedido y queda tumbado |

**Ataques** (fases en frames: anticipación / golpe / recuperación)

| Animación (carpeta) | Movimiento | Fases | Dibujos | Notas |
|---|---|---|---|---|
| `st_lp` | Manotazo | 4 / 2 / 8 | 2 + 1 + 2 |  |
| `st_lk` | Pisotón frontal | 6 / 3 / 10 | 2 + 1 + 3 |  |
| `st_hp` | Palmada de oso | 11 / 4 / 18 | 3 + 2 + 3 |  |
| `st_hk` | Patada de mula | 13 / 5 / 22 | 4 + 2 + 4 | armadura f8–13: que se note (cuerpo tenso) |
| `cr_lp` | Puño bajo | 4 / 2 / 8 | 2 + 1 + 2 |  |
| `cr_lk` | Patada a la espinilla | 5 / 2 / 10 | 2 + 1 + 3 |  |
| `cr_hp` | Cabezazo al cielo | 8 / 5 / 20 | 3 + 2 + 4 |  |
| `cr_hk` | Barrida pesada | 11 / 4 / 24 | 3 + 2 + 4 |  |
| `j_lp` | Codazo en salto | 4 / 6 / hasta aterrizar + aterrizaje 3 | 2 + 2 + 1 |  |
| `j_lk` | Rodillazo | 5 / 8 / hasta aterrizar + aterrizaje 3 | 2 + 2 + 1 |  |
| `j_hp` | Panzazo | 7 / 6 / hasta aterrizar + aterrizaje 5 | 3 + 2 + 1 |  |
| `j_hk` | Patada de tronco | 8 / 5 / hasta aterrizar + aterrizaje 5 | 3 + 2 + 1 |  |
| `throw` | Suplex | 4 / 2 / 24 | 2 + 1 + 4 | agarre: si conecta, la animación de lanzamiento dura 36 f (daño en el f18) → `throw_hit` |
| `cmd` | Abrazo de Oso (corto) / Abrazo de Oso (largo) | cmd_l: 4 / 3 / 34<br>cmd_h: 9 / 3 / 38 | 3 + 1 + 4 | agarre: si conecta, la animación de lanzamiento dura 46 f (daño en el f26) → `cmd_hit` |
| `dp` | Atrapa Cielos (ligero) / Atrapa Cielos (fuerte) | dp_l: 3 / 8 / 26 + aterrizaje 14<br>dp_h: 4 / 10 / 28 + aterrizaje 18 | 2 + 2 + 4 | agarre: si conecta, la animación de lanzamiento dura 38 f (daño en el f18) → `dp_hit`; deja el suelo: incluir caída |
| `fb` | Temblor (corto) / Temblor (largo) | fb_l: 15 / 1 / 34<br>fb_h: 17 / 1 / 34 | 4 + 1 + 4 | el proyectil sale en el f18: las manos deben estar extendidas ahí |
| `charge` | Embestida de Toro (corta) / Embestida de Toro (larga) | charge_l: 13 / 6 / 18<br>charge_h: 17 / 8 / 20 | 4 + 2 + 4 | armadura f1–25: que se note (cuerpo tenso) |
| `super` | Gran Terremoto | 13 / 1 / 36 | 4 + 1 + 4 | el proyectil sale en el f14: las manos deben estar extendidas ahí; pantalla de súper: el f1 se congela 40 f (pose de carga espectacular) |
| `throw_hit` | Suplex: lanzamiento | 36 f (daño en f18) | 4 | el rival usa `thrown` y luego `air_hit` |
| `cmd_hit` | Abrazo de Oso (corto): lanzamiento | 46 f (daño en f26) | 4 | el rival usa `thrown` y luego `air_hit` |
| `dp_hit` | Atrapa Cielos (ligero): lanzamiento | 38 f (daño en f18) | 4 | el rival usa `thrown` y luego `air_hit` |

**Proyectiles**

| Animación (carpeta) | Proyectil | Dibujos | Notas |
|---|---|---|---|
| `proj_fb_l` | fb_l (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_l_end`) | centrado en (256, 256); hoy se dibuja con código |
| `proj_fb_h` | fb_h (1 golpe) | 4 en bucle + 3 al desaparecer (`proj_fb_h_end`) | centrado en (256, 256); hoy se dibuja con código |
| `proj_super` | super (4 golpes) | 4 en bucle + 3 al desaparecer (`proj_super_end`) | centrado en (256, 256); hoy se dibuja con código |

Total Bruno Ortega: 27 animaciones básicas + 21 de ataque + 3 proyectiles.

## 3. HUD y menús (opcional)

| Archivo | Tamaño | Uso |
|---|---|---|
| `assets/sprites/<personaje>/portrait.png` | 256 × 256 | retrato junto a la barra de vida |
| `assets/sprites/<personaje>/portrait_hurt.png` | 256 × 256 | retrato con la vida baja (< 25 %) |
| `assets/sprites/<personaje>/select.png` | 768 × 1024 | busto para la pantalla de selección |
