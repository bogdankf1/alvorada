import { describe, it, expect } from 'vitest';
import {
  HEX_DIRS,
  hexDistance,
  neighbors,
  ring,
  hexesWithin,
  tileIndex,
  axialOfIndex,
  hexToPixel,
  pixelToHex,
  axialFromColRow,
  offsetCol,
} from '../src/engine/hex';

describe('hex math', () => {
  it('has 6 unique directions summing to zero', () => {
    expect(HEX_DIRS).toHaveLength(6);
    const sum = HEX_DIRS.reduce((a, d) => ({ q: a.q + d.q, r: a.r + d.r }), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
  });

  it('distance is symmetric and matches known values', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 3, r: -1 };
    expect(hexDistance(a, b)).toBe(3);
    expect(hexDistance(b, a)).toBe(3);
    expect(hexDistance(a, a)).toBe(0);
    for (const n of neighbors(a)) expect(hexDistance(a, n)).toBe(1);
  });

  it('ring(r) has 6r hexes all at distance r', () => {
    const c = { q: 5, r: 5 };
    for (const rad of [1, 2, 3]) {
      const hexes = ring(c, rad);
      expect(hexes).toHaveLength(6 * rad);
      for (const h of hexes) expect(hexDistance(c, h)).toBe(rad);
    }
  });

  it('hexesWithin(r) has 1+3r(r+1) hexes', () => {
    const c = { q: 2, r: 7 };
    expect(hexesWithin(c, 2)).toHaveLength(19);
    expect(hexesWithin(c, 3)).toHaveLength(37);
  });

  it('round-trips axial <-> flat index over a whole map', () => {
    const W = 12;
    const H = 9;
    for (let i = 0; i < W * H; i++) {
      const a = axialOfIndex(i, W);
      expect(tileIndex(a, W, H)).toBe(i);
    }
    expect(tileIndex({ q: -99, r: 0 }, W, H)).toBe(-1);
    expect(tileIndex({ q: 0, r: H }, W, H)).toBe(-1);
  });

  it('offset conversion round-trips', () => {
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const a = axialFromColRow(col, row);
        expect(offsetCol(a)).toBe(col);
        expect(a.r).toBe(row);
      }
  });

  it('pixel round-trip: every hex center maps back to itself', () => {
    const size = 36;
    for (let r = 0; r < 10; r++)
      for (let q = -5; q < 10; q++) {
        const { x, y } = hexToPixel({ q, r }, size);
        expect(pixelToHex(x, y, size)).toEqual({ q, r });
      }
  });
});
