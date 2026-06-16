/**
 * Pure read-model over GameState. The single source of truth for derived
 * facts — validation, the reducer, the AI, and the UI all ask these same
 * questions, which is what keeps their answers consistent.
 */
import type { BeliefDef, CivicEffect, PartialYields, PromotionDef, SpecialistType, Yields } from '../data/types';
import { addYields, emptyYields, YIELD_KEYS } from '../data/types';
import type { Axial, City, Ctx, GameState, PlayerId, ProductionItem, TradeRoute, Unit } from './types';
import { sortedIds } from './types';
import { hexDistance, hexesWithin, tileIndex } from './hex';

// --- basic lookups ---

export function tileAtIndex(state: GameState, idx: number) {
  return state.tiles[idx];
}

export function tileAt(state: GameState, a: Axial) {
  const idx = tileIndex(a, state.mapW, state.mapH);
  return idx >= 0 ? state.tiles[idx] : null;
}

export function unitsAt(state: GameState, a: Axial): Unit[] {
  const out: Unit[] = [];
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.q === a.q && u.r === a.r) out.push(u);
  }
  return out;
}

export function isCivilian(ctx: Ctx, u: Unit): boolean {
  return ctx.rules.units[u.def].class === 'civilian';
}

export function militaryAt(ctx: Ctx, state: GameState, a: Axial): Unit | undefined {
  return unitsAt(state, a).find((u) => !isCivilian(ctx, u));
}

export function civilianAt(ctx: Ctx, state: GameState, a: Axial): Unit | undefined {
  return unitsAt(state, a).find((u) => isCivilian(ctx, u));
}

export function cityAt(state: GameState, a: Axial): City | undefined {
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.q === a.q && c.r === a.r) return c;
  }
  return undefined;
}

export function playerUnits(state: GameState, pid: PlayerId): Unit[] {
  return sortedIds(state.units)
    .map((id) => state.units[id])
    .filter((u) => u.owner === pid);
}

export function playerCities(state: GameState, pid: PlayerId): City[] {
  return sortedIds(state.cities)
    .map((id) => state.cities[id])
    .filter((c) => c.owner === pid);
}

export function atWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  return a !== b && state.relations[a][b].status === 'war';
}

export function hasMet(state: GameState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return true;
  if (state.players[a].barbarian || state.players[b].barbarian) return false;
  return state.relations[a][b].met;
}

export function metPlayers(state: GameState, viewer: PlayerId): PlayerId[] {
  return state.players
    .filter((p) => p.alive && !p.barbarian && p.id !== viewer && state.relations[viewer][p.id].met)
    .map((p) => p.id);
}

export function bordersOpenTo(state: GameState, granter: PlayerId, grantee: PlayerId): boolean {
  return state.relations[granter][grantee].openBordersUntil >= state.turn;
}

export function tileOwner(state: GameState, idx: number): PlayerId | null {
  const cityId = state.tiles[idx].ownerCity;
  return cityId === null ? null : (state.cities[cityId]?.owner ?? null);
}

// --- terrain properties ---

export function isWater(ctx: Ctx, terrain: string): boolean {
  return !!ctx.rules.terrains[terrain].water;
}

export function isImpassable(ctx: Ctx, state: GameState, idx: number): boolean {
  const t = state.tiles[idx];
  return !!ctx.rules.elevations[t.elevation].impassable || isWater(ctx, t.terrain);
}

export function moveCostOf(ctx: Ctx, state: GameState, idx: number): number {
  const t = state.tiles[idx];
  const terr = ctx.rules.terrains[t.terrain];
  const elev = ctx.rules.elevations[t.elevation];
  const feat = t.feature ? ctx.rules.features[t.feature] : null;
  return Math.max(1, terr.moveCost + elev.moveCostDelta + (feat?.moveCostDelta ?? 0));
}

export function defenseBonusAt(ctx: Ctx, state: GameState, idx: number): number {
  const t = state.tiles[idx];
  return (
    ctx.rules.terrains[t.terrain].defenseBonus +
    ctx.rules.elevations[t.elevation].defenseBonus +
    (t.feature ? ctx.rules.features[t.feature].defenseBonus : 0)
  );
}

