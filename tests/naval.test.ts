import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { isEmbarked, isCoastal, unitCanOccupy } from '../src/engine/selectors';
import { tileIndex } from '../src/engine/hex';

/** Paint axial q≥8 as coast so everything east of q=8 is sea (off-map coords skipped). */
function coastWorld() {
  const s = flatWorld(16, 12, 2);
  for (let r = 0; r < s.mapH; r++) {
    for (let q = 8; q < s.mapW; q++) {
      const idx = tileIndex({ q, r }, s.mapW, s.mapH);
      if (idx >= 0) s.tiles[idx].terrain = 'coast';
    }
  }
  return s;
}

describe('naval foundations', () => {
  it('schema is 11', () => { expect(SCHEMA_VERSION).toBe(11); });

  it('isEmbarked: a land unit on water is embarked; on land is not', () => {
    const s = coastWorld();
    const w = spawn(s, 0, 'warrior', 5, 5);
    const w2 = spawn(s, 0, 'warrior', 10, 5);
    expect(isEmbarked(ctx, s, w)).toBe(false);
    expect(isEmbarked(ctx, s, w2)).toBe(true);
  });

  it('isCoastal: a city beside water is coastal', () => {
    const s = coastWorld();
    expect(isCoastal(ctx, s, { q: 7, r: 5 } as any)).toBe(true);
    expect(isCoastal(ctx, s, { q: 2, r: 5 } as any)).toBe(false);
  });

  it('unitCanOccupy: land unit needs the embark tech for water; sea unit needs water', () => {
    const s = coastWorld();
    const warrior = spawn(s, 0, 'warrior', 5, 5);
    const waterIdx = idxOf(s, 10, 5), landIdx = idxOf(s, 5, 5);
    expect(unitCanOccupy(ctx, s, warrior, landIdx)).toBe(true);
    expect(unitCanOccupy(ctx, s, warrior, waterIdx)).toBe(false);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    expect(unitCanOccupy(ctx, s, warrior, waterIdx)).toBe(true);
  });
});
