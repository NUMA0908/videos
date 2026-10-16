# Guía para hacer un juego de terror 2D (lo aprendido con La Llorona)

Recopilación de todo lo que funcionó (y lo que no) al construir `la-llorona/`. Está escrita para
reutilizarse en otro juego, con otra criatura u otra historia. Donde dice «la criatura» puede ir la
Llorona, la Ciguapa o lo que inventes.

La implementación de referencia está en `juegos/la-llorona/`. Cada sección indica en qué archivo
está el código que la demuestra.

---

## 1. Cómo evolucionó (y qué enseñó cada versión)

| Versión | Qué se hizo | Lección |
| --- | --- | --- |
| v1 | Vista desde arriba, linterna con batería, aliento para correr, escondites en arbustos, IA que vaga/investiga/persigue, 4 niños que rescatar, audio 100 % sintetizado | La base jugable sale rápido, pero «jugable» no es lo mismo que «da miedo» |
| v2 | Más aliento, pasos distintos por superficie, más variedad de sonidos, criatura rediseñada (harapos, pelo sobre la cara, garras) y susto final más feo | El **sonido** y la **silueta** de la criatura pesan más que cualquier mecánica nueva |
| v3 | Grabaciones reales, sombras por línea de visión, director de tensión, aguantar la respiración, armarios, niños falsos, cuervos, clima con tormenta, lugares de interés, notas con historia | El miedo sale de la **incertidumbre** y del **ritmo** (tensión → alivio → tensión), no de que la criatura sea más rápida |

Pedidos del jugador que conviene recordar:

- Pidió **más aliento** (v2) y luego **un poco menos** (v3). El aliento es la palanca de dificultad
  que más se nota: hay que afinarlo jugando.
- **Demasiados árboles que no se pueden atravesar** frustran. Los obstáculos sólidos deben ser
  pocos y tener intención. Para dar ambiente sirve mejor la vegetación que se puede atravesar
  (arbustos, que además son escondites).
- Los **sonidos reales** (grabaciones) le dieron al juego más miedo que cualquier sonido
  sintetizado. Para lo que más importa, el grito de la criatura y la muerte, usa grabaciones.

---

## 2. Principios de diseño de terror

Sacados de la investigación (Alien: Isolation, Darkwood, Slender, Amnesia, Outlast, Phasmophobia) y
probados en el juego:

1. **Vulnerabilidad.** El jugador no puede pelear. Solo puede ver, oír, esconderse y huir.
2. **Anticipación antes que susto.** Lo que asusta es la espera: el silencio, el latido, la linterna
   que parpadea. Un susto sin tensión previa no funciona.
3. **Incertidumbre.** Que el jugador no sepa con seguridad dónde está ella, si el llanto es de un
   niño de verdad o si el escondite aguantará.
4. **Ritmo: tensión y alivio.** Mantener la presión siempre cansa y deja de dar miedo. Después de un
   pico hay que dar respiro, y el respiro debe durar poco.
5. **La criatura no hace trampa.** Encuentra al jugador con sus sentidos (vista y oído). El jugador
   debe poder entender por qué lo encontró: «me vio la luz», «corrí cerca de los cuervos».
6. **Reglas que se aprenden.** Las mejores mecánicas son reglas del mundo que el jugador descubre
   (por notas o por experiencia): «si la oyes lejos, está cerca», «los niños de verdad tiemblan».
7. **Escalada.** Cada avance del jugador empeora el mundo: ella va más rápido, la tormenta crece y
   la música suma capas. El progreso da miedo.
8. **Recursos escasos.** La batería y el aliento obligan a decidir: luz o invisibilidad, correr o
   poder aguantar la respiración después.
9. **El silencio es un arma.** Cortar el sonido de golpe antes de un susto multiplica el efecto.
10. **Señales fiables de peligro.** La comunidad de Phasmophobia pedía avisos que no dependieran de
    la suerte. Aquí la linterna y los faroles fallan cuando ella está cerca, siempre. El jugador
    aprende a temer ese parpadeo.

---

## 3. Catálogo de mecánicas (con los números que funcionaron)

Todos los valores están en `la-llorona/js/util.js` y `la-llorona/js/game.js`. Distancias en píxeles
(1 casilla = 32 px) y tiempos en segundos.

### Jugador

