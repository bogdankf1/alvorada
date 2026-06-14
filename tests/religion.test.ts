import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { cityYields, empireHappiness } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';

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

describe('civic effects in the funnels', () => {
  it('a pantheon belief adds its yield to every owner city', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    const before = cityYields(ctx, s, s.cities[id]).total.food;
    s.players[0].pantheon = 'god_of_harvest'; // +1 food/city
    expect(cityYields(ctx, s, s.cities[id]).total.food).toBe(before + 1);
  });

  it('a founder belief with happiness counts once for the empire', () => {
    let s = flatWorld(18, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5); const b = spawn(s, 0, 'settler', 10, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id }); s = thaw(s);
    const cap = Object.keys(s.cities).map(Number)[0];
    const before = empireHappiness(ctx, s, 0).happy;
    s.religions['rel_0'] = { id: 'rel_0', name: 'Test', founder: 0, holyCity: cap, founderBelief: 'papal_primacy', followerBelief: 'feed_the_world' };
    expect(empireHappiness(ctx, s, 0).happy).toBe(before + 3); // +3 once, not +3 per city
  });
});

describe('founding', () => {
  function capital() {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    return { s, id: Object.keys(s.cities).map(Number)[0] };
  }
  it('founds a pantheon, spending faith', () => {
    const { s } = capital();
    s.players[0].faith = 25;
    const s2 = applyAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'god_of_harvest' });
    expect(s2.players[0].pantheon).toBe('god_of_harvest');
    expect(s2.players[0].faith).toBe(25 - 20);
  });
  it('rejects a pantheon without enough faith or with a non-pantheon belief', () => {
    const { s } = capital();
    s.players[0].faith = 10;
    expect(validateAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'god_of_harvest' }).ok).toBe(false);
    s.players[0].faith = 25;
    expect(validateAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'tithe' }).ok).toBe(false); // founder, not pantheon
  });
  it('founds a religion with theology, faith, and a holy city', () => {
    const { s, id } = capital();
    s.players[0].faith = 70; s.players[0].techs.push('theology');
    const s2 = applyAction(ctx, s, { type: 'FOUND_RELIGION', player: 0, name: 'Sol', holyCity: id, founderBelief: 'tithe', followerBelief: 'feed_the_world' });
    expect(s2.religions['rel_0'].holyCity).toBe(id);
    expect(s2.cities[id].religion).toBe('rel_0');
    expect(s2.players[0].faith).toBe(70 - 60);
  });
});

describe('spread', () => {
  it("a holy city's religion spreads to a nearby city; the holy city stays loyal", () => {
    let s = flatWorld(20, 12, 1);
    const a = spawn(s, 0, 'settler', 4, 5); const b = spawn(s, 0, 'settler', 8, 5); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id }); s = thaw(s);
    const [c0, c1] = Object.keys(s.cities).map(Number);
    s.players[0].faith = 70; s.players[0].techs.push('theology');
    s = applyAction(ctx, s, { type: 'FOUND_RELIGION', player: 0, name: 'Sol', holyCity: c0, founderBelief: 'tithe', followerBelief: 'feed_the_world' });
    for (let i = 0; i < 6; i++) s = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    expect(s.cities[c1].religion).toBe('rel_0'); // converted (dist 4 <= spreadRange 6)
    expect(s.cities[c0].religion).toBe('rel_0'); // holy city loyal
  });
});
