import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw, declareWarBetween } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { findPath } from '../src/engine/map/pathfind';
import { decideSettlerForTest, decideWorkBoatForTest } from '../src/ai/decide';
import type { Action } from '../src/engine/types';
import { canProduce } from '../src/engine/selectors';
import { applyAction } from '../src/engine/reducer';
import { wantsWorkBoatForTest, navalNeedForTest } from '../src/ai/economy';

/** Land everywhere except a vertical sea channel at q in {8,9}; west land, east land. */
function channelWorld() {
  const s = flatWorld(18, 12, 2);
  for (let r = 0; r < s.mapH; r++) {
    for (const q of [8, 9]) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH);
      if (i >= 0) s.tiles[i].terrain = 'coast';
    }
  }
  return s;
}

describe('embark pathfinding', () => {
  it('with { embark: true } a tech land unit can plan a route across the sea channel', () => {
    const s = channelWorld();
    const u = spawn(s, 0, 'settler', 5, 5);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    refreshVis(s);
    const strict = findPath(ctx, s, u, { q: 13, r: 5 });
    expect(strict).toBeNull(); // land unit cannot plan across water by default
    const viaSea = findPath(ctx, s, u, { q: 13, r: 5 }, { embark: true });
    expect(viaSea).not.toBeNull();
    expect(viaSea!.some((step) => s.tiles[idxOf(s, step.q, step.r)].terrain === 'coast')).toBe(true);
  });

  it('without the embark tech, { embark: true } still returns null', () => {
    const s = channelWorld();
    const u = spawn(s, 0, 'settler', 5, 5); // no embark tech
    refreshVis(s);
    expect(findPath(ctx, s, u, { q: 13, r: 5 }, { embark: true })).toBeNull();
  });
});

function overseasWorld() {
  const s = flatWorld(18, 12, 2);
  for (let r = 0; r < s.mapH; r++) {
    for (const q of [8, 9]) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH);
      if (i >= 0) s.tiles[i].terrain = 'coast';
    }
  }
  return s;
}

describe('overseas settling', () => {
  it('a settler with only an overseas site + a galley + embark tech sets out to sea', () => {
    const s = overseasWorld();
    spawn(s, 0, 'warrior', 2, 5);                 // a garrison so player 0 is a going concern
    const settler = spawn(s, 0, 'settler', 6, 5); // on home land beside the channel
    spawn(s, 0, 'galley', 8, 5);                  // an escort is available
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    refreshVis(s);
    // reveal the east side as explored so knownGoodSpots can score it
    for (let r = 0; r < s.mapH; r++) for (let q = 10; q < 16; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH);
      if (i >= 0) s.visibility[0][i] = Math.max(s.visibility[0][i], 1);
    }
    const d = decideSettlerForTest(ctx, s, settler);
    expect(d?.action.type).toBe('MOVE_UNIT');
    const move = d!.action as Extract<Action, { type: 'MOVE_UNIT' }>;
    expect(move.path.some((p) => s.tiles[idxOf(s, p.q, p.r)].terrain === 'coast')).toBe(true);
  });
});

describe('coastal production', () => {
  function coastalCity() {
    let s = flatWorld(18, 12, 2);
    for (let r = 0; r < s.mapH; r++) for (const q of [8, 9]) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const settler = spawn(s, 0, 'settler', 7, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    s.players[0].techs.push('pottery', 'bronze_working');
    return { s, id };
  }

  it('wants a Work Boat only when a coastal city owns an unimproved fish tile', () => {
    const { s, id } = coastalCity();
    expect(wantsWorkBoatForTest(ctx, s, s.cities[id])).toBe(false); // no fish yet
    const fishIdx = idxOf(s, 8, 5); // an owned coast tile in range
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    expect(wantsWorkBoatForTest(ctx, s, s.cities[id])).toBe(true);
  });

  it('a coastal city can produce harbor + work_boat; an inland city cannot', () => {
    const { s, id } = coastalCity();
    const coastal = s.cities[id];
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'unit', id: 'work_boat' }).ok).toBe(true);
    expect(canProduce(ctx, s, coastal, { kind: 'building', id: 'harbor' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'unit', id: 'work_boat' }).ok).toBe(false);
    expect(canProduce(ctx, s, inland, { kind: 'building', id: 'harbor' }).ok).toBe(false);
  });
});

describe('work boat orders', () => {
  it('a Work Boat on an owned fish tile is told to build Fishing Boats', () => {
    let s = flatWorld(18, 12, 2);
    for (let r = 0; r < s.mapH; r++) for (const q of [8, 9, 10]) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const settler = spawn(s, 0, 'settler', 7, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    s.players[0].techs.push('pottery');
    const fishIdx = idxOf(s, 8, 5);
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    const wb = spawn(s, 0, 'work_boat', 8, 5);
    refreshVis(s);
    const d = decideWorkBoatForTest(ctx, s, wb);
    expect(d?.action.type).toBe('BUILD_IMPROVEMENT');
    expect((d!.action as any).improvement).toBe('fishing_boats');
  });
});

describe('naval production', () => {
  function coastalCityWith(techs: string[]) {
    let s = flatWorld(18, 12, 2);
    for (let r = 0; r < s.mapH; r++) for (let q = 8; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH); if (i >= 0) s.tiles[i].terrain = 'coast';
    }
    const settler = spawn(s, 0, 'settler', 7, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push(...techs);
    return { s, id: Object.keys(s.cities).map(Number)[0] };
  }

  it('naval need is true when an enemy ship is visible near home waters', () => {
    const { s, id } = coastalCityWith(['bronze_working']);
    spawn(s, 0, 'warrior', 7, 5);          // garrison
    spawn(s, 1, 'galley', 9, 5);           // hostile ship offshore
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    expect(navalNeedForTest(ctx, s, s.cities[id])).toBe(true);
  });

  it('no naval need in peacetime with no ships and no embarked civilians', () => {
    const { s, id } = coastalCityWith(['bronze_working']);
    refreshVis(s);
    expect(navalNeedForTest(ctx, s, s.cities[id])).toBe(false);
  });
});
