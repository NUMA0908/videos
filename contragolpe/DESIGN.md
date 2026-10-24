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
- **SOCD de los dispositivos** (teclado y mando por igual, `src/input/socd.ts`): izquierda+derecha = neutral;
  arriba+abajo = **arriba**. La simulación conserva su propia limpieza (arriba+abajo = neutral) como red de
  seguridad para fuentes que no pasan por los dispositivos (IA, grabaciones); a ella nunca le llega arriba+abajo
  de un jugador, así que no se cambió ninguna regla de la simulación (ver §17).
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
- **Poses de enlace** (`src/render/fighterAnim.ts`, memoria solo de presentación): al cambiar de estado se
  mezcla desde la pose que se veía (idle 4 f, caminar 3, ataque hasta 4, aire 3, aterrizaje/dash/agarre 2…).
  Golpe recibido, bloqueo, parry y agarrado cortan en seco: el impacto se lee al instante. La mezcla de un
  ataque termina como muy tarde en `startup − 2`, así que **el primer frame activo muestra exactamente la
  pose de golpe** (hay test). Solo avanza con frames no congelados.
- Los ángulos de las extremidades se interpolan por el **camino más corto** (antes un antebrazo que pasaba de
  170° a −170° daba casi una vuelta entera en un frame al caminar o atacar).
- **Exageración**: el atacante se estira un 4 % (ligero), 7 % (fuerte) o 6 % (especial) en el primer frame
  activo y la mitad en el segundo; se sostiene durante el hitstop. El golpeado se inclina hacia atrás según la
  fuerza (retroceso que se suelta al reanudarse).
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

## 8. Profundidad: agarres, especiales, combos, medidor y súper

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

## 9. Parry (pieza central)

Inspirado en el parry de *Street Fighter III: 3rd Strike*: riesgo y recompensa puros, sin coste de medidor,
convive con bloquear, atacar y agarrar. Buscamos un punto medio: ventana corta pero alcanzable y castigo real al fallar.

| Regla | Valor |
|---|---|
| Ventana (desde que se pulsa) | **Normal 8** · Fácil 11 · Hardcore 5 frames (Opciones) |
| En el aire | ventana − 3 (Normal: 5 frames); desvía cualquier altura |
| De pie | desvía **alto y medio** + proyectiles |
| Agachado (↓ + PARRY) | desvía **bajo y medio** + proyectiles |
| Acierto | 0 daño · congelamiento de 8 frames para ambos · el defensor actúa en cuanto termina · el atacante suma **+10 frames** de recuperación · +60 de medidor |
| Fallo | 20 frames de recuperación en estado de **counter hit** · +14 frames de enfriamiento (no se puede volver a intentar) |
| Agarres | **siempre le ganan** al parry (no se pueden parriar) |
| Red parry | en blockstun, pulsar PARRY abre 3 frames; si el siguiente golpe llega dentro, se desvía. Cuesta 250 (1/4 de medidor) |

- **Frame exacto** (con tests para las tres dificultades): si el golpe conecta en el frame H, el parry pulsado
  en cualquier frame de `H − (ventana − 1)` a `H` (incluido el mismo frame del impacto) acierta; un frame antes
  es "demasiado pronto" (y el golpe entra como counter hit); un frame después ya es tarde.
- La ventana se abre al pulsar (no al mantener): para parriar varios golpes seguidos (la súper de 5 golpes) hay
  que volver a pulsar en cada uno, al ritmo. Pulsar durante el congelamiento del parry anterior queda en el buffer.
- Un movimiento parriado no puede cancelarse (ni chain ni especial): el atacante se come los +10 frames.
- Tras un parry aéreo se recupera la acción aérea: se puede contraatacar en el aire.

### Balance con el resto del sistema
- **Triángulo**: bloquear gana a atacar, agarrar gana a bloquear, atacar rápido gana a agarrar.
  **Parry** gana a los golpes predecibles (jump-ins, proyectiles lanzados de lejos, el final de una cadena
  que siempre es igual); pero un parry a ciegas pierde contra agarres, contra golpes retrasados (el parry se
  agota y te comes un counter hit) y contra la altura contraria (bajo/alto).
- Los proyectiles siguen siendo útiles: el parry no da medidor suficiente para compensar el riesgo de fallar,
  y la Onda lenta sirve para avanzar detrás de ella (si te parrian la onda, sigues cubierto).
- El muñeco del modo Entrenamiento y la CPU usan el parry con limitaciones (reacción con retraso, fallos).

### Trial de parry (enseñar sin abrumar)
Siete lecciones con un muñeco que repite patrones; cada una añade una idea:
1. **El tiempo del parry** — un directo lento y visible (3 aciertos).
2. **Proyectiles** — la Onda lenta (3).
3. **Ataques bajos** — barrida: ↓ + PARRY (3).
4. **Ataques en salto** — se parrian de pie (3).
5. **¿Alto o bajo?** — mezcla aleatoria Martillo (alto) / Barrida (bajo), leyendo la anticipación (4).
6. **Desviar una súper** — los 5 golpes seguidos (1).
7. **Red parry** — bloquear agachado y desviar el 2.º o 3.er golpe de una cadena (2).

Tras cada fallo dice el porqué: "¡Muy pronto! Por N frames", "¡Tarde! Por N frames", "Altura incorrecta"…
Un test simula cada lección y comprueba que el ataque conecta y que existe un timing que la supera.

## 10. Game feel ("juice", con moderación)

Todo vive fuera de la simulación (`src/render/effects.ts`, `src/audio/Audio.ts`): reaccionan a `state.events`
y usan su propio azar. Regla de oro: **el fuerte tiene que destacar sobre el ligero**; si todo explota, nada pesa.

| Elemento | Ligero | Fuerte | Súper / KO |
|---|---|---|---|
| Hitstop (ambos congelados) | 4 f (~67 ms) | 9–10 f (~150–170 ms) | 5 f por golpe, el último +12; KO ≥ 14 f |
| Counter hit | +2 f de hitstop, anillo rojo, "COUNTER", campanita | igual | — |
| Sacudida de cámara | **ninguna** (solo 2 px / 4 f si es counter hit) | 6 px / 10 f | 9–12 px / 14–22 f |
| Chispas | 6 | 14 + anillo | 22–30 + destello de pantalla |
| Destello con forma (punto de impacto) | r 17 / 5 f | r 30 / 8 f | r 38 / 10 f |
| Bloqueo | chispas azules + arco de guardia hacia el atacante, sin sacudida | 1,5 px / 4 f | |

- **Forma según lo que golpea** (`src/render/strikeInfo.ts` lee `anim.limb` y el tipo del movimiento):
  puño = estrella de 8 puntas cálida · patada = arco anaranjado que se abre en la dirección del golpe ·
  especial/proyectil/súper = estrella de 10 puntas del color de energía del personaje · bloqueo = arco azul.
  Con "destellos" desactivados las formas se dibujan a media opacidad.

- Las chispas salen del **punto exacto de impacto** (intersección hitbox/hurtbox) y hacia el lado contrario al atacante.
- **Flash blanco** del personaje golpeado: un solo "pop" al principio del hitstop (2 frames; 3 si el hitstop
  es ≥ 8), no un parpadeo continuo. **Vibración de hitstop** que decae con los frames que quedan:
  ligero 2,5 px, fuerte 4,5, súper 5, bloqueo 1,5/2,5 (antes ±3 px para todo).
- **Estela** (smear) de la extremidad que golpea durante los frames activos: blanca en normales, del color de
  energía en especiales.