// --- yields ---

/** Yields of one tile as seen/worked by `forPlayer` (resource gated by reveal tech). */
export function tileYields(ctx: Ctx, state: GameState, idx: number, forPlayer: PlayerId): Yields {
  const t = state.tiles[idx];
  const out = emptyYields();
  addYields(out, ctx.rules.terrains[t.terrain].yields);
  addYields(out, ctx.rules.elevations[t.elevation].yields);
  if (t.feature) addYields(out, ctx.rules.features[t.feature].yields);
  if (t.improvement) addYields(out, ctx.rules.improvements[t.improvement].yields);
  if (t.resource) {
    const res = ctx.rules.resources[t.resource];
    if (resourceRevealed(ctx, state, forPlayer, t.resource)) {
      addYields(out, res.yields);
      if (t.improvement && res.improvedBy === t.improvement) addYields(out, res.bonusImproved);
    }
  }
  return out;
}

export function resourceRevealed(
  ctx: Ctx,
  state: GameState,
  player: PlayerId,
  resourceId: string,
): boolean {
  const res = ctx.rules.resources[resourceId];
  return !res.revealedBy || state.players[player].techs.includes(res.revealedBy);
}

export function allocateCitizens(
  ctx: Ctx, state: GameState, city: City,
): { worked: number[]; specialists: Partial<Record<SpecialistType, number>> } {
  const weight = (y: PartialYields) =>
    (y.food ?? 0) * 4 + (y.production ?? 0) * 3 + (y.gold ?? 0) * 2 + (y.science ?? 0) * 2 + (y.culture ?? 0) + (y.faith ?? 0);
  const centerIdx = tileIndex({ q: city.q, r: city.r }, state.mapW, state.mapH);

  const tileCands: { kind: 'tile'; idx: number; value: number }[] = [];
  for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.workRadius)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx < 0 || idx === centerIdx) continue;
    if (state.tiles[idx].ownerCity !== city.id) continue;
    if (ctx.rules.elevations[state.tiles[idx].elevation].impassable) continue;
    tileCands.push({ kind: 'tile', idx, value: weight(tileYields(ctx, state, idx, city.owner)) });
  }

  const TYPE_ORDER: SpecialistType[] = ['scientist', 'merchant', 'artist', 'engineer'];
  const slotCounts: Partial<Record<SpecialistType, number>> = {};
  for (const b of city.buildings) {
    const def = ctx.rules.buildings[b];
    if (def.specialistSlots)
      slotCounts[def.specialistSlots.type] = (slotCounts[def.specialistSlots.type] ?? 0) + def.specialistSlots.count;
  }

  const specialists: Partial<Record<SpecialistType, number>> = {};
  let remaining = city.pop;

  // forced specialists first (clamped to available slots and pop)
  if (city.forcedSpecialists) {
    for (const t of TYPE_ORDER) {
      const want = Math.min(city.forcedSpecialists[t] ?? 0, slotCounts[t] ?? 0, remaining);
      if (want > 0) { specialists[t] = want; slotCounts[t] = (slotCounts[t] ?? 0) - want; remaining -= want; }
    }
  }

  // fill the rest greedily across remaining tiles + open slots
  const slotCands: { kind: 'slot'; type: SpecialistType; value: number }[] = [];
  for (const t of TYPE_ORDER) {
    const val = weight(ctx.rules.specialists[t].yields);
    for (let i = 0; i < (slotCounts[t] ?? 0); i++) slotCands.push({ kind: 'slot', type: t, value: val });
  }
  const rank = (c: { kind: string }) => (c.kind === 'tile' ? 0 : 1);
  const pool = [...tileCands, ...slotCands].sort((a, b) =>
    b.value - a.value ||
    rank(a) - rank(b) ||
    (a.kind === 'tile' && b.kind === 'tile' ? a.idx - b.idx : 0) ||
    (a.kind === 'slot' && b.kind === 'slot' ? TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) : 0),
  );

  const worked: number[] = [];
  for (const cand of pool) {
    if (remaining <= 0) break;
    if (cand.kind === 'tile') worked.push(cand.idx);
    else specialists[cand.type] = (specialists[cand.type] ?? 0) + 1;
    remaining -= 1;
  }
  return { worked, specialists };
}

