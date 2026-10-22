# CONTRAGOLPE — Documento de diseño

Juego de peleas 2D, 1 contra 1, en el navegador. Este documento recoge las decisiones de diseño,
el porqué de cada una y **todos los valores de frame data**. Los números viven en código como datos
(`src/data/`); si cambias uno allí, actualiza la tabla correspondiente aquí.

## 1. Arquitectura

| Capa | Carpeta | Reglas |
|---|---|---|
| Simulación | `src/sim/` | Pura y determinista: `step(state, inputP1, inputP2) → state`. Solo enteros. Sin DOM, sin `Math.random`, sin tiempo real. |
| Datos de diseño | `src/data/` | Personajes, movimientos, proyectiles y `tuning.ts` (ajustes globales). La simulación los lee, nunca los modifica. |
| Render | `src/render/` | Lee el estado; puede usar decimales, curvas y su propio azar. Cámara, poses, escenarios, HUD, efectos. |
| Entrada | `src/input/` | Teclado + Gamepad API → bitmask por jugador y frame. Remapeable. |
| App/escenas | `src/app/`, `src/scenes/` | Bucle de paso fijo, menús, modos de juego. |

Decisiones clave:

- **60 ticks fijos con acumulador** (`src/app/loop.ts`). El render dibuja el último estado (sin
  interpolación: en un juego de peleas la nitidez de cada frame importa más que la suavidad sub-frame).
  Si el navegador va lento se ejecutan hasta 5 ticks por frame de pantalla; nunca se usa `deltaTime` en la lógica.
- **Posiciones en sub-unidades enteras**: 1 px = 100 unidades (`src/sim/fixed.ts`). Velocidades y gravedad
  también son enteras. Un test recorre el estado y falla si aparece un número no entero.
- **Estado serializable**: el `GameState` es JSON plano (incluye historial de inputs, buffer, RNG con semilla).
  `serialize()` / `deserialize()` permiten guardar y restaurar cualquier frame: es la base para rollback.
- **Efectos fuera de la simulación**: la simulación emite `state.events` (golpe, bloqueo, parry, KO...) y el
  render/audio reaccionan. Partículas, sacudida y destellos usan su propio RNG.
- **Pureza vigilada por tests**: `tests/determinism.test.ts` comprueba mismo input ⇒ mismo hash, que `step`
  no muta su entrada, guardar/restaurar, y que el código de `src/sim` y `src/data` no usa APIs no deterministas.

## 2. Convenciones de frame data

- **Startup** = frame en que el ataque golpea por primera vez (el frame 1 es el primero del movimiento).
- **Active** = frames con hitbox activa. **Recovery** = frames posteriores en los que no se puede actuar.
- **Hitstun/blockstun** = frames, contados *después* del frame de impacto, en que el defensor no puede actuar.
- Fórmulas (con tests):
  - Ventaja en bloqueo = `blockstun − ((active − 1) + recovery)`
  - Ventaja al pegar = `hitstun − ((active − 1) + recovery)`
- El **hitstop** congela a ambos personajes por igual, así que no cambia la ventaja.
- Los frames congelados (hitstop, pantalla de súper) **no consumen** el buffer de botones ni la ventana de los
  motion inputs: puedes introducir un especial durante el congelamiento de un golpe y sale al reanudarse.

## 3. Entrada

- Bitmask por jugador y frame: ↑ ↓ ← →, LP, HP, LK, HK, Parry y SP (especial simple).
- **SOCD**: izquierda+derecha = neutral; arriba+abajo = neutral.
- **Historial circular** de 64 frames por jugador dentro del estado.
- **Buffer de 6 frames** (`TUNING.inputBuffer`): cada botón recuerda su última pulsación; si el personaje
  aún no puede actuar, la acción sale en cuanto pueda. Los frames congelados no envejecen el buffer.
