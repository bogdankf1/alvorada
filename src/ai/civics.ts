/** AI religion + civics: returns at most one founding/adoption action per turn. Pure, deterministic. */
import type { Action, Ctx, GameState, PlayerId } from '../engine/types';
import { playerCities, traitWeights } from '../engine/selectors';

function focusYield(ctx: Ctx, state: GameState, pid: PlayerId): 'faith' | 'science' | 'culture' | 'gold' | null {
  const tw = traitWeights(ctx, state, pid);
  let best: { k: 'faith' | 'science' | 'culture' | 'gold'; v: number } | null = null;
  for (const k of ['faith', 'science', 'culture', 'gold'] as const)
    if (tw[k] > 0 && (!best || tw[k] > best.v)) best = { k, v: tw[k] };
  return best?.k ?? null;
}

function pickBelief(ctx: Ctx, state: GameState, pid: PlayerId, kind: 'pantheon' | 'founder' | 'follower'): string | null {
  const ids = Object.keys(ctx.rules.beliefs).filter((id) => ctx.rules.beliefs[id].kind === kind).sort();
  if (!ids.length) return null;
  const focus = focusYield(ctx, state, pid);
  if (focus) {
    const scored = ids
      .map((id) => ({ id, v: ctx.rules.beliefs[id].effect.yields?.[focus] ?? 0 }))
      .sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
    if (scored[0].v > 0) return scored[0].id;
  }
  return ids[pid % ids.length]; // deterministic fallback
}

function pickPolicy(ctx: Ctx, state: GameState, pid: PlayerId): string | null {
  const p = state.players[pid];
  const affordable = Object.keys(ctx.rules.policies).sort().filter((id) => {
    const pol = ctx.rules.policies[id];
    return !p.policies.includes(id) && pol.prereqs.every((pre) => p.policies.includes(pre)) && p.policyProgress >= pol.cost;
  });
  if (!affordable.length) return null;
  const focus = focusYield(ctx, state, pid);
  if (focus) {
    const preferred = affordable.find((id) => (ctx.rules.policies[id].effect.yields?.[focus] ?? 0) > 0);
    if (preferred) return preferred;
  }
  return affordable[0];
}

export function civicAction(ctx: Ctx, state: GameState, pid: PlayerId): Action | null {
  const p = state.players[pid];
  const r = ctx.rules.settings.religion;
  if (!p.pantheon && p.faith >= r.pantheonCost) {
    const belief = pickBelief(ctx, state, pid, 'pantheon');
    if (belief) return { type: 'FOUND_PANTHEON', player: pid, belief };
  }
  if (
    p.techs.includes(r.religionTech) && !state.religions['rel_' + pid] &&
    Object.keys(state.religions).length < r.maxReligions && p.faith >= r.religionCost
  ) {
    const cap = playerCities(state, pid)[0];
    const fb = pickBelief(ctx, state, pid, 'founder');
    const lb = pickBelief(ctx, state, pid, 'follower');
    if (cap && fb && lb)
      return { type: 'FOUND_RELIGION', player: pid, name: ctx.rules.civs[p.civ].name, holyCity: cap.id, founderBelief: fb, followerBelief: lb };
  }
  const pol = pickPolicy(ctx, state, pid);
  if (pol) return { type: 'ADOPT_POLICY', player: pid, policy: pol };
  return null;
}
