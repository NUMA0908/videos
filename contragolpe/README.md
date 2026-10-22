# CONTRAGOLPE

Juego de peleas 2D, 1 contra 1, en el navegador (TypeScript + Vite + Canvas 2D). Tres personajes originales,
parry al estilo clásico, combos, súper, IA, entrenamiento y trial de parry. Todo el arte y el sonido se
generan por código.

```bash
npm install
npm run dev     # abre http://localhost:5173
npm test
```

Controles por defecto (remapeables en Opciones):

| | Jugador 1 | Jugador 2 | Mando |
|---|---|---|---|
| Moverse / saltar / agacharse | A D / W / S | ← → / ↑ / ↓ | Cruceta o stick |
| Puño ligero / fuerte | J / K | Num 4 / Num 5 | X / Y |
| Patada ligera / fuerte | U / I | Num 7 / Num 8 | A / B |
| Parry | L | Num 6 | RB |
| Especial simple | O | Num 9 | LB |
| Agarre / Súper | LP+LK / HP+HK | | LT / RT |

Pausa: Esc · Debug: F1 · FPS: F3. Más detalles de diseño en [DESIGN.md](DESIGN.md).
