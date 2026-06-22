/**
 * The single mutation path: state' = applyAction(state, action).
 * Validation guards the door; handlers below assume legal input.
 */
import { produce } from 'immer';
import type { Action, Ctx, GameState, Proposal } from './types';
import { validateAction } from './validate';
import { purchaseCost, tilePurchaseCost } from './selectors';
import { tileIndex } from './hex';
import { pushEvent } from './events';
import { executeMovePath } from './systems/movement';
import { resolveMeleeAttack, resolveRangedAttack } from './systems/combat';
import { foundCity, placeProducedUnit } from './systems/cities';
import { handleEndTurn } from './systems/turn';
import { checkElimination } from './systems/victory';
import { recomputeVisibility } from './map/visibility';
import { applyDeal, applyDenounce, enterWar, pushProposal } from './systems/diplomacy';
import { establishTradeRoute } from './systems/trade';
import { foundPantheon, foundReligion } from './systems/religion';
import { applyEventEffects } from './systems/worldevents';
import { resolveProposal } from './diplomacy-eval';

export class ActionError extends Error {
  constructor(
    public readonly action: Action,
    reason: string,
  ) {
    super(`${action.type}: ${reason}`);
  }
}

export function applyAction(ctx: Ctx, state: GameState, action: Action): GameState {
  const v = validateAction(ctx, state, action);
  if (!v.ok) throw new ActionError(action, v.reason);
  return produce(state, (draft) => handle(ctx, draft, action));
}

