import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { isEmbarked, isCoastal, unitCanOccupy, canProduce } from '../src/engine/selectors';
import { tileIndex } from '../src/engine/hex';
import { findPath } from '../src/engine/map/pathfind';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';

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

describe('domain-aware movement', () => {
  it('findPath never routes an on-land land unit through water', () => {
    const s = coastWorld();
    const u = spawn(s, 0, 'warrior', 7, 5);
    refreshVis(s);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    const path = findPath(ctx, s, u, { q: 11, r: 5 });
    if (path) for (const step of path) expect(isWaterAt(s, step)).toBe(false);
  });

  it('a tech land unit can deliberately embark one step onto adjacent water', () => {
    const s = thaw(coastWorld());
    spawn(s, 0, 'settler', 5, 5); // keep player 0 alive after move (no city)
    const u = spawn(s, 0, 'warrior', 7, 5);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    refreshVis(s);
    const s2 = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: u.id, path: [{ q: 8, r: 5 }] });
    expect(isEmbarked(ctx, s2, s2.units[u.id])).toBe(true);
  });

  it('without the embark tech, stepping onto water is rejected', () => {
    const s = thaw(coastWorld());
    const u = spawn(s, 0, 'warrior', 7, 5);
    refreshVis(s);
    const res = validateAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: u.id, path: [{ q: 8, r: 5 }] });
    expect(res.ok).toBe(false);
  });
});

describe('naval units & coastal production', () => {
  it('a coastal city can produce a Galley; an inland city cannot', () => {
    const s = coastWorld();
    s.players[0].techs.push('bronze_working');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'unit', id: 'galley' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'unit', id: 'galley' }).ok).toBe(false);
  });

  it('a sea unit may occupy water but not land', () => {
    const s = coastWorld();
    const g = spawn(s, 0, 'galley', 10, 5); // on water
    expect(unitCanOccupy(ctx, s, g, idxOf(s, 11, 5))).toBe(true);  // water
    expect(unitCanOccupy(ctx, s, g, idxOf(s, 5, 5))).toBe(false);  // land
  });
});

function isWaterAt(s: ReturnType<typeof flatWorld>, a: { q: number; r: number }) {
  return s.tiles[idxOf(s, a.q, a.r)].terrain === 'coast' || s.tiles[idxOf(s, a.q, a.r)].terrain === 'ocean';
}
