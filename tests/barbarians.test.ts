import { describe, it, expect } from 'vitest';
import { ctx } from './helpers';
import { initialState } from '../src/engine/state';

const cfg = (seed: number) => ({ seed, mapW: 40, mapH: 26, players: [{ civ: 'rome', controller: 'ai' as const }, { civ: 'egypt', controller: 'ai' as const }] });

describe('barbarian faction', () => {
  it('is appended at war with everyone but never "met", and camps are placed', () => {
    const s = initialState(cfg(123), ctx);
    expect(s.players.length).toBe(3); // 2 civs + barbarians
    const barb = s.players.length - 1;
    expect(s.players[barb].barbarian).toBe(true);
    expect(s.relations[barb][0].status).toBe('war');
    expect(s.relations[0][barb].status).toBe('war');
    expect(s.relations[0][barb].met).toBe(false); // never met → diplomacy excludes them automatically
    expect(s.camps.length).toBe(ctx.rules.settings.barbarians.campCount);
  });
});