function handle(ctx: Ctx, state: GameState, action: Action): void {
  switch (action.type) {
    case 'FOUND_CITY': {
      foundCity(ctx, state, state.units[action.unit]);
      break;
    }

    case 'MOVE_UNIT': {
      const unit = state.units[action.unit];
      if (unit.stance === 'sleep') unit.stance = 'none'; // moving wakes a sleeper
      executeMovePath(ctx, state, unit, action.path);
      checkElimination(ctx, state); // capturing a last settler can end an empire
      break;
    }

    case 'ATTACK': {
      resolveMeleeAttack(ctx, state, state.units[action.unit], action.target);
      break;
    }

    case 'RANGED_ATTACK': {
      resolveRangedAttack(ctx, state, state.units[action.unit], action.target);
      break;
    }

    case 'BUILD_IMPROVEMENT': {
      const unit = state.units[action.unit];
      if (unit.stance === 'sleep') unit.stance = 'none'; // a new order wakes a sleeper
      const imp = ctx.rules.improvements[action.improvement];
      unit.order = { kind: 'build', improvement: imp.id, turnsLeft: imp.turns };
      unit.moves = 0;
      unit.acted = true;
      break;
    }

    case 'BUILD_ROAD': {
      const unit = state.units[action.unit];
      if (unit.stance === 'sleep') unit.stance = 'none'; // a new order wakes a sleeper
      unit.order = { kind: 'road', road: action.road, turnsLeft: ctx.rules.roads[action.road].turns };
      unit.moves = 0;
      unit.acted = true;
      break;
    }

    case 'FORTIFY': {
      const unit = state.units[action.unit];
      unit.stance = 'fortified';
      unit.moves = 0;
      unit.order = null;
      break;
    }

    case 'SKIP_UNIT': {
      const unit = state.units[action.unit];
      if (unit.stance === 'sleep') unit.stance = 'none'; // a new order wakes a sleeper
      unit.moves = 0;
      unit.order = null;
      break;
    }

    case 'SLEEP_UNIT': {
      const unit = state.units[action.unit];
      if (unit.stance === 'sleep') {
        unit.stance = 'none'; // toggle awake
      } else {
        unit.stance = 'sleep';
        unit.moves = 0;
        unit.order = null;
      }
      break;
    }

    case 'DISBAND': {
      const unit = state.units[action.unit];
      delete state.units[unit.id];
      recomputeVisibility(ctx, state, action.player);
      checkElimination(ctx, state);
      // a player who disbands their last hope forfeits the turn to the world
      if (!state.players[state.currentPlayer].alive && state.phase === 'playing') {
        handleEndTurn(ctx, state);
      }
      break;
    }

    case 'SET_PRODUCTION': {
      state.cities[action.city].production.item = action.item;
      break;
    }

    case 'SET_SPECIALISTS': {
      const city = state.cities[action.city];
      if (!city.forcedSpecialists) city.forcedSpecialists = {};
      city.forcedSpecialists[action.specialist] = action.count; // 0 = force zero (kept as an explicit pin)
      break;
    }

    case 'BUY_ITEM': {
      const city = state.cities[action.city];
      const player = state.players[action.player];
      const price = purchaseCost(ctx, action.item);
      if (action.item.kind === 'building') {
        player.gold -= price;
        city.buildings.push(action.item.id);
        if (city.production.item?.kind === 'building' && city.production.item.id === action.item.id) {
          city.production.item = null;
        }
        pushEvent(state, {
          player: action.player,
          type: 'purchase',
          msg: `${ctx.rules.buildings[action.item.id].name} purchased in ${city.name}`,
          q: city.q,
          r: city.r,
        });
      } else {
        const unit = placeProducedUnit(ctx, state, city, action.item.id);
        if (!unit) throw new ActionError(action, 'no room for the new unit');
        player.gold -= price;
        const def = ctx.rules.units[action.item.id];
        if (def.abilities?.includes('foundCity')) city.pop = Math.max(1, city.pop - 1);
        pushEvent(state, {
          player: action.player,
          type: 'purchase',
          msg: `${def.name} mustered in ${city.name}`,
          q: city.q,
          r: city.r,
        });
      }
      break;
    }

    case 'BUY_TILE': {
      const city = state.cities[action.city];
      const player = state.players[action.player];
      player.gold -= tilePurchaseCost(ctx, city, action.tile);
      const idx = tileIndex(action.tile, state.mapW, state.mapH);
      state.tiles[idx].ownerCity = city.id;
      recomputeVisibility(ctx, state, action.player);
      break;
    }

    case 'ESTABLISH_TRADE_ROUTE': {
      establishTradeRoute(ctx, state, state.units[action.unit], state.cities[action.targetCity]);
      break;
    }

    case 'SET_RESEARCH': {
      state.players[action.player].researching = action.tech;
      break;
    }

    case 'DECLARE_WAR': {
      enterWar(ctx, state, action.player, action.target);
      pushEvent(state, {
        player: null,
        type: 'war',
        msg: `${state.players[action.player].name} declares war on ${state.players[action.target].name}!`,
      });
      break;
    }

    case 'PROPOSE_DEAL': {
      const toName = state.players[action.to].name;
      if (state.players[action.to].controller === 'ai') {
        const probe: Proposal = { id: -1, from: action.player, to: action.to, give: action.give, take: action.take, expiresTurn: 0 };
        const res = resolveProposal(ctx, state, probe, state.players[action.player].controller === 'human');
        if (res.kind === 'accept') {
          applyDeal(ctx, state, action.player, action.to, action.give, action.take);
          pushEvent(state, { player: action.player, type: 'dealAccepted', msg: `${toName} accepted your proposal` });
        } else if (res.kind === 'counter') {
          pushProposal(ctx, state, action.to, action.player, res.give, res.take);
          pushEvent(state, { player: action.player, type: 'dealCounter', msg: `${toName} counters your proposal` });
        } else {
          pushEvent(state, { player: action.player, type: 'dealRejected', msg: `${toName} rejected your proposal` });
        }
      } else {
        pushProposal(ctx, state, action.player, action.to, action.give, action.take);
        pushEvent(state, { player: action.to, type: 'dealOffer', msg: `${state.players[action.player].name} proposes a deal` });
      }
      break;
    }

    case 'RESPOND_DEAL': {
      const idx = state.proposals.findIndex((p) => p.id === action.proposal);
      if (idx < 0) break;
      const p = state.proposals[idx];
      state.proposals.splice(idx, 1);
      if (action.accept) {
        applyDeal(ctx, state, p.from, p.to, p.give, p.take);
        pushEvent(state, { player: p.from, type: 'dealAccepted', msg: `${state.players[p.to].name} accepted your proposal` });
      } else {
        pushEvent(state, { player: p.from, type: 'dealRejected', msg: `${state.players[p.to].name} rejected your proposal` });
      }
      break;
    }

    case 'DENOUNCE': {
      applyDenounce(ctx, state, action.player, action.target);
      break;
    }

    case 'FOUND_PANTHEON': {
      foundPantheon(ctx, state, action.player, action.belief);
      break;
    }

    case 'FOUND_RELIGION': {
      foundReligion(ctx, state, action.player, action.name, action.holyCity, action.founderBelief, action.followerBelief);
      break;
    }

    case 'ADOPT_POLICY': {
      const p = state.players[action.player];
      p.policyProgress -= ctx.rules.policies[action.policy].cost;
      p.policies.push(action.policy);
      pushEvent(state, { player: action.player, type: 'policyAdopted', msg: `${p.name} adopts ${ctx.rules.policies[action.policy].name}` });
      break;
    }

    case 'CHOOSE_PROMOTION': {
      const unit = state.units[action.unit];
      if (!unit.promotions) unit.promotions = [];
      unit.promotions.push(action.promotion);
      break;
    }

    case 'EVENT_CHOICE': {
      const pe = state.pendingEvent;
      if (pe) {
        const ev = ctx.rules.events[pe.eventId];
        const choice = ev?.choices[action.choice];
        if (choice) applyEventEffects(ctx, state, action.player, choice.effects);
        if (ev && choice) pushEvent(state, { player: action.player, type: 'eventChronicle', msg: `${state.players[action.player].name}: ${ev.title} — ${choice.text}` });
        state.pendingEvent = null;
      }
      break;
    }

    case 'END_TURN': {
      handleEndTurn(ctx, state);
      break;
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`unhandled action: ${(_exhaustive as Action).type}`);
    }
  }
}
