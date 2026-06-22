import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { tileYields } from '../src/engine/selectors';

function cityWorld() {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 6, 6);
  spawn(s, 1, 'warrior', 1, 10); // keep player 1 alive
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  return { s, id };
}

describe('lumber mill', () => {
  it('a worker builds a lumber mill on an owned forest', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6);
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    s.players[0].techs.push('construction');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'lumber_mill' }).ok).toBe(true);
  });
  it('a lumber mill needs the forest — fails on cleared land', () => {
    const { s, id } = cityWorld();
    const gIdx = idxOf(s, 7, 6);
    s.tiles[gIdx].ownerCity = id;
    s.players[0].techs.push('construction');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'lumber_mill' }).ok).toBe(false);
  });
  it('a normal improvement (farm) still cannot be built on a forest tile', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6);
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    s.players[0].techs.push('agriculture');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'farm' }).ok).toBe(false);
  });
  it('a lumber-milled forest yields +2 production on top of the forest', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6);
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    const before = tileYields(ctx, s, fIdx, 0).production;
    s.tiles[fIdx].improvement = 'lumber_mill';
    const after = tileYields(ctx, s, fIdx, 0).production;
    expect(after - before).toBe(2);
    expect(s.tiles[fIdx].feature).toBe('forest');
  });
});
