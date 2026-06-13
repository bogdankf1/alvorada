import { describe, it, expect } from 'vitest';
import { flatWorld, spawn, refreshVis } from './helpers';
import { hasMet } from '../src/engine/selectors';

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
