/**
 * Religion: faith-funded pantheons and religions that spread by deterministic
 * pressure. Pure mutations inside the reducer — replays reproduce them exactly.
 */
import type { Ctx, GameState, PlayerId, CityId } from '../types';
import { pushEvent } from '../events';

export function foundPantheon(ctx: Ctx, state: GameState, pid: PlayerId, belief: string): void {
  state.players[pid].faith -= ctx.rules.settings.religion.pantheonCost;
  state.players[pid].pantheon = belief;
  pushEvent(state, { player: pid, type: 'pantheonFounded', msg: `${state.players[pid].name} adopts ${ctx.rules.beliefs[belief].name}` });
}

export function foundReligion(
  ctx: Ctx, state: GameState, pid: PlayerId,
  name: string, holyCity: CityId, founderBelief: string, followerBelief: string,
): void {
  const r = ctx.rules.settings.religion;
  state.players[pid].faith -= r.religionCost;
  const id = 'rel_' + pid;
  state.religions[id] = { id, name, founder: pid, holyCity, founderBelief, followerBelief };
  const city = state.cities[holyCity];
  city.religion = id;
  city.religiousPressure = { ...(city.religiousPressure ?? {}), [id]: r.holyCityBonus };
  pushEvent(state, { player: null, type: 'religionFounded', msg: `${state.players[pid].name} founds ${name}!`, q: city.q, r: city.r });
}