/** Deterministic auto-assignment: the city's pop works its best owned tiles. */
export function assignWorkedTiles(ctx: Ctx, state: GameState, city: City): number[] {
  return allocateCitizens(ctx, state, city).worked;
}

export interface CityYieldBreakdown {
  total: Yields;
  worked: number[];
  specialists: Partial<Record<SpecialistType, number>>;
}

export function cityYields(ctx: Ctx, state: GameState, city: City): CityYieldBreakdown {
  const s = ctx.rules.settings;
  const total = emptyYields();

  const centerIdx = tileIndex({ q: city.q, r: city.r }, state.mapW, state.mapH);
  const center = tileYields(ctx, state, centerIdx, city.owner);
  center.food = Math.max(center.food, 2);
  center.production = Math.max(center.production, 1);
  addYields(total, center);

  const alloc = allocateCitizens(ctx, state, city);
  for (const idx of alloc.worked) addYields(total, tileYields(ctx, state, idx, city.owner));
  for (const t of Object.keys(alloc.specialists).sort() as SpecialistType[]) {
    const n = alloc.specialists[t] ?? 0;
    const y = ctx.rules.specialists[t].yields;
    for (const k of YIELD_KEYS) total[k] += (y[k] ?? 0) * n;
  }

  for (const b of city.buildings) {
    const def = ctx.rules.buildings[b];
    addYields(total, def.yields);
    if (def.perPop) total[def.perPop.yield] += Math.floor(city.pop / def.perPop.per);
  }
  if (s.sciencePerPopHalf) total.science += Math.floor(city.pop / 2);
  addYields(total, wonderOwnerEffects(ctx, state, city.owner).empire);

  for (const rid of sortedIds(state.tradeRoutes)) {
    const route = state.tradeRoutes[rid];
    if (route.fromCity === city.id) addYields(total, routeOriginYield(ctx, state, route));
    if (route.toCity === city.id && route.kind === 'international') total.gold += s.tradeRoute.destinationGold;
  }

  for (const eff of empireCivicEffects(ctx, state, city.owner)) applyCivicEffect(total, eff, city);
  const fb = followerBelief(ctx, state, city);
  if (fb) applyCivicEffect(total, fb.effect, city);

  if (empireHappiness(ctx, state, city.owner).tier === 'veryUnhappy') {
    total.production = Math.floor((total.production * (100 - s.happiness.veryUnhappyProdPenaltyPct)) / 100);
  }
  return { total, worked: alloc.worked, specialists: alloc.specialists };
}

/** Aggregate the ongoing wonder effects owned by `owner`: empire-wide yields + city-defense aura. */
export function wonderOwnerEffects(
  ctx: Ctx,
  state: GameState,
  owner: PlayerId,
): { empire: Yields; cityDefense: number } {
  const empire = emptyYields();
  let cityDefense = 0;
  for (const wid of Object.keys(state.wondersBuilt).sort()) {
    const city = state.cities[state.wondersBuilt[wid]];
    if (!city || city.owner !== owner) continue;
    const eff = ctx.rules.buildings[wid]?.effect;
    if (!eff) continue;
    if (eff.kind === 'empireYields') addYields(empire, eff.yields);
    else if (eff.kind === 'cityDefense') cityDefense += eff.strength;
  }
  return { empire, cityDefense };
}

export function connectedLuxuries(ctx: Ctx, state: GameState, pid: PlayerId): string[] {
  const set = new Set<string>();
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (!t.resource) continue;
    const res = ctx.rules.resources[t.resource];
    if (res.kind !== 'luxury') continue;
    if (tileOwner(state, i) !== pid) continue;
    if (res.improvedBy && t.improvement === res.improvedBy) set.add(res.id);
  }
  return [...set].sort();
}

