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

## App de escritorio (Windows, Linux, macOS)

El juego también se distribuye como app nativa con Electron (detalles técnicos en `DESIGN.md` §18).

```bash
npm run app:dev      # ventana de escritorio con recarga en caliente
npm run app:build    # app sin instalador en release/<plataforma>-unpacked/ (rápido, para probar)
npm run app:dist     # instaladores de la plataforma actual en release/
npm run icon         # regenera los íconos de build/ (dibujados por código)
```

Cada plataforma se construye en su propio sistema (electron-builder no genera instaladores de Windows/macOS
fiables desde Linux). El workflow `.github/workflows/build.yml` lo hace en GitHub Actions y deja como artefactos:

| Plataforma | Archivo | Notas |
|---|---|---|
| Windows | `CONTRAGOLPE-Setup-<versión>.exe` | instalador (elige carpeta, crea accesos directos) |
| Windows | `CONTRAGOLPE-Portable-<versión>.exe` | sin instalar: se ejecuta directamente |
| Linux | `CONTRAGOLPE-<versión>-x86_64.AppImage` | `chmod +x` y ejecutar |
| macOS | `CONTRAGOLPE-<versión>.dmg` | arrastrar a Aplicaciones |

Configuración y registros: `%APPDATA%\CONTRAGOLPE` (Windows), `~/.config/CONTRAGOLPE` (Linux),
`~/Library/Application Support/CONTRAGOLPE` (macOS); los registros están en la subcarpeta `logs/`.

### Pruebas automáticas de la app

```bash
npm run app:build                 # empaqueta en release/<plataforma>-unpacked
npm run app:smoke                 # smoke test: menú → versus → salir, sin errores (Linux sin pantalla: xvfb-run -a npm run app:smoke)
node scripts/smoke-electron.mjs --source   # lo mismo sin empaquetar (dist/ + dist-electron/)
```

El smoke test deja las mediciones (arranque, FPS, memoria) en `release/smoke-metrics.json`. Si se ejecuta como
root (contenedores) añade `--no-sandbox` automáticamente; un usuario normal nunca lo necesita.

### Pruebas manuales (antes de publicar una versión)

Lo que no se puede automatizar sin hardware. Marcar en cada plataforma:

1. **Pantalla completa**: F11 y Alt+Enter alternan; la imagen mantiene 16:9 con barras negras; al cerrar en
   pantalla completa y volver a abrir, se recupera el modo. Opción "Iniciar en pantalla completa".
2. **Ventana**: cambiar tamaño y posición, cerrar y reabrir → misma ventana. Con dos monitores: cerrar en el
   secundario, desconectarlo y abrir → la ventana aparece centrada en el principal.
3. **Monitor de alta frecuencia (120/144/240 Hz)**: con F3 el contador debe marcar FPS = frecuencia del monitor
   y **60 tps**; el juego no va más rápido (comparar un round de 99 s con un cronómetro).
4. **Foco**: Alt+Tab en mitad de un combate → se abre la pausa y baja el volumen; al volver, el volumen se
   recupera y el juego espera a que el jugador continúe. Con "Pausar al perder el foco" en No, solo baja el volumen.
5. **Cursor**: en combate desaparece a los 2 s sin mover el ratón; reaparece al moverlo y en los menús.
6. **Cerrar en partida**: con la opción activada pregunta antes de cerrar; en el menú cierra directamente.
7. **Mando**: conectar antes y después de abrir la app; desconectarlo en mitad de un combate (se pausa con
   aviso, sin errores; el alta y la baja quedan en `logs/main.log`). Lista completa en "Pruebas manuales con mando real".
8. **Bajo consumo**: activarlo en un portátil con batería; el juego sigue a 60 FPS con menos efectos.
9. **Instaladores**: Windows (instalar, acceso directo, desinstalar; portable desde una memoria USB),
   macOS (abrir desde el dmg con clic derecho → Abrir), Linux (AppImage con `chmod +x`).
10. **Un solo ejemplar**: abrir la app dos veces → la segunda enfoca la primera.

### Pruebas manuales con mando real