| Parámetro | Valor | Nota |
| --- | --- | --- |
| Caminar / correr | 92 / 152 px/s | Correr debe ganarle a la criatura; caminar no |
| Aliento máx. | 130 | Gasta 19/s corriendo (unos 7 s), recupera 20/s quieto y 12/s caminando |
| Agotado | se recupera al llegar a 30 | Mientras tanto camina a ×0.8 |
| Agua / arbustos | velocidad ×0.5 / ×0.75 | El agua además hace ruido y ahí ella va más rápido |
| Batería | gasta 0.85 %/s; pilas +40 % | Con menos de 20 % parpadea y alumbra menos |

### Sigilo y ruido

| Acción | Radio de ruido | Efecto |
| --- | --- | --- |
| Caminar | 90 | Casi seguro |
| Correr | 270 | La atrae si está cerca |
| Chapotear en agua | +120 | Los ríos son peligrosos |
| Tabla que cruje (30 % en madera) | +120 | Sorpresa que castiga correr dentro de casas |
| Cuervos que salen volando | 520 | Se espantan si corres a menos de 150 o caminas a menos de 45 |

La vista de la criatura alcanza **330 px con la linterna encendida y 150 sin ella**. Suma +120 si
estás en una zona iluminada y +40 si corres. Si le apuntas con la linterna, te ve hasta 380 px. Los
árboles y las paredes le tapan la vista.

### Escondites y aguantar la respiración

- **Arbusto:** te escondes si estás quieto y sin luz. Si ella pasa a menos de 24 px y no aguantas la
  respiración, te encuentra.
- **Armario:** se entra con E. Ella no te ve, pero si te encuentra adentro no hay escapatoria (como
  en Alien: Isolation).
- **Aguantar la respiración** (Espacio): se activa cuando ella está a menos de 100 px de tu
  escondite.
  - Si no aguantas, se llena una barra de «exposición» a 0.75/s (1.5/s a menos de 55 px). Al
    llenarse, te oye.
  - Aguantar gasta 24 de aliento por segundo. Si se acaba, das una bocanada y te encuentra.
  - **Conexión clave:** si llegas corriendo y agotado, no puedes aguantar. Correr tiene un costo
    diferido.
- **«Te vio entrar»:** si ella te está viendo, esconderte no sirve durante 1.2 s después de perderte
  de vista, y durante 2.5 s si te descubrió. Sin esto, el jugador se mete en un arbusto delante de
  ella y se salva, y el juego se rompe.

### Zonas seguras

- **Refugio** (la iglesia): radio de 210 px. Ella no puede entrar y deja de perseguirte.
- **Zonas seguras temporales** (las ofrendas): se encienden manteniendo E durante 1.4 s y protegen
  120 px durante 100 s. El viento las apaga antes. Dan estrategia sin quitar tensión.

### Tiempo y escalada

- La noche dura 9 minutos reales y en pantalla corre de 00:00 a 05:00.
- **Arranque tranquilo:** los primeros 45 s ella solo ronda lejos. Sin esto, un jugador nuevo
  moría en 25 s.
- **Por cada rescate:** ella va +8 px/s más rápida, la lluvia aumenta, se suma una capa de música y
  bajan los tiempos del director.
- **La hora muerta** (03:00): las campanas suenan solas, se apagan los faroles uno por uno y ella
  sale a cazar durante 50 s.

---

## 4. La IA de la criatura

Código: `la-llorona/js/game.js` → `updateLlorona()`, `buildSearch()`, `updateDirector()`.

### Máquina de estados

```
wander ──(oye ruido)──▶ investigate ──(llega)──▶ search ──(nada)──▶ wander
   │                         │                      │
   └────────(te ve)──────────┴──────────────────────┴──▶ chase ──(te pierde 2.5 s)──▶ search
                                                         │
director: menace alta ──▶ retreat (16-28 s) ──▶ wander   └─(estás en refugio)──▶ search
director: mucha calma ──▶ investigate cerca de ti
03:00 / evento ──▶ hunt (va a tu zona sin saber exactamente dónde estás)
niño falso / te descubre ──▶ reveal (0.7-0.9 s quieta gritando) ──▶ chase
```

- **wander:** el 45 % de las veces ronda el río (su territorio), el 30 % acecha cerca del jugador
  (no durante el arranque tranquilo) y el resto va a puntos al azar.
