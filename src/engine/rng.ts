/**
 * Deterministic randomness. mulberry32 for sequential draws (state lives in
 * GameState.rngState), and a stateless 2D hash for per-tile stable variation.
 * Integer mixing only — bit-identical on every JS engine.
 */

export function rngNext(state: number): [value: number, nextState: number] {
  const t = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** Draw float in [0,1) advancing the rng state stored on the object (Immer draft ok). */
export function drawFloat(holder: { rngState: number }): number {
  const [v, next] = rngNext(holder.rngState);
  holder.rngState = next;
  return v;
}

export function drawInt(holder: { rngState: number }, n: number): number {
  return Math.floor(drawFloat(holder) * n);
}

export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(arr: readonly T[]): T;
  state(): number;
}

/** Local generator for self-contained processes (map generation). */
export function makeRng(seed: number): Rng {
  let s = seed | 0;
  const next = () => {
    const [v, ns] = rngNext(s);
    s = ns;
    return v;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: (arr) => arr[int(arr.length)],
    state: () => s,
  };
}

/** Stateless hash of integer coords -> [0,1). Stable per tile, order-independent. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
