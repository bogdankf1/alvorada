/**
 * END_TURN: advance to the next living player and run their turn-start
 * processing in the documented order (PLAN.md §3.4). Everything happens
 * inside the reducer — replays reproduce it exactly.
 */
import type { Ctx, GameState, PlayerId } from '../types';
import { sortedIds } from '../types';
import { tileIndex } from '../hex';
import { cityAt, tileOwner, playerCities, empireHappiness } from '../selectors';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';
import { findPath } from '../map/pathfind';
import { executeMovePath } from './movement';
import { processCity } from './cities';
import { checkScoreVictory, checkScienceVictory } from './victory';
import { processObligations } from './diplomacy';
import { processTradeRoutes } from './trade';
import { spreadReligions } from './religion';

export function handleEndTurn(ctx: Ctx, state: GameState): void {
  const current = state.currentPlayer;

  // next living player, wrapping; a wrap ends the round
  let next = current;
  let wrapped = false;
  do {
    next = (next + 1) % state.players.length;
    if (next <= current && !wrapped) wrapped = true;
    if (next === current) break; // sole survivor or everyone else dead
  } while (!state.players[next].alive);

  if (wrapped || next === current) {
    state.turn += 1;
    checkScoreVictory(ctx, state);
    if (state.phase === 'ended') return;
  }

  state.currentPlayer = next;
  beginTurn(ctx, state, next);
}

function healAmount(ctx: Ctx, state: GameState, pid: PlayerId, idx: number, q: number, r: number): number {
  const s = ctx.rules.settings;
  const city = cityAt(state, { q, r });
  if (city && city.owner === pid) return s.healCity;
  const owner = tileOwner(state, idx);
  if (owner === pid) return s.healOwn;
  if (owner === null) return s.healNeutral;
  return 0; // no rest in hostile lands
}

export function beginTurn(ctx: Ctx, state: GameState, pid: PlayerId): void {
  // 1. units: heal, reset moves, tick worker builds, continue marches
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (!u || u.owner !== pid) continue;
    const def = ctx.rules.units[u.def];
    const idx = tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH);

    if (!u.acted && u.hp < 100) {
      u.hp = Math.min(100, u.hp + healAmount(ctx, state, pid, idx, u.q, u.r));
    }
    u.acted = false;
    u.moves = def.moves;

    if (u.order?.kind === 'build') {
      u.moves = 0;
      u.order.turnsLeft -= 1;
      if (u.order.turnsLeft <= 0) {
        const imp = ctx.rules.improvements[u.order.improvement];
        const tile = state.tiles[idx];
        if (imp.clearsFeature) tile.feature = null;
        else {
          tile.improvement = imp.id;
          const res = tile.resource ? ctx.rules.resources[tile.resource] : null;
          if (res && res.kind === 'luxury' && res.improvedBy === imp.id)
            pushEvent(state, { player: pid, type: 'luxuryConnected', msg: `${res.name} now graces your cities` });
        }
        u.order = null;
        pushEvent(state, {
          player: pid,
          type: 'improvement',
          msg: imp.clearsFeature ? 'Land cleared' : `${imp.name} completed`,
          q: u.q,
          r: u.r,
        });
      }
    } else if (u.order?.kind === 'goto') {
      const dest = u.order.path[u.order.path.length - 1];
      const path = findPath(ctx, state, u, dest);
      if (!path) {
        u.order = null;
        pushEvent(state, {
          player: pid,
          type: 'unitBlocked',
          msg: `${def.name} cannot reach its destination`,
          q: u.q,
          r: u.r,
        });
      } else {
        executeMovePath(ctx, state, u, path);
      }
    }
  }

  // 1b. trade routes: expire and pillage before cities tally their yields
  processTradeRoutes(ctx, state, pid);

  // 1c. religion spreads by pressure before cities tally their yields
  spreadReligions(ctx, state, pid);

  // 2. cities: economy in id order; science/gold/faith/culture flow to the player
  let science = 0;
  let gold = 0;
  let faith = 0;
  let culture = 0;
  for (const c of playerCities(state, pid)) {
    const out = processCity(ctx, state, c);
    science += out.science;
    gold += out.gold;
    faith += out.faith;
    culture += out.culture;
  }

  // 3. player: research progress and treasury
  const player = state.players[pid];
  player.gold += gold;
  player.science += science;
  player.faith += faith;
  player.policyProgress += culture;
  if (player.researching) {
    const tech = ctx.rules.techs[player.researching];
    if (player.science >= tech.cost) {
      player.science -= tech.cost;
      player.techs.push(tech.id);
      player.researching = null;
      pushEvent(state, {
        player: pid,
        type: 'techDone',
        msg: `${tech.name} discovered!`,
      });
      checkScienceVictory(ctx, state, pid);
      for (const res of Object.values(ctx.rules.resources)) {
        if (res.revealedBy === tech.id) {
          pushEvent(state, {
            player: pid,
            type: 'resourceRevealed',
            msg: `${res.name} deposits are now visible on the map`,
          });
        }
      }
    }
  }

  // 3b. diplomacy obligations: pay tribute, expire pacts & stale proposals, decay grudges
  processObligations(ctx, state, pid);

  // 3c. happiness mood: warn while the empire is unhappy
  const mood = empireHappiness(ctx, state, pid);
  if (mood.tier === 'veryUnhappy')
    pushEvent(state, { player: pid, type: 'veryUnhappy', msg: `${player.name}'s empire is in turmoil (happiness ${mood.net})` });
  else if (mood.tier === 'unhappy')
    pushEvent(state, { player: pid, type: 'unhappy', msg: `${player.name}'s people are unhappy (happiness ${mood.net})` });

  // 4. fresh eyes
  recomputeVisibility(ctx, state, pid);
}
