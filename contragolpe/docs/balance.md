# Informe de balance (simulación)

Generado con `npm run sim -- --partidos 50 --fuzz 400`. Todas las partidas son deterministas (semillas fijas).

## CPU vs CPU · nivel Normal

Porcentaje de victorias del personaje de la fila contra el de la columna (ambos lados de la pantalla).

| | RAYO | CHISPA | MURALLA | Total |
|---|---|---|---|---|
| **RAYO** | — | 40 % | 86 % | 63 % |
| **CHISPA** | 60 % | — | 38 % | 49 % |
| **MURALLA** | 10 % | 72 % | — | 41 % |

## CPU vs CPU · nivel Difícil

Porcentaje de victorias del personaje de la fila contra el de la columna (ambos lados de la pantalla).

| | RAYO | CHISPA | MURALLA | Total |
|---|---|---|---|---|
| **RAYO** | — | 40 % | 44 % | 42 % |
| **CHISPA** | 46 % | — | 2 % | 24 % |
| **MURALLA** | 50 % | 90 % | — | 70 % |

Partidos simulados: 600 · duración media: 120.6 s · rondas por tiempo: 0

Combo más largo visto en CPU vs CPU: **10 golpes, 301 de daño** (chispa: j_hp → st_lp → cr_lk → cr_lk → super → super → super → super → super → super)

### Daño total por movimiento (top 12)

| Movimiento | Daño | % del total |
|---|---|---|
| rayo/fb_h | 276643 | 12 % |
| muralla/cr_hp | 210960 | 9 % |
| muralla/st_hp | 152220 | 6 % |
| rayo/dp_h | 119892 | 5 % |
| rayo/cr_hp | 112965 | 5 % |
| chispa/j_hp | 107280 | 5 % |
| chispa/dp_l | 105222 | 4 % |
| muralla/charge_l | 98646 | 4 % |
| chispa/oh | 96609 | 4 % |
| chispa/j_hk | 92123 | 4 % |
| rayo/st_hk | 87001 | 4 % |
| chispa/cr_lk | 79974 | 3 % |

## Tácticas únicas contra la CPU Normal

Victorias de un bot que solo hace una cosa. Si una táctica simple gana a menudo, es dominante.

| Bot | RAYO | CHISPA | MURALLA |
|---|---|---|---|
| saltador | 0 % | 0 % | 0 % |
| tortuga | 0 % | 0 % | 0 % |
| zoner | 6 % | 65 % | 47 % |
| agarrador | 59 % | 29 % | 24 % |
| machacador | 41 % | 41 % | 88 % |
| dpSpam | 12 % | 12 % | 24 % |
| parrySpam | 0 % | 0 % | 0 % |

Táctica única más exitosa: **machacador (muralla)** con 88 % de victorias.

## Tácticas únicas contra la CPU Difícil

Victorias de un bot que solo hace una cosa. Si una táctica simple gana a menudo, es dominante.

| Bot | RAYO | CHISPA | MURALLA |
|---|---|---|---|
| saltador | 0 % | 0 % | 0 % |
| tortuga | 0 % | 0 % | 0 % |
| zoner | 0 % | 12 % | 24 % |
| agarrador | 0 % | 0 % | 0 % |
| machacador | 12 % | 0 % | 76 % |
| dpSpam | 0 % | 18 % | 47 % |
| parrySpam | 0 % | 0 % | 0 % |

Táctica única más exitosa: **machacador (muralla)** con 76 % de victorias.

## Fuzzer de combos (búsqueda de infinitos)

400 secuencias aleatorias por personaje y posición: botones y direcciones cada 1–6 frames, con el medidor lleno al empezar (una súper), contra un rival que no se defiende.

| Personaje | Posición | Combo máximo | Daño máximo | Secuencia |
|---|---|---|---|---|
| RAYO | centro | 8 golpes | 261 | cr_lp → st_lk → cr_lp → super → super → super → super → st_hk |
| RAYO | esquina | 8 golpes | 320 | st_hp → super → super → super → super → st_lk → st_lp → cr_lk |
| CHISPA | centro | 9 golpes | 263 | st_lk → cr_lp → st_lk → super → super → super → super → super → super |
| CHISPA | esquina | 9 golpes | 260 | st_lk → st_lp → cr_lk → super → super → super → super → super → super |
| MURALLA | centro | 6 golpes | 348 | cr_hp → super → super → super → cr_lk → st_lk |
| MURALLA | esquina | 7 golpes | 362 | st_hp → super → super → super → st_lp → cr_lk → cr_lk |

Combo más largo encontrado por el fuzzer: **9 golpes**. Un infinito se vería como decenas de golpes; el límite real lo ponen el escalado, el decaimiento de hitstun, el empuje en esquina y el máximo de juggles.

Tiempo de simulación: 39.2 s.
