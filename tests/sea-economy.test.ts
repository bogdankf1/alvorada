import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw, fullRound } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { canProduce, tileYields, cityYields } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';

/** A coastal city for player 0 at (7,5); everything east of q=8 is coast. Returns state + city id. */
function seaWorld(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  for (let r = 0; r < s.mapH; r++) {
    for (let q = 8; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH);
      if (i >= 0) s.tiles[i].terrain = 'coast';
    }
  }
  const settler = spawn(s, 0, 'settler', 7, 5);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  return { s, id };
}

describe('Work Boat', () => {
  it('a coastal city can build a Work Boat; an inland city cannot', () => {
    const { s } = seaWorld();
    s.players[0].techs.push('pottery');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'unit', id: 'work_boat' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'unit', id: 'work_boat' }).ok).toBe(false);
  });
});
