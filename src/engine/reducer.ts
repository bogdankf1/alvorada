/**
 * The single mutation path: state' = applyAction(state, action).
 * Validation guards the door; handlers below assume legal input.
 */
import { produce } from 'immer';
import type { Action, Ctx, GameState } from './types';
import { validateAction } from './validate';
import { purchaseCost } from './selectors';
import { pushEvent } from './events';
import { executeMovePath } from './systems/movement';
import { resolveMeleeAttack, resolveRangedAttack } from './systems/combat';
import { foundCity, placeProducedUnit } from './systems/cities';
import { handleEndTurn } from './systems/turn';
import { checkElimination } from './systems/victory';
import { recomputeVisibility } from './map/visibility';

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
      executeMovePath(ctx, state, state.units[action.unit], action.path);
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
      const imp = ctx.rules.improvements[action.improvement];
      unit.order = { kind: 'build', improvement: imp.id, turnsLeft: imp.turns };
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
      unit.moves = 0;
      unit.order = null;
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

    case 'SET_RESEARCH': {
      state.players[action.player].researching = action.tech;
      break;
    }

    case 'DECLARE_WAR': {
      state.relations[action.player][action.target] = 'war';
      state.relations[action.target][action.player] = 'war';
      pushEvent(state, {
        player: null,
        type: 'war',
        msg: `${state.players[action.player].name} declares war on ${state.players[action.target].name}!`,
      });
      break;
    }

    case 'END_TURN': {
      handleEndTurn(ctx, state);
      break;
    }
  }
}
