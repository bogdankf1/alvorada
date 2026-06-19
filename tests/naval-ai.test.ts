import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { findPath } from '../src/engine/map/pathfind';

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