Todo lo del mando tiene tests con mandos simulados, pero estas comprobaciones necesitan hardware:

1. **Xbox** (cable y Bluetooth): se reconoce como "Xbox" y los íconos son A/B/X/Y de colores; X = LP, Y = HP,
   A = LK, B = HK, LB = agarre, RB = parry, RT = súper, Start = pausa. En menús A acepta y B vuelve.
2. **PlayStation** (DualShock 4 / DualSense): íconos ✕ ○ □ △ y L1/R1/L2/R2; Options = pausa.
3. **Stick**: cuartos de círculo (↓↘→ + P) salen cómodos sin apuntar; caminar no salta a diagonales por
   accidente; en Opciones → Mando: sensibilidad, el punto del stick se mueve y cambia de color al salir de la
   zona muerta. Probar también un mando gastado con deriva (subir la zona muerta debe eliminarla).
4. **Gatillos**: RT a medio recorrido no dispara la súper con el umbral por defecto; bajarlo en Opciones sí.
5. **Desconexión en partida**: quitar el cable / apagar el mando → pausa con el aviso; volver a conectarlo →
   el aviso desaparece y el mando sigue siendo del mismo jugador; repetir pulsando una tecla en vez de reconectar.
6. **Dos mandos y mezcla**: Versus con dos mandos (el primero que pulsa es J1); Versus con teclado + mando.
7. **Vibración**: golpe ligero = toque corto, fuerte = golpe seco, KO = largo; bloquear y parry se notan
   distintos; la vibración no se encadena en golpes múltiples; con la opción en "No" no vibra; la intensidad
   cambia la fuerza. (En navegadores sin `vibrationActuator` simplemente no vibra.)
8. **Remapeo**: asignar Y a Puño ligero → avisa del intercambio con Puño fuerte; los íconos de la lista de
   movimientos cambian; "Restablecer este perfil" vuelve al diseño de fábrica; reiniciar el juego conserva el perfil.
9. **Palanca arcade / mando no estándar**: aparece como "No estándar"; la configuración guiada pide cada
   botón y dirección (hat incluido) y después se juega normalmente.

### Instaladores sin firmar

Los instaladores **no están firmados digitalmente** (el proyecto no tiene certificados). Consecuencias:

- **Windows**: SmartScreen mostrará "Windows protegió su PC". Para ejecutarlo: *Más información → Ejecutar de
  todas formas*. Es el aviso normal para cualquier ejecutable sin firma o sin reputación.
- **macOS**: Gatekeeper dirá que la app "no se puede abrir porque es de un desarrollador no identificado".
  Para abrirla: clic derecho sobre la app → *Abrir* (o *Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente*).
- **Linux**: no aplica (los AppImage no se firman de forma obligatoria).

Qué hace falta para firmar (ninguno de estos datos existe todavía en el repo):

- **Windows**: un certificado de firma de código (OV o EV) de una autoridad certificadora, o un servicio de firma
  en la nube (p. ej. Azure Trusted Signing). Con un `.pfx`: secretos `CSC_LINK` (archivo en base64) y
  `CSC_KEY_PASSWORD` en el CI; electron-builder firma solo. Un certificado EV elimina el aviso de SmartScreen de
  inmediato; uno OV lo hace a medida que el ejecutable gana reputación.
- **macOS**: cuenta del Apple Developer Program, certificado *Developer ID Application* (secretos `CSC_LINK` y
  `CSC_KEY_PASSWORD`) y **notarización** (secretos `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`;
  en `build.mac` activar `hardenedRuntime` y `notarize`). Además hay que quitar `CSC_IDENTITY_AUTO_DISCOVERY: "false"`
  del workflow.

### Actualizaciones automáticas (preparadas, desactivadas)

`electron-updater` ya es dependencia y el código está en `electron/main.ts`, pero apagado (`AUTO_UPDATE = false`
y `"publish": null` en `package.json`). Para activarlas falta:

1. **Dónde publicar**: p. ej. GitHub Releases (`"publish": { "provider": "github" }`) o un servidor propio
   (`"provider": "generic", "url": …`), y que el CI publique con un token (`GH_TOKEN`) en lugar de `--publish never`.