- **investigate:** va al punto del ruido, con un error de ±40 px.
- **search:** revisa primero los **escondites cercanos** (los 3 arbustos o armarios más cercanos al
  último lugar donde te vio) y luego 2 puntos al azar. En cada uno se detiene 1-1.8 s a
  «olfatear». Es lo que más miedo da cuando estás escondido.
- **chase:** va directo hacia ti. Cada 3-6 s «parpadea» 48 px hacia adelante con un glitch visual y
  un susurro.
- **reveal:** una pausa corta antes de lanzarse. Le da al jugador una oportunidad justa de
  reaccionar.
- **Si estás muy lejos** (más de 800 px durante 16 s), reaparece a 380-560 px, **fuera del haz de
  tu linterna**.
- Flota y atraviesa todo, salvo las zonas seguras. Esto ahorra hacer pathfinding, pero es una
  limitación: ver la sección 10.

### Director de tensión (Alien: Isolation)

Un «gauge» de amenaza (menace) que no controla a la criatura directamente, solo la empuja:

```js
if (chase) menace += 16 * dt;
else if (dist < 380) menace += 10 * (1 - dist / 380) * (laVes ? 1.6 : 1) * dt;
else menace -= 5 * dt;

if (menace > 110 && !chase) retreat(16..28 s);              // alivio
if (calma > 48 - 9 * rescatados) investigate(cercaDelJugador); // empujón «casual»
if (cooldown <= 0 && menace < 35 && !chase) lanzarSusto();     // sustos solo con tensión baja
```

### Niños falsos (señuelos)

Después del primer rescate, cada 75-110 s ella imita el llanto de un niño a 480-900 px del jugador.
El llanto falso es más grave y lento y tiene un gorgoteo de agua. Visualmente no tiembla y gotea. Si
te acercas a menos de 62 px, se revela y te persigue. Una nota da la pista. Así se convierte en una
regla aprendible en vez de un castigo arbitrario.

---

## 5. Catálogo de sustos

Código: `triggerScare()` en `game.js`. Solo se lanzan con la tensión baja, cada 24-40 s (menos con
cada rescate), y se eligen al azar con pesos:

| Susto | Cómo funciona |
| --- | --- |
| Aparición en relámpago | 1.8 s de **silencio**, luego un relámpago y ella de pie a 220-330 px frente a ti, solo durante el destello |
| Farol que revienta | Parpadea 1.4 s y revienta con un «pop» |
| Susurro a la espalda | Voz sin palabras, sintetizada con formantes, detrás del jugador |
| Huellas mojadas | Aparece de golpe un rastro de huellas que viene desde detrás y termina a tus pies |
| Campana sola | La campana de la iglesia suena sin que nadie la toque |
| Risita de niño | A tu espalda |
| Silencio total | 3 s sin ningún sonido y luego una rama que se quiebra detrás |
| Cara en el borde | Su cara asoma 0.28 s en un borde de la pantalla, con un acorde suave |
| Mano del pozo | Si estás cerca del pozo |
| Cajita de música | La cuna se mece sola y suena una canción de cuna desafinada que se va frenando |

Regla general: **un susto falso cada tanto mantiene creíbles los verdaderos.** Los tendederos con
sábanas que de lejos parecen alguien de pie son sustos «gratis» que pone el propio escenario.

---

## 6. Técnicas visuales (canvas 2D)

Código: `la-llorona/js/render.js`, `world.js` y `sprites.js`.

### Oscuridad con luces recortadas

Se usa un segundo canvas del tamaño de la pantalla. Se pinta casi negro y se «borran» las luces
con `destination-out`:

```js
dctx.globalCompositeOperation = "source-over";
dctx.fillStyle = "rgba(2,3,9,0.975)";          // noche
dctx.fillRect(0, 0, W, H);
dctx.globalCompositeOperation = "destination-out";
light(x, y, radio, intensidad);                 // degradado radial que «abre» la oscuridad
// ... después: ctx.drawImage(dark, 0, 0) sobre el mundo
```

El haz de la linterna es un arco (`moveTo` + `arc`) relleno con un degradado radial. Se le suma un
temblor mínimo (±3 %) para que se sienta vivo.

### Sombras por línea de visión (Darkwood)

Se lanzan 300 rayos desde el jugador, en pasos de 6 px, hasta chocar con una casilla opaca. Cada
rayo entra 12 px más para iluminar la cara del obstáculo. Con eso se arma un polígono (`world.js →
computeVisibility`, unos 0.3 ms) que sirve para dos cosas:

