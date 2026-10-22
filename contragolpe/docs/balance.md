# Informe de balance (simulación)

Generado con `npm run sim -- --partidos 50 --fuzz 400`. Todas las partidas son deterministas (semillas fijas).

## CPU vs CPU · nivel Normal

Porcentaje de victorias del personaje de la fila contra el de la columna (ambos lados de la pantalla).

| | RAYO | CHISPA | MURALLA | Total |
|---|---|---|---|---|
| **RAYO** | — | 32 % | 82 % | 57 % |
| **CHISPA** | 58 % | — | 46 % | 52 % |
| **MURALLA** | 28 % | 58 % | — | 43 % |

## CPU vs CPU · nivel Difícil

Porcentaje de victorias del personaje de la fila contra el de la columna (ambos lados de la pantalla).

| | RAYO | CHISPA | MURALLA | Total |
|---|---|---|---|---|
| **RAYO** | — | 40 % | 68 % | 54 % |
| **CHISPA** | 58 % | — | 4 % | 31 % |
| **MURALLA** | 36 % | 88 % | — | 62 % |

Partidos simulados: 600 · duración media: 107.1 s · rondas por tiempo: 2

Combo más largo visto en CPU vs CPU: **9 golpes, 309 de daño** (chispa: j_hk → cr_lk → cr_lk → super → super → super → super → super → super)

### Daño total por movimiento (top 12)

| Movimiento | Daño | % del total |
|---|---|---|
| rayo/fb_h | 299073 | 13 % |
| muralla/cr_hp | 177840 | 8 % |
| muralla/charge_l | 160404 | 7 % |
| rayo/dp_h | 154371 | 7 % |
| chispa/rush_l | 130972 | 6 % |
| muralla/st_hp | 120400 | 5 % |
| chispa/oh | 99810 | 4 % |
| rayo/cr_hp | 94078 | 4 % |
| chispa/dp_l | 87514 | 4 % |
| chispa/j_hp | 85152 | 4 % |
| rayo/st_hk | 81225 | 3 % |
| chispa/j_hk | 74035 | 3 % |

## Tácticas únicas contra la CPU Normal

Victorias de un bot que solo hace una cosa. Si una táctica simple gana a menudo, es dominante.

| Bot | RAYO | CHISPA | MURALLA |
|---|---|---|---|
| saltador | 0 % | 0 % | 0 % |
| tortuga | 0 % | 0 % | 0 % |
| zoner | 6 % | 100 % | 47 % |
| agarrador | 47 % | 29 % | 35 % |
| machacador | 24 % | 35 % | 94 % |
| dpSpam | 29 % | 6 % | 24 % |
| parrySpam | 0 % | 0 % | 0 % |

Táctica única más exitosa: **zoner (chispa)** con 100 % de victorias.

## Tácticas únicas contra la CPU Difícil

Victorias de un bot que solo hace una cosa. Si una táctica simple gana a menudo, es dominante.

| Bot | RAYO | CHISPA | MURALLA |
|---|---|---|---|
| saltador | 0 % | 0 % | 0 % |
| tortuga | 0 % | 0 % | 0 % |
| zoner | 0 % | 12 % | 18 % |
| agarrador | 0 % | 0 % | 0 % |
| machacador | 0 % | 0 % | 47 % |
| dpSpam | 0 % | 6 % | 35 % |
| parrySpam | 0 % | 0 % | 0 % |

Táctica única más exitosa: **machacador (muralla)** con 47 % de victorias.

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

Tiempo de simulación: 43.9 s.