2. **Firma**: en macOS las actualizaciones automáticas exigen app firmada y notarizada; en Windows funcionan sin
   firma, pero SmartScreen avisará en cada versión nueva.
3. Poner `AUTO_UPDATE = true`. El portable de Windows no se autoactualiza (limitación de electron-updater); el
   instalador NSIS, el AppImage y el dmg sí.

## Controles

Por defecto (teclado en **Opciones → Teclado del Jugador 1/2**; mando en **Opciones → Botones del mando**):

| Acción | Jugador 1 | Jugador 2 | Mando Xbox | Mando PlayStation |
|---|---|---|---|---|
| Moverse / saltar / agacharse | A D / W / S | ← → / ↑ / ↓ | Cruceta o stick izquierdo | Cruceta o stick izquierdo |
| Puño ligero (LP) / fuerte (HP) | J / K | Num 4 / Num 5 | X / Y | □ / △ |
| Patada ligera (LK) / fuerte (HK) | U / I | Num 7 / Num 8 | A / B | ✕ / ○ |
| Agarre (LP+LK) | J+U | Num 4+Num 7 | LB | L1 |
| Parry | L | Num 6 | RB | R1 |
| Súper (HP+HK, o ↓↘→↓↘→+P) | K+I | Num 5+Num 8 | RT | R2 |
| Especial de un botón (SP, con "inputs simplificados") | O | Num 9 | LT | L2 |
| Pausa | Esc / Enter / P | | Menu (Start) | Options |
| Menús: aceptar / volver | Enter, J / Esc, K | | A / B | ✕ / ○ |

El mando también admite palancas arcade y mandos sin mapeo estándar: **Opciones → Botones del mando →
Configuración guiada** pide cada botón y dirección uno por uno. Sensibilidad del stick (zona muerta,
histéresis, diagonales) y umbral de los gatillos en **Opciones → Mando: sensibilidad y calibración**.

Otras teclas: **F1** cajas y estado (debug) · **F3** FPS · en Entrenamiento: **R** reiniciar posición,
**T** esquina, **F4** grabar al muñeco, **F5** reproducir la grabación (con mando, todo eso está en la pausa).

### Mando

- Funciona cualquier mando que el navegador/Electron reconozca con el mapeo estándar (Xbox, DualShock/DualSense,
  Switch Pro y la mayoría de genéricos); el juego detecta el tipo y muestra sus íconos (letras de colores en
  Xbox, ✕ ○ □ △ en PlayStation). Cruceta y stick izquierdo a la vez.
- **El primer mando que pulsa un botón es J1**; el segundo, J2. En **Versus (2 jugadores)** hay una pantalla
  "Presiona un botón para unirte" que admite dos mandos o teclado + mando.
- Si un mando se desconecta en mitad de un combate, el juego se pausa: reconéctalo (vuelve a ser tu mando) o
  pulsa una tecla para seguir con teclado.
- **Opciones**: Vibración del mando e intensidad · Botones del mando (remapeo por tipo de mando; si asignas un
  botón ocupado se intercambian; configuración guiada para palancas arcade) · Mando: sensibilidad y calibración.
- En **Entrenamiento**: historial de entrada con los íconos de tu mando, entrada en vivo (stick, dirección y
  botones) y "Calibrar el stick" desde la pausa.

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
dificultad de la CPU, sacudida y destellos para accesibilidad, pantalla, vibración, botones del mando,
sensibilidad del stick, teclado).

## Estructura

```
src/sim/      simulación determinista (step, combate, parry, agarres, proyectiles, rondas)
src/data/     personajes, movimientos (frame data como datos) y ajustes globales
src/render/   esqueleto procedural, poses, animación, escenarios, HUD, efectos
src/audio/    sonido y música sintetizados
src/input/    teclado y mando: lectura, zona muerta, SOCD, perfiles, remapeo, vibración
src/ai/       CPU, muñeco de entrenamiento, lecciones del trial, bots de balance
src/scenes/   menús y modos de juego
tests/        Vitest
scripts/      simulación de balance y generación de documentación
```