- **Anticipación**: los especiales con proyectil concentran energía en las manos durante el startup; las poses
  de carga (windup) se sostienen para que el golpe se vea venir. **Follow-through**: pose de recuperación antes
  de volver a la guardia.
- **Polvo** al saltar, aterrizar, hacer dash y caer derribado.
- **Parry**: contorno blanco-azulado, anillo + esquirlas, destello de pantalla breve y un "ting" metálico
  inconfundible (distinto del red parry, más grave y rojo).
- **Súper**: congelamiento de 40 frames con zoom, oscurecido del escenario, contorno de energía y líneas de velocidad.
- **KO**: cámara lenta (30 % durante 50 ticks: el bucle ejecuta menos ticks, la lógica de cada tick no cambia),
  zoom al derribado, destello y "K.O.".

### Sonido en capas (todo sintetizado)
- Golpe = impacto grave (seno con caída de tono) + "clack" agudo (onda cuadrada/triángulo muy corta) + ruido filtrado.
- Bloqueo = golpe sordo y apagado; parry = campanas agudas (2 kHz) con eco; counter = campanita extra;
  proyectil = barrido de ruido + diente de sierra ascendente; súper = barrido largo; KO = estruendo grave con eco.
- Panorama estéreo según la posición en pantalla y ligera variación de tono aleatoria para no cansar.
- Música en bucle por escenario (secuenciador propio): "muelle" con aire de merengue (güira constante),
  "azotea" synthwave, "plaza" con guitarra arpegiada, y tema de menú.

### Accesibilidad
- Opciones para **desactivar la sacudida** y **los destellos** (el flash blanco del golpe se sustituye por un
  contorno tenue; sin destellos de pantalla).

## 11. Personajes (identidades)

| | RAYO (equilibrado) | CHISPA (rushdown) | MURALLA (grappler) |
|---|---|---|---|
| Vida | 1000 | 880 | 1150 |
| Caminar adelante / atrás | 3,2 / 2,6 | 4,2 / 3,3 | 2,2 / 1,9 |
| Dash | 18 f, 112 px | 15 f, 128 px | 22 f, 92 px |
| Salto | 44 f en el aire | ~38 f (rápido) | ~47 f (pesado) |
| Jab | 4 f | **3 f** | 5 f (más alcance y daño) |
| Proyectil (↓↘→+P) | Onda Rayo: cruza la pantalla | Chispazo: se apaga a ~250 px | Temblor: onda baja y lenta (se bloquea agachado) |
| Anti-aéreo (→↓↘+P) | Puño Ascendente (invencible) | Gancho Relámpago (invencible, más bajo) | Atrapa Cielos: **agarre** aéreo invencible a golpes |
| Otros especiales | Embestida (↓↙←+K, atraviesa proyectiles) | Ráfaga (↓↘→+K), Rodada (↓↙←+K, invencible a golpes, agarrable) | **Abrazo de Oso** (→↘↓↙←+P, agarre de comando que no se escapa), Embestida de Toro (↓↘→+K, armadura) |
| Overhead | Martillo (→+HP) | Salto de gata (→+HK) | — (tiene el agarre de comando) |
| Súper | Tormenta Final: orbe de 5 golpes | Mil Chispas: ráfaga invencible de 6 golpes | Gran Terremoto: onda sísmica de 4 golpes |
| Plan de juego | Controlar la distancia y castigar saltos | Pegarse, mezclar alto/bajo/agarre | Aguantar, acercarse con armadura y agarrar |
| Debilidad | Nada destaca: hay que jugar bien | Poca vida, poco alcance, se la puede mantener lejos | Lento, salto pesado, le cuesta acercarse |

- **Armadura** (Muralla: Embestida y patada fuerte): durante ciertos frames encaja 1 golpe sin interrumpirse,
  recibiendo la mitad del daño. Los agarres la rompen siempre (y Chispa/Rayo pueden agarrarle).
- **Agarres de comando**: no se pueden escapar (sin tech), mucho daño, pero fallar deja 34–38 frames de
  recuperación. Es la amenaza que obliga a no quedarse bloqueando contra Muralla.
- **Golpes múltiples con remate**: cada golpe de un movimiento puede definir su propio daño/hitstun/derribo
  (la súper de Chispa remata con un uppercut de 110 que lanza).
- Cada personaje tiene su propia guardia y forma de caminar (poses base por personaje) y paletas alternativas
  para los espejos.

## 12. IA (CPU) y muñeco de entrenamiento

- La CPU **no lee inputs**: observa el estado del juego con un **retraso de reacción** (26/17/11 frames en
  Fácil/Normal/Difícil) y ejecuta especiales con motion inputs reales, frame a frame.
- Decide por capas: escapar de agarres (adivinando, la ventana es menor que cualquier reacción), cancelar en
  combo si su golpe conectó, anti-aéreo si ve un salto que se acerca, defensa (bloqueo con la altura que ve,
  parry de lectura contra proyectiles y saltos), castigo de recuperaciones y juego neutro según distancia y
  "costumbres" del personaje (Rayo zonea, Chispa se pega, Muralla busca el agarre).
- Se equivoca a propósito: probabilidad de despiste, de bloquear con la altura equivocada y de no reaccionar.
  Entre decisiones "piensa" unos frames (más en Fácil).
- Test: Difícil gana a Fácil ≥ 70 % de los partidos; los partidos CPU vs CPU terminan y son deterministas.
- **Muñeco**: quieto, agachado, bloquea todo (ve el golpe al instante; medios de pie, bajos agachado), parry
  perfecto (pulsa en el frame justo, incluido cada golpe de un multi-hit), salta, CPU de nivel elegible y
  reproducir una grabación (F4 graba controlando al muñeco, F5 reproduce en bucle; la grabación es relativa a
  hacia dónde mira, así funciona en cualquier lado).

## 13. Modos y menús

- **Arcade**: 3 combates (los otros dos personajes y un espejo final un nivel más difícil) en los tres
  escenarios; si pierdes puedes repetir; final con la frase del campeón.
- **Versus** (2 jugadores, cada uno elige con sus controles), **Versus contra CPU** (combate libre).
- **Entrenamiento**: vida infinita, sin reloj, frame data del último ataque (teórica y **medida** en vivo tras
  cada contacto), historial de inputs, cajas (F1), reiniciar posición (R centro / T esquina), muñeco
  configurable, medidor infinito y grabación/reproducción.
- **Trial de parry** con cualquier personaje.
- **Opciones**: volumen de música y efectos, dificultad del parry, inputs simplificados, dificultad de la CPU,
  sacudida, destellos, controles de J1 y J2 (teclado y mando; al asignar una tecla se quita de otras acciones
  para evitar conflictos) y restaurar valores. Se guardan en `localStorage` (si no hay, duran la sesión).
- **Pausa** (Esc/Enter/P/Start), **lista de movimientos** de cada personaje y **pantalla de victoria**.

## 14. Escenarios

| Escenario | Ambiente | Detalles animados | Música |
|---|---|---|---|
| Muelle al Atardecer | puerto al final de la tarde | barcos que se mecen, olas, gaviotas, grúa, ventanas que se encienden | aire de merengue (güira) |
| Azotea Neón | ciudad a medianoche | letreros de neón que parpadean, estrellas, ventiladores, antena, lluvia fina, charcos con reflejos | synthwave |
| Plaza Colonial | casco antiguo en fiesta | casas de colores, banderines, palmeras que se mecen, público que salta, nubes | guitarra arpegiada |

## 15. Balance y rendimiento (fase de pulido)

