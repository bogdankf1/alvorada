/**
 * Religion: faith-funded pantheons and religions that spread by deterministic
 * pressure. Pure mutations inside the reducer — replays reproduce them exactly.
 */
import type { Ctx, GameState, PlayerId, CityId } from '../types';
import { sortedIds } from '../types';
import { hexDistance } from '../hex';
import { playerCities, cityYields } from '../selectors';
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

export function spreadReligions(ctx: Ctx, state: GameState, pid: PlayerId): void {
  const r = ctx.rules.settings.religion;
  const faithIncome = new Map<PlayerId, number>();
  const incomeOf = (owner: PlayerId): number => {
    let v = faithIncome.get(owner);
    if (v === undefined) {
      v = 0;
      for (const c of playerCities(state, owner)) v += cityYields(ctx, state, c).total.faith;
      faithIncome.set(owner, v);
    }
    return v;
  };
  for (const cid of sortedIds(state.cities)) {
    const city = state.cities[cid];
    if (city.owner !== pid) continue;
    const pressure: Record<string, number> = { ...(city.religiousPressure ?? {}) };
    for (const oid of sortedIds(state.cities)) {
      if (oid === cid) continue;
      const other = state.cities[oid];
      if (!other.religion) continue;
      if (hexDistance({ q: city.q, r: city.r }, { q: other.q, r: other.r }) > r.spreadRange) continue;
      const rel = state.religions[other.religion];
      const isHoly = !!rel && rel.holyCity === other.id;
      const emit = r.pressurePerCity + (isHoly ? Math.floor(incomeOf(other.owner) / r.holyCityFaithDiv) : 0);
      pressure[other.religion] = (pressure[other.religion] ?? 0) + emit;
    }
    city.religiousPressure = pressure;
    let best: string | null = null;
    let bestP = 0;
    for (const relId of Object.keys(pressure).sort()) {
      if (pressure[relId] > bestP) { best = relId; bestP = pressure[relId]; }
    }
    if (best && best !== city.religion) {
      city.religion = best;
      pushEvent(state, { player: city.owner, type: 'cityConverted', msg: `${city.name} now follows ${state.religions[best].name}`, q: city.q, r: city.r });
    }
  }
}
