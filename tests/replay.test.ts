/**
 * The determinism contract (PLAN.md §3.3): a game is fully determined by
 * (config, action log). If these tests fail, multiplayer/saves/debugging
 * guarantees are broken — fix the engine, never the tests.
 */
import { describe, it, expect } from 'vitest';
import type { Action, GameState } from '../src/engine/types';
import { initialState } from '../src/engine/state';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { deserializeGame, gameHash, serializeGame } from '../src/engine/serialize';
import { playerUnits } from '../src/engine/selectors';
import { findPath } from '../src/engine/map/pathfind';
import { ctx } from './helpers';

const config = (seed: number) => ({
  seed,
  mapW: 36,
  mapH: 24,
  players: [
    { civ: 'rome', controller: 'ai' as const },
    { civ: 'egypt', controller: 'ai' as const },
  ],
});

/** A scripted "player": founds, wanders, ends turns — enough to churn state. */
function scriptedGame(seed: number, rounds: number): { final: GameState; log: Action[] } {
  let s = initialState(config(seed), ctx);
  const log: Action[] = [];
  const act = (a: Action) => {
    s = applyAction(ctx, s, a);
    log.push(a);
  };

  for (let round = 0; round < rounds; round++) {
    for (let p = 0; p < 2; p++) {
      // Skip barbarian turns: barbarians have no scripted actions; just end their turn.
      while (s.players[s.currentPlayer]?.barbarian) {
        act({ type: 'END_TURN', player: s.currentPlayer });
      }
      expect(s.currentPlayer).toBe(p);
      // found a city with any settler standing around
      for (const u of playerUnits(s, p)) {
        if (u.def !== 'settler') continue;
        const v = validateAction(ctx, s, { type: 'FOUND_CITY', player: p, unit: u.id });
        if (v.ok) act({ type: 'FOUND_CITY', player: p, unit: u.id });
      }
      // march military around deterministically
      for (const u of playerUnits(s, p)) {
        if (u.def === 'settler' || u.moves <= 0) continue;
        const dest = { q: u.q + ((round + u.id) % 3) - 1, r: u.r + (u.id % 3) - 1 };
        const path = findPath(ctx, s, u, dest);
        if (path && path.length) {
          const v = validateAction(ctx, s, { type: 'MOVE_UNIT', player: p, unit: u.id, path });
          if (v.ok) act({ type: 'MOVE_UNIT', player: p, unit: u.id, path });
        }
      }
      // set research and production where possible
      const player = s.players[p];
      if (!player.researching) {
        for (const t of ['pottery', 'mining', 'archery']) {
          const v = validateAction(ctx, s, { type: 'SET_RESEARCH', player: p, tech: t });
          if (v.ok) {
            act({ type: 'SET_RESEARCH', player: p, tech: t });
            break;
          }
        }
      }
      for (const cid of Object.keys(s.cities).map(Number)) {
        const c = s.cities[cid];
        if (c.owner === p && !c.production.item) {
          const v = validateAction(ctx, s, {
            type: 'SET_PRODUCTION',
            player: p,
            city: cid,
            item: { kind: 'unit', id: 'warrior' },
          });
          if (v.ok)
            act({ type: 'SET_PRODUCTION', player: p, city: cid, item: { kind: 'unit', id: 'warrior' } });
        }
      }
      act({ type: 'END_TURN', player: p });
    }
  }
  return { final: s, log };
}

describe('replay determinism', () => {
  it('re-applying the action log reproduces the exact final state', () => {
    const { final, log } = scriptedGame(2026, 12);
    let replayed = initialState(config(2026), ctx);
    for (const a of log) replayed = applyAction(ctx, replayed, a);
    expect(gameHash(replayed)).toBe(gameHash(final));
    expect(replayed).toEqual(final);
  });

  it('two runs of the same script are identical', () => {
    const a = scriptedGame(77, 8);
    const b = scriptedGame(77, 8);
    expect(gameHash(a.final)).toBe(gameHash(b.final));
  });

  it('serialization round-trips losslessly', () => {
    const { final } = scriptedGame(13, 6);
    const restored = deserializeGame(serializeGame(final));
    expect(restored).toEqual(final);
    expect(gameHash(restored)).toBe(gameHash(final));
    // and the restored game keeps playing (turn advances, or same turn with a later player)
    const next = applyAction(ctx, restored, { type: 'END_TURN', player: restored.currentPlayer });
    expect(next.turn * 100 + next.currentPlayer).toBeGreaterThan(restored.turn * 100 + restored.currentPlayer - 1);
  });
});

describe('diplomacy replay determinism', () => {
  const config = {
    seed: 909,
    mapW: 30,
    mapH: 20,
    players: [
      { civ: 'rome', controller: 'human' as const },
      { civ: 'egypt', controller: 'ai' as const },
    ],
  };
  // Deterministic starting state shared by build and replay: force first contact and
  // give the human a treasury so deals are affordable. Both paths derive it identically.
  const makeStart = () => {
    const s = initialState(config, ctx);
    s.relations[0][1].met = true;
    s.relations[1][0].met = true;
    s.players[0].gold = 300;
    return s;
  };

  it('a scripted diplomacy game (deals, denounce, obligations) replays bit-identically', () => {
    const term = ctx.rules.settings.diplomacy.termLength;
    const build = () => {
      let s = makeStart();
      const log: Action[] = [];
      const act = (a: Action) => {
        s = applyAction(ctx, s, a);
        log.push(a);
      };
      // human (player 0) gifts gold (AI accepts), buys open borders, then denounces
      act({ type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 100 }, take: { gold: 0 } });
      act({ type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 50 }, take: { gold: 0, openBorders: true } });
      act({ type: 'PROPOSE_DEAL', player: 0, to: 1, give: { gold: 0, goldPerTurn: { amount: 5, turns: term } }, take: { gold: 0 } });
      act({ type: 'DENOUNCE', player: 0, target: 1 });
      // run several rounds so obligations tick (gold-per-turn) and grudge decays
      for (let i = 0; i < 12; i++) act({ type: 'END_TURN', player: s.currentPlayer });
      return { final: s, log };
    };
    const a = build();
    // the script exercised the machinery, not just turns (assert on stable facts)
    expect(a.log.filter((x) => x.type === 'PROPOSE_DEAL').length).toBe(3);
    expect(a.final.relations[0][1].denounced).toBe(true); // denounce sticks
    expect(a.final.relations[1][0].openBordersUntil).toBeGreaterThan(a.final.turn); // pact still active

    let replay = makeStart();
    for (const action of a.log) replay = applyAction(ctx, replay, action);
    expect(gameHash(replay)).toBe(gameHash(a.final));
    expect(replay).toEqual(a.final);
  });
});
