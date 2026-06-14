/** AI religion + civics: returns at most one founding/adoption action per turn. Pure, deterministic. */
import type { Action, Ctx, GameState, PlayerId } from '../engine/types';
import { playerCities } from '../engine/selectors';

function pickBelief(ctx: Ctx, pid: PlayerId, kind: 'pantheon' | 'founder' | 'follower'): string | null {
  const ids = Object.keys(ctx.rules.beliefs).filter((id) => ctx.rules.beliefs[id].kind === kind).sort();
  return ids.length ? ids[pid % ids.length] : null; // deterministic, varied by player
}

function pickPolicy(ctx: Ctx, state: GameState, pid: PlayerId): string | null {
  const p = state.players[pid];
  for (const id of Object.keys(ctx.rules.policies).sort()) {
    const pol = ctx.rules.policies[id];
    if (p.policies.includes(id)) continue;
    if (!pol.prereqs.every((pre) => p.policies.includes(pre))) continue;
    if (p.policyProgress < pol.cost) continue;
    return id;
  }
  return null;
}

export function civicAction(ctx: Ctx, state: GameState, pid: PlayerId): Action | null {
  const p = state.players[pid];
  const r = ctx.rules.settings.religion;
  if (!p.pantheon && p.faith >= r.pantheonCost) {
    const belief = pickBelief(ctx, pid, 'pantheon');
    if (belief) return { type: 'FOUND_PANTHEON', player: pid, belief };
  }
  if (
    p.techs.includes(r.religionTech) && !state.religions['rel_' + pid] &&
    Object.keys(state.religions).length < r.maxReligions && p.faith >= r.religionCost
  ) {
    const cap = playerCities(state, pid)[0];
    const fb = pickBelief(ctx, pid, 'founder');
    const lb = pickBelief(ctx, pid, 'follower');
    if (cap && fb && lb)
      return { type: 'FOUND_RELIGION', player: pid, name: ctx.rules.civs[p.civ].name, holyCity: cap.id, founderBelief: fb, followerBelief: lb };
  }
  const pol = pickPolicy(ctx, state, pid);
  if (pol) return { type: 'ADOPT_POLICY', player: pid, policy: pol };
  return null;
}
