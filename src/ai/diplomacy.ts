/**
 * AI diplomacy POLICY — what an AI chooses to propose. Resolution of offers
 * (accept/reject/counter) lives in the engine (diplomacy-eval); this module only
 * decides initiations, built on the same pure attitude/valuation. Deterministic:
 * sorted iteration, integer math, first sensible action wins.
 */
import type { Action, Ctx, GameState, PlayerId } from '../engine/types';
import { attitude } from '../engine/diplomacy-eval';
import { atWar, hasMet, militaryPower } from '../engine/selectors';

const ORDER = ['hostile', 'wary', 'neutral', 'cordial', 'friendly'] as const;

/** At most one diplomacy action per call (non-spammy). Returns null if nothing fits. */
export function initiateDiplomacy(ctx: Ctx, state: GameState, pid: PlayerId): Action | null {
  const d = ctx.rules.settings.diplomacy;
  const others = state.players
    .filter((p) => p.alive && p.id !== pid && hasMet(state, pid, p.id))
    .map((p) => p.id)
    .sort((a, b) => a - b);

  // 1. sue for peace when losing a war
  for (const o of others) {
    if (!atWar(state, pid, o)) continue;
    const mine = militaryPower(ctx, state, pid);
    const theirs = militaryPower(ctx, state, o);
    if (theirs > mine * 1.4) {
      // offer peace; sweeten with a little gold if we have it and we're really behind
      const sweeten = theirs > mine * 2 ? Math.min(state.players[pid].gold, 50) : 0;
      // avoid re-proposing the same pending offer
      if (!state.proposals.some((pr) => pr.from === pid && pr.to === o)) {
        return {
          type: 'PROPOSE_DEAL', player: pid, to: o,
          give: { gold: sweeten, peace: true }, take: { gold: 0, peace: true },
        };
      }
    }
  }

  // 2. offer friendship to a warm, peaceful neighbour we're not already friends with
  for (const o of others) {
    if (atWar(state, pid, o) || state.relations[pid][o].friends) continue;
    const band = attitude(ctx, state, pid, o).band;
    if (ORDER.indexOf(band) >= ORDER.indexOf(d.minFriendBand)) {
      if (!state.proposals.some((pr) => pr.from === pid && pr.to === o)) {
        return {
          type: 'PROPOSE_DEAL', player: pid, to: o,
          give: { gold: 0, friendship: true }, take: { gold: 0, friendship: true },
        };
      }
    }
  }

  return null;
}
