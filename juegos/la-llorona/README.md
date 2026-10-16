# La Llorona

Juego de terror 2D con vista desde arriba. Es HTML5 canvas + Web Audio, sin dependencias ni build.

## Cómo jugar

Abre `index.html` en el navegador (doble clic). Se recomiendan audífonos: todo suena desde
donde está (izquierda/derecha, apagado si hay paredes de por medio o si está detrás de ti).

**Objetivo:** cuatro niños se perdieron en el pueblo. Encuéntralos y llévalos a la iglesia antes de
las 05:00 (unos 9 minutos reales). La Llorona no puede pisar el terreno sagrado de la iglesia.

| Control | PC | Móvil |
| --- | --- | --- |
| Moverse | WASD / flechas | joystick (lado izquierdo) |
| Correr | Shift | botón «Correr» |
| Aguantar la respiración (escondido) | Espacio (o Shift) | mantener «Aguantar» |
| Linterna | F o clic derecho; apuntas con el ratón | botón «Luz»; apunta hacia donde caminas |
| Esconderse en armario / encender ofrenda | E (mantener para la ofrenda) | botón «Usar» |
| Pausa / silencio | P o Esc / M | — |

## Mecánicas

Inspiradas en juegos de terror establecidos:

- **Línea de visión (Darkwood):** solo ves lo que está frente a ti. Árboles, paredes y la iglesia
  proyectan sombras, y detrás de ellas todo es negro.
- **Director de tensión (Alien: Isolation):** un sistema mide cuánta presión llevas. Si pasas mucho
  rato tranquilo, ella aparece «por casualidad» cerca de ti. Si la presión dura demasiado, se retira
  un rato para dejarte respirar. En los momentos tranquilos lanza sustos: su aparición en un
  relámpago, faroles que revientan, susurros a tu espalda, huellas mojadas recién hechas, la cajita
  de música de la cuna, una mano que sale del pozo, risitas de niño, silencio total...
- **Escondites (Amnesia / Outlast / Alien):** arbustos (quieto y sin luz) y armarios en las casas.
  Si ella pasa cerca, aguanta la respiración: gasta aliento, y si no aguantas te oye. Si llegas
  agotado de correr, no podrás aguantar. Si te ve entrar, esconderte no sirve, y si te encuentra
  en un armario, no hay escapatoria.
- **Escalada (Slender):** cada niño rescatado la vuelve más rápida, empeora la tormenta y suma una
  capa a la música. A las 03:00 llega la **hora muerta**: las campanas suenan solas, se apagan los
  faroles y ella sale a cazar.
- **Interferencia (Phasmophobia):** cerca de ella fallan la linterna y los faroles. Es tu mejor aviso.
- **La leyenda:** «si la oyes lejos, está cerca; si la oyes cerca, está lejos». Su lamento suena
  más fuerte cuanto más lejos está. Cuando está cerca lo que se oye es agua goteando, tela mojada
  arrastrándose y su respiración ronca.
- **Niños falsos:** después del primer rescate, a veces ella imita el llanto de un niño. Los niños
  de verdad tiemblan; lo que ella imita es más grave, gotea agua y no tiembla.
- **Cuervos:** si pasas corriendo junto a ellos, salen volando y la atraen.
- **Ruido:** correr, chapotear en el río y las tablas que crujen la atraen. Caminar hace poco ruido.
- **Linterna y aliento:** la linterna gasta batería (busca pilas). El aliento se usa para correr y
  para aguantar la respiración.
- **Clima:** empieza despejado y a la 01:00 comienza a llover. La lluvia va empeorando hasta
  convertirse en tormenta con relámpagos y truenos, y los caminos de tierra se vuelven lodo. Hay
  niebla espesa junto al río.

## Lugares

Cada partida genera un mapa nuevo con:

- **Iglesia:** refugio con faroles; aquí entregas a los niños.
- **Isla de las Muñecas:** un islote en el río con muñecas colgadas que giran la cabeza hacia ti.
- **Hacienda en ruinas de María:** con una cuna que se mece sola, armarios y un muelle con lancha.
- **Cementerio y cripta:** tumbas con velas; dentro de la cripta se esconde un niño.
- **Pozo:** a veces algo sale de él.
- **Ofrendas de Día de Muertos:** enciende las velas (mantén E) y durante un rato ella no se
  acerca. El viento las apaga antes.
- **Faroles, casas abandonadas y tendederos** con sábanas que de lejos parecen alguien de pie.
- **6 notas** que cuentan la historia de María y dan pistas.

## Estructura

```
index.html          carga los scripts en orden
audio-data.js       generado: los MP3 en base64 (funciona abriendo el archivo sin servidor)
audio/              grabaciones originales (lamento de la Llorona, grito de muerte)
tools/embed_audio.py  regenera audio-data.js tras cambiar un MP3
js/util.js          constantes, tipos de casilla y ajustes de dificultad
js/audio.js         motor de audio: grabaciones, síntesis, reverberación, sonido posicional, música
js/world.js         generación del mapa y lugares, colisiones, línea de visión, sombras
js/sprites.js       dibujo de personas, la Llorona, su cara (susto final), textos
js/game.js          lógica: jugador, la Llorona, director, niños falsos, cuervos, clima
js/render.js        dibujo de cada fotograma, HUD, pantallas y bucle principal
```

Los ajustes de dificultad están en `js/util.js` (`PLAYER`, `STAMINA`, `BATTERY`, `LLORONA`,
`NIGHT_SECONDS`). Abre `index.html#debug` para tener el estado del juego en `window.__llorona`.
