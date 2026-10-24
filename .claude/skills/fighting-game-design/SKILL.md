---
name: fighting-game-design
description: Reglas de diseño para el juego de peleas CONTRAGOLPE. Úsalo siempre que se cree o modifique un personaje, ataque, animación, sonido, efecto de impacto, IA rival, HUD o sistema de combate, para que el juego sea fluido, legible y satisfactorio.
---

# Diseño de juego de peleas (CONTRAGOLPE)

Objetivo: que cada golpe se sienta con peso, que nada pase "de repente" y que el juego responda al instante. La sensación de cada golpe importa más que la cantidad de personajes.

Los números de este archivo son **puntos de partida**: se afinan jugando, no se asumen correctos.

## 1. Prioridades (en este orden)

1. **Controles que responden al instante.** Si los controles pelean con el jugador, nada más importa.
2. **Claridad.** El jugador siempre debe entender qué pasó y por qué.
3. **Sensación de impacto.** Cada golpe conectado debe sentirse.
4. **Profundidad y balance.** Solo después de lo anterior.
5. **Cantidad de contenido.** Un personaje pulido vale más que cinco a medias.

## 2. Motor del combate

- **Paso fijo de 60 FPS.** Toda la lógica de combate corre en frames fijos, separada del renderizado. Todo se mide en frames (1 frame = 1/60 s).
- **Datos de frames por ataque:** startup (antes de poder golpear), active (cuando puede golpear) y recovery (vulnerable tras golpear). Guardar estos números en datos editables, no escritos dentro del código.
- Referencia: los ataques normales más rápidos suelen tener unos 4 a 6 frames de startup; los lentos y fuertes, bastante más, pero con más daño. Un ataque rápido debe ser poco castigable; uno lento y fuerte, muy castigable si falla.
- **Hitbox y hurtbox** separados de la imagen del sprite. Tener un modo debug que dibuje las cajas y muestre el estado y los frames del personaje.
- **Máquina de estados clara** por personaje: idle, caminar, saltar, agacharse, atacar, hitstun, blockstun, parry, derribo, victoria.
- **Input buffer:** guardar las últimas pulsaciones unos 5 a 10 frames para que un botón apretado un poco antes se ejecute en cuanto sea posible. Evita combos "que no salen".
- **Cancels y combos:** permitir encadenar ataques en ventanas definidas (por ejemplo normal a especial). Aplicar reducción de daño a medida que el combo crece.
- **Ataques fallados tienen costo:** el recovery de un golpe que falla debe poder ser castigado. Sin riesgo no hay estrategia.
- **Parry:** ventana corta y exigente de éxito, con recompensa clara (ventaja de frames o contraataque). Si falla, que cueste.

## 3. Animación: nada aparece "de repente"

Cada ataque tiene tres fases y las tres se ven:

1. **Anticipación:** el cuerpo se carga antes de golpear (retroceso del brazo, torso girado, peso atrás). Es lo que permite leer el ataque.
2. **Golpe:** pocos frames, el movimiento más rápido. Usar exageración (estiramiento del cuerpo, estela del arma o del puño) en el frame de impacto.
3. **Recuperación:** el cuerpo vuelve a la pose neutral de forma visible. Su duración coincide con los frames de recovery del ataque.

Reglas:
- La duración visual de cada fase debe coincidir con los datos de frames del ataque. La animación y la lógica no pueden desfasarse.
- Las transiciones entre estados (idle a ataque, ataque a idle, caminar a ataque) usan poses de enlace. Nada de cambios bruscos de pose entre un frame y el siguiente.
- Cada personaje tiene un idle con movimiento sutil (respiración) y una pose de victoria y de derrota.
- Dar a cada ataque su propia identidad: puño ligero, puño fuerte, patada ligera, patada fuerte, salto y especial deben verse distintos.

## 4. Sensación de impacto (game feel)

Al conectar un golpe, activar en conjunto (cada efecto refuerza a los demás):

