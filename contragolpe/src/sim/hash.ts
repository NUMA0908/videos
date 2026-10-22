/** FNV-1a de 32 bits: hash rápido y estable para comparar estados (tests de determinismo, desync). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashValue(value: unknown): string {
  return hashString(JSON.stringify(value)).toString(16).padStart(8, "0");
}