1. Aclara un poco la oscuridad solo dentro del polígono: ves formas en tu línea de visión y detrás
   de los árboles todo queda negro.
2. Recorta (`clip()`) la luz de la linterna y el halo del jugador, para que no atraviesen paredes.

Las luces fijas (faroles, velas) no se recortan: su resplandor se ve por encima de las paredes, y
queda bien.

### Clima y atmósfera

- **Lluvia:** líneas en coordenadas de pantalla inclinadas por el viento. Hay hasta 340 gotas
  según la intensidad. Las salpicaduras se dibujan en el mundo, antes de la oscuridad, así que
  solo se ven donde hay luz.
- **Relámpago:** una curva de brillo (1 → 0.15 → 0.85 → 0) que baja la oscuridad casi a cero y
  hace visibles las sombras. El trueno llega 0.15-2.8 s después; si llega antes de 0.8 s suena un
  chasquido «cercano».
- **Niebla:** degradados radiales grandes que se mueven con el viento. Solo se dibujan los que
  están en pantalla, porque son lo más caro de dibujar.
- **Huellas mojadas** de la criatura: ella deja una cada 24 px y se desvanecen en 45 s. Sirven para
  rastrearla con la linterna.
- **Efectos de pantalla según el miedo:** viñeta roja, grano de película, líneas de
  interferencia y temblor de cámara.
- **Estados con su propio filtro:**
  - Armario: rendijas horizontales que solo dejan ver franjas.
  - Aguantar la respiración: un túnel oscuro que late.

### Diseño de la criatura (lo que la hizo más terrorífica)

`sprites.js → drawLlorona()`

- **Silueta reconocible:** alta, encorvada, ropa clara en un mundo oscuro.
- **Cara casi tapada:** el pelo mojado cae sobre la cara y solo asoman **un ojo** y una boca
  estirada. Lo que no se ve asusta más.
- **Proporciones incorrectas:** brazos larguísimos, dedos como garras.
- **Movimiento antinatural:** la cabeza ladeada con **tirones** bruscos, la ropa en jirones que
  queda atrás al moverse y gotas que caen.
- **Glitch:** de vez en cuando su imagen se desplaza con franjas, como interferencia.
- **Al perseguirte:** el ojo se pone rojo con brillo y los brazos se estiran hacia ti.
- **Susto final:** una cara a pantalla completa con piel agrietada, cuencas negras que gotean, la
  boca desencajada llena de dientes y franjas desplazadas. Se copia el propio canvas sobre sí
  mismo con `drawImage(canvas, ...)` desplazado.

---

## 7. Audio (Web Audio)

Código: `la-llorona/js/audio.js`. Es la mitad del miedo.

### Arquitectura

```
fuentes ──▶ bus() ──▶ sfx ─┐
                           ├─▶ muffle (lowpass) ─▶ master ─▶ compresor ─▶ salida
          música ──▶ music ┘          ▲
              envío ──▶ reverb (convolver) ┘
```

- **Compresor final:** evita que los truenos y los gritos saturen.
- **muffle:** un filtro que se cierra a 420 Hz al **aguantar la respiración**. Todo el mundo se oye
  amortiguado y solo queda el latido. Es muy efectivo.
- **Reverberación:** se usa un `ConvolverNode` con una respuesta al impulso **sintética**: ruido
  estéreo que decae en 3.4 s. No hacen falta archivos.

### Sonido posicional: `bus(vol, { at, range, falloff, rev })`

Cada sonido con posición pasa por esta cadena:

1. **Volumen por distancia:** `(1 - d / range)^1.4`.
2. **Paneo** estéreo según la diferencia en x (±380 px = extremo).
3. **Filtro paso bajo** que se cierra con la distancia. Se cierra más si el sonido está **detrás**
   del jugador (más de 126° de su mirada), y baja a 1100 Hz si hay **paredes o árboles** de por
   medio (oclusión).
4. **Envío a la reverberación** según el tipo de sonido.

Los sonidos largos (el lamento) guardan su «handle» y se actualizan cada fotograma mientras la
criatura se mueve.

### La regla de la leyenda (volumen invertido)

```js
// lejos suena fuerte, cerca suena débil
volumen = 0.2 + 0.72 * clamp((distancia - 120) / 800, 0, 1);
```