- **Hitstop:** congelar ambos personajes entre 3 y 6 frames según la fuerza del golpe (más en golpes pesados y finales de combo). Se afina probando.
- **Destello breve** en el rival y **chispas o efecto visual** en el punto de impacto, con forma y color distintos según el tipo de golpe.
- **Sacudida de pantalla pequeña**, solo en golpes fuertes. Nunca en cada movimiento.
- **Empuje (knockback)** proporcional a la fuerza del golpe, con reacción visible en el cuerpo del rival.
- **Sonido en capas** (sección 5).
- **Equilibrio:** el exceso de efectos oculta la acción y marea. Los golpes ligeros tienen efecto mínimo; los pesados, más. Incluir opción en ajustes para reducir sacudida y destellos.

## 5. Audio

- **Capas por golpe:** (1) sonido de swing al lanzar el ataque, (2) sonido de impacto al conectar, (3) opcional, voz o grito corto del personaje.
- **Distinguir por tipo:** puño ligero, puño fuerte, patada, bloqueo, parry, golpe al aire, proyectil, derribo. Cada uno suena distinto y no se reutiliza uno para otro.
- **Variación:** 3 o más variantes por sonido y cambio leve de tono aleatorio, para que no suene repetido.
- **Música:** una pista en bucle por escenario, con volumen más bajo que los efectos durante el combate. Menús con sus propios sonidos (mover, seleccionar, volver).
- Los efectos importantes (parry, golpe final, KO) deben distinguirse con claridad sobre la música.
- Usar solo audio propio o con licencia clara (CC0 o equivalente). Guardar en el repo un archivo de créditos con la fuente y licencia de cada audio.

## 6. IA del rival

- **No hacer trampas invisibles:** la IA sigue las mismas reglas que el jugador. No lee los botones del jugador en el mismo frame.
- **Tiempo de reacción humano:** un retraso variable (por ejemplo 10 a 25 frames según dificultad) antes de reaccionar a un ataque.
- **Imperfección controlada:** que a veces falle, dude o repita patrones, pero no que sea tonta. Una IA perfecta que bloquea todo frustra.
- **Adaptación:** que pruebe una estrategia, la mantenga mientras funcione y cambie cuando deje de funcionar (como suele jugar una persona).
- **Debe castigar los errores obvios del jugador** (por ejemplo ataques fallados) para que sirva de práctica real.
- **Dificultades** (fácil, normal, difícil) que cambien reacción, agresividad y variedad de ataques, no que den vida o daño extra a escondidas.
- El comportamiento debe ser reproducible (semilla fija) para poder probar y depurar.

## 7. Preparar el juego para jugar en línea (aunque aún no se haga)

- Mantener la simulación **determinista** (misma entrada produce mismo resultado) y el estado del combate **serializable**, para poder añadir rollback netcode después sin reescribir todo.
- No usar valores aleatorios no sembrados ni tiempos reales dentro de la lógica del combate.

## 8. Estilo visual

- Objetivo: arte 2D pintado de alta calidad, estilo anime, escenarios detallados con capas de profundidad, HUD con retratos, barras de vida, temporizador central y barra de súper.
- **Solo personajes y arte originales o con licencia.** No recrear personajes, logos ni escenarios de juegos o franquicias existentes. Si el usuario enseña una referencia, extraer el estilo (colores, proporciones, composición, tipo de HUD), no los personajes.
- Cada personaje original debe tener silueta distinguible, paleta de color propia y un arma o estilo de pelea reconocible.
- Los sprites se organizan por personaje y por animación, con una convención de nombres consistente.

## 9. Proceso de trabajo

1. Antes de cambiar nada, leer los datos de frames y el estado actual del juego.
2. Trabajar **un personaje a la vez** hasta que se sienta bien; luego repetir.
3. Después de cada cambio de combate, probar con el modo debug: cajas visibles, frames de cada fase, estado actual.
4. Ejecutar los tests existentes; añadir tests para la lógica de frames, buffer y combos.
5. Al terminar, resumir en pocas líneas qué cambió en la sensación del juego y qué valores conviene afinar jugando.

## 10. Lista de verificación antes de dar un ataque por terminado

- [ ] Tiene anticipación, golpe y recuperación visibles.
- [ ] Los frames visuales coinciden con startup, active y recovery.
- [ ] Hitstop, destello, empuje y sonido de impacto activados.
- [ ] Sonido de swing distinto al de impacto, con variantes.
- [ ] Se puede castigar si falla.
- [ ] El input buffer lo deja encadenar sin pelearse con los controles.
- [ ] Funciona con teclado y con mando.
- [ ] No rompe el paso fijo de 60 FPS.
