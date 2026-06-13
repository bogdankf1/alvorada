import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, declareWarBetween } from './helpers';
import { hasMet } from '../src/engine/selectors';
import { attitude } from '../src/engine/diplomacy-eval';

describe('met flag', () => {
  it('is set when a unit sees a rival unit, and is sticky', () => {
    const s = flatWorld(12, 10, 2);
    spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 1, 'warrior', 5, 4); // within sight of player 0's warrior
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(true);
    expect(hasMet(s, 1, 0)).toBe(true); // symmetric
  });

  it('stays unmet when far apart', () => {
    const s = flatWorld(20, 12, 2);
    spawn(s, 0, 'warrior', 2, 2);
    spawn(s, 1, 'warrior', 14, 10); // far corner, well outside sight range
    refreshVis(s);
    expect(hasMet(s, 0, 1)).toBe(false);
  });
});

describe('attitude', () => {
  it('is neutral between two untouched, distant players at peace', () => {
    const s = flatWorld(20, 12, 2);
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('neutral');
    expect(a.factors.every((f) => typeof f.label === 'string')).toBe(true);
  });

  it('war makes the band hostile and is reflected in the factors', () => {
    const s = flatWorld(20, 12, 2);
    declareWarBetween(s, 0, 1);
    s.relations[1][0].grudge = ctx.rules.settings.diplomacy.grudgeOnWar;
    const a = attitude(ctx, s, 1, 0);
    expect(a.band).toBe('hostile');
    expect(a.factors.some((f) => f.label.toLowerCase().includes('war'))).toBe(true);
  });

  it('mutual friendship lifts the band to at least cordial', () => {
    const s = flatWorld(20, 12, 2);
    s.relations[0][1].friends = true;
    s.relations[1][0].friends = true;
    const a = attitude(ctx, s, 1, 0);
    expect(['cordial', 'friendly']).toContain(a.band);
  });
});
