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
import { computeScore, playerCities } from '../src/engine/selectors';
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

    const alive = state.players.filter((p) => p.alive);
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
  }, 300_000);

  it('the science capstone is a reachable victory in self-play', () => {
    // seed 7 is a tech-leaning game: an AI completes scientific_method ~turn 177
    const { state } = runGame(7, 265);
    expect(state.phase).toBe('ended');
    expect(state.winner?.victory).toBe('science');
    expect(state.players[state.winner!.player].techs).toContain('scientific_method');
  }, 300_000);
});

describe('balance telemetry', () => {
  it('prints milestone table (eyeball check, no hard assertions)', () => {
    const { state } = runGame(8128, 100);
    const rows = state.players.map((p) => ({
      civ: ctx.rules.civs[p.civ].name,
      alive: p.alive,
      cities: playerCities(state, p.id).length,
      pop: playerCities(state, p.id).reduce((s2, c) => s2 + c.pop, 0),
      techs: p.techs.length,
      gold: p.gold,
      score: computeScore(ctx, state, p.id),
    }));
    console.table(rows);
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
