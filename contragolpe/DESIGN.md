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
