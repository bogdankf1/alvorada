import { describe, it, expect } from 'vitest';
import { makeRng, rngNext, drawFloat, drawInt, hash2 } from '../src/engine/rng';

describe('deterministic rng', () => {
  it('same seed produces the same sequence', () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds diverge', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('values are in [0,1) and ints in range', () => {
    const r = makeRng(777);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('drawFloat/drawInt advance state on the holder (replayable)', () => {
    const holder = { rngState: 42 };
    const v1 = drawFloat(holder);
    const s1 = holder.rngState;
    const holder2 = { rngState: 42 };
    expect(drawFloat(holder2)).toBe(v1);
    expect(holder2.rngState).toBe(s1);
    expect(drawInt(holder, 10)).toBeLessThan(10);
  });

  it('rngNext is pure', () => {
    const [v1, s1] = rngNext(99);
    const [v2, s2] = rngNext(99);
    expect(v1).toBe(v2);
    expect(s1).toBe(s2);
  });

  it('hash2 is stable and order-independent of calls', () => {
    const h1 = hash2(10, 20, 7);
    hash2(99, 1, 7);
    expect(hash2(10, 20, 7)).toBe(h1);
    expect(hash2(10, 20, 8)).not.toBe(h1);
    expect(hash2(20, 10, 7)).not.toBe(h1);
  });
});