### Método
`npm run sim` (informe completo en [docs/balance.md](docs/balance.md)) ejecuta, de forma determinista:
1. **Round-robin CPU vs CPU** en Normal y Difícil (todos los emparejamientos, ambos lados de la pantalla).
2. **Bots de una sola táctica** contra la CPU: saltar siempre, tortuga, solo proyectiles, solo agarrar,
   machacar botones, spamear el anti-aéreo, parry a ciegas. Si una táctica trivial gana a menudo, es dominante.
3. **Fuzzer de combos**: miles de secuencias aleatorias de inputs muy rápidos contra un rival quieto, en el
   centro y en la esquina, con una súper disponible, buscando combos infinitos o demasiado largos.
Una versión ligera corre en cada `npm test` (`tests/balance.test.ts`).

### Cambios hechos a partir de las simulaciones
| Problema detectado | Ajuste |
|---|---|
| Lanzar proyectiles sin parar ganaba el 100 % a la CPU | Onda Rayo: recuperación 32→40, blockstun 16→13, daño fuerte 75→70; Chispazo: startup 10/12→13/15, recuperación 22→28, blockstun 15→12; Temblor: recuperación 30→34 |
| Chispa ganaba ~15 % de sus partidos | Vida 880→930 y +10–15 % de daño en normales y especiales |
| Muralla con botones al azar ganaba mucho | Abrazo de Oso: alcance 96/118→90/104, el fuerte arranca en 10 y avanza menos; Atrapa Cielos 120/140→104/122; patada fuerte 120→105 y armadura más corta (f8–13); vida 1150→1100; agarres 140/180/210→130/165/190; palmada 110→100 |
| La IA no sabía lidiar con proyectiles, reversals ni machacadores | Salta/atraviesa proyectiles y se queda bloqueando hasta que pasan; modela al rival (si abusa de reversals o machaca, espera y castiga); castigo según los frames que le quedan al rival; memoria: si le anti-aérean o le cazan con counter hits, insiste menos; contra agarres de comando retrocede en vez de agacharse |

### Resultados finales (50 partidos por emparejamiento y nivel)
- **Sin infinitos**: el combo más largo del fuzzer es de 9 golpes (súper incluida); el máximo de daño, ~36 % de la vida.
- **Tácticas triviales contra la CPU Difícil**: saltar siempre, tortuga, agarrar y parry a ciegas 0 %;
  proyectiles 0–18 %; spam de anti-aéreo 0–35 %; machacar 0–47 % (Muralla, el mejor caso).
- **Personajes (CPU vs CPU)**: Normal 57 / 52 / 43 % (Rayo / Chispa / Muralla); Difícil 54 / 31 / 62 %.
  Todos ganan partidos y cada uno gana algún emparejamiento.
- **Pendiente / a vigilar**: la CPU Normal sigue siendo explotable por dos patrones (Chispazo constante a media
  distancia y Muralla machacando); Chispa vs Muralla en Difícil es muy desfavorable para Chispa con la IA actual.
  La simulación mide personajes *jugados por la IA*: estos números deben contrastarse con partidas humanas.

### Rendimiento
Medido en Chromium headless (render por software), CPU vs CPU en los tres escenarios (`?modo=demo`):
**60 FPS y 60 ticks/s estables**, tick de simulación ~0,4 ms, dibujo ~1 ms de media (pico ~12 ms, por debajo de
los 16,7 ms del frame), memoria JS ~8 MB. La simulación hace 1 clon del estado por tick (`structuredClone`); las
simulaciones masivas usan `stepInPlace` sin clonar (~600 partidos completos en ~40 s).

## 16. Lista de verificación final

- [x] `npm run dev` abre el juego y `npm test` pasa en verde.
- [x] Un jugador nuevo puede golpear, bloquear y lanzar un proyectil en menos de un minuto (inputs simplificados: SP).
- [x] Cada golpe con peso: hitstop, empuje, sonido y partículas proporcionales.
- [x] Parry arriesgado pero justo, enseñado por el trial (las 7 lecciones verificadas por simulación).
- [x] Sin combos infinitos ni táctica trivial que gane siempre a la CPU Difícil (simulaciones). Ver pendientes arriba.
- [x] Los 3 personajes juegan distinto y todos pueden ganar.
- [x] 60 FPS estables; simulación determinista (tests de reproducción de inputs).
- [x] Teclado y mando; controles remapeables; opciones de accesibilidad.
- [x] DESIGN.md con decisiones y toda la frame data; README con cómo jugar y lista de movimientos.

App de escritorio:
- [x] `contextIsolation`, `nodeIntegration: false`, `sandbox`, preload mínimo, CSP estricta, sin navegación
  externa ni ventanas nuevas, un solo ejemplar (§18, con tests de CSP/orígenes).
- [x] Pantalla completa (F11/Alt+Enter), escalado 16:9 con barras y por enteros, ventana recordada, sin menú.
- [x] 60 ticks fijos a 30–240 Hz (tests), pausa y atenuación al perder el foco, `backgroundThrottling: false`.
- [x] Configuración JSON atómica con versión/migración y recuperación de archivos dañados (tests), registros con rotación.
- [x] Instaladores: Windows NSIS + portable, Linux AppImage, macOS dmg (CI); construido y ejecutado en local: Linux.
- [x] Arranque < 3 s, 60 FPS estables sin tirones (medido), modo bajo consumo, smoke test en CI.
- [ ] Firma de código y actualizaciones automáticas: preparadas pero sin certificados ni servidor (README).

## 17. Mando (gamepad)

### Un solo camino de entrada
Teclado y mando producen **la misma máscara de bits** por tick y pasan por el mismo código
(`InputManager.sample`: acciones → bits → SOCD). El mando solo genera inputs: la simulación, el buffer y los
motion inputs no saben de dónde vienen. Hay un test que lo demuestra: el cuarto de círculo + LP con teclado,
cruceta y stick produce la misma secuencia de bitmasks y el mismo estado final de la simulación (mismo hash).

### Lectura (fase 1)
- **Gamepad API por sondeo**, una vez por tick, justo antes de que la escena muestree la entrada
  (`App.tick → input.poll() → scene.update()`): la lectura más reciente posible para ese tick. Los eventos
  `gamepadconnected/disconnected` no se usan para jugar.
- `src/input/gamepad.ts` (sin DOM, testeable con mandos simulados): `PadReader` guarda por mando los botones
  de este tick y del anterior (pulsaciones nuevas), los ejes y la dirección; reutiliza sus arrays (sin basura).
- **Mapeo `standard`** (Xbox, DualShock/DualSense, Switch Pro y la mayoría de genéricos): cruceta = botones
  12–15, stick izquierdo = ejes 0/1, gatillos = botones 6/7 analógicos.
- **Cruceta y stick a la vez**: sus direcciones se suman y el SOCD final resuelve contradicciones.
- **Stick → 8 direcciones** (`stickDirection`):
  - zona muerta **radial** (0,45): una diagonal suave cuenta igual que una cardinal;
  - **histéresis de radio**: activa a 0,45 y suelta por debajo de 0,32 (sin parpadeo en el borde);
  - **diagonales generosas**: cada diagonal ocupa 56° (las cardinales 34°), así el ↘ del cuarto de círculo
    sale sin apuntar; hay un test con un arco descuidado (radio 0,7–0,8, empezando detrás de ↓) que lanza la Onda;
  - **histéresis de sector**: hay que pasarse 6° de la frontera para cambiar de dirección.
- **Gatillos analógicos → digitales** con umbral configurable (0,45) y 0,08 de histéresis (Chrome marca
  `pressed` con cualquier presión mínima; se ignora y se usa el valor).