Para que el jugador no quede sin pistas, cuando ella está cerca suenan otras cosas: goteo de agua,
tela mojada arrastrándose y su respiración ronca. Es una regla que se aprende con las notas.

### Recetas de síntesis que funcionaron

| Sonido | Receta |
| --- | --- |
| Paso en hierba | Ruido con filtro paso alto en 2500-3800 Hz + golpe grave con paso bajo en 260 Hz |
| Paso en madera | Seno de 150-190 → 70 Hz + chasquido con paso de banda en 800-1100 Hz (Q 7); a veces un crujido con diente de sierra |
| Paso en tierra | 5 granitos de ruido muy cortos (25 ms) con paso de banda en 1400-3200 Hz |
| Paso en lodo | Paso de banda que sube de 500 a 1300 Hz + un «plop» que sube de 200 a 420 Hz |
| Paso en agua | Paso de banda que baja de 1600 a 450 Hz + siseo agudo + 3 burbujas (senos que suben ×2.2) |
| Lluvia | Ruido en bucle con paso alto en 1100 Hz + rumor grave con paso bajo en 420 Hz (volumen ∝ lluvia²) |
| Trueno | Chasquido agudo si es cercano + 5 ráfagas de ruido grave con paso bajo en 90-260 Hz, de 1.5-3 s |
| Latido | Dos senos que bajan de 60 a 32 Hz, separados 0.24 s; el intervalo se acorta con el miedo |
| Susurro | Ráfagas de ruido por **dos filtros de formante** (pares de vocales 300/2300, 500/900...) + «sss» |
| Cuervo | Diente de sierra de 600-720 → 420-500 Hz con paso de banda en 1300 Hz + aleteo de ruido |
| Cajita de música | Senos con armónicos 1, 2 y 3.01, ataque de 4 ms y caída de 1.4 s; cada nota un 3.5 % más lenta |
| Golpe al ser vista | Cúmulo disonante de dientes de sierra (98, 104, 147, 208, 415, 440 Hz) + golpe de 70 → 32 Hz |
| Pavor | 5 dientes de sierra disonantes (110, 116.5, 164.8, 233, 311 Hz) con vibrato y paso bajo en 1 kHz; volumen según el miedo |

### Música en capas

Hay un zumbido de fondo constante y cuerdas de pavor según la cercanía. Además hay **3 capas que se
suman con la escalada**: un coro grave que respira, un «vidrio» agudo que bate (dos senos casi
iguales) y un pulso grave de tambor. Durante la persecución suenan tambores cada 0.32-0.42 s y de
vez en cuando un chirrido de violín.

### Grabaciones reales

- Se recortan y normalizan con ffmpeg:
  ```bash
  ffmpeg -i entrada.mp4 -vn -ss 0.35 -to 16.2 -ac 1 -af "loudnorm=I=-14:TP=-1.2" -c:a libmp3lame -b:a 80k salida.mp3
  ```
- Para ver dónde empieza y termina cada frase hay dos opciones: un espectrograma
  (`-lavfi showspectrumpic`) o medir el volumen RMS cada 0.25 s.
- Si un clip tiene varias frases, se reproduce **un segmento al azar** con
  `src.start(t, offset, duración)` y una velocidad de 0.94-1.03. Así no suena siempre igual.
- **Para abrir con doble clic (`file://`)**, `fetch()` no funciona. Se incrustan los MP3 en base64
  dentro de un `.js` (`tools/embed_audio.py`) y se decodifican con `atob` y `decodeAudioData`.
- Siempre debe haber un **sonido sintetizado de respaldo** por si la grabación no carga.
- **Licencias:** antes de publicar, confirma que puedes usar cada grabación.

### Reglas del navegador

- El audio solo puede empezar después de un clic o toque. Por eso el `AudioContext` se crea al
  pulsar «empezar».
- Los nodos de un sonido corto se descartan solos cuando la fuente termina (`stop`).

---

## 8. Generación del mundo

Código: `la-llorona/js/world.js → generateMap()`.

1. **Azar con semilla** (`mulberry32`) para el mapa y `Math.random` para el juego. Cada partida es
   distinta.
2. **Orden de colocación:**
   1. Elementos grandes: río, isla, refugio, hacienda.
   2. Caminos y puentes, que evitan los lugares ya colocados.
   3. Cementerio.
   4. Casas.
   5. Claros para el pozo y las ofrendas.
   6. Al final, la vegetación.
