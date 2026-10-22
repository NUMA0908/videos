# CONTRAGOLPE (juego de peleas)

Proyecto independiente dentro del repo (las reglas de Remotion del CLAUDE.md raíz NO aplican aquí).
TypeScript + Vite + Canvas 2D + Vitest. Ver `DESIGN.md` (diseño y frame data) y `README.md` (cómo jugar).

## Reglas

- `src/sim/` y `src/data/` son deterministas: solo enteros en el estado, sin DOM, sin `Math.random`,
  sin `Date.now`/`performance`. Hay un test que lo vigila.
- Todo movimiento nuevo es **dato** en `src/data/moves/<personaje>.ts`; la lógica de combate no conoce movimientos concretos.
- Efectos visuales y audio reaccionan a `state.events`; nunca escriben en el estado de simulación.
- Si cambias frame data, actualiza la tabla de `DESIGN.md` y corre `npm test`.
- Personajes, nombres y arte 100 % originales.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run typecheck
```