- **Asignación provisional**: el primer mando conectado es J1 y el segundo J2 (la pantalla "presiona un botón
  para unirte" llega en la fase 3).
- **Configuración**: valores de fábrica en `src/input/padTuning.ts`; el jugador los ajusta en
  Opciones → "Mando: sensibilidad y calibración" (con vista en vivo del stick, la zona muerta, el radio de
  soltar, las fronteras de sector y los gatillos) y se guardan en `settings.padTuning` (validados al cargar).

### Botones, perfiles y mandos no estándar (fase 2)
- **Diseño por defecto** (`DEFAULT_PAD`): X/□ LP · Y/△ HP · A/✕ LK · B/○ HK · LB/L1 agarre · RB/R1 parry ·
  RT/R2 súper · LT/L2 especial de un botón (SP) · Start/Options pausa · cruceta = direcciones.
  - **Agarre y súper son atajos de un botón que producen LP+LK y HP+HK** en el mismo tick: exactamente lo que la
    simulación ya aceptaba con teclado (la súper también sale con ↓↘→↓↘→+P). No se añadió ninguna regla.
  - **SP** solo actúa con "inputs simplificados" (opción aparte, no sustituye a los motion inputs). Se puso en
    LT porque el prompt no le asigna botón y es el único libre al alcance.
  - Menús con mando: **el botón de abajo acepta y el de la derecha vuelve** (A/B, ✕/○), fijos aunque se
    remapee el combate. En mandos de Nintendo con mapeo estándar el botón de abajo es "B": se respeta la
    posición física, no la letra (decisión: un mismo gesto en todos los mandos).
- **Entradas como números** (`padCodes.ts`) para que los perfiles sean listas de enteros en el JSON:
  botón 0–99, eje 100+2·i (+) / 101+2·i (−), hat 200+i. El hat (cruceta de muchas palancas arcade sin mapeo
  estándar: un eje con 8 valores en −1+k·2/7 y reposo fuera de [−1, 1]) se decodifica a 8 direcciones.
- **Un perfil por tipo de dispositivo**: `xbox`, `playstation`, `switch`, `generic` (detectado por `Gamepad.id`:
  fabricante 045e/054c/057e o nombre) y `raw:<id>` por modelo para los no estándar. Se guarda en
  `settings.padProfiles`; sin perfil = diseño de fábrica. Decisión: el perfil es del tipo de mando, no del
  jugador (dos mandos Xbox comparten diseño); "Restablecer este perfil" lo borra. El formato antiguo `pads`
  (por jugador, con otro diseño) se descarta al cargar.
- **Conflictos**: una entrada física pertenece a una sola acción. Al asignar un botón ocupado se
  **intercambian** las dos acciones y se avisa ("Y era de Puño fuerte: intercambiados"); el teclado hace lo mismo
  (antes dejaba la otra acción vacía). Si un archivo trae conflictos, la pantalla los señala.
- **Configuración guiada** (Opciones → Botones del mando): "Presiona el botón para Puño ligero…" paso a paso
  (direcciones primero si el mando no es estándar). `PadCapture` exige volver a reposo antes de aceptar,
  detecta botones, ejes por desplazamiento desde su reposo (gatillos en eje que descansan en −1) y hats, y
  aprende el reposo una vez por mando (el paso siguiente puede empezar con el eje aún movido). Un hat en
  "arriba" cubre las cuatro direcciones. Un botón ya usado se rechaza ("ya es…: pulsa otro"). Cada paso se
  omite a los 8 s o con Retroceso; Esc cancela sin tocar el perfil anterior.
- Un mando no estándar sin configurar no inventa botones: solo se mueve con los ejes 0/1 (stick).

### Jugadores, conexión y menús (fase 3)
- **Huecos de jugador** (`InputManager.slots`): cada jugador tiene como mucho un mando, identificado por su
  índice y su `id`. Fuera de la pantalla de unión, **un mando libre que pulsa un botón se une solo** (primero J1,
  luego J2): el primero que pulsa es J1, no el primero que se conectó. El teclado siempre funciona para los dos.
- **Pantalla "Presiona un botón para unirte"** (Versus de 2 jugadores): A/✕ une un mando, B/○ lo saca;
  el teclado se une con Enter/J (teclas de J1) o Num Enter/Num 4 (teclas de J2). Mezclas: dos mandos,
  teclado + mando o los dos juegos de teclas. **Quien entra con un juego de teclas lo conserva** aunque quede
  como J2 (`keySet`), así un jugador de teclado no tiene que cambiar de manos si el mando llegó antes. Al volver
  al título cada jugador recupera su juego de teclas.
- **Desconexión**: el hueco no se libera; queda "esperando" a ese mando (`lost`). En plena partida (combate y
  trial) se **pausa** con el aviso "Mando desconectado (Jn): reconéctalo o presiona una tecla para continuar
  con teclado". Si vuelve un mando con el mismo `id` (aunque el navegador le dé otro índice) **recupera su
  jugador** sin pasar por la unión; si se pulsa una tecla, ese jugador sigue con teclado; si pulsa otro mando,
  ocupa el hueco. La pausa sigue abierta tras el aviso: se continúa a propósito. Los eventos
  `gamepadconnected/disconnected` solo se registran en el log; los cambios se detectan sondeando.
- **Menús con mando**: todas las pantallas (incluidas la pausa del trial, que antes solo salía con Esc, y la
  grabación del muñeco en entrenamiento, antes solo F4/F5) se manejan con cruceta/stick, A/✕ y B/○; Start abre
  la pausa. Foco: la fila elegida resaltada con flecha y fondo, igual en todas.
- **Sin dobles disparos**: el menú se calcula **una vez por tick** (varias llamadas devuelven lo mismo y la
  auto-repetición no corre el doble) y `consume()` anula el resto del tick: lo llaman el cambio de escena (la
  pulsación que cambió de pantalla no actúa en la nueva) y la apertura de una pausa (Enter es "pausa" y
  "aceptar": abre la pausa sin elegir "Continuar"). Mantener A pulsado avanza una sola pantalla.
- Tests con las escenas reales y una App falsa: recorrido completo título → combate → pausa → salir solo con
  mando, B en cada pantalla, A mantenido, la pausa con Enter, desconexión/reconexión/teclado en plena partida
  y la pantalla de unión (dos mandos y teclado + mando con su juego de teclas).

### Íconos y vibración (fase 4)
- **Íconos dibujados por código** (`src/ui/glyphs.ts`, sin arte de terceros): Xbox = círculos con la letra en
  su color; PlayStation = cruz, círculo, cuadrado y triángulo **dibujados como figuras** (no tipografía);
  Switch = letras según la posición física; genérico = rombo de cuatro puntos con el botón marcado (no se sabe
  qué letra lleva); hombros y gatillos con su nombre (LB/L1/L…); cruceta con el brazo marcado; teclado = tecla
  con su letra. Mandos no estándar: "B3", "Eje 2+", "Cruceta (hat)".
- `drawRich` sustituye tokens (`{LP}`, `{P}` = LP/HP, `{PARRY}`, `{ACCEPT}`, `{BACK}`, `{PAUSE}`, `{UPDOWN}`…)
  por el ícono del **botón realmente asignado** en el perfil (si se remapea, los íconos cambian).
  - Menús y barras de ayuda: el **último dispositivo usado** (`input.lastDevice`: pulsar una tecla cambia a
    teclado, tocar el mando cambia al mando).
  - Lista de movimientos (también la de la pausa, con los consejos) y el trial de parry: el dispositivo del J1.
- **Vibración** (`src/input/rumble.ts`): `vibrationActuator.playEffect("dual-rumble")` si existe; si no, nada
  (sin errores: también se capturan excepciones y promesas rechazadas). Vive en la capa de efectos: la llama
  `FightScene` con los eventos del tick, solo para lados humanos (`rumbleSides`), y nunca toca la simulación.
  | Evento | Para quién | Grande / pequeño / ms |
  |---|---|---|
  | golpe ligero / fuerte / súper / contraataque | quien lo recibe | 0,22/0,38/70 · 0,6/0,45/140 · 0,85/0,6/220 · 0,75/0,55/170 |
  | bloqueo | quien bloquea | 0,05/0,22/50 |
  | parry y red parry | quien lo hace | 0/0,55/60 (seco, agudo) |
  | súper | quien la lanza | 0,45/0,3/260 |
  | agarre | quien lo sufre | 0,55/0,3/160 |
  | KO | quien cae / quien gana | 1/0,8/480 · 0,25/0,25/200 |
  - **No se acumula**: mientras dura una vibración, otra igual o más débil se ignora (los impactos de un golpe
    múltiple durante el hitstop no encadenan vibraciones); una más fuerte la sustituye. La pausa la corta.
  - Opciones: "Vibración del mando" (sí/no) e "Intensidad" (10–100 %, escala las magnitudes); al cambiarlas
    vibra una vez de prueba.

### Entrenamiento, pruebas y estado final (fase 5)
- **Historial de entrada** del entrenamiento con los íconos del dispositivo de cada lado (lo que de verdad
  llegó a la simulación, con los frames que duró cada entrada); el muñeco se muestra con nombres (LP, HP…).
  Agarre y súper desde LB/RT aparecen como sus dos botones, que es lo que ve la simulación.
- **Entrada en vivo** (opción de la pausa, activada por defecto): stick con su zona muerta y posición real,
  cruceta con la dirección final (tras SOCD) y los botones encendidos mientras se pulsan.
- **Calibración del stick** también desde la pausa del entrenamiento (la misma pantalla de Opciones; al
  volver se sigue en la pausa).
- **Pruebas** (todas con mandos simulados, `tests/padHelpers.ts`): zona muerta radial, histéresis de radio y
  de sector, SOCD de teclado/mando/mezcla, mapeo estándar, remapeo e intercambio, perfiles por tipo, gatillos
  con umbral e histéresis, máscaras, hotplug (unión al pulsar, baja, reconexión con otro índice, mando que
  ocupa el hueco, paso a teclado), captura guiada (botón, gatillo en eje, hat, reposo), vibración (a quién,
  proporción, sin acumulación, fallos silenciosos), menús con las escenas reales solo con mando y sin dobles
  disparos, y la **prueba clave**: QCF + LP con teclado, cruceta y stick → misma secuencia de bitmasks y
  mismo hash final de la simulación. Los tests de determinismo existentes siguen pasando sin cambios.
- **Sin verificar aquí** (no hay mandos físicos en el contenedor): el comportamiento con hardware real
  (ids exactos de cada modelo y sistema, vibración física, deriva de sticks gastados, palancas arcade con hat).
  Todo eso está en la lista de pruebas manuales del README; en la app de escritorio se probó inyectando mandos
  simulados en `navigator.getGamepads` (menús, unión, desconexión, Onda con el stick, remapeo, guía, íconos y
  llamadas a `playEffect`).

#### Lista "listo cuando"
- [x] Partida completa con mando; íconos Xbox y PlayStation (verificado con mandos simulados; falta hardware real).
- [x] Teclado, cruceta y stick → mismos inputs de simulación (test con hash).
- [x] Cuartos de círculo cómodos con el stick (diagonales de 56°, test con arco descuidado).
- [x] Remapeo, perfiles guardados y mandos no estándar (configuración guiada con botones, ejes y hat).
- [x] Hotplug: pausa al desconectar y recuperación al reconectar.
- [x] Todos los menús solo con mando (test con las escenas reales).
- [x] Vibración con interruptor e intensidad.
- [x] Tests en verde, 60 FPS (ver medición en §18, fase 5), README actualizado.

## 18. App de escritorio (Electron)

### Decisión: Electron + electron-builder
- **Electron trae su propio Chromium**: Gamepad API, Web Audio y Canvas 2D se comportan igual en todas las
  máquinas (el juego ya es web y casi no cambia).
- **Tauri** (alternativa considerada, no adoptada): instaladores mucho más pequeños y menos memoria, pero usa el
  webview del sistema (WebView2 en Windows, WebKitGTK en Linux, WKWebView en macOS); el soporte del Gamepad API y
  la latencia de audio varían entre ellos, y para un juego de peleas eso es un riesgo mayor que el tamaño.
- Versiones fijadas: Electron 44.5.1, electron-builder 26.17.0, electron-updater 6.8.10.

### Estructura
```
electron/main.ts      proceso principal: ventana, protocolo app://, seguridad, IPC, ciclo de vida
electron/preload.ts   puente mínimo (contextBridge) → window.contragolpeDesktop
electron/security.ts  CSP y lista de orígenes permitidos (con tests)
scripts/electron-*.mjs compilación (tsc → dist-electron/, CommonJS) y modo desarrollo
```
- `npm run app:dev`: servidor Vite con recarga en caliente + ventana Electron apuntando a él.
- En producción el juego se sirve desde `dist/` con un **protocolo propio `app://game/`** (más seguro que
  `file://`: origen propio, rutas confinadas a `dist/`, tipos MIME explícitos y cabeceras de seguridad).

### Seguridad (revisión punto por punto)
| Requisito | Cómo se cumple |
|---|---|
| `contextIsolation: true` | `webPreferences` de la ventana |
| `nodeIntegration: false` | `webPreferences`; verificado: `window.require` y `window.process` no existen en el juego |
| `sandbox: true` | renderer en sandbox; el preload solo usa el módulo `electron` (requisito del sandbox) |
| Preload mínimo | expone solo funciones concretas (`toggleFullscreen`, `setFullscreen`, `isFullscreen`, `quit`, y en fases siguientes configuración, logs y foco); **nunca `ipcRenderer`**. El proceso principal valida los tipos de cada argumento |
| CSP estricta | `<meta>` inyectada en el build y además **cabecera HTTP** en cada respuesta de `app://`: `default-src 'self'`, sin `unsafe-eval`, sin orígenes remotos, `object-src 'none'`. (Estilos `unsafe-inline` solo por el `<style>` del HTML; no hay scripts en línea) |
| Sin navegación externa | `will-navigate`/`will-redirect` bloquean todo lo que no sea `app://game` (o el servidor de desarrollo) |
| Sin ventanas nuevas | `setWindowOpenHandler → deny`; `<webview>` bloqueado |
| Permisos del navegador | todos denegados salvo pantalla completa |
| Un solo ejemplar | `requestSingleInstanceLock`; un segundo arranque enfoca la ventana existente |
| Sin menú del navegador | `Menu.setApplicationMenu(null)` |

Nota de entorno: dentro de contenedores que corren como **root**, Chromium exige `--no-sandbox` (desactiva el
sandbox del sistema operativo, no el `sandbox: true` del renderer). Los scripts de desarrollo y pruebas lo añaden
solo en ese caso; un usuario normal nunca lo necesita.

### Ventana, escalado y frecuencia del monitor (fase 2)
- **Resolución lógica 960×540 (16:9)**, la misma de la versión web (el prompt sugería 1280×720 "por ejemplo";
  cambiarla obligaría a rehacer todas las coordenadas de UI sin ganar nitidez). El lienzo se dibuja a la
  resolución real de la ventana × `devicePixelRatio` (hasta 2×), así que se ve nítido a cualquier tamaño;
  se escala manteniendo 16:9 con barras negras. Opción **"Escalado por enteros"**: solo múltiplos exactos.
- **Pantalla completa**: F11 y Alt+Enter. En escritorio el proceso principal intercepta las teclas reales
  (`before-input-event`) y las consume; el renderer también las atiende (navegador, o teclas inyectadas por
  pruebas automáticas) sin doble disparo. Opción "Iniciar en pantalla completa". Ventana 1280×720 de inicio.
- **Cursor**: visible en menús; en partida se oculta tras 2 s sin mover el ratón.
- **Vsync y monitores rápidos**: el render va a la frecuencia del monitor (requestAnimationFrame con vsync) y
  la simulación sigue con el acumulador de paso fijo. Tests con monitores simulados de 30–240 Hz (y jitter):
  siempre 600 ticks en 10 s, sin doble velocidad. Un parón largo no provoca una avalancha de ticks (máx. 5 por frame).
- **Foco**: al perderlo, la partida se pausa (opción "Pausar al perder el foco") y el volumen baja al 15 %;
  `backgroundThrottling: false` para que el juego y el audio no se degraden en segundo plano.

### Guardado, registro y ciclo de vida (fase 3)
- **Configuración** en `userData/settings.json` (Windows: `%APPDATA%/CONTRAGOLPE`, Linux: `~/.config/CONTRAGOLPE`,
  macOS: `~/Library/Application Support/CONTRAGOLPE`) con sobre `{ version, savedAt, settings }`.
  - Escritura **atómica**: temporal + `fsync` + `rename` (un corte de luz nunca deja el archivo a medias).
  - **Archivo dañado** (JSON inválido o estructura sin sentido): se usan los valores por defecto, se conserva una
    copia `settings.corrupt-<fecha>.json` y se anota en el registro.
  - **Versión de esquema** (actual: 2) con migración: v1 era el objeto de ajustes sin sobre (lo que guardaba la web
    en `localStorage`); campos renombrados se migran. Las versiones futuras se leen campo a campo.
  - El juego **valida** cada campo al cargar (`parseSettings`): tipos incorrectos o desconocidos → valor por defecto.
  - En el navegador (`npm run dev`) se sigue usando `localStorage`.
- **Estado de la ventana** (`window-state.json`): tamaño, posición, maximizada y pantalla completa; si la posición
  guardada ya no cae en ninguna pantalla, se centra.
- **Registro** en `userData/logs/main.log` con rotación por tamaño (1 MB, 3 archivos): arranque, versiones,
  errores del proceso principal y del juego (`window.onerror`, promesas rechazadas, con límite de 200 por minuto),
  caídas del renderer, navegación bloqueada y métricas de rendimiento.
- **Cierre**: la configuración se guarda en cada cambio y el estado de la ventana al cerrar. Si hay un combate en
  curso pide confirmación (opción "Confirmar al salir en partida"). "Salir del juego" en el menú principal.
- **Caída del renderer** (`render-process-gone`): mensaje claro con el motivo y la ruta del registro, y botones
  "Reiniciar el juego" / "Salir".
- Variable `CONTRAGOLPE_USER_DATA` para aislar la carpeta de datos en pruebas automáticas.

### Empaquetado, íconos e instaladores (fase 4)
- **Identidad**: `productName` CONTRAGOLPE, `appId` `com.contragolpe.game`, versión y descripción de `package.json`.
- **Ícono original generado por código** (`npm run icon` → `scripts/make-icon.mjs`, Node puro sin dependencias):
  rasteriza con antialiasing un cuadrado redondeado oscuro, un anillo cian y un rayo amarillo con contorno, y
  escribe `build/icon.png` (1024), `build/icon.ico` (16–256, PNG embebidos) y `build/icon.icns` (ic07–ic10).
- **Objetivos**: Windows NSIS (instalador con elección de carpeta y accesos directos) + portable (prioridad),
  Linux AppImage, macOS dmg. Todo x64 (macOS: arquitectura del runner).
- **Tamaño**: solo entran `dist/`, `dist-electron/` y `package.json` (sin sourcemaps ni tests; las devDependencies
  nunca se empaquetan); `asar`, compresión máxima y solo los idiomas es/es-419/en-US de Chromium.
  `app.asar` ≈ 1,4 MB; el resto es el runtime de Electron (AppImage ≈ 98 MB).
- **Construcción local de esta fase**: Linux (contenedor x64) → `release/linux-unpacked/` y
  `release/CONTRAGOLPE-0.1.0-x86_64.AppImage`, ambos **ejecutados** con Playwright: llegan al menú sin errores
  (desempaquetado ≈ 0,7 s; AppImage ≈ 13 s la primera vez porque el contenedor no tiene FUSE y se extrae entero).
  Windows y macOS no se pueden construir ni probar aquí: los construye el CI en sus runners nativos.
- **CI**: `.github/workflows/build.yml` (raíz del repo): matriz windows/ubuntu/macos → `npm ci`, tests, build y
  `electron-builder --publish never`; sube los instaladores como artefactos (14 días).
- **Sin firma** (no hay certificados): Windows mostrará SmartScreen y macOS Gatekeeper. Pasos para firmar y para
  activar las actualizaciones automáticas (electron-updater, hoy desactivado con `AUTO_UPDATE = false` en
  `electron/main.ts`): ver README.

### Rendimiento y pruebas de la app (fase 5)
Medido con la app **empaquetada** (`release/linux-unpacked`) bajo Xvfb en el contenedor (Linux x64, GPU por
software SwiftShader: es el peor caso; en una máquina con GPU real el dibujo cuesta menos). Lo mide el smoke test
y lo deja en `release/smoke-metrics.json` (también en cada artefacto del CI, por plataforma).

| Métrica | Resultado | Objetivo |
|---|---|---|
| Arranque hasta el menú interactivo | 0,4–0,7 s (AppImage: ~13 s la 1.ª vez en el contenedor, por extraerse sin FUSE) | < 3 s |
| FPS / ticks por segundo en combate | 60 / 60 | 60 estables |
| Tiempo de frame en 30 s de combate (1800 frames) | p50 16,7 ms · p99 16,8 ms · 0–4 frames > 20 ms (máx. 33–66 ms) según la carga del contenedor | sin tirones |
| Coste por tick / por dibujo | ~0,2 ms / ~0,6–0,9 ms | — |
| Montón JS del juego | menú ~3 MB · combate 4,5–7 MB | — |
| Memoria total (conjunto de trabajo, 4–5 procesos) | menú ~500 MB · combate ~620 MB | — |

- La memoria total es la suma del *working set* de todos los procesos de Electron (principal ~160 MB, GPU
  ~140 MB, renderer ~130–170 MB, audio/utilidades ~80–150 MB) y cuenta varias veces las páginas compartidas: el
  consumo real es menor. El juego en sí ocupa menos de 10 MB de montón.
- **Basura por frame (GC)**: el combate ya no copia el estado en cada tick (`stepInPlace`, mismo resultado
  que `step`, verificado por test), las partículas y anillos salen de una **reserva** y se compactan en el sitio
  (sin `filter`), la geometría "aleatoria" de los escenarios se calcula una vez al cargar, los colores sombreados
  se memorizan y la lectura de entrada no crea cierres. Queda ~1 MB/s de asignaciones de vida muy corta (sobre
  todo números y objetos temporales del dibujo con Canvas): el recolector joven las limpia ~1 vez por segundo en
  fracciones de milisegundo y no aparecen como tirones.
- **Variación del entorno**: el contenedor (GPU por software, CPU compartida) produce de vez en cuando un
  frame perdido. Medición A/B al terminar el soporte de mando, misma máquina y mismo momento: versión previa
  1/0/3/1 frames > 20 ms por 30 s, versión con mando 2/2/1 (y 0/2/0 en otra tanda), con la misma tasa de
  asignación (~1 MB/s) y p99 de 16,8 ms en todas: no hay regresión medible. En una máquina normal con GPU
  real esos picos no deberían aparecer; queda en la lista de pruebas manuales.
- **Modo bajo consumo** (Opciones): la mitad de partículas, sin estelas de golpe, sin desenfoque en los contornos
  (lo más caro de dibujar), sin líneas de velocidad de la súper ni lluvia, y lienzo a 1× aunque la pantalla sea HiDPI.
  La simulación no cambia.
- **Smoke test** (`npm run app:smoke`, Playwright + Electron sobre la app empaquetada): arranque → menú →
  "Versus contra CPU" → personaje → escenario → combate con inputs → pausa → "Salir al menú" → "Salir del juego".
  Falla con cualquier error de consola o de página, si la app no se cierra sola, si el registro tiene líneas
  `[error]` o si no se guardó el estado de la ventana. Corre en el CI en las tres plataformas.
- Lo que **no** se pudo verificar aquí (sin hardware): monitores de 120/144/240 Hz reales (cubierto por los tests
  del bucle con frecuencias simuladas), pantalla completa en un monitor físico, mandos reales y los instaladores
  de Windows/macOS (los construye y prueba el CI). Quedan en la lista de pruebas manuales del README.

## 19. Frame data completa

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
| Martillo (overhead) | → + HP | 20 | 3 | 14 | 70 | alto | 18 | 12 | -4 | +2 | +8 | 9 |  |
| Jab agachado | ↓ + LP | 4 | 2 | 7 | 25 | medio | 11 | 8 | 0 | +3 | +6 | 4 | cancel: chain/special/super |
| Patada rastrera | ↓ + LK | 5 | 2 | 8 | 25 | bajo | 13 | 9 | 0 | +4 | +7 | 4 | cancel: chain/special/super |
| Gancho ascendente | ↓ + HP | 7 | 4 | 18 | 85 | medio | 19 | 12 | -9 | -2 | +4 | 9 | si pega a un rival en el aire, lo lanza; cancel: special/super |
| Barrida | ↓ + HK | 9 | 3 | 22 | 90 | bajo | 20 | 14 | — | — | — | 9 | derriba |
| Puño en salto | (aire) LP | 4 | 7 | 0 | 35 | alto | 12 | 9 | altura | altura | altura | 4 | aterrizaje 2f |
| Rodilla cruzada | (aire) LK | 5 | 9 | 0 | 40 | alto | 14 | 10 | altura | altura | altura | 4 | aterrizaje 3f |
| Martillo aéreo | (aire) HP | 7 | 5 | 0 | 85 | alto | 18 | 14 | altura | altura | altura | 9 | aterrizaje 4f |
| Patada voladora | (aire) HK | 8 | 5 | 0 | 90 | alto | 18 | 14 | altura | altura | altura | 9 | aterrizaje 4f |
| Llave de cadera | LP + LK (cerca) | 5 | 2 | 23 | 120 | agarre | 0 | 0 | — | — | — | 10 | agarre 84px |
| Onda Rayo (lenta) | ↓↘→ + LP | 12 | 1 | 40 | 0 | medio | 0 | 0 | -40 | -40 | -37 | 4 | proyectil en f12 |
| Onda Rayo (rápida) | ↓↘→ + HP | 12 | 1 | 40 | 0 | medio | 0 | 0 | -40 | -40 | -37 | 4 | proyectil en f12 |
| Puño Ascendente (ligero) | →↓↘ + LP | 3 | 8 | 18 | 100 | medio | 20 | 16 | — | — | — | 9 | derriba; juggle; invencible (all) f1-3; chip 10; aterrizaje 12f |
| Puño Ascendente (fuerte) | →↓↘ + HP | 4 | 10 | 20 | 135 | medio | 20 | 16 | — | — | — | 11 | derriba; juggle; invencible (all) f1-7; chip 14; aterrizaje 16f |
| Embestida (corta) | ↓↙← + LK | 10 | 6 | 16 | 70 | medio | 18 | 14 | -7 | -3 | +3 | 9 | chip 8; cancel: super |
| Embestida (larga) | ↓↙← + HK | 13 | 7 | 18 | 95 | medio | 20 | 16 | — | — | — | 10 | derriba; invencible (projectile) f6-16; chip 10 |
| Tormenta Final | ↓↘→↓↘→ + P  (o HP + HK) | 10 | 1 | 38 | 0 | medio | 0 | 0 | -38 | -38 | -32 | 0 | invencible (all) f1-12; proyectil en f10; cuesta 1000 de medidor |

| Proyectil | Velocidad | Golpes | Daño | Chip | Hitstun | Blockstun | Vida |
|---|---|---|---|---|---|---|---|
| fb_l | 4.2 px/f | 1 | 70 | 12 | 18 | 13 | 260f |
| fb_h | 7.5 px/f | 1 | 70 | 12 | 18 | 13 | 180f |
| super | 5.5 px/f | 5 | 62 | 18 | 24 | 18 | 220f |

### CHISPA — Luna Reyes (Rushdown, vida 930)

| Movimiento | Input | Startup | Active | Recovery | Daño | Guardia | Hitstun | Blockstun | Bloqueo | Hit | CH | Hitstop | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jab relámpago | LP | 3 | 2 | 6 | 28 | medio | 12 | 8 | +1 | +5 | +8 | 4 | cancel: chain/special/super |
| Patada al tobillo | LK | 5 | 2 | 8 | 33 | medio | 13 | 9 | 0 | +4 | +7 | 4 | cancel: chain/special/super |
| Codazo giratorio | HP | 8 | 3 | 14 | 74 | medio | 18 | 13 | -3 | +2 | +8 | 8 | cancel: special/super |
| Patada de látigo | HK | 10 | 3 | 18 | 90 | medio | 20 | 14 | -6 | 0 | +6 | 9 |  |
| Salto de gata (overhead) | → + HK | 16 | 3 | 14 | 68 | alto | 16 | 11 | -5 | 0 | +6 | 8 |  |
| Jab bajo | ↓ + LP | 3 | 2 | 7 | 24 | medio | 11 | 8 | 0 | +3 | +6 | 4 | cancel: chain/special/super |
| Barrido corto | ↓ + LK | 4 | 2 | 8 | 25 | bajo | 12 | 9 | 0 | +3 | +6 | 4 | cancel: chain/special/super |
| Codo al cielo | ↓ + HP | 6 | 3 | 15 | 78 | medio | 18 | 11 | -6 | +1 | +7 | 8 | si pega a un rival en el aire, lo lanza; cancel: special/super |
| Deslizamiento | ↓ + HK | 8 | 6 | 18 | 85 | bajo | 18 | 12 | — | — | — | 8 | derriba |
| Puño en salto | (aire) LP | 3 | 6 | 0 | 34 | alto | 11 | 8 | altura | altura | altura | 4 | aterrizaje 2f |
| Rodilla cruzada | (aire) LK | 4 | 9 | 0 | 40 | alto | 13 | 9 | altura | altura | altura | 4 | aterrizaje 2f |
| Garra en picado | (aire) HP | 6 | 5 | 0 | 80 | alto | 17 | 13 | altura | altura | altura | 8 | aterrizaje 3f |
| Patada en picado | (aire) HK | 7 | 6 | 0 | 85 | alto | 17 | 13 | altura | altura | altura | 8 | aterrizaje 3f |
| Voltereta | LP + LK (cerca) | 5 | 2 | 22 | 115 | agarre | 0 | 0 | — | — | — | 10 | agarre 80px |
| Chispazo (corto) | ↓↘→ + LP | 13 | 1 | 28 | 0 | medio | 0 | 0 | -28 | -28 | -25 | 4 | proyectil en f13 |
| Chispazo (largo) | ↓↘→ + HP | 15 | 1 | 28 | 0 | medio | 0 | 0 | -28 | -28 | -25 | 4 | proyectil en f15 |
| Gancho Relámpago (ligero) | →↓↘ + LP | 3 | 7 | 16 | 95 | medio | 20 | 15 | — | — | — | 9 | derriba; juggle; invencible (all) f1-3; chip 8; aterrizaje 12f |
| Gancho Relámpago (fuerte) | →↓↘ + HP | 4 | 8 | 18 | 125 | medio | 20 | 15 | — | — | — | 10 | derriba; juggle; invencible (all) f1-6; chip 10; aterrizaje 14f |
| Ráfaga (corta) | ↓↘→ + LK | 9 | 6 | 14 | 80 | medio | 18 | 14 | -5 | -1 | +5 | 9 | chip 8; cancel: super |
| Ráfaga (larga) | ↓↘→ + HK | 12 | 7 | 16 | 105 | medio | 20 | 15 | — | — | — | 10 | derriba; chip 10 |
| Rodada (corta) | ↓↙← + LK | 18 | 1 | 8 | 0 | medio | 0 | 0 | -8 | -8 | -5 | 4 | invencible (strike) f3-15 |
| Rodada (larga) | ↓↙← + HK | 22 | 1 | 9 | 0 | medio | 0 | 0 | -9 | -9 | -6 | 4 | invencible (strike) f3-19 |
| Mil Chispas | ↓↘→↓↘→ + P  (o HP + HK) | 6 | 22 | 30 | 52 | medio | 26 | 16 | -35 | -25 | -19 | 5 | invencible (all) f1-10; cuesta 1000 de medidor; chip 12 |

| Proyectil | Velocidad | Golpes | Daño | Chip | Hitstun | Blockstun | Vida |
|---|---|---|---|---|---|---|---|
| fb_l | 6 px/f | 1 | 50 | 8 | 18 | 12 | 34f |
| fb_h | 8.5 px/f | 1 | 55 | 8 | 18 | 12 | 32f |

### MURALLA — Bruno Ortega (Grappler, vida 1100)

| Movimiento | Input | Startup | Active | Recovery | Daño | Guardia | Hitstun | Blockstun | Bloqueo | Hit | CH | Hitstop | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Manotazo | LP | 5 | 2 | 8 | 40 | medio | 13 | 9 | 0 | +4 | +7 | 5 | cancel: chain/special/super |
| Pisotón frontal | LK | 7 | 3 | 10 | 45 | medio | 15 | 11 | -1 | +3 | +6 | 5 | cancel: chain/special/super |
| Palmada de oso | HP | 12 | 4 | 18 | 100 | medio | 21 | 15 | -6 | 0 | +6 | 10 | cancel: special/super |
| Patada de mula | HK | 14 | 5 | 22 | 105 | medio | 24 | 18 | -8 | -2 | +4 | 11 | armadura 1 golpe f8-13 |
| Puño bajo | ↓ + LP | 5 | 2 | 8 | 35 | medio | 12 | 9 | 0 | +3 | +6 | 5 | cancel: chain/special/super |
| Patada a la espinilla | ↓ + LK | 6 | 2 | 10 | 35 | bajo | 13 | 10 | -1 | +2 | +5 | 5 | cancel: chain/special/super |
| Cabezazo al cielo | ↓ + HP | 9 | 5 | 20 | 100 | medio | 20 | 13 | -11 | -4 | +2 | 10 | si pega a un rival en el aire, lo lanza; cancel: special/super |
| Barrida pesada | ↓ + HK | 12 | 4 | 24 | 110 | bajo | 20 | 15 | — | — | — | 10 | derriba |
| Codazo en salto | (aire) LP | 5 | 6 | 0 | 45 | alto | 12 | 9 | altura | altura | altura | 5 | aterrizaje 3f |
| Rodillazo | (aire) LK | 6 | 8 | 0 | 50 | alto | 14 | 10 | altura | altura | altura | 5 | aterrizaje 3f |
| Panzazo | (aire) HP | 8 | 6 | 0 | 105 | alto | 18 | 14 | altura | altura | altura | 11 | aterrizaje 5f |
| Patada de tronco | (aire) HK | 9 | 5 | 0 | 105 | alto | 18 | 14 | altura | altura | altura | 11 | aterrizaje 5f |
| Suplex | LP + LK (cerca) | 5 | 2 | 24 | 130 | agarre | 0 | 0 | — | — | — | 12 | agarre 92px |
| Abrazo de Oso (corto) | →↘↓↙← + LP | 5 | 3 | 34 | 165 | agarre | 0 | 0 | — | — | — | 14 | agarre 90px, no se escapa |
| Abrazo de Oso (largo) | →↘↓↙← + HP | 10 | 3 | 38 | 190 | agarre | 0 | 0 | — | — | — | 14 | agarre 104px, no se escapa |
| Atrapa Cielos (ligero) | →↓↘ + LP | 4 | 8 | 26 | 150 | agarre | 0 | 0 | — | — | — | 12 | invencible (strike) f1-7; agarre 104px, no se escapa, aéreo; aterrizaje 14f |
| Atrapa Cielos (fuerte) | →↓↘ + HP | 5 | 10 | 28 | 180 | agarre | 0 | 0 | — | — | — | 12 | invencible (strike) f1-10; agarre 122px, no se escapa, aéreo; aterrizaje 18f |
| Temblor (corto) | ↓↘→ + LP | 16 | 1 | 34 | 0 | medio | 0 | 0 | -34 | -34 | -28 | 9 | proyectil en f16 |
| Temblor (largo) | ↓↘→ + HP | 18 | 1 | 34 | 0 | medio | 0 | 0 | -34 | -34 | -28 | 9 | proyectil en f18 |
| Embestida de Toro (corta) | ↓↘→ + LK | 14 | 6 | 18 | 90 | medio | 20 | 14 | -9 | -3 | +3 | 11 | armadura 1 golpe f1-19; chip 10; cancel: super |
| Embestida de Toro (larga) | ↓↘→ + HK | 18 | 8 | 20 | 115 | medio | 20 | 14 | — | — | — | 12 | derriba; armadura 1 golpe f1-25; chip 12 |
| Gran Terremoto | ↓↘→↓↘→ + P  (o HP + HK) | 14 | 1 | 36 | 0 | medio | 0 | 0 | -36 | -36 | -30 | 0 | invencible (all) f1-15; proyectil en f14; cuesta 1000 de medidor |

| Proyectil | Velocidad | Golpes | Daño | Chip | Hitstun | Blockstun | Vida |
|---|---|---|---|---|---|---|---|
| fb_l | 3.8 px/f | 1 | 70 | 12 | 20 | 16 | 70f |
| fb_h | 5.4 px/f | 1 | 75 | 12 | 20 | 16 | 62f |
| super | 7 px/f | 4 | 78 | 20 | 24 | 18 | 150f |

<!-- FRAMEDATA:END -->
