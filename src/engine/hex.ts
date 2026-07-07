/**
 * Pointy-top hex math on axial coordinates (q, r), stored in a flat array
 * using odd-r offset rows (Civ-style horizontal map). See Red Blob Games.
 */
import type { Axial } from './types';

export const SQRT3 = Math.sqrt(3);

/** Pointy-top axial neighbor directions: E, NE, NW, W, SW, SE. */
export const HEX_DIRS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function axialKey(a: Axial): number {
  // compact unique key for in-map coords (r is bounded; q can dip negative by mapH/2)
  return (a.r + 4) * 4096 + a.q + 1024;
}

export function offsetCol(a: Axial): number {
  return a.q + ((a.r - (a.r & 1)) >> 1);
}

export function axialFromColRow(col: number, row: number): Axial {
  return { q: col - ((row - (row & 1)) >> 1), r: row };
}

export function inBounds(a: Axial, mapW: number, mapH: number): boolean {
  if (a.r < 0 || a.r >= mapH) return false;
  const col = offsetCol(a);
  return col >= 0 && col < mapW;
}

/** Flat-array index for an axial coord, or -1 when out of bounds. */
export function tileIndex(a: Axial, mapW: number, mapH: number): number {
  if (a.r < 0 || a.r >= mapH) return -1;
  const col = offsetCol(a);
  if (col < 0 || col >= mapW) return -1;
  return a.r * mapW + col;
}

export function axialOfIndex(i: number, mapW: number): Axial {
  const row = Math.floor(i / mapW);
  return axialFromColRow(i - row * mapW, row);
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** hexDistance for any `{q,r}`-bearing objects (units, cities, tiles) without wrapping. */
export function dist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return hexDistance(a, b);
}

export function neighbors(a: Axial): Axial[] {
  return HEX_DIRS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function sameHex(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

export function ring(center: Axial, radius: number): Axial[] {
  if (radius === 0) return [{ ...center }];
  const out: Axial[] = [];
  let cur = { q: center.q + HEX_DIRS[4].q * radius, r: center.r + HEX_DIRS[4].r * radius };
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push(cur);
      cur = { q: cur.q + HEX_DIRS[side].q, r: cur.r + HEX_DIRS[side].r };
    }
  }
  return out;
}

/** All hexes within `radius` of center (inclusive), center first, then by ring. */
export function hexesWithin(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [{ ...center }];
  for (let rad = 1; rad <= radius; rad++) out.push(...ring(center, rad));
  return out;
}

// --- pixel space (renderer + hit testing share this single source of truth) ---

export function hexToPixel(a: Axial, size: number): { x: number; y: number } {
  return { x: size * SQRT3 * (a.q + a.r / 2), y: size * 1.5 * a.r };
}

export function axialRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 }; // +0 normalizes IEEE negative zero from Math.round
}

export function pixelToHex(x: number, y: number, size: number): Axial {
  const qf = ((SQRT3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  return axialRound(qf, rf);
}

/** Polygon corners of a pointy-top hex centered at (cx, cy). */
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    // pointy-top: corners at 30deg + 60deg*i
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return out;
}
