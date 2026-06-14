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

import { ctx as ctx2, flatWorld, spawn, refreshVis } from './helpers';
import { spawnBarbarians } from '../src/engine/systems/barbarians';
import { applyAction } from '../src/engine/reducer';

/** A flatWorld whose last player is the barbarian faction, at war with all, with one camp. */
function barbFixture() {
  const s = flatWorld(20, 14, 3);
  const b = 2;
  s.players[b].barbarian = true; s.players[b].civ = 'barbarians'; s.players[b].name = 'Barbarians';
  for (let x = 0; x < 3; x++) if (x !== b) { s.relations[b][x].status = 'war'; s.relations[x][b].status = 'war'; }
  s.camps = [{ id: 1, q: 10, r: 7 }]; s.nextCampId = 2;
  return s;
}

describe('barbarian spawning', () => {
  it('a camp spawns a raider on the spawn cadence', () => {
    const s = barbFixture();
    s.turn = ctx2.rules.settings.barbarians.spawnEveryTurns; // turn % cadence === 0
    spawnBarbarians(ctx2, s);
    expect(Object.values(s.units).filter((u) => u.owner === 2).length).toBeGreaterThan(0);
  });
  it('does not spawn off-cadence', () => {
    const s = barbFixture();
    s.turn = ctx2.rules.settings.barbarians.spawnEveryTurns + 1;
    spawnBarbarians(ctx2, s);
    expect(Object.values(s.units).filter((u) => u.owner === 2).length).toBe(0);
  });
});

describe('clearing camps', () => {
  it('occupying a camp tile removes it and pays a bounty + XP', () => {
    const s = barbFixture(); // camp at (10,7), no defender in this fixture
    const u = spawn(s, 0, 'warrior', 9, 7);
    spawn(s, 0, 'settler', 1, 1); // keep player 0 alive through checkElimination
    refreshVis(s);
    const goldBefore = s.players[0].gold;
    const s2 = applyAction(ctx2, s, { type: 'MOVE_UNIT', player: 0, unit: u.id, path: [{ q: 10, r: 7 }] });
    expect(s2.camps.length).toBe(0);
    expect(s2.players[0].gold).toBe(goldBefore + ctx2.rules.settings.barbarians.campBounty);
    expect(s2.units[u.id].xp ?? 0).toBeGreaterThan(0);
  });
});
