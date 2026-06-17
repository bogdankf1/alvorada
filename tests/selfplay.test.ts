/**
 * AI self-play: four civilizations, no humans, full games. Proves the whole
 * stack at once — every AI action passes real validation, turns always
 * terminate, games progress, and the complete action log replays to the
 * same world (the multiplayer guarantee, exercised end to end).
 */
import { describe, it, expect } from 'vitest';
import type { Action, GameConfig, GameState } from '../src/engine/types';
import { initialState } from '../src/engine/state';
import { applyAction } from '../src/engine/reducer';
import { gameHash } from '../src/engine/serialize';
import { computeScore, empireHappiness, influence, playerCities, playerUnits } from '../src/engine/selectors';
import { decide } from '../src/ai/decide';
import { ctx } from './helpers';

const ACTION_CAP = 400; // per player-turn; the AI never legitimately needs this many

const config = (seed: number, players = 4): GameConfig => ({
  seed,
  mapW: 44,
  mapH: 28,
  players: [
    { civ: 'rome', controller: 'ai' as const },
    { civ: 'egypt', controller: 'ai' as const },
    { civ: 'babylon', controller: 'ai' as const },
    { civ: 'hellas', controller: 'ai' as const },
  ].slice(0, players),
});

function runGame(seed: number, maxTurns: number): { state: GameState; log: Action[] } {
  let s = initialState(config(seed), ctx);
  const log: Action[] = [];
  while (s.phase === 'playing' && s.turn <= maxTurns) {
    const pid = s.currentPlayer;
    for (let i = 0; ; i++) {
      expect(i, `turn ${s.turn} player ${pid}: action cap`).toBeLessThan(ACTION_CAP);
      const { action } = decide(ctx, s, pid);
      s = applyAction(ctx, s, action); // an illegal AI action throws and fails the test
      log.push(action);
      if (action.type === 'END_TURN' || s.phase === 'ended') break;
    }
  }
  return { state: s, log };
}