- **Motion inputs** con ventana de 18 frames (30 para el súper). El último paso debe ser de hace ≤ 10 frames.
  - Cuarto de círculo ↓↘→, cuarto atrás ↓↙←, Z →↓↘ (acepta →↙↘), medio círculo →↘↓↙←, doble cuarto.
  - **Conflicto Z vs cuarto de círculo**: si la dirección al pulsar es ↘ gana la Z; si es → gana el cuarto de
    círculo. Así caminar hacia delante y lanzar un proyectil nunca saca el anti-aéreo por accidente.
- **Dash**: doble toque →·→ o ←·← en 12 frames.
- **Prioridad**: súper > especial > agarre > normal.

## 4. Movimiento (Rayo, valores base)

| Acción | Valor |
|---|---|
| Caminar adelante / atrás | 3,2 / 2,6 px por frame |
| Pre-salto | 4 frames (en el suelo, se puede agarrar) |
| Salto | vy 16,5 px/f, gravedad 0,75 px/f² → ~44 frames en el aire, ~180 px de altura |
| Salto adelante / atrás | 4,0 / 3,6 px/f horizontal |
| Aterrizaje (salto vacío) | 3 frames |
| Dash adelante | 18 frames, 112 px (frenado lineal, últimos 5 frames sin moverse) |
| Backdash | 22 frames, 104 px, 7 frames invulnerable |

- La dirección del salto se lee en el último frame del pre-salto (más permisivo).
- **Pushboxes** separadas de las hurtboxes: los personajes no se atraviesan; si uno está contra la pared, el otro
  absorbe todo el empuje. En el aire la pushbox es más alta y estrecha: un salto profundo pasa por encima de la
  cabeza y, si cae al otro lado, es un **cross-up** (el defensor debe bloquear hacia el otro lado).
- Separación máxima de 820 px (lo que cabe en cámara, 960 px).
- El personaje se gira hacia el rival solo en estados neutrales en el suelo y al aterrizar; en el aire mantiene
  la orientación (permite cross-ups).

## 5. Render procedural

- Personajes = esqueleto 2D (cadera, torso, cabeza, brazos y piernas de dos segmentos) dibujado con cápsulas
  y contorno. Las poses se definen con objetivos de manos/tobillos y una IK de dos huesos (`src/render/poses.ts`);
  el animador interpola ángulos según el estado y el frame del movimiento.
- Cada ataque tiene **anticipación** (llega rápido a la pose de carga y la sostiene: se ve venir), un **frame de
  impacto nítido** (salta directo a la pose de golpe en el primer frame activo) y **follow-through**.
- Para pasar a spritesheets basta con sustituir `drawFighter` / `skeleton.ts`: el resto del juego solo pide
  "dibuja a este personaje en este estado".

## 6. Modo debug (F1)

Cajas (pushbox amarilla, hurtbox azul, hitbox roja, proyectil rosa), origen de cada personaje, estado, frame,
velocidades, buffer, ventana de parry e historial de inputs. F3 muestra FPS y ticks por segundo.

## 7. Combate base

### Cajas
- **Hurtbox** (azul): dónde te pueden golpear. Hay una por postura (de pie, agachado, en el aire) y los
  ataques añaden la de la extremidad extendida durante el golpe y parte de la recuperación: fallar un golpe
  fuerte deja la pierna/brazo expuesto (*whiff punish*).
- **Hitbox** (roja): dónde golpea el ataque, por rango de frames. Cada golpe de un movimiento conecta una vez.
- **Pushbox** (amarilla): solo evita que los cuerpos se solapen.
- Un test de QA comprueba que la mano/pie de cada pose de impacto cae dentro de su hitbox (lo que se ve es lo que pega).

### Guardia
| Tipo | Se bloquea | Ejemplos |
|---|---|---|
| **Alto** (overhead) | solo de pie | todos los ataques en salto |
| **Medio** | de pie o agachado | la mayoría de normales de pie |
| **Bajo** | solo agachado | patada rastrera, barrida |

- Bloquear = sostener la dirección contraria **al lado del que viene el golpe** (no hacia donde miras): por eso
  los cross-up obligan a cambiar de dirección.
