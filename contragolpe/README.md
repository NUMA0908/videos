# CONTRAGOLPE

Juego de peleas 2D, 1 contra 1, en el navegador. Tres personajes originales, parry al estilo clásico,
combos con cancels, súper con medidor, IA con tres niveles, modo entrenamiento y un trial que enseña el parry.
Todo el arte (personajes, escenarios, efectos) y todo el sonido se generan por código: no hay ni un solo asset externo.

TypeScript + Vite + Canvas 2D + Web Audio. Simulación determinista a 60 ticks fijos, lista para rollback.

## Cómo ejecutarlo

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev          # abre http://localhost:5173
npm test             # tests (Vitest)
npm run build        # versión de producción en dist/
npm run sim          # simulaciones de balance (IA vs IA, bots, fuzzer de combos) → docs/balance.md
npm run framedata    # regenera la frame data de DESIGN.md y la lista de movimientos de este README
```

Atajos de desarrollo por URL: `?modo=entrenamiento&p1=chispa&p2=muralla&esc=plaza`, `?modo=trial`,
`?modo=versus`, `?modo=demo` (CPU contra CPU) y `?modo=galeria` (todas las poses).

## Controles

Por defecto (todo se puede cambiar en **Opciones → Controles**, con teclado o mando):

| Acción | Jugador 1 | Jugador 2 | Mando |
|---|---|---|---|
| Moverse / saltar / agacharse | A D / W / S | ← → / ↑ / ↓ | Cruceta o stick izquierdo |
| Puño ligero (LP) / fuerte (HP) | J / K | Num 4 / Num 5 | X / Y |
| Patada ligera (LK) / fuerte (HK) | U / I | Num 7 / Num 8 | A / B |
| Parry | L | Num 6 | RB |
| Especial simple (SP) | O | Num 9 | LB |
| Agarre (LP+LK) / Súper (HP+HK) | J+U / K+I | | LT / RT |
| Pausa | Esc / Enter / P | | Start |

Otras teclas: **F1** cajas y estado (debug) · **F3** FPS · en Entrenamiento: **R** reiniciar posición,
**T** esquina, **F4** grabar al muñeco, **F5** reproducir la grabación.

Notación: ↓↘→ = cuarto de círculo hacia el rival; → = hacia el rival; P = cualquier puño; K = cualquier patada.

## Lo básico

- **Bloquear**: sostén atrás. Agachado para los ataques bajos; de pie para los ataques en salto.
- **Agarre** (LP+LK de cerca): le gana a quien solo bloquea. Escápalo pulsando LP+LK justo cuando te agarran.
- **Parry**: pulsa PARRY justo antes del golpe (↓+PARRY para golpes bajos). Si aciertas no recibes daño y
  contraatacas; si fallas, te quedas vendido un momento. El **Trial de parry** lo enseña paso a paso.
- **Combos**: los golpes ligeros se encadenan y casi todos los normales se cancelan en especiales.
- **Súper**: con el medidor lleno, ↓↘→↓↘→ + P o HP+HK. El medidor se llena pegando, recibiendo, bloqueando y con parries.
- **Inputs simplificados** (opción activada por defecto): SP solo, o SP + dirección, lanza los especiales.

## Lista de movimientos

<!-- MOVELIST:START (generado con `npm run framedata`, no editar a mano) -->

### RAYO — Equilibrado (vida 1000)

Proyectil, anti-aéreo invencible y normales fiables. Ideal para aprender.

| Movimiento | Cómo se hace |
|---|---|
| **SÚPER** Tormenta Final | ↓↘→↓↘→ + P  (o HP + HK) |
| Onda Rayo | ↓↘→ + P |
| Puño Ascendente | →↓↘ + P |
| Embestida | ↓↙← + K |
| Llave de cadera | LP + LK (cerca) |
| Martillo (overhead) | → + HP |

Inputs simplificados: SP = Onda Rayo · SP+↓ = Puño Ascendente · SP+→ = Embestida · SP+← = Onda Rayo.

### CHISPA — Rushdown (vida 930)

Muy rápida, presión constante y mezclas. Poca vida: no puede permitirse errores.

| Movimiento | Cómo se hace |
|---|---|
| **SÚPER** Mil Chispas | ↓↘→↓↘→ + P  (o HP + HK) |
| Chispazo | ↓↘→ + P |
| Gancho Relámpago | →↓↘ + P |
| Ráfaga | ↓↘→ + K |
| Rodada | ↓↙← + K |
| Voltereta | LP + LK (cerca) |
| Salto de gata (overhead) | → + HK |

Inputs simplificados: SP = Chispazo · SP+↓ = Gancho Relámpago · SP+→ = Ráfaga · SP+← = Rodada.

### MURALLA — Grappler (vida 1100)

Mucha vida, golpes enormes y agarres que no se escapan. Lento: tiene que abrirse paso.

| Movimiento | Cómo se hace |
|---|---|
| **SÚPER** Gran Terremoto | ↓↘→↓↘→ + P  (o HP + HK) |
| Abrazo de Oso | →↘↓↙← + P |
| Atrapa Cielos | →↓↘ + P |
| Temblor | ↓↘→ + P |
| Embestida de Toro | ↓↘→ + K |
| Suplex | LP + LK (cerca) |

Inputs simplificados: SP = Temblor · SP+↓ = Atrapa Cielos · SP+→ = Embestida de Toro · SP+← = Abrazo de Oso.

<!-- MOVELIST:END -->

La frame data completa (startup, activos, recuperación, ventajas) está en [DESIGN.md](DESIGN.md).

## Modos

Arcade (3 combates) · Versus (2 jugadores) · Versus contra CPU · Entrenamiento · Trial de parry ·
Lista de movimientos · Opciones (volumen, dificultad del parry Fácil/Normal/Hardcore, inputs simplificados,
dificultad de la CPU, sacudida y destellos para accesibilidad, controles).

## Estructura

```
src/sim/      simulación determinista (step, combate, parry, agarres, proyectiles, rondas)
src/data/     personajes, movimientos (frame data como datos) y ajustes globales
src/render/   esqueleto procedural, poses, animación, escenarios, HUD, efectos
src/audio/    sonido y música sintetizados
src/input/    teclado, mando y remapeo
src/ai/       CPU, muñeco de entrenamiento, lecciones del trial, bots de balance
src/scenes/   menús y modos de juego
tests/        Vitest
scripts/      simulación de balance y generación de documentación
```