export function followerBelief(ctx: Ctx, state: GameState, city: City): BeliefDef | null {
  if (!city.religion) return null;
  const rel = state.religions[city.religion];
  if (!rel) return null;
  return ctx.rules.beliefs[rel.followerBelief] ?? null;
}

export function empireCivicEffects(ctx: Ctx, state: GameState, pid: PlayerId): CivicEffect[] {
  const out: CivicEffect[] = [];
  const p = state.players[pid];
  if (p.pantheon) out.push(ctx.rules.beliefs[p.pantheon].effect);
  const mine = state.religions['rel_' + pid];
  if (mine) out.push(ctx.rules.beliefs[mine.founderBelief].effect);
  for (const id of p.policies) out.push(ctx.rules.policies[id].effect);
  for (const ab of ctx.rules.civs[p.civ].uniqueAbility ?? [])
    if (ab.kind === 'empireCivic') out.push(ab.effect);
  return out;
}

export function influence(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const p = state.players[pid];
  let mult = 100;
  for (const eff of empireCivicEffects(ctx, state, pid)) mult += eff.influenceMult ?? 0;
  let wonders = 0;
  for (const wid of Object.keys(state.wondersBuilt))
    if (state.cities[state.wondersBuilt[wid]]?.owner === pid) wonders++;
  return Math.floor((p.cultureTotal * mult) / 100) + wonders * ctx.rules.settings.victory.culture.perWonder;
}

function applyCivicEffect(total: Yields, eff: CivicEffect, city: City): void {
  if (eff.yields) addYields(total, eff.yields);
  if (eff.perBuilding) {
    const n = city.buildings.filter((b) => b === eff.perBuilding!.building).length;
    if (n) for (const k of YIELD_KEYS) total[k] += (eff.perBuilding.yields[k] ?? 0) * n;
  }
}

export interface HappinessReport {
  happy: number;
  unhappy: number;
  net: number;
  tier: 'content' | 'unhappy' | 'veryUnhappy';
  connectedLuxuries: string[];
}

export function empireHappiness(ctx: Ctx, state: GameState, pid: PlayerId): HappinessReport {
  const h = ctx.rules.settings.happiness;
  const cities = playerCities(state, pid);
  let happy = h.baseEmpire;
  let unhappy = cities.length * h.perCity;
  for (const c of cities) {
    unhappy += c.pop * h.perPop;
    if (c.occupied && !c.buildings.some((b) => ctx.rules.buildings[b].pacifies)) unhappy += h.occupiedExtra;
    for (const b of c.buildings) happy += ctx.rules.buildings[b].happiness ?? 0;
  }
  const lux = connectedLuxuries(ctx, state, pid);
  for (const id of lux) happy += ctx.rules.resources[id].happiness ?? h.luxuryHappiness;
  for (const wid of Object.keys(state.wondersBuilt).sort()) {
    const city = state.cities[state.wondersBuilt[wid]];
    if (!city || city.owner !== pid) continue;
    const eff = ctx.rules.buildings[wid]?.effect;
    if (eff?.kind === 'happiness') happy += eff.amount;
  }
  for (const eff of empireCivicEffects(ctx, state, pid)) happy += eff.happiness ?? 0;
  for (const c of cities) {
    const fb = followerBelief(ctx, state, c);
    if (fb?.effect.happiness) happy += fb.effect.happiness;
  }

  const net = happy - unhappy;
  const tier = net >= 0 ? 'content' : net <= h.veryUnhappyAt ? 'veryUnhappy' : 'unhappy';
  return { happy, unhappy, net, tier, connectedLuxuries: lux };
}

