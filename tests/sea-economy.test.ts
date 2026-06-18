import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { canProduce, tileYields, cityYields } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';
import type { GameState } from '../src/engine/types';

// `endTurn`/`fullRound` are file-local helpers (same pattern as tests/engine.test.ts — NOT exported from helpers.ts).
const endTurn = (s: GameState) => applyAction(ctx, s, { type: 'END_TURN', player: s.currentPlayer });
const fullRound = (s: GameState) => {
  const n = s.players.filter((p) => p.alive).length;
  let st = s;
  for (let i = 0; i < n; i++) st = endTurn(st);
  return st;
};

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

describe('Fishing Boats', () => {
  it('a Work Boat builds Fishing Boats on an owned fish tile (and it completes)', () => {
    let { s, id } = seaWorld();
    spawn(s, 1, 'warrior', 1, 8); // keep player 1 alive so fullRound can cycle without ending the game
    const fishIdx = idxOf(s, 8, 5); // claimed by the city at founding (ring 1), water
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    s.players[0].techs.push('pottery');
    const wb = spawn(s, 0, 'work_boat', 8, 5);
    refreshVis(s);
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' }).ok,
    ).toBe(true);
    s = applyAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' });
    for (let i = 0; i < ctx.rules.improvements.fishing_boats.turns; i++) s = fullRound(s);
    expect(s.tiles[fishIdx].improvement).toBe('fishing_boats');
    expect(s.units[wb.id].order).toBeNull();
  });

  it('Fishing Boats fails on a coast tile without the fish resource', () => {
    const { s, id } = seaWorld();
    const plainCoast = idxOf(s, 8, 5);
    s.tiles[plainCoast].ownerCity = id; // owned water, no resource
    s.players[0].techs.push('pottery');
    const wb = spawn(s, 0, 'work_boat', 8, 5);
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' }).ok,
    ).toBe(false);
  });

  it('an improved fish tile yields food 4 / gold 2 (un-improved is food 3 / gold 1)', () => {
    const { s, id } = seaWorld();
    const fishIdx = idxOf(s, 8, 5);
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    const before = tileYields(ctx, s, fishIdx, 0);
    expect(before.food).toBe(3); // coast food1 + fish food2
    expect(before.gold).toBe(1); // coast gold1
    s.tiles[fishIdx].improvement = 'fishing_boats';
    const after = tileYields(ctx, s, fishIdx, 0);
    expect(after.food).toBe(4); // + bonusImproved food1
    expect(after.gold).toBe(2); // + bonusImproved gold1
  });

  it('a land Worker still cannot build a farm on water', () => {
    const { s, id } = seaWorld();
    const waterIdx = idxOf(s, 8, 5);
    s.tiles[waterIdx].ownerCity = id;
    s.players[0].techs.push('agriculture');
    const worker = spawn(s, 0, 'worker', 8, 5); // land unit force-placed on water for the assertion
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: worker.id, improvement: 'farm' }).ok,
    ).toBe(false);
  });
});

describe('Harbor', () => {
  it('is coastal-gated', () => {
    const { s } = seaWorld();
    s.players[0].techs.push('bronze_working');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'building', id: 'harbor' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'building', id: 'harbor' }).ok).toBe(false);
  });

  it('adds +1 production per worked water tile', () => {
    const { s, id } = seaWorld();
    const city = s.cities[id];
    city.pop = 7; // enough citizens to work all ring-1 tiles (incl. the 2 coast tiles)
    const base = cityYields(ctx, s, city);
    const waterWorked = base.worked.filter(
      (idx) => ctx.rules.terrains[s.tiles[idx].terrain].water,
    ).length;
    city.buildings.push('harbor');
    const withHarbor = cityYields(ctx, s, city);
    expect(withHarbor.total.production - base.total.production).toBe(waterWorked);
    expect(waterWorked).toBeGreaterThan(0); // the coastal city actually works water
  });
});
