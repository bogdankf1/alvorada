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

import { checkElimination } from '../src/engine/systems/victory';
import { barbarianDecide } from '../src/ai/barbarian';
import { hasMet, metPlayers } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';

describe('barbarian AI', () => {
  it('attacks an adjacent enemy unit', () => {
    const s = barbFixture();
    s.currentPlayer = 2; // barbarians' turn (validateAction checks this)
    spawn(s, 2, 'warrior', 10, 7);  // a barbarian raider
    spawn(s, 0, 'warrior', 11, 7);  // an adjacent enemy
    refreshVis(s);
    expect(barbarianDecide(ctx2, s, 2).action.type).toBe('ATTACK');
  });
});

describe('conquest victory with barbarians present', () => {
  it('barbarian always-alive does not block conquest win for the sole real survivor', () => {
    // 3-player state: player 0 (alive), player 1 (to be eliminated), player 2 (barbarian, always alive)
    const s = barbFixture(); // flatWorld(20,14,3) + players[2].barbarian=true

    // Give player 0 a city so it stays alive through the elimination check
    const cityId = s.nextCityId++;
    s.cities[cityId] = {
      id: cityId,
      owner: 0,
      name: 'Roma',
      q: 1,
      r: 1,
      pop: 1,
      food: 0,
      production: { item: null, progress: 0 },
      buildings: [],
      culture: 0,
      tilesClaimed: 0,
      hp: ctx2.rules.settings.cityMaxHp,
    };

    // Player 1 has no cities and no settler units → will be eliminated
    // (units object starts empty in flatWorld, so player 1 is immediately city-less and unit-less)
    s.players[1].alive = true; // start alive; checkElimination will eliminate them

    // Barbarian is alive (always)
    s.players[2].alive = true;

    checkElimination(ctx2, s);

    // Player 1 must have been eliminated
    expect(s.players[1].alive).toBe(false);
    // The sole surviving real player (player 0) must be the conquest winner
    expect(s.phase).toBe('ended');
    expect(s.winner).toEqual({ player: 0, victory: 'conquest' });
    // Barbarian is still alive but did not prevent conquest
    expect(s.players[2].alive).toBe(true);
  });
});

describe('barbarians are never a diplomatic party', () => {
  it('hasMet returns false for barbarians even when the raw met flag is set', () => {
    const s = barbFixture();
    // Simulate player 0 having seen a barbarian unit (what visibility.ts does)
    s.relations[0][2].met = true;
    s.relations[2][0].met = true;
    expect(hasMet(s, 0, 2)).toBe(false);
  });

  it('metPlayers does not include the barbarian faction', () => {
    const s = barbFixture();
    s.relations[0][2].met = true;
    s.relations[2][0].met = true;
    // Also meet player 1 so we confirm real players still appear
    s.relations[0][1].met = true;
    const met = metPlayers(s, 0);
    expect(met).not.toContain(2);
    expect(met).toContain(1);
  });

  it('PROPOSE_DEAL to the barbarian faction fails validation', () => {
    const s = barbFixture();
    s.relations[0][2].met = true;
    s.relations[2][0].met = true;
    s.currentPlayer = 0;
    const propose = {
      type: 'PROPOSE_DEAL' as const,
      player: 0 as const,
      to: 2 as const,
      give: { gold: 0, peace: true },
      take: { gold: 0, peace: true },
    };
    expect(validateAction(ctx2, s, propose).ok).toBe(false);
  });
});