- Solo se bloquea en neutral (quieto, caminando, agachado) o encadenando bloqueos (blockstun). En el aire no.
- Durante el blockstun se puede cambiar entre guardia alta y baja.
- El jab de pie de Rayo es "alto" de altura (no de guardia): pasa por encima de un rival agachado. Agacharse
  es una defensa real contra el jab, a cambio de perder ante los ataques en salto.

### Golpe, counter hit y derribo
- **Counter hit**: golpear a un rival en el startup o frames activos de su ataque, o recuperándose de un parry
  fallido. +20 % de daño, +3 frames de hitstun (ligeros) o +6 (fuertes), +2 de hitstop y aviso "COUNTER".
  En un intercambio (ambos se golpean el mismo frame) no hay counter hit.
- **Derribo**: barridas, anti-aéreos y cualquier golpe recibido en el aire. El derribado queda en el suelo
  32 frames y se levanta en 14, ambos invulnerables (no hay golpes al suelo). Un golpe ligero en el aire no
  derriba: el rival cae de pie (8 frames de recuperación).
- **Juggles**: un rival que cae tras un golpe aéreo solo puede volver a ser golpeado por movimientos marcados
  como `juggle` y como mucho 2 veces.

### Empuje y esquina
- Cada golpe empuja al defensor (`pushback`, repartido en 8 frames con frenado). Si el defensor no tiene sitio
  (pared), el resto del empuje lo absorbe el atacante: en la esquina no se puede encadenar golpes eternamente.

### Combos (anti-infinitos)
- **Escalado de daño** por número de golpe: 100, 100, 85, 75, 65, 55, 45, 35, 30 % (mínimo 30 %).
- **Decaimiento de hitstun**: a partir del 4.º golpe, −1 frame por golpe (hasta −6). Junto con el empuje,
  ningún enlace se puede repetir indefinidamente (hay un test que machaca jab 600 frames).

### Rondas
- 99 segundos, al mejor de 3. Gana la ronda quien deje al otro sin vida; si se acaba el tiempo, quien tenga
  más vida en proporción. Empate (doble KO o misma vida) = ronda para ambos; si los dos llegan a 2, empate.
