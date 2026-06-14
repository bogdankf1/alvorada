/**
 * Elimination and victory evaluation. Victory kinds are simple evaluators —
 * adding a new one (domination, culture, ...) means adding a function here
 * plus a settings entry, nothing else.
 */
import type { Ctx, GameState, PlayerId } from '../types';
import { sortedIds } from '../types';
import { computeScore, influence, playerCities, playerUnits } from '../selectors';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';

/** A player with no cities and no settlers has fallen. Then: last empire standing? */
export function checkElimination(ctx: Ctx, state: GameState): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    if (p.barbarian) continue; // barbarians have no cities; they persist until the last camp is cleared
    const cities = playerCities(state, p.id);
    if (cities.length > 0) continue;
    const canRefound = playerUnits(state, p.id).some((u) =>
      ctx.rules.units[u.def].abilities?.includes('foundCity'),
    );
    if (canRefound) continue;

    p.alive = false;
    for (const id of sortedIds(state.units)) {
      if (state.units[id].owner === p.id) delete state.units[id];
    }
    recomputeVisibility(ctx, state, p.id);
    pushEvent(state, {
      player: null,
      type: 'playerEliminated',
      msg: `${p.name} of ${ctx.rules.civs[p.civ].name} has fallen`,
    });
  }

  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 1 && state.phase === 'playing') {
    declareWinner(state, alive[0].id, 'conquest');
  }
}

/** Round-end checks: score threshold, then turn limit. */
export function checkScoreVictory(ctx: Ctx, state: GameState): void {
  if (state.phase !== 'playing') return;
  const v = ctx.rules.settings.victory;
  const alive = state.players.filter((p) => p.alive);
  const scores = alive.map((p) => ({ id: p.id, score: computeScore(ctx, state, p.id) }));
  scores.sort((a, b) => b.score - a.score || a.id - b.id);
  const top = scores[0];
  if (top && (top.score >= v.scoreThreshold || state.turn > v.turnLimit)) {
    declareWinner(state, top.id, 'score');
  }
}

/** Win immediately upon researching the science capstone tech. */
export function checkScienceVictory(ctx: Ctx, state: GameState, pid: PlayerId): void {
  if (state.phase !== 'playing') return;
  if (!state.players[pid].techs.includes(ctx.rules.settings.victory.scienceCapstone)) return;
  state.winner = { player: pid, victory: 'science' };
  state.phase = 'ended';
  pushEvent(state, {
    player: null,
    type: 'victory',
    msg: `${state.players[pid].name} ushers in a new age of reason!`,
  });
}

/** Win when, past minTurn, your influence dominates every living rival's culture. */
export function checkCultureVictory(ctx: Ctx, state: GameState, pid: PlayerId): void {
  if (state.phase !== 'playing') return;
  const cv = ctx.rules.settings.victory.culture;
  if (state.turn < cv.minTurn) return;
  const rivals = state.players.filter((r) => r.alive && r.id !== pid);
  if (rivals.length === 0) return;
  const inf = influence(ctx, state, pid);
  for (const r of rivals) if (inf < r.cultureTotal * cv.dominanceFactor) return;
  state.winner = { player: pid, victory: 'culture' };
  state.phase = 'ended';
  pushEvent(state, { player: null, type: 'victory', msg: `${state.players[pid].name}'s culture echoes across the ages!` });
}

function declareWinner(state: GameState, player: number, victory: 'conquest' | 'score'): void {
  state.winner = { player, victory };
  state.phase = 'ended';
  const p = state.players[player];
  pushEvent(state, {
    player: null,
    type: 'victory',
    msg:
      victory === 'conquest'
        ? `${p.name} has conquered the known world!`
        : `${p.name} leads civilization into a new age!`,
  });
}