3. **Áreas reservadas:** cada lugar marca un margen donde no pueden nacer árboles. Si no, el bosque
   tapa las entradas.
4. **Accesibilidad:** un relleno por inundación (flood fill) desde el inicio marca qué casillas son
   alcanzables. Objetivos, notas y pilas **solo** se ponen en casillas alcanzables, y hay un plan B
   si un lugar quedó encerrado.
5. **Los objetivos van en los lugares de interés** (isla, cripta, hacienda, más uno en el bosque).
   Así explorar tiene sentido y cada rescate es una pequeña historia.
6. **Densidad de vegetación con «ruido» de senos.** Salen manchas de bosque y claros en vez de
   árboles repartidos al azar. Lo que se usó al final: 1.2-13 % de árboles sólidos, 0.6 % de
   árboles secos y unos 3.4 % de arbustos, más grupos de arbustos extra.

### Ideas de lugares que funcionaron

- Un lugar «imposible» al que se llega con riesgo: la isla, que obliga a meterse al agua, donde
  ella es más rápida.
- Objetos que reaccionan al jugador, como las muñecas que giran la cabeza hacia ti.
- Objetos que se mueven solos, como la cuna que se mece.
- Notas que cuentan la historia y, de paso, enseñan las reglas.
- Faroles que se pueden apagar, porque la luz es un recurso del mundo.

---

## 9. Técnica, rendimiento y pruebas

### Estructura sin build

```
index.html → <script> en orden: audio-data.js, util, audio, world, sprites, game, render
```

- Son **scripts clásicos que comparten variables globales** (no módulos), para que funcione con
  doble clic. Los módulos ES y `fetch()` no funcionan desde `file://`.
- **Cuidado con los nombres globales:** no uses `name`, `top`, `status`, `parent`, `close`,
  `open`, `event`, `history`, `location`, `screen`, `self` ni `length`. Chocan con propiedades de
  `window`.
- Para publicarlo como una sola página, se concatenan todos los scripts en un HTML.

### Bucle y lógica

- `dt` con tope de 0.05 s para que un tirón no teletransporte nada.
- La lógica va separada del dibujo (`update(dt)` / `render()`). Así se puede simular en las pruebas
  sin dibujar.
- **Pulsación vs. mantener:** las acciones de un toque (entrar al armario) se guardan en una cola
  `useQueued`. Las de mantener (encender la ofrenda, aguantar la respiración) leen el estado de la
  tecla cada fotograma. Además se usa `e.repeat` para ignorar la autorrepetición del teclado.
- **Eventos programados:** una lista `pending` de `{ at, fn }`. Sirve para «silencio y luego susto»,
  campanadas espaciadas y faroles que se apagan uno por uno.

### Rendimiento

- Sin GPU (navegador de pruebas), un fotograma tarda unos 25 ms. En un navegador normal con GPU es
  mucho menos.
- Lo más caro son los **degradados radiales grandes** (niebla, luces). Solo se dibujan si están en
  pantalla.
- El mapa estático se dibuja **una vez** en un canvas aparte (`mapCanvas`) y luego se copia con
  `drawImage`.
- El polígono de visibilidad (300 rayos) cuesta unos 0.3 ms: no es problema.

### Móvil

- Joystick virtual en la mitad izquierda y botones a la derecha.
- Los botones cambian de etiqueta según el contexto: «Correr» pasa a «Aguantar», y «Usar» pasa a
  «Salir».
- Se detecta el último tipo de entrada usado (táctil o ratón), no solo si hay pantalla táctil.
  Hay portátiles con las dos.
- **Todos los textos deben partirse en líneas** (`wrap()`), porque en 390 px de ancho se salen.
- Los avisos importantes no deben coincidir en la misma posición que otros paneles (lo
  comprobamos con capturas).

### Cómo se probó

- **Playwright con Chromium sin interfaz:**
  - capturas de cada pantalla y de cada lugar (también durante un relámpago);
  - captura de errores de la página.
- **`index.html#debug`** expone el estado (`window.__llorona`) para:
  - teletransportar al jugador;
  - forzar sustos, relámpagos o un niño falso;
  - comprobar estados.
- **Bot de estrés:** simula 150 s de partida con teclas al azar en varias partidas seguidas. Ahí se
  vio que un jugador descuidado moría en 25 s, y por eso se añadió el arranque tranquilo.