- Intro de ronda (110 frames, nadie se mueve) → pelea → KO (170 frames: el KO'd sale despedido, el ganador posa)
  → siguiente ronda. Vida al máximo cada ronda; el medidor de súper se conserva (permite remontadas).

## 9. Profundidad: agarres, especiales, combos, medidor y súper

### Prioridad y tolerancias
- **Súper > especial > agarre > normal.** Si un mismo frame cumple varias, gana la de más prioridad.
- **Kara (2 frames)**: durante los 2 primeros frames de un normal todavía se puede "convertir" en agarre,
  especial o súper. Así, pulsar LP y LK con un frame de diferencia sigue siendo un agarre, y un especial cuyo
  botón llegó un pelín antes que el final del motion sigue saliendo.
- **Pulsación simultánea** (agarre LP+LK, atajo de súper HP+HK): hasta 3 frames de diferencia.
- Especiales en **familias** (mismo motion y mismo tipo de botón): la primera familia que coincide decide, y
  dentro de ella la versión ligera/fuerte según el botón pulsado más reciente (empate → fuerte).

### Agarres (throws)
- LP+LK cerca (84 px entre centros). Startup 5, 2 activos, 23 de recuperación si fallan (castigable).
- **Ignoran el bloqueo** y le ganan al parry: son la respuesta a quien solo se defiende.
- No se puede agarrar a quien está en hitstun/blockstun, en el aire, derribado, levantándose, ni durante los
  4 frames posteriores a salir de un stun (*throw protection*), ni durante un backdash.
- **Escape (tech)**: el agarrado tiene **7 frames** desde que lo agarran para pulsar LP+LK. Si escapa: nadie
  recibe daño, ambos se separan y vuelve el neutral. Si ambos agarran el mismo frame, escape automático.
- Sosteniendo atrás se lanza hacia el otro lado (cambia la posición en pantalla: útil para llevar al rival a la esquina).
- El daño llega en el frame 16 de la animación (después de la ventana de escape), y derriba.

### Proyectiles
- Un solo proyectil propio en pantalla. Si ya hay uno, el input del proyectil no sale (sale el normal).
- Versión ligera **lenta** (4,2 px/f: para avanzar detrás de ella) y fuerte **rápida** (7,5 px/f: para castigar).
- 32 frames de recuperación: lanzarlo de cerca o sin pensar se castiga (saltando encima o con la Embestida, que
  atraviesa proyectiles).
- Se anulan entre sí golpe a golpe; el de mayor prioridad (la súper) sobrevive.
- Daño de bloqueo (*chip*): 12. El hitstop solo congela al defensor y al proyectil, no a quien lo lanzó.

### Anti-aéreo invencible (Puño Ascendente)
- Ligero: invencible frames 1–3, 100 de daño. Fuerte: invencible 1–7, 135 de daño, sube más.
- Deja el suelo, cae y aterriza con 12/16 frames de recuperación: **más de 45 frames** expuesto si falla o lo
  bloquean. Saltar deja de ser la mejor opción, pero spamear el anti-aéreo se paga caro.
- **Conflicto con el cuarto de círculo**: si el motion termina en → sale el proyectil; si termina en ↘ sale el
  anti-aéreo (así caminar hacia delante + ↓↘→ nunca saca un anti-aéreo por accidente).

### Cancels y combos
- **Chain**: los ligeros (LP/LK de pie y agachado) se encadenan entre sí tras el contacto (golpe o bloqueo),
  hasta 3 ligeros seguidos.
- **Cancel a especial / súper**: desde ligeros, el directo, el gancho agachado y la Embestida ligera (a súper).
- Ventana de cancel: 10 frames no congelados desde el contacto. El buffer no envejece durante el hitstop, así
  que se puede meter el especial durante el congelamiento del golpe.
- Ejemplos con Rayo: `↓LK → ↓LK → ↓↘→HP` · `salto HP → HP → ↓↘→HP` · `LP → LP → LK → ↓↙←LK → HP+HK`.

### Medidor y súper
- Medidor de 0 a 1000. Se llena **al pegar** (20/40 ligeros/fuertes, más con especiales), **al bloquear**
  (la mitad), **al recibir** (60 % de lo que gana el atacante), **al bloquear** como defensor (40 %), al
  lanzar especiales (10–15) y con **parry** (fase 4). Se conserva entre rondas.
- Súper de Rayo, **Tormenta Final** (↓↘→↓↘→ + P, o HP+HK): pantalla de súper de 40 frames (congela el juego,
  zoom y oscurece), invencible frames 1–12, gran orbe de energía de 5 golpes (62 c/u antes de escalado,
  ~260 total) que derriba en el último. Cuesta el medidor entero.

### Inputs simplificados (opción, activa por defecto)
- Botón **SP** (J1: O · J2: Num 9 · gamepad: LB): SP = proyectil rápido, SP+↓ = anti-aéreo fuerte,
  SP+→ = Embestida larga, SP+← = proyectil lento. Mismo daño que con el motion: la ventaja del motion es solo
  elegir la versión. Los motion inputs siempre funcionan. Se puede desactivar en Opciones.

## 10. Frame data completa

Columnas "Bloqueo", "Hit" y "CH" = ventaja en frames si el primer frame activo conecta.
"—" = no aplica (derriba o es un agarre). "altura" = ataques en salto: la ventaja depende de lo cerca
del suelo que conecten (cuanto más tarde, más ventaja; un salto profundo deja combo).

<!-- FRAMEDATA:START (generado con `npm run framedata`, no editar a mano) -->

### RAYO — Tomás Valdez (Equilibrado, vida 1000)

| Movimiento | Input | Startup | Active | Recovery | Daño | Guardia | Hitstun | Blockstun | Bloqueo | Hit | CH | Hitstop | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jab | LP | 4 | 2 | 6 | 30 | medio | 12 | 8 | +1 | +5 | +8 | 4 | cancel: chain/special/super |
| Patada baja al muslo | LK | 6 | 3 | 8 | 35 | medio | 14 | 10 | 0 | +4 | +7 | 4 | cancel: chain/special/super |
| Directo | HP | 10 | 3 | 16 | 80 | medio | 20 | 14 | -4 | +2 | +8 | 9 | cancel: special/super |
| Patada circular | HK | 12 | 4 | 20 | 95 | medio | 22 | 16 | -7 | -1 | +5 | 10 |  |
| Jab agachado | ↓ + LP | 4 | 2 | 7 | 25 | medio | 11 | 8 | 0 | +3 | +6 | 4 | cancel: chain/special/super |
| Patada rastrera | ↓ + LK | 5 | 2 | 8 | 25 | bajo | 13 | 9 | 0 | +4 | +7 | 4 | cancel: chain/special/super |
| Gancho ascendente | ↓ + HP | 7 | 4 | 18 | 85 | medio | 19 | 12 | -9 | -2 | +4 | 9 | si pega a un rival en el aire, lo lanza; cancel: special/super |
| Barrida | ↓ + HK | 9 | 3 | 22 | 90 | bajo | 20 | 14 | — | — | — | 9 | derriba |
| Puño en salto | (aire) LP | 4 | 7 | 0 | 35 | alto | 12 | 9 | altura | altura | altura | 4 | aterrizaje 2f |
| Rodilla cruzada | (aire) LK | 5 | 9 | 0 | 40 | alto | 14 | 10 | altura | altura | altura | 4 | aterrizaje 3f |
| Martillo aéreo | (aire) HP | 7 | 5 | 0 | 85 | alto | 18 | 14 | altura | altura | altura | 9 | aterrizaje 4f |
| Patada voladora | (aire) HK | 8 | 5 | 0 | 90 | alto | 18 | 14 | altura | altura | altura | 9 | aterrizaje 4f |
| Llave de cadera | LP + LK (cerca) | 5 | 2 | 23 | 120 | agarre | 0 | 0 | — | — | — | 10 | agarre 84px |
| Onda Rayo (lenta) | ↓↘→ + LP | 12 | 1 | 32 | 0 | medio | 0 | 0 | -32 | -32 | -29 | 4 | proyectil en f12 |
| Onda Rayo (rápida) | ↓↘→ + HP | 12 | 1 | 32 | 0 | medio | 0 | 0 | -32 | -32 | -29 | 4 | proyectil en f12 |
| Puño Ascendente (ligero) | →↓↘ + LP | 3 | 8 | 18 | 100 | medio | 20 | 16 | — | — | — | 9 | derriba; juggle; invencible (all) f1-3; chip 10; aterrizaje 12f |
| Puño Ascendente (fuerte) | →↓↘ + HP | 4 | 10 | 20 | 135 | medio | 20 | 16 | — | — | — | 11 | derriba; juggle; invencible (all) f1-7; chip 14; aterrizaje 16f |
| Embestida (corta) | ↓↙← + LK | 10 | 6 | 16 | 70 | medio | 18 | 14 | -7 | -3 | +3 | 9 | chip 8; cancel: super |
| Embestida (larga) | ↓↙← + HK | 13 | 7 | 18 | 95 | medio | 20 | 16 | — | — | — | 10 | derriba; invencible (projectile) f6-16; chip 10 |
| Tormenta Final | ↓↘→↓↘→ + P  (o HP + HK) | 10 | 1 | 38 | 0 | medio | 0 | 0 | -38 | -38 | -32 | 0 | invencible (all) f1-12; proyectil en f10; cuesta 1000 de medidor |

| Proyectil | Velocidad | Golpes | Daño | Chip | Hitstun | Blockstun | Vida |
|---|---|---|---|---|---|---|---|
| fb_l | 4.2 px/f | 1 | 70 | 12 | 18 | 16 | 260f |
| fb_h | 7.5 px/f | 1 | 75 | 12 | 18 | 16 | 180f |
| super | 5.5 px/f | 5 | 62 | 18 | 24 | 18 | 220f |

<!-- FRAMEDATA:END -->
