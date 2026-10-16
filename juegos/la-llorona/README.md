# La Llorona

Juego de terror 2D con vista desde arriba. Es HTML5 canvas + Web Audio, sin dependencias ni build.

## Cómo jugar

Abre `index.html` en el navegador (doble clic). También se puede servir con
`npx serve juegos/la-llorona` o `python3 -m http.server`. Se recomiendan audífonos: el llanto de
los niños y el de la Llorona suenan del lado (izquierda/derecha) donde están.

**Objetivo:** cuatro niños se perdieron en el pueblo. Encuéntralos y llévalos a la iglesia antes de
las 05:00 (unos 8 minutos reales). La Llorona no puede entrar en el terreno sagrado de la iglesia.

| Control | PC | Móvil |
| --- | --- | --- |
| Moverse | WASD / flechas | joystick (lado izquierdo) |
| Correr | Shift | botón «Correr» |
| Linterna | F, E o clic derecho; apuntas con el ratón | botón «Luz»; apunta hacia donde caminas |
| Pausa / silencio | P o Esc / M | — |

## Mecánicas

- **Linterna con batería:** ilumina un cono, pero ella te ve desde más lejos. Busca pilas (+45 %).
  Con poca batería parpadea y alumbra menos.
- **Aliento:** correr gasta aliento (aguanta unos 10 s seguidos y se recupera rápido). Si se acaba, quedas
  agotado y vas más lento hasta recuperarte.
- **Ruido:** correr y chapotear en el río hacen ruido, y ella va a investigar. Caminar hace poco ruido.
- **Escondites:** en un arbusto, quieto y con la luz apagada, no te ve (salvo que te pase encima).
- **La Llorona:** vaga por el río, acecha y te persigue si te ve. Los árboles y las paredes le tapan
  la vista, pero ella flota a través de todo. Si te alejas mucho, aparece cerca de ti, fuera de la
  luz de la linterna. Cada niño que rescatas la hace más rápida, y es más veloz sobre el agua.
- **Niños:** te siguen en fila. Si ella toca a uno, se lo lleva y vuelve a perderse en otro lugar.
- **Miedo:** cuando está cerca oyes latidos, la pantalla se pone roja, hay interferencia y la
  linterna falla.
- **Sonido:** los pasos suenan distinto en hierba, madera (puentes y casas), tierra, arbustos y agua.
  La Llorona alterna lamentos, llanto entrecortado, quejidos distorsionados y susurros. De fondo
  hay río, búhos, grillos, ranas, ramas que se quiebran, aullidos y ráfagas de viento, y unas
  cuerdas disonantes que suben cuando ella se acerca. Cada niño tiene su propia voz.
- Cada partida genera un mapa nuevo: río con puentes, casas abandonadas, bosque y cementerio.

## Desarrollo

Todo está en `game.js`, un solo archivo organizado por secciones: configuración, audio, mapa, estado,
entrada, actualización y dibujo. Los ajustes de dificultad están arriba (`PLAYER`, `STAMINA`,
`BATTERY_DRAIN`, `LLORONA`, `NIGHT_SECONDS`). Abre `index.html#debug` para tener el estado del juego
en `window.__llorona` desde la consola.