- **Lo que no se puede probar sin una persona:** cómo **suena** (el navegador de pruebas no tiene
  audio) y si **da miedo**. Eso solo se sabe jugando.

---

## 10. Para el próximo juego

### Mejoras técnicas pendientes

- **Pathfinding (A\*) sobre la cuadrícula**, para que la criatura rodee paredes en vez de
  atravesarlas. Así las casas serían refugios de verdad y no harían falta tantos parches («te vio
  entrar»).
- **Pasar a Vite + TypeScript** (o a Phaser o PixiJS) cuando crezca el código. Hoy son unas 4.200
  líneas en 6 archivos y aún se maneja bien.
- **Editor de mapas** (por ejemplo Tiled) para algunas zonas hechas a mano, mezcladas con las
  generadas.
- **Opciones:** volumen por categoría, desactivar el susto final o los destellos
  (accesibilidad), dificultad y guardar récords en `localStorage`.
- **Arte:** sprites dibujados (o pixel art) en vez de figuras geométricas; la criatura merece
  animación propia.
- **Más grabaciones reales:** pasos, lluvia y voces de niños. El salto de calidad con las dos
  grabaciones fue enorme.

### Leyendas dominicanas que encajan con estas mecánicas

Para cuando la idea siga «sin la Llorona». Son ideas para explorar; verifica los detalles de cada
leyenda antes de usarlos.

| Leyenda | Mecánica que sugiere |
| --- | --- |
| **La Ciguapa** (pies al revés, pelo larguísimo, vive en el monte) | Sus huellas apuntan al revés: rastrearla te lleva en la dirección contraria. Es una regla aprendible, perfecta para notas y huellas |
| **El Bacá** (un ser en forma de animal ligado a un pacto) | Animales del mapa que podrían ser él. Es un señuelo como los niños falsos, pero con perros o chivos |
| **Los Galipotes** (personas que se transforman en animales u objetos) | Objetos del escenario que no estaban ahí antes o que cambian de lugar cuando no miras (con la línea de visión) |
| **El Cuco / el Hombre del Saco** | Una persecución en interiores con escondites, armarios y aguantar la respiración |

### Lista para revisar si da miedo

- [ ] ¿El primer minuto es tranquilo y deja que la tensión suba sola?
- [ ] ¿Hay momentos de silencio total?
- [ ] ¿El jugador entiende por qué lo encontraron?
- [ ] ¿Hay al menos una regla del mundo que se descubre jugando?
- [ ] ¿Hay algo que el jugador **no sabe si es real** (señuelos, sábanas, sombras)?
- [ ] ¿Cada avance empeora el mundo?
- [ ] ¿Hay alivio después de cada pico?
- [ ] ¿Esconderse es tenso y no un botón de «salvado»?
- [ ] ¿Se juega bien con audífonos y se entiende de dónde viene cada sonido?
- [ ] ¿Funciona en el celular?

---

## Fuentes consultadas

- [Game Developer: The perfect organism, la IA de Alien: Isolation](https://www.gamedeveloper.com/design/the-perfect-organism-the-ai-of-alien-isolation)
- [Game Developer: Revisiting the AI of Alien: Isolation](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [Epic Games Store: Darkwood y su perspectiva](https://store.epicgames.com/news/darkwood-is-a-horror-masterpiece-viewed-from-an-atypical-perspective)
- [GameDev.net: Creating dread in horror games](https://gamedev.net/blogs/entry/2266481-creating-dread-in-horror-games)
- [Wayline: Silence is scary](https://www.wayline.io/blog/silence-is-scary-sound-design-horror-games)
- [Game Informer: guía de Alien: Isolation (aguantar la respiración)](https://gameinformer.com/b/features/archive/2014/10/07/alien-isolation-tips-survival-guide-game-informer)
- [Pure Xbox: reseña de Slender: The Arrival](https://www.purexbox.com/reviews/xbox-360/slender_the_arrival)
- [Steam: discusión de Phasmophobia sobre la linterna durante las cacerías](https://steamcommunity.com/app/739630/discussions/0/2956040588014783432)
- [Cultura Genial: La leyenda de la Llorona](https://www.culturagenial.com/es/leyenda-de-la-llorona/)
- [Chilango: La aterradora leyenda de La Llorona](https://www.chilango.com/cultura/leyenda-de-la-llorona-cdmx/)
