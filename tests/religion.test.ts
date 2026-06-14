import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

/** Found one city for player 0, give it a Shrine, return the thawed state + city id. */
function cityWithShrine(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  s.cities[id].buildings.push('shrine'); // +1 faith
  return { s, id };
}

describe('faith pool', () => {
  it("a city's faith banks into the player pool at turn start", () => {
    const { s } = cityWithShrine();
    expect(s.players[0].faith).toBe(0);
    // end player 0's turn; it comes back around (2 players) and beginTurn banks faith
    let s2 = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    s2 = applyAction(ctx, s2, { type: 'END_TURN', player: 1 });
    expect(s2.players[0].faith).toBeGreaterThan(0);
  });
});