/** Itemized happiness sources for the UI: positive = helping, negative = hurting. Sums to empireHappiness().net. */
export function happinessBreakdown(
  ctx: Ctx,
  state: GameState,
  pid: PlayerId,
): { label: string; amount: number }[] {
  const h = ctx.rules.settings.happiness;
  const cities = playerCities(state, pid);
  const out: { label: string; amount: number }[] = [];

  // helping
  out.push({ label: 'Empire base', amount: h.baseEmpire });
  const lux = connectedLuxuries(ctx, state, pid);
  if (lux.length) {
    const amount = lux.reduce((s, id) => s + (ctx.rules.resources[id].happiness ?? h.luxuryHappiness), 0);
    out.push({ label: `Luxuries: ${lux.map((id) => ctx.rules.resources[id].name).join(', ')}`, amount });
  }
  const byBuilding: Record<string, { name: string; count: number; each: number }> = {};
  for (const c of cities)
    for (const b of c.buildings) {
      const def = ctx.rules.buildings[b];
      if (!def.happiness) continue;
      if (!byBuilding[def.id]) byBuilding[def.id] = { name: def.name, count: 0, each: def.happiness };
      byBuilding[def.id].count += 1;
    }
  for (const id of Object.keys(byBuilding).sort()) {
    const e = byBuilding[id];
    out.push({ label: e.count > 1 ? `${e.name} ×${e.count}` : e.name, amount: e.each * e.count });
  }
  for (const wid of Object.keys(state.wondersBuilt).sort()) {
    const city = state.cities[state.wondersBuilt[wid]];
    if (!city || city.owner !== pid) continue;
    const eff = ctx.rules.buildings[wid]?.effect;
    if (eff?.kind === 'happiness') out.push({ label: ctx.rules.buildings[wid].name, amount: eff.amount });
  }
  const civDef = ctx.rules.civs[state.players[pid].civ];
  for (const ab of civDef.uniqueAbility ?? [])
    if (ab.kind === 'empireCivic' && ab.effect.happiness)
      out.push({ label: civDef.name, amount: ab.effect.happiness });

  // hurting
  if (cities.length) out.push({ label: `Cities ×${cities.length}`, amount: -cities.length * h.perCity });
  const pop = cities.reduce((s, c) => s + c.pop, 0);
  if (pop) out.push({ label: `Population ×${pop}`, amount: -pop * h.perPop });
  const occ = cities.filter(
    (c) => c.occupied && !c.buildings.some((b) => ctx.rules.buildings[b].pacifies),
  ).length;
  if (occ) out.push({ label: `Occupied cities ×${occ}`, amount: -occ * h.occupiedExtra });

  return out;
}

export function growthThreshold(pop: number): number {
  const p = pop - 1;
  return 15 + 8 * p + Math.floor(p * Math.sqrt(p));
}

export function borderThreshold(ctx: Ctx, tilesClaimed: number): number {
  const g = ctx.rules.settings.borderGrowth;
  return g.base + g.linear * tilesClaimed + g.quad * tilesClaimed * tilesClaimed;
}

// --- production / research gating ---

/** Net strategic resource pool: improved owned sources minus living consumers. */
export function strategicAvailability(
  ctx: Ctx,
  state: GameState,
  pid: PlayerId,
  resourceId: string,
): number {
  let sources = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (t.resource !== resourceId) continue;
    if (tileOwner(state, i) !== pid) continue;
    const res = ctx.rules.resources[resourceId];
    if (t.improvement && t.improvement === res.improvedBy) sources++;
  }
  let used = 0;
  for (const u of playerUnits(state, pid)) {
    if (ctx.rules.units[u.def].requiresResource === resourceId) used++;
  }
  return sources - used;
}

/** True if `civId` has a unique unit/building that replaces `baseId` (so the base is hidden for that civ). */
function replacedByUnique(
  defs: Record<string, { civ?: string; replaces?: string }>,
  civId: string,
  baseId: string,
): boolean {
  for (const id of Object.keys(defs)) {
    const d = defs[id];
    if (d.civ === civId && d.replaces === baseId) return true;
  }
  return false;
}