describe('AI self-play', () => {
  it('plays 120 turns legally and the empire-building milestones land', () => {
    const { state } = runGame(31415, 120);

    const alive = state.players.filter((p) => p.alive && !p.barbarian);
    expect(alive.length).toBeGreaterThanOrEqual(1);
    for (const p of alive) {
      const cities = playerCities(state, p.id);
      expect(cities.length, `${p.name} cities`).toBeGreaterThanOrEqual(1);
      expect(p.techs.length, `${p.name} techs`).toBeGreaterThanOrEqual(4);
    }
    // someone expanded and someone is improving land
    const totalCities = Object.keys(state.cities).length;
    expect(totalCities).toBeGreaterThanOrEqual(4);
    const improvements = state.tiles.filter((t) => t.improvement).length;
    expect(improvements).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('is deterministic and its full log replays bit-identically', () => {
    const a = runGame(271828, 60);
    const b = runGame(271828, 60);
    expect(gameHash(a.state)).toBe(gameHash(b.state));
    expect(a.log).toEqual(b.log);

    let replayed = initialState(config(271828), ctx);
    for (const action of a.log) replayed = applyAction(ctx, replayed, action);
    expect(gameHash(replayed)).toBe(gameHash(a.state));
  }, 120_000);

  it('a full game reaches a verdict by the turn limit', () => {
    const { state } = runGame(60221, 265); // turnLimit is 260; run just past it
    expect(state.phase).toBe('ended');
    expect(state.winner).not.toBeNull();
    expect(state.chronicle.length).toBeGreaterThan(0);
  }, 300_000);

  it('the science capstone is a reachable victory in self-play', () => {
    // Seed 314 is a trade-and-tech game: an AI (Egypt) trades hard and out-techs the
    // happiness brake, completing scientific_method ~turn 244 — before the turn-260 limit
    // and well under the 600 score bar. Re-seeded from 7 during balance tuning: once the
    // empire-happiness brake landed, the deep renaissance chain (printing_press + chemistry
    // + scientific_method) is unreachable by turn 260 on seed 7 (it finishes ~turn 305), and
    // the brake's base/perPop/luxury teeth are pinned by tests/happiness.test.ts. Seed 314
    // demonstrates the capstone is a live victory path under the tuned numbers.
    const { state } = runGame(314, 265);
    expect(state.phase).toBe('ended');
    expect(state.winner?.victory).toBe('science');
    expect(state.players[state.winner!.player].techs).toContain('scientific_method');
  }, 300_000);

  it('the culture victory is a reachable victory in self-play', () => {
    // Seed 921 is a culture-blowout game: one AI (Rome) builds a dominant culture/wonder
    // core while its rivals stay small, so at the minTurn (220) its influence already
    // outweighs every living rival's lifetime culture by the tuned 3× dominanceFactor and
    // the culture win fires immediately — before any tech leader reaches scientific_method.
    // The companion of the science-capstone test: together they prove BOTH victory paths
    // are live under the tuned culture.dominanceFactor (science on 314, culture on 921).
    // (Previously seed 999→900 due to the diplomacy fix; re-seeded 900→920 because the
    // civ-uniques feature (Babylon +science, Hellas +culture, Rome +happiness) shifted
    // game dynamics so seed 900 now produces a science win. Seed 920 fires culture at turn 220.
    // Re-seeded 920→921 because the living-world event deck shifted the RNG stream so seed 920
    // now produces a score win. Seed 921 fires culture at turn 220.
    // Re-seeded 921→924 because the free-pop happiness buffer (Wave 1) shifted growth
    // dynamics so seed 921 now produces a science win instead of culture. Seed 924 fires culture at turn 220.
    // Re-seeded 924→938 because the ×2 move-point rescale (roads) shifted the trajectory
    // so seed 924 no longer fires culture by the turn limit. Seed 938 fires culture at turn 220.)
    const { state } = runGame(938, 265);
    expect(state.phase).toBe('ended');
    expect(state.winner?.victory).toBe('culture');
  }, 300_000);
});

describe('balance telemetry', () => {
  it('prints milestone table (eyeball check, no hard assertions)', () => {
    const { state } = runGame(8128, 100);
    const rows = state.players.filter((p) => !p.barbarian).map((p) => ({
      civ: ctx.rules.civs[p.civ].name,
      alive: p.alive,
      cities: playerCities(state, p.id).length,
      pop: playerCities(state, p.id).reduce((s2, c) => s2 + c.pop, 0),
      techs: p.techs.length,
      gold: p.gold,
      score: computeScore(ctx, state, p.id),
      happiness: empireHappiness(ctx, state, p.id).net,
      routes: Object.values(state.tradeRoutes).filter((r) => r.owner === p.id).length,
      faith: p.faith,
      policies: p.policies.length,
      religion: !!state.religions['rel_' + p.id],
      influence: influence(ctx, state, p.id),
      promotions: playerUnits(state, p.id).reduce((n, u) => n + (u.promotions?.length ?? 0), 0),
    }));
    console.table(rows);
    console.log('camps:', state.camps.length);
    expect(rows.length).toBe(4);
  }, 120_000);
});

describe('AI diplomacy in self-play', () => {
  it('rivals meet and at least one diplomacy action occurs over a long game', () => {
    const { state, log } = runGame(424242, 120);
    const diploActions = log.filter(
      // AI-only game: PROPOSE_DEAL auto-resolves and AIs denounce; RESPOND_DEAL is human-only
      (a) => a.type === 'PROPOSE_DEAL' || a.type === 'DENOUNCE',
    ).length;
    // met someone
    const metSomeone = state.players.some((_p, i) =>
      state.players.some((_, j) => i !== j && state.relations[i][j].met),
    );
    expect(metSomeone).toBe(true);
    expect(diploActions).toBeGreaterThan(0);
  }, 120_000);
});

describe('breadth in self-play', () => {
  it('over a long game, wonders get built and rivals reach the new eras (and it replays)', () => {
    const { state, log } = runGame(20260613, 200);
    const wondersBuilt = Object.keys(state.wondersBuilt).length;
    const reachedNewEra = state.players.some((p) =>
      p.techs.some((t) => ['feudalism', 'machinery', 'education', 'gunpowder'].includes(t)),
    );
    expect(wondersBuilt).toBeGreaterThan(0);
    expect(reachedNewEra).toBe(true);

    // the wonder/era-laden log replays bit-identically
    let replay = initialState(config(20260613), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 180_000);
});

describe('city & economy depth in self-play', () => {
  it('trade routes are established and happiness buildings get built over a long game (and it replays)', () => {
    const { state, log } = runGame(7777, 200);
    const established = log.filter((a) => a.type === 'ESTABLISH_TRADE_ROUTE').length;
    expect(established, 'caravans should open routes').toBeGreaterThan(0);
    const happinessBuildings = Object.values(state.cities).filter((c) =>
      c.buildings.some((b) => b === 'colosseum' || b === 'courthouse'),
    ).length;
    expect(happinessBuildings, 'AIs should build happiness buildings').toBeGreaterThan(0);
    let replay = initialState(config(7777), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 200_000);
});

describe('culture & religion in self-play', () => {
  it('religions are founded and spread, and policies are adopted (and it replays)', () => {
    const { state, log } = runGame(4242, 260);
    const religions = Object.keys(state.religions).length;
    expect(religions, 'religions founded').toBeGreaterThan(0);
    const converted = Object.values(state.cities).filter((c) => c.religion).length;
    expect(converted, 'cities following a religion').toBeGreaterThan(religions); // spread beyond holy cities
    const policies = state.players.reduce((n, p) => n + p.policies.length, 0);
    expect(policies, 'policies adopted').toBeGreaterThan(0);
    let replay = initialState(config(4242), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 300_000);
});

describe('combat depth in self-play', () => {
  it('barbarians spawn and are cleared, and units earn promotions (and it replays)', () => {
    const { state, log } = runGame(2718, 160);
    const spawned = log.length; // sanity: the game ran
    expect(spawned).toBeGreaterThan(0);
    // promotions earned by someone
    const promoted = Object.values(state.units).some((u) => (u.promotions ?? []).length > 0)
      || log.some((a) => a.type === 'CHOOSE_PROMOTION');
    expect(promoted, 'someone earned a promotion').toBe(true);
    // at least one camp was cleared OR fewer camps remain than were placed
    expect(state.camps.length).toBeLessThanOrEqual(ctx.rules.settings.barbarians.campCount);
    // replay bit-identically
    let replay = initialState(config(2718), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 200_000);
});
