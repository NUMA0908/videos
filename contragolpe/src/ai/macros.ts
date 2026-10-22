import { Btn } from "../sim/input";

/** Dirección numpad → bitmask, según hacia dónde mira el personaje. */
export function dirMask(d: number, facing: 1 | -1): number {
  const fwd = facing === 1 ? Btn.RIGHT : Btn.LEFT;
  const back = facing === 1 ? Btn.LEFT : Btn.RIGHT;
  const h = d % 3 === 0 ? fwd : d % 3 === 1 ? back : 0;
  const v = d >= 7 ? Btn.UP : d <= 3 ? Btn.DOWN : 0;
  return h | v;
}

/** Motion completo como lista de frames: cada dirección `hold` frames y el botón en el último. */
export function motionFrames(dirs: number[], button: number, facing: 1 | -1, hold = 2): number[] {
  const out: number[] = [];
  for (const d of dirs) for (let i = 0; i < hold; i++) out.push(dirMask(d, facing));
  out[out.length - 1] |= button;
  return out;
}

export function waitFrames(n: number, mask = 0): number[] {
  return new Array(n).fill(mask);
}