export function canProduce(
  ctx: Ctx,
  state: GameState,
  city: City,
  item: ProductionItem,
): { ok: true } | { ok: false; reason: string } {
  const player = state.players[city.owner];
  if (item.kind === 'unit') {
    const def = ctx.rules.units[item.id];
    if (!def) return { ok: false, reason: 'unknown unit' };
    if (def.civ && def.civ !== player.civ) return { ok: false, reason: 'unique to another civ' };
    if (replacedByUnique(ctx.rules.units, player.civ, item.id)) return { ok: false, reason: 'replaced by a unique unit' };
    if (def.requiresTech && !player.techs.includes(def.requiresTech))
      return { ok: false, reason: `requires ${ctx.rules.techs[def.requiresTech].name}` };
    if (def.requiresResource && strategicAvailability(ctx, state, city.owner, def.requiresResource) <= 0)
      return { ok: false, reason: `requires ${ctx.rules.resources[def.requiresResource].name}` };
    if (def.abilities?.includes('foundCity')) {
      if (empireHappiness(ctx, state, city.owner).net < 0)
        return { ok: false, reason: 'the empire is too unhappy to support settlers' };
      if (city.pop < 2) return { ok: false, reason: 'city too small (needs population 2)' };
    }
    return { ok: true };
  }
  const def = ctx.rules.buildings[item.id];
  if (!def) return { ok: false, reason: 'unknown building' };
  if (def.civ && def.civ !== player.civ) return { ok: false, reason: 'unique to another civ' };
  if (replacedByUnique(ctx.rules.buildings, player.civ, item.id)) return { ok: false, reason: 'replaced by a unique building' };
  if (def.unbuildable) return { ok: false, reason: 'cannot be built' };
  if (city.buildings.includes(item.id)) return { ok: false, reason: 'already built' };
  if (def.requiresTech && !player.techs.includes(def.requiresTech))
    return { ok: false, reason: `requires ${ctx.rules.techs[def.requiresTech].name}` };
  if (def.wonder && state.wondersBuilt[item.id] !== undefined)
    return { ok: false, reason: 'wonder already built elsewhere' };
  return { ok: true };
}

export function productionOptions(ctx: Ctx, state: GameState, city: City): ProductionItem[] {
  const out: ProductionItem[] = [];
  for (const id of Object.keys(ctx.rules.units).sort()) {
    if (canProduce(ctx, state, city, { kind: 'unit', id }).ok) out.push({ kind: 'unit', id });
  }
  for (const id of Object.keys(ctx.rules.buildings).sort()) {
    if (canProduce(ctx, state, city, { kind: 'building', id }).ok)
      out.push({ kind: 'building', id });
  }
  return out;
}

export function itemCost(ctx: Ctx, item: ProductionItem): number {
  return item.kind === 'unit' ? ctx.rules.units[item.id].cost : ctx.rules.buildings[item.id].cost;
}

export function purchaseCost(ctx: Ctx, item: ProductionItem): number {
  return itemCost(ctx, item) * ctx.rules.settings.purchaseMultiplier;
}

export function availableTechs(ctx: Ctx, state: GameState, pid: PlayerId): string[] {
  const player = state.players[pid];
  return Object.keys(ctx.rules.techs)
    .sort()
    .filter(
      (id) =>
        !player.techs.includes(id) &&
        ctx.rules.techs[id].prereqs.every((p) => player.techs.includes(p)),
    );
}

// --- misc ---

export function cityDistanceOk(ctx: Ctx, state: GameState, a: Axial): boolean {
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (hexDistance(a, { q: c.q, r: c.r }) < ctx.rules.settings.cityMinDist) return false;
  }
  return true;
}

export function militaryPower(ctx: Ctx, state: GameState, pid: PlayerId): number {
  let power = 0;
  for (const u of playerUnits(state, pid)) {
    const def = ctx.rules.units[u.def];
    power += Math.max(def.strength, def.ranged?.strength ?? 0);
  }
  return power;
}

export function computeScore(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const w = ctx.rules.settings.score;
  const cities = playerCities(state, pid);
  const pop = cities.reduce((s, c) => s + c.pop, 0);
  const techs = state.players[pid].techs.length;
  return (
    cities.length * w.city +
    pop * w.pop +
    techs * w.tech +
    Math.floor(militaryPower(ctx, state, pid) / w.strengthPer)
  );
}

