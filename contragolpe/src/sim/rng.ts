/**
 * RNG con semilla (mulberry32). La simulación guarda su semilla en el estado (`state.rng`),
 * por lo que restaurar un estado restaura también la secuencia aleatoria.
 * Los efectos visuales y la IA usan instancias propias de `Rng`, nunca la de la simulación.
 */
export function rngNext(holder: { rng: number }): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Entero en [0, n). */
export function rngInt(holder: { rng: number }, n: number): number {
  return rngNext(holder) % n;
}

/** Generador independiente (IA, partículas, menús). */
export class Rng {
  rng: number;
  constructor(seed: number) {
    this.rng = seed | 0;
  }
  next(): number {
    return rngNext(this) / 4294967296;
  }
  int(n: number): number {
    return rngInt(this, n);
  }
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }
}
