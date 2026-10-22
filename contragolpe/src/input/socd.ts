import { Btn } from "../sim/input";

/**
 * Limpieza SOCD de los dispositivos (teclado y mando por igual):
 *   izquierda + derecha = neutral · arriba + abajo = arriba.
 * Se aplica a la máscara final de cada jugador, después de juntar teclado, cruceta y stick.
 * (La simulación conserva su propia limpieza como red de seguridad para fuentes que no pasan por aquí,
 * como la IA o las grabaciones; a ella ya nunca le llega arriba+abajo de un jugador.)
 */
export function resolveSOCD(mask: number): number {
  let m = mask;
  if (m & Btn.LEFT && m & Btn.RIGHT) m &= ~(Btn.LEFT | Btn.RIGHT);
  if (m & Btn.UP && m & Btn.DOWN) m &= ~Btn.DOWN;
  return m;
}