export function currentEra(ctx: Ctx, state: GameState, pid: PlayerId): string {
  const eras = ctx.rules.eras;
  let best = 0;
  for (const t of state.players[pid].techs) {
    const era = ctx.rules.techs[t]?.era;
    const i = eras.findIndex((e) => e.id === era);
    if (i > best) best = i;
  }
  return eras[best].id;
}

export function tradeOrigin(ctx: Ctx, state: GameState, pid: PlayerId, target: City): City | null {
  const range = ctx.rules.settings.tradeRoute.caravanRange;
  let best: City | null = null;
  let bestDist = Infinity;
  for (const c of playerCities(state, pid)) {
    if (c.id === target.id) continue;
    const d = hexDistance({ q: c.q, r: c.r }, { q: target.q, r: target.r });
    if (d > range) continue;
    if (d < bestDist || (d === bestDist && (best === null || c.id < best.id))) { best = c; bestDist = d; }
  }
  return best;
}

function routeOriginYield(ctx: Ctx, state: GameState, route: TradeRoute): PartialYields {
  const tr = ctx.rules.settings.tradeRoute;
  if (route.kind === 'domestic') return tr.domestic;
  const out: Yields = { ...emptyYields(), ...tr.international };
  if (state.players[route.owner].techs.includes(tr.internationalScienceTech)) out.science += tr.internationalScience;
  const dst = state.cities[route.toCity];
  if (dst) {
    const o = route.owner, d = dst.owner;
    const friends = state.relations[o][d].friends;
    const open = state.relations[o][d].openBordersUntil >= state.turn || state.relations[d][o].openBordersUntil >= state.turn;
    if (friends || open) {
      out.gold = Math.floor((out.gold * (100 + tr.friendshipBonusPct)) / 100);
      out.science = Math.floor((out.science * (100 + tr.friendshipBonusPct)) / 100);
    }
  }
  return out;
}

// --- promotion selectors ---

export function promotionSlots(ctx: Ctx, unit: Unit): number {
  const xp = unit.xp ?? 0;
  return ctx.rules.settings.combat.promotionThresholds.filter((t) => xp >= t).length;
}

export function pendingPromotions(ctx: Ctx, unit: Unit): number {
  return promotionSlots(ctx, unit) - (unit.promotions?.length ?? 0);
}

export function availablePromotions(ctx: Ctx, unit: Unit): PromotionDef[] {
  const cls = ctx.rules.units[unit.def].class;
  const have = new Set(unit.promotions ?? []);
  return Object.values(ctx.rules.promotions)
    .filter((p) => !have.has(p.id) && (!p.classes || p.classes.includes(cls)) && (p.requires ?? []).every((r) => have.has(r)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function unitHasPromoFlag(ctx: Ctx, unit: Unit, flag: 'ignoreZoc' | 'healAlways'): boolean {
  return (unit.promotions ?? []).some((id) => !!ctx.rules.promotions[id]?.effect[flag]);
}

export function promotionMovementBonus(ctx: Ctx, unit: Unit): number {
  let m = 0; for (const id of unit.promotions ?? []) m += ctx.rules.promotions[id]?.effect.movement ?? 0; return m;
}

export function promotionHealBonus(ctx: Ctx, unit: Unit): number {
  let h = 0; for (const id of unit.promotions ?? []) h += ctx.rules.promotions[id]?.effect.healPerTurn ?? 0; return h;
}

export function promotionBonus(
  ctx: Ctx, unit: Unit, kind: 'attack' | 'defense', vs: { unit?: Unit; city?: boolean }, base: number,
): number {
  let pct = 0;
  for (const id of unit.promotions ?? []) {
    const e = ctx.rules.promotions[id]?.effect;
    if (!e) continue;
    if (kind === 'attack') {
      pct += e.attackPct ?? 0;
      if (e.vsClassPct && vs.unit && ctx.rules.units[vs.unit.def].class === e.vsClassPct.class) pct += e.vsClassPct.pct;
      if (e.vsCityPct && vs.city) pct += e.vsCityPct;
    } else {
      pct += e.defensePct ?? 0;
    }
  }
  return Math.floor((base * pct) / 100);
}
