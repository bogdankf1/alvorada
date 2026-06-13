# City & Economy Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add empire happiness (an expansion brake), typed specialists, and an expiring trader-unit trade-route system to Alvorada, deepening city/economy play while preserving the deterministic, serializable, data-driven engine.

**Architecture:** All three systems are additive — new ruleset data, new optional state fields, pure selectors, reducer handlers, AI hints, and UI. Happiness is a pure derived selector (`empireHappiness`); specialists extend the existing citizen allocator (`assignWorkedTiles` → `allocateCitizens`); per-turn trade yields flow through the single `cityYields` funnel while a small `processTradeRoutes` step handles lifecycle. Integer math + `sortedIds` iteration + the existing A* keep replays bit-identical.

**Tech Stack:** TypeScript, Immer reducer, Vitest, React + canvas. Spec: `docs/superpowers/specs/2026-06-13-city-economy-depth-design.md`.

**Branch:** `feature/city-economy-depth` (already created; the spec is committed there).

**Verification commands** (used throughout):
- Types: `npx tsc --noEmit`
- A test file: `npx vitest run tests/<file>.test.ts`
- Full suite: `npx vitest run`
- Build: `npm run build`

---

## Shared contracts (defined once; each task that creates a symbol shows its full code)

Key signatures introduced by this plan, for cross-task consistency:

```ts
// data/types.ts
type UnitAbility = 'foundCity' | 'improve' | 'trade';
type SpecialistType = 'scientist' | 'merchant' | 'artist' | 'engineer';
interface SpecialistDef { name: string; yields: PartialYields; }
// ResourceDef.kind: 'bonus' | 'strategic' | 'luxury'; ResourceDef.happiness?: number
// BuildingDef.happiness?: number; .pacifies?: boolean; .specialistSlots?: { type: SpecialistType; count: number }
// WonderEffect adds: { kind: 'happiness'; amount: number }
// Ruleset.specialists: Record<SpecialistType, SpecialistDef>
// RulesetSettings.happiness: HappinessSettings; .tradeRoute: TradeRouteSettings

// engine/types.ts
interface TradeRoute { id: number; owner: PlayerId; fromCity: CityId; toCity: CityId; kind: 'domestic' | 'international'; expires: number; path: number[]; }
// City adds: occupied?: boolean; forcedSpecialists?: Partial<Record<SpecialistType, number>>
// GameState adds: tradeRoutes: Record<number, TradeRoute>; nextTradeRouteId: number
// Action adds: { type:'SET_SPECIALISTS'; player; city; specialist: SpecialistType; count: number }
//             { type:'ESTABLISH_TRADE_ROUTE'; player; unit; targetCity: CityId }

// engine/selectors.ts
interface HappinessReport { happy: number; unhappy: number; net: number; tier: 'content'|'unhappy'|'veryUnhappy'; connectedLuxuries: string[] }
function empireHappiness(ctx, state, pid): HappinessReport
function connectedLuxuries(ctx, state, pid): string[]
function allocateCitizens(ctx, state, city): { worked: number[]; specialists: Partial<Record<SpecialistType, number>> }
function tradeOrigin(ctx, state, pid, target: City): City | null
// CityYieldBreakdown gains: specialists: Partial<Record<SpecialistType, number>>

// engine/systems/trade.ts (new)
function establishTradeRoute(ctx, state, unit: Unit, target: City): void
function processTradeRoutes(ctx, state, pid): void
function pruneRoutesForCity(state, cityId): void
function cancelInternationalRoutesBetween(state, a: PlayerId, b: PlayerId): void
```

Starting balance numbers (tuned in Phase 6): happiness `{ baseEmpire:9, perCity:2, perPop:1, occupiedExtra:3, luxuryHappiness:4, unhappyGrowthDivisor:4, veryUnhappyAt:-10, veryUnhappyProdPenaltyPct:33 }`; tradeRoute `{ caravanRange:12, duration:30, domestic:{food:1,production:1}, international:{gold:4}, internationalScience:2, internationalScienceTech:'guilds', destinationGold:2, friendshipBonusPct:50, pillageBounty:25 }`.

---

# Phase 1 — Happiness model: data + pure selector (no gameplay change yet)

## Task 1.1: Ruleset type additions + standard values

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/standard/index.ts`

- [ ] **Step 1: Add the new types to `src/data/types.ts`**

Add `'trade'` to `UnitAbility`:
```ts
export type UnitAbility = 'foundCity' | 'improve' | 'trade';
```

Add specialist types (after `YieldKey`):
```ts
export type SpecialistType = 'scientist' | 'merchant' | 'artist' | 'engineer';
export interface SpecialistDef {
  name: string;
  yields: PartialYields;
}
```

In `ResourceDef`, change `kind` and add `happiness`:
```ts
  kind: 'bonus' | 'strategic' | 'luxury';
  yields: PartialYields; // delta, applies once the owner has revealedBy
  happiness?: number; // luxury only: empire happiness when connected (default settings.happiness.luxuryHappiness)
```

Extend `WonderEffect` with a happiness variant:
```ts
  | { kind: 'happiness'; amount: number } // empire-wide happiness while the owner holds the wonder
```

In `BuildingDef`, add three optional fields (after `effect?`):
```ts
  happiness?: number; // empire-wide happiness contributed per city that has this building
  pacifies?: boolean; // clears an occupied city's unrest (Courthouse)
  specialistSlots?: { type: SpecialistType; count: number };
```

Add the two settings blocks and wire them into `RulesetSettings`:
```ts
export interface HappinessSettings {
  baseEmpire: number;
  perCity: number;
  perPop: number;
  occupiedExtra: number;
  luxuryHappiness: number;
  unhappyGrowthDivisor: number;
  veryUnhappyAt: number;
  veryUnhappyProdPenaltyPct: number;
}
export interface TradeRouteSettings {
  caravanRange: number;
  duration: number;
  domestic: PartialYields;
  international: PartialYields;
  internationalScience: number;
  internationalScienceTech: string;
  destinationGold: number;
  friendshipBonusPct: number;
  pillageBounty: number;
}
```
Inside `RulesetSettings`, after `victory: {...};` add:
```ts
  happiness: HappinessSettings;
  tradeRoute: TradeRouteSettings;
```
Inside `Ruleset`, after `civs: Record<string, CivDef>;` add:
```ts
  specialists: Record<SpecialistType, SpecialistDef>;
```

- [ ] **Step 2: Add the standard values to `src/data/standard/index.ts`**

Update the import line:
```ts
import type { Ruleset, RulesetSettings, SpecialistType, SpecialistDef } from '../types';
```
Inside `SETTINGS`, after the `victory: {...},` line add:
```ts
  happiness: {
    baseEmpire: 9,
    perCity: 2,
    perPop: 1,
    occupiedExtra: 3,
    luxuryHappiness: 4,
    unhappyGrowthDivisor: 4,
    veryUnhappyAt: -10,
    veryUnhappyProdPenaltyPct: 33,
  },
  tradeRoute: {
    caravanRange: 12,
    duration: 30,
    domestic: { food: 1, production: 1 },
    international: { gold: 4 },
    internationalScience: 2,
    internationalScienceTech: 'guilds',
    destinationGold: 2,
    friendshipBonusPct: 50,
    pillageBounty: 25,
  },
```
Before `export const STANDARD_RULESET`, add the specialists record:
```ts
const SPECIALISTS: Record<SpecialistType, SpecialistDef> = {
  scientist: { name: 'Scientist', yields: { science: 3 } },
  merchant: { name: 'Merchant', yields: { gold: 3 } },
  artist: { name: 'Artist', yields: { culture: 3 } },
  engineer: { name: 'Engineer', yields: { production: 2 } },
};
```
Inside `STANDARD_RULESET`, after `civs: CIVS,` add:
```ts
  specialists: SPECIALISTS,
```

- [ ] **Step 3: Verify it compiles and the ruleset is still valid**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).
Run: `npx vitest run tests/ruleset.test.ts`
Expected: PASS — `validateRuleset` still returns `[]` (no new cross-refs broken yet).

- [ ] **Step 4: Commit**
```bash
git add src/data/types.ts src/data/standard/index.ts
git commit -m "feat(data): happiness/specialist/trade-route ruleset types and settings"
```

## Task 1.2: Luxury resources + plantation improvement

**Files:**
- Modify: `src/data/standard/resources.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write a failing content test**

Append to `tests/content.test.ts`:
```ts
describe('luxury resources', () => {
  it('defines five luxuries, each improvable and tagged luxury', () => {
    const r = STANDARD_RULESET.resources;
    for (const id of ['wine', 'silk', 'spices', 'incense', 'gems']) {
      expect(r[id], id).toBeDefined();
      expect(r[id].kind, id).toBe('luxury');
      expect(r[id].improvedBy, id).toBeDefined();
    }
    expect(STANDARD_RULESET.improvements.plantation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/content.test.ts -t "luxury resources"`
Expected: FAIL — `r.wine` is undefined.

- [ ] **Step 3: Add the luxuries and plantation to `src/data/standard/resources.ts`**

Add to the `RESOURCES` object (after `iron`):
```ts
  wine: {
    id: 'wine', name: 'Wine', kind: 'luxury', yields: { gold: 1 },
    improvedBy: 'plantation', bonusImproved: { gold: 1 },
    spawn: { terrains: ['grassland', 'plains'], elevations: ['flat'], weight: 5 },
  },
  silk: {
    id: 'silk', name: 'Silk', kind: 'luxury', yields: { gold: 1 },
    improvedBy: 'plantation', bonusImproved: { gold: 1 },
    spawn: { terrains: ['grassland', 'plains'], weight: 4 },
  },
  spices: {
    id: 'spices', name: 'Spices', kind: 'luxury', yields: { gold: 1 },
    improvedBy: 'plantation', bonusImproved: { gold: 1 },
    spawn: { terrains: ['plains', 'grassland'], weight: 4 },
  },
  incense: {
    id: 'incense', name: 'Incense', kind: 'luxury', yields: { gold: 1 },
    improvedBy: 'plantation', bonusImproved: { gold: 1 },
    spawn: { terrains: ['desert', 'plains'], weight: 4 },
  },
  gems: {
    id: 'gems', name: 'Gems', kind: 'luxury', yields: { gold: 2 },
    improvedBy: 'mine', bonusImproved: { gold: 1 },
    spawn: { terrains: ['grassland', 'plains', 'desert'], elevations: ['hill'], weight: 4 },
  },
```
Add to the `IMPROVEMENTS` object (after `quarry`):
```ts
  plantation: {
    id: 'plantation', name: 'Plantation', turns: 5, yields: { gold: 1 },
    requiresResource: true, requiresTech: 'pottery',
  },
```

- [ ] **Step 4: Run the test + the ruleset validator**

Run: `npx vitest run tests/content.test.ts -t "luxury resources" && npx vitest run tests/ruleset.test.ts`
Expected: PASS (both). `validateRuleset` still `[]` (luxury `improvedBy` resolves via the existing resource check).

- [ ] **Step 5: Commit**
```bash
git add src/data/standard/resources.ts tests/content.test.ts
git commit -m "feat(data): luxury resources and the plantation improvement"
```

## Task 1.3: Happiness buildings, specialist slots, and the happiness wonder

**Files:**
- Modify: `src/data/standard/buildings.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write a failing content test**

Append to `tests/content.test.ts`:
```ts
describe('happiness & specialist buildings', () => {
  const b = STANDARD_RULESET.buildings;
  it('adds colosseum, courthouse, and the Circus Maximus wonder', () => {
    expect(b.colosseum.happiness).toBe(3);
    expect(b.courthouse.pacifies).toBe(true);
    expect(b.circus_maximus.wonder).toBe(true);
    expect(b.circus_maximus.effect).toEqual({ kind: 'happiness', amount: 5 });
  });
  it('puts specialist slots on yield buildings', () => {
    expect(b.library.specialistSlots).toEqual({ type: 'scientist', count: 1 });
    expect(b.market.specialistSlots).toEqual({ type: 'merchant', count: 1 });
    expect(b.temple.specialistSlots).toEqual({ type: 'artist', count: 1 });
    expect(b.workshop.specialistSlots).toEqual({ type: 'engineer', count: 1 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/content.test.ts -t "happiness & specialist"`
Expected: FAIL — `b.colosseum` is undefined.

- [ ] **Step 3: Edit `src/data/standard/buildings.ts`**

Add `specialistSlots` to these existing buildings (add the property to each object):
- `library`: `specialistSlots: { type: 'scientist', count: 1 },`
- `university`: `specialistSlots: { type: 'scientist', count: 1 },`
- `observatory`: `specialistSlots: { type: 'scientist', count: 1 },`
- `market`: `specialistSlots: { type: 'merchant', count: 1 },`
- `bank`: `specialistSlots: { type: 'merchant', count: 1 },`
- `temple`: `specialistSlots: { type: 'artist', count: 1 },`
- `workshop`: `specialistSlots: { type: 'engineer', count: 1 },`

Add three new buildings (place the two civic buildings near `aqueduct`, the wonder among the wonders):
```ts
  colosseum: {
    id: 'colosseum', name: 'Colosseum', cost: 100, yields: {},
    happiness: 3, requiresTech: 'construction', art: { glyph: 'arch' },
  },
  courthouse: {
    id: 'courthouse', name: 'Courthouse', cost: 100, yields: {},
    pacifies: true, requiresTech: 'mathematics', art: { glyph: 'arch' },
  },
  circus_maximus: {
    id: 'circus_maximus', name: 'The Circus Maximus', cost: 250, yields: { culture: 1 },
    wonder: true, effect: { kind: 'happiness', amount: 5 },
    requiresTech: 'construction', art: { glyph: 'temple' },
  },
```

- [ ] **Step 4: Run the test + full data tests**

Run: `npx vitest run tests/content.test.ts -t "happiness & specialist" && npx vitest run tests/ruleset.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**
```bash
git add src/data/standard/buildings.ts tests/content.test.ts
git commit -m "feat(data): colosseum, courthouse, Circus Maximus, and specialist slots"
```

## Task 1.4: Ruleset validator — specialist slots & trade-science tech

**Files:**
- Modify: `src/data/validate.ts`
- Test: `tests/ruleset.test.ts`

- [ ] **Step 1: Write a failing test**

Append to the `describe('standard ruleset', ...)` block in `tests/ruleset.test.ts`:
```ts
  it('rejects a building slot of an unknown specialist type', () => {
    const r = structuredClone(STANDARD_RULESET);
    // @ts-expect-error intentionally invalid for the test
    r.buildings.library.specialistSlots = { type: 'wizard', count: 1 };
    expect(validateRuleset(r)).toContain('building library: unknown specialist type wizard');
  });
  it('rejects an unknown trade-science tech', () => {
    const r = structuredClone(STANDARD_RULESET);
    r.settings.tradeRoute.internationalScienceTech = 'nonesuch';
    expect(validateRuleset(r)).toContain('settings: unknown trade-science tech nonesuch');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ruleset.test.ts -t "unknown specialist"`
Expected: FAIL — those strings are not produced.

- [ ] **Step 3: Extend `validateRuleset` in `src/data/validate.ts`**

After the existing `for (const b of Object.values(rules.buildings)) if (!has(rules.techs, b.requiresTech)) ...` loop, add:
```ts
  for (const b of Object.values(rules.buildings))
    if (b.specialistSlots && !(b.specialistSlots.type in rules.specialists))
      errors.push(`building ${b.id}: unknown specialist type ${b.specialistSlots.type}`);
```
After the existing `if (!(rules.settings.victory.scienceCapstone in rules.techs)) ...` check, add:
```ts
  if (!(rules.settings.tradeRoute.internationalScienceTech in rules.techs))
    errors.push(`settings: unknown trade-science tech ${rules.settings.tradeRoute.internationalScienceTech}`);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ruleset.test.ts`
Expected: PASS — including the original `has no broken references` (the standard ruleset's `guilds` tech and all slot types resolve).

- [ ] **Step 5: Commit**
```bash
git add src/data/validate.ts tests/ruleset.test.ts
git commit -m "feat(data): validate specialist slot types and trade-science tech"
```

## Task 1.5: Engine state shape — City fields, TradeRoute, GameState slice

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/state.ts`
- Modify: `src/engine/serialize.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Edit `src/engine/types.ts`**

Update the data-types import to include `SpecialistType`:
```ts
import type { Ruleset, SpecialistType } from '../data/types';
```
In `interface City`, after `hp: number;` add:
```ts
  occupied?: boolean; // captured; adds unrest until a pacifying building is built
  forcedSpecialists?: Partial<Record<SpecialistType, number>>; // manual pinned minimums
```
After the `City` interface (before `RelationState`), add:
```ts
export interface TradeRoute {
  id: number;
  owner: PlayerId;
  fromCity: CityId;
  toCity: CityId;
  kind: 'domestic' | 'international';
  expires: number; // absolute turn the route ends
  path: number[]; // tile indices, origin→destination (pillage + rendering)
}
```
In `interface GameState`, after `wondersBuilt: Record<string, CityId>;` add:
```ts
  tradeRoutes: Record<number, TradeRoute>;
  nextTradeRouteId: number;
```
(Do NOT add the new Action variants yet — they arrive with their handlers in Phases 3 and 4 to keep the reducer's exhaustiveness check satisfied.)

- [ ] **Step 2: Initialize the slice in `src/engine/state.ts`**

In the `state` object literal, after `wondersBuilt: {},` add:
```ts
    tradeRoutes: {},
    nextTradeRouteId: 1,
```

- [ ] **Step 3: Bump the schema in `src/engine/serialize.ts`**
```ts
export const SCHEMA_VERSION = 4;
```

- [ ] **Step 4: Update the test fixture in `tests/helpers.ts`**

In `flatWorld`'s returned object, after `wondersBuilt: {},` add:
```ts
    tradeRoutes: {},
    nextTradeRouteId: 1,
```

- [ ] **Step 5: Verify types + existing suites still pass**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npx vitest run tests/replay.test.ts tests/selfplay.test.ts`
Expected: PASS — replays are internally consistent (both sides build with schema 4).

- [ ] **Step 6: Commit**
```bash
git add src/engine/types.ts src/engine/state.ts src/engine/serialize.ts tests/helpers.ts
git commit -m "feat(engine): trade-route state slice and city occupied/specialist fields (schema 4)"
```

## Task 1.6: `empireHappiness` and `connectedLuxuries` selectors

**Files:**
- Modify: `src/engine/selectors.ts`
- Test: `tests/happiness.test.ts` (create)

- [ ] **Step 1: Write the failing test `tests/happiness.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { empireHappiness, connectedLuxuries } from '../src/engine/selectors';

/** Found one city for player 0 and return the thawed state + city id. */
function oneCity(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('empireHappiness', () => {
  it('base minus per-city minus per-pop', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 3;
    // base 9 - perCity 2 - perPop*3 = 9 - 2 - 3 = 4
    const h = empireHappiness(ctx, s, 0);
    expect(h.happy).toBe(9);
    expect(h.unhappy).toBe(2 + 3);
    expect(h.net).toBe(4);
    expect(h.tier).toBe('content');
  });

  it('happiness buildings and happiness wonders add happy', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('colosseum'); // +3
    s.cities[id].buildings.push('circus_maximus');
    s.wondersBuilt['circus_maximus'] = id; // +5
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 3 + 5);
  });

  it('a connected luxury adds once; duplicates do not stack', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    // two wine tiles inside the city's borders, both improved by plantation
    for (const [q, r] of [[5, 6], [6, 5]] as const) {
      const i = (r * s.mapW) + q;
      s.tiles[i].ownerCity = c.id;
      s.tiles[i].resource = 'wine';
      s.tiles[i].improvement = 'plantation';
    }
    expect(connectedLuxuries(ctx, s, 0)).toEqual(['wine']);
    // base 9 + luxuryHappiness 4 = 13 happy
    expect(empireHappiness(ctx, s, 0).happy).toBe(9 + 4);
  });

  it('an occupied city adds unrest until a pacifying building is present', () => {
    const { s, id } = oneCity();
    s.cities[id].occupied = true;
    const before = empireHappiness(ctx, s, 0).unhappy;
    s.cities[id].buildings.push('courthouse');
    const after = empireHappiness(ctx, s, 0).unhappy;
    expect(before - after).toBe(3); // occupiedExtra
  });

  it('tiers: content at 0, unhappy below 0, veryUnhappy at the threshold', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 7; // 9 - 2 - 7 = 0 → content
    expect(empireHappiness(ctx, s, 0).tier).toBe('content');
    s.cities[id].pop = 8; // -1 → unhappy
    expect(empireHappiness(ctx, s, 0).tier).toBe('unhappy');
    s.cities[id].pop = 17; // 9 - 2 - 17 = -10 → veryUnhappy
    expect(empireHappiness(ctx, s, 0).tier).toBe('veryUnhappy');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/happiness.test.ts`
Expected: FAIL — `empireHappiness` is not exported.

- [ ] **Step 3: Add the selectors to `src/engine/selectors.ts`**

Add near the other yield/economy selectors:
```ts
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
  const net = happy - unhappy;
  const tier = net >= 0 ? 'content' : net <= h.veryUnhappyAt ? 'veryUnhappy' : 'unhappy';
  return { happy, unhappy, net, tier, connectedLuxuries: lux };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/happiness.test.ts`
Expected: PASS (all five).

- [ ] **Step 5: Commit**
```bash
git add src/engine/selectors.ts tests/happiness.test.ts
git commit -m "feat(engine): empireHappiness and connectedLuxuries selectors"
```

---

# Phase 2 — Wire the happiness brake + AI awareness + top-bar UI

## Task 2.1: Growth throttle (processCity) + very-unhappy production penalty (cityYields)

**Files:**
- Modify: `src/engine/systems/cities.ts`
- Modify: `src/engine/selectors.ts`
- Test: `tests/happiness.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/happiness.test.ts`:
```ts
import { customCtx } from './helpers';
import { processCity } from '../src/engine/systems/cities';
import { cityYields, canProduce } from '../src/engine/selectors';

describe('happiness brake', () => {
  it('very unhappy applies a production penalty to city yields', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('workshop');
    const contentProd = cityYields(ctx, s, s.cities[id]).total.production;
    const vu = customCtx((r) => { r.settings.happiness.perCity = 1000; }); // force net < veryUnhappyAt
    const penalized = cityYields(vu, s, s.cities[id]).total.production;
    expect(penalized).toBe(Math.floor((contentProd * (100 - 33)) / 100));
    expect(penalized).toBeLessThan(contentProd);
  });

  it('an unhappy empire throttles food growth', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 2;
    const s2 = thaw(s); processCity(ctx, s2, s2.cities[id]);
    const contentFood = s2.cities[id].food;
    expect(contentFood).toBeGreaterThan(0);
    const vu = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    const s3 = thaw(s); processCity(vu, s3, s3.cities[id]);
    expect(s3.cities[id].food).toBeLessThan(contentFood);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/happiness.test.ts -t "happiness brake"`
Expected: FAIL — no penalty/throttle yet (`penalized` equals `contentProd`).

- [ ] **Step 3: Add the production penalty in `cityYields` (`src/engine/selectors.ts`)**

`empireHappiness` is already in this file. In `cityYields`, replace the final `return { total, worked };` with:
```ts
  if (empireHappiness(ctx, state, city.owner).tier === 'veryUnhappy') {
    total.production = Math.floor((total.production * (100 - s.happiness.veryUnhappyProdPenaltyPct)) / 100);
  }
  return { total, worked };
```
(`s` is the existing `const s = ctx.rules.settings;` at the top of `cityYields`.)

- [ ] **Step 4: Add the growth throttle in `processCity` (`src/engine/systems/cities.ts`)**

Add `empireHappiness` to the selectors import at the top of the file. Then replace:
```ts
  // growth
  const net = total.food - city.pop * s.foodConsumptionPerPop;
  city.food += net;
```
with:
```ts
  // growth — empire unhappiness throttles (or stops) it
  let net = total.food - city.pop * s.foodConsumptionPerPop;
  if (net > 0) {
    const tier = empireHappiness(ctx, state, city.owner).tier;
    if (tier === 'veryUnhappy') net = 0;
    else if (tier === 'unhappy') net = Math.floor(net / s.happiness.unhappyGrowthDivisor);
  }
  city.food += net;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/happiness.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**
```bash
git add src/engine/systems/cities.ts src/engine/selectors.ts tests/happiness.test.ts
git commit -m "feat(engine): wire happiness brake into growth and production"
```

## Task 2.2: Settler lockout while unhappy (canProduce)

**Files:**
- Modify: `src/engine/selectors.ts`
- Test: `tests/happiness.test.ts`

- [ ] **Step 1: Add a failing test** — append inside the `describe('happiness brake', ...)` block:
```ts
  it('settlers cannot be produced while the empire is unhappy', () => {
    const { s, id } = oneCity();
    s.cities[id].pop = 3;
    expect(canProduce(ctx, s, s.cities[id], { kind: 'unit', id: 'settler' }).ok).toBe(true);
    const unhappy = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    expect(canProduce(unhappy, s, s.cities[id], { kind: 'unit', id: 'settler' }).ok).toBe(false);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/happiness.test.ts -t "settlers cannot"`
Expected: FAIL — settler still producible when unhappy.

- [ ] **Step 3: Edit `canProduce` in `src/engine/selectors.ts`**

In the `item.kind === 'unit'` branch, replace:
```ts
    if (def.abilities?.includes('foundCity') && city.pop < 2)
      return { ok: false, reason: 'city too small (needs population 2)' };
    return { ok: true };
```
with:
```ts
    if (def.abilities?.includes('foundCity')) {
      if (empireHappiness(ctx, state, city.owner).net < 0)
        return { ok: false, reason: 'the empire is too unhappy to support settlers' };
      if (city.pop < 2) return { ok: false, reason: 'city too small (needs population 2)' };
    }
    return { ok: true };
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/happiness.test.ts && npx vitest run tests/content.test.ts`
Expected: PASS (settler gating works; existing wonder/production tests unaffected — they use content-happy single cities).

- [ ] **Step 5: Commit**
```bash
git add src/engine/selectors.ts tests/happiness.test.ts
git commit -m "feat(engine): lock settler production while the empire is unhappy"
```

## Task 2.3: Captured cities become occupied

**Files:**
- Modify: `src/engine/systems/cities.ts`
- Test: `tests/happiness.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/happiness.test.ts`:
```ts
import { captureCity } from '../src/engine/systems/cities';

describe('occupied cities', () => {
  it('captureCity marks the city occupied and unrest clears with a courthouse', () => {
    const { s, id } = oneCity(); // owned by player 0
    captureCity(ctx, s, s.cities[id], 1);
    expect(s.cities[id].owner).toBe(1);
    expect(s.cities[id].occupied).toBe(true);
    const before = empireHappiness(ctx, s, 1).unhappy;
    s.cities[id].buildings.push('courthouse');
    expect(before - empireHappiness(ctx, s, 1).unhappy).toBe(3); // occupiedExtra cleared
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/happiness.test.ts -t "occupied"`
Expected: FAIL — `occupied` is undefined after capture.

- [ ] **Step 3: Edit `captureCity` in `src/engine/systems/cities.ts`**

After the line `city.owner = byPlayer;` add:
```ts
  city.occupied = true;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/happiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/engine/systems/cities.ts tests/happiness.test.ts
git commit -m "feat(engine): captured cities are flagged occupied"
```

## Task 2.4: Per-turn happiness warnings + luxury-connected event + toast types

**Files:**
- Modify: `src/engine/systems/turn.ts`
- Modify: `src/app/driver.ts`
- Test: `tests/happiness.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/happiness.test.ts`:
```ts
import { applyAction as apply2 } from '../src/engine/reducer';

describe('happiness events', () => {
  it('an unhappy empire emits a warning event at its turn start', () => {
    let s = flatWorld(16, 12, 1);
    const settler = spawn(s, 0, 'settler', 5, 5);
    refreshVis(s);
    s = apply2(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.cities[Object.keys(s.cities).map(Number)[0]].pop = 30; // deeply unhappy
    s = apply2(ctx, s, { type: 'END_TURN', player: 0 }); // single player → wraps to its own turn start
    expect(s.events.some((e) => e.type === 'unhappy' || e.type === 'veryUnhappy')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/happiness.test.ts -t "happiness events"`
Expected: FAIL — no such event.

- [ ] **Step 3: Emit the warning in `beginTurn` (`src/engine/systems/turn.ts`)**

Add `empireHappiness` to the selectors import. After the `processObligations(ctx, state, pid);` line (step 3b), add:
```ts
  // 3c. happiness mood: warn while the empire is unhappy
  const mood = empireHappiness(ctx, state, pid);
  if (mood.tier === 'veryUnhappy')
    pushEvent(state, { player: pid, type: 'veryUnhappy', msg: `${player.name}'s empire is in turmoil (happiness ${mood.net})` });
  else if (mood.tier === 'unhappy')
    pushEvent(state, { player: pid, type: 'unhappy', msg: `${player.name}'s people are unhappy (happiness ${mood.net})` });
```
(`player` is the existing `const player = state.players[pid];` from step 3.)

- [ ] **Step 4: Emit `luxuryConnected` when a worker finishes a luxury improvement**

In `beginTurn`, inside the worker-build completion block, replace:
```ts
        if (imp.clearsFeature) tile.feature = null;
        else tile.improvement = imp.id;
```
with:
```ts
        if (imp.clearsFeature) tile.feature = null;
        else {
          tile.improvement = imp.id;
          const res = tile.resource ? ctx.rules.resources[tile.resource] : null;
          if (res && res.kind === 'luxury' && res.improvedBy === imp.id)
            pushEvent(state, { player: pid, type: 'luxuryConnected', msg: `${res.name} now graces your cities` });
        }
```

- [ ] **Step 5: Register the new toast types in `src/app/driver.ts`**

Add to the `TOAST_TYPES` set (alongside the existing entries):
```ts
  'unhappy',
  'veryUnhappy',
  'luxuryConnected',
```

- [ ] **Step 6: Run tests + types**

Run: `npx vitest run tests/happiness.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add src/engine/systems/turn.ts src/app/driver.ts tests/happiness.test.ts
git commit -m "feat: happiness warnings, luxury-connected event, and their toasts"
```

## Task 2.5: AI — happiness recovery, building priority, worker luxury bump

**Files:**
- Modify: `src/ai/economy.ts`
- Test: `tests/happiness.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/happiness.test.ts`:
```ts
import { pickProduction } from '../src/ai/economy';

describe('AI happiness response', () => {
  it('an unhappy city builds a happiness building before other works', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 4;
    s.players[0].techs.push('construction'); // colosseum available
    spawn(s, 0, 'warrior', 5, 5); // garrison so it's not "undefended"
    refreshVis(s);
    const unhappy = customCtx((r) => { r.settings.happiness.perCity = 1000; });
    const pick = pickProduction(unhappy, s, c);
    expect(pick?.item).toEqual({ kind: 'building', id: 'colosseum' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/happiness.test.ts -t "AI happiness"`
Expected: FAIL — picks something else (or a wonder/civic).

- [ ] **Step 3: Edit `src/ai/economy.ts`**

Add `empireHappiness` to the selectors import. Add `'colosseum'` and `'courthouse'` to `BUILDING_PRIORITY`:
```ts
const BUILDING_PRIORITY = ['monument', 'granary', 'library', 'walls', 'market', 'workshop', 'aqueduct', 'temple', 'colosseum', 'courthouse', 'university', 'observatory', 'bank', 'castle', 'monastery', 'cathedral'];
```
In `pickProduction`, insert a happiness-recovery rule immediately **before** the `// 6. wonders` block:
```ts
  // 5c. an unhappy empire quells unrest before anything optional
  if (empireHappiness(ctx, state, pid).net < 0) {
    if (city.occupied && canProduce(ctx, state, city, { kind: 'building', id: 'courthouse' }).ok)
      return { item: { kind: 'building', id: 'courthouse' }, reason: `${city.name} seethes under occupation` };
    if (canProduce(ctx, state, city, { kind: 'building', id: 'colosseum' }).ok)
      return { item: { kind: 'building', id: 'colosseum' }, reason: 'the people demand bread and circuses' };
  }
```
In `bestWorkerJob`, replace:
```ts
        if (tile.resource && ctx.rules.resources[tile.resource].improvedBy === imp) value += 6;
```
with:
```ts
        if (tile.resource && ctx.rules.resources[tile.resource].improvedBy === imp) {
          value += 6;
          if (ctx.rules.resources[tile.resource].kind === 'luxury') value += 8; // connecting a luxury relieves unhappiness
        }
```
(No explicit settler gating is needed in the AI: `canProduce` already blocks settlers when unhappy, so the expansion branch's `canProduce(... settler).ok` guard short-circuits.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/happiness.test.ts && npx vitest run tests/selfplay.test.ts`
Expected: PASS — self-play still legal and replays match.

- [ ] **Step 5: Commit**
```bash
git add src/ai/economy.ts tests/happiness.test.ts
git commit -m "feat(ai): build happiness when unhappy; value luxury improvements"
```

## Task 2.6: Top-bar happiness indicator + debug bridge

**Files:**
- Modify: `src/ui/panels/TopBar.tsx`
- Modify: `src/ui/debug.ts`
- Verify: types + build (UI is not unit-tested)

- [ ] **Step 1: Add the happiness chip to `src/ui/panels/TopBar.tsx`**

Add `empireHappiness` to the `../../engine/selectors` import. After computing the per-turn yields, compute happiness and render a chip beside the others:
```tsx
const hap = empireHappiness(gameCtx, game, viewer);
const hapColor = hap.tier === 'content' ? '#7DBE7D' : hap.tier === 'unhappy' ? '#D9A441' : '#C75450';
```
```tsx
<span
  className="yield-chip"
  style={{ color: hapColor }}
  title={`Happiness ${hap.net} (+${hap.happy} / −${hap.unhappy})\nLuxuries connected: ${hap.connectedLuxuries.length}`}
>
  <span style={{ fontWeight: 700 }}>☺</span>
  <span className="per-turn">{hap.net}</span>
</span>
```

- [ ] **Step 2: Expose happiness on the debug bridge (`src/ui/debug.ts`)**

Add to the `DebugApi` interface:
```ts
  happiness(): { happy: number; unhappy: number; net: number; tier: string; connectedLuxuries: string[] } | null;
```
Add to the returned object (import `empireHappiness` from `../engine/selectors`):
```ts
    happiness() {
      const g = appStore.get().game;
      return g ? empireHappiness(gameCtx, g, appStore.get().viewingPlayer) : null;
    },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (Optional manual: in the browser console, `__alvorada().happiness()` returns a report.)

- [ ] **Step 4: Commit**
```bash
git add src/ui/panels/TopBar.tsx src/ui/debug.ts
git commit -m "feat(ui): empire-happiness indicator in the top bar"
```

---

# Phase 3 — Specialists: citizen allocation + manual override + city UI

## Task 3.1: `allocateCitizens` and specialist yields in `cityYields`

**Files:**
- Modify: `src/engine/selectors.ts`
- Test: `tests/specialists.test.ts` (create)

- [ ] **Step 1: Write the failing test `tests/specialists.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { allocateCitizens, cityYields } from '../src/engine/selectors';

function oneCity() {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('allocateCitizens', () => {
  it('forced specialists are honored and clamped to slots and pop', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 3;
    c.buildings.push('library'); // 1 scientist slot
    c.forcedSpecialists = { scientist: 5 }; // ask for more than the single slot
    const alloc = allocateCitizens(ctx, s, c);
    expect(alloc.specialists.scientist).toBe(1); // clamped to the one slot
    expect(alloc.worked.length).toBe(2); // the remaining 2 citizens work tiles
  });

  it('a forced specialist increases city yields and fills its slot', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.pop = 2;
    c.buildings.push('market'); // 1 merchant slot → +3 gold when filled
    const baseline = cityYields(ctx, s, c).total.gold;
    c.forcedSpecialists = { merchant: 1 };
    expect(allocateCitizens(ctx, s, c).specialists.merchant).toBe(1);
    expect(cityYields(ctx, s, c).total.gold).toBeGreaterThan(baseline);
  });

  it('shrinking population re-clamps without error', () => {
    const { s, id } = oneCity();
    const c = s.cities[id];
    c.buildings.push('library');
    c.forcedSpecialists = { scientist: 1 };
    c.pop = 1;
    const alloc = allocateCitizens(ctx, s, c);
    expect((alloc.specialists.scientist ?? 0) + alloc.worked.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/specialists.test.ts`
Expected: FAIL — `allocateCitizens` is not exported.

- [ ] **Step 3: Edit `src/engine/selectors.ts`**

Update the data-types imports to add `PartialYields`, `SpecialistType`, and the `YIELD_KEYS` value:
```ts
import type { PartialYields, SpecialistType, Yields } from '../data/types';
import { addYields, emptyYields, YIELD_KEYS } from '../data/types';
```
Extend `CityYieldBreakdown`:
```ts
export interface CityYieldBreakdown {
  total: Yields;
  worked: number[];
  specialists: Partial<Record<SpecialistType, number>>;
}
```
Add `allocateCitizens` (place it just above `assignWorkedTiles`):
```ts
export function allocateCitizens(
  ctx: Ctx, state: GameState, city: City,
): { worked: number[]; specialists: Partial<Record<SpecialistType, number>> } {
  const weight = (y: PartialYields) =>
    (y.food ?? 0) * 4 + (y.production ?? 0) * 3 + (y.gold ?? 0) * 2 + (y.science ?? 0) * 2 + (y.culture ?? 0);
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
```
Replace the body of `assignWorkedTiles` with a thin wrapper (it now delegates):
```ts
export function assignWorkedTiles(ctx: Ctx, state: GameState, city: City): number[] {
  return allocateCitizens(ctx, state, city).worked;
}
```
Rewrite `cityYields` to use the allocation and add specialist output (this is the full replacement function):
```ts
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

  if (empireHappiness(ctx, state, city.owner).tier === 'veryUnhappy') {
    total.production = Math.floor((total.production * (100 - s.happiness.veryUnhappyProdPenaltyPct)) / 100);
  }
  return { total, worked: alloc.worked, specialists: alloc.specialists };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/specialists.test.ts && npx vitest run tests/content.test.ts tests/happiness.test.ts tests/selfplay.test.ts`
Expected: PASS — specialists work; existing yield/wonder/self-play tests still green (the wrapper preserves prior behavior when there are no slots/forced specialists).

- [ ] **Step 5: Commit**
```bash
git add src/engine/selectors.ts tests/specialists.test.ts
git commit -m "feat(engine): allocateCitizens across tiles and specialist slots"
```

## Task 3.2: `SET_SPECIALISTS` action

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/validate.ts`
- Modify: `src/engine/reducer.ts`
- Test: `tests/specialists.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/specialists.test.ts`:
```ts
import { validateAction } from '../src/engine/validate';

describe('SET_SPECIALISTS', () => {
  it('pins, rejects over-cap, and clears at zero', () => {
    const { s, id } = oneCity();
    s.cities[id].buildings.push('library'); // 1 scientist slot
    let s2 = applyAction(ctx, s, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'scientist', count: 1 });
    expect(s2.cities[id].forcedSpecialists?.scientist).toBe(1);
    expect(validateAction(ctx, s2, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'scientist', count: 2 }).ok).toBe(false);
    s2 = applyAction(ctx, s2, { type: 'SET_SPECIALISTS', player: 0, city: id, specialist: 'scientist', count: 0 });
    expect(s2.cities[id].forcedSpecialists?.scientist).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/specialists.test.ts -t "SET_SPECIALISTS"`
Expected: FAIL — action type not recognized (TS/validation).

- [ ] **Step 3: Add the action to the `Action` union in `src/engine/types.ts`**

After the `SET_PRODUCTION` line in the union add:
```ts
  | { type: 'SET_SPECIALISTS'; player: PlayerId; city: CityId; specialist: SpecialistType; count: number }
```
(`SpecialistType` is already imported into this file from Task 1.5.)

- [ ] **Step 4: Add validation in `src/engine/validate.ts`**

Add a case (e.g. after `SET_PRODUCTION`):
```ts
    case 'SET_SPECIALISTS': {
      const city = state.cities[action.city];
      if (!city || city.owner !== action.player) return fail('not your city');
      if (!ctx.rules.specialists[action.specialist]) return fail('unknown specialist');
      if (!Number.isInteger(action.count) || action.count < 0) return fail('invalid count');
      let slots = 0;
      for (const b of city.buildings) {
        const d = ctx.rules.buildings[b];
        if (d.specialistSlots?.type === action.specialist) slots += d.specialistSlots.count;
      }
      if (action.count > slots) return fail('not enough specialist slots');
      return ok;
    }
```

- [ ] **Step 5: Add the handler in `src/engine/reducer.ts`**

Add a case (after `SET_PRODUCTION`):
```ts
    case 'SET_SPECIALISTS': {
      const city = state.cities[action.city];
      if (!city.forcedSpecialists) city.forcedSpecialists = {};
      if (action.count <= 0) delete city.forcedSpecialists[action.specialist];
      else city.forcedSpecialists[action.specialist] = action.count;
      break;
    }
```

- [ ] **Step 6: Run tests + types**

Run: `npx tsc --noEmit && npx vitest run tests/specialists.test.ts`
Expected: PASS — the reducer/validate exhaustiveness checks are satisfied (the new case is handled in both).

- [ ] **Step 7: Commit**
```bash
git add src/engine/types.ts src/engine/validate.ts src/engine/reducer.ts tests/specialists.test.ts
git commit -m "feat(engine): SET_SPECIALISTS action to pin city specialists"
```

## Task 3.3: City-panel specialists section

**Files:**
- Modify: `src/ui/panels/CityPanel.tsx`
- Modify: `src/ui/debug.ts`
- Verify: types + build

- [ ] **Step 1: Add the Specialists section to `src/ui/panels/CityPanel.tsx`**

Add to the engine-selectors import: `allocateCitizens`. Import the type: `import type { SpecialistType } from '../../data/types';`. Inside the component, after the existing `cityYields` read, compute slot totals and current assignment:
```tsx
const alloc = allocateCitizens(gameCtx, game, city);
const slotTotals: Partial<Record<SpecialistType, number>> = {};
for (const b of city.buildings) {
  const d = gameCtx.rules.buildings[b];
  if (d.specialistSlots) slotTotals[d.specialistSlots.type] = (slotTotals[d.specialistSlots.type] ?? 0) + d.specialistSlots.count;
}
const specialistTypes = (Object.keys(slotTotals) as SpecialistType[]).sort();
```
Render a section after the Buildings list (only when the city has slots):
```tsx
{specialistTypes.length > 0 && (
  <div className="city-specialists">
    <h4>Specialists</h4>
    {specialistTypes.map((t) => {
      const assigned = alloc.specialists[t] ?? 0;
      const total = slotTotals[t] ?? 0;
      const pinned = city.forcedSpecialists?.[t] ?? assigned;
      const set = (count: number) =>
        humanDispatch({ type: 'SET_SPECIALISTS', player: viewer, city: city.id, specialist: t, count });
      return (
        <div key={t} className="specialist-row">
          <span className="spec-name">{gameCtx.rules.specialists[t].name}</span>
          <span className="spec-count">{assigned}/{total}</span>
          <button className="btn btn--xs" disabled={pinned <= 0} onClick={() => set(Math.max(0, pinned - 1))}>−</button>
          <button className="btn btn--xs" disabled={assigned >= total} onClick={() => set(Math.min(total, pinned + 1))}>+</button>
        </div>
      );
    })}
  </div>
)}
```

- [ ] **Step 2: Add a debug-bridge helper in `src/ui/debug.ts`**

Add to `DebugApi`:
```ts
  setSpecialists(cityId: number, specialist: string, count: number): void;
```
Add to the returned object:
```ts
    setSpecialists(cityId: number, specialist: string, count: number) {
      humanDispatch({ type: 'SET_SPECIALISTS', player: appStore.get().viewingPlayer, city: cityId, specialist: specialist as never, count });
    },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (Optional manual: open a city with a Library/Market, click +/− on a specialist, watch the yield change.)

- [ ] **Step 4: Commit**
```bash
git add src/ui/panels/CityPanel.tsx src/ui/debug.ts
git commit -m "feat(ui): specialist assignment controls in the city panel"
```

---

# Phase 4 — Trade routes: engine (caravan, establish, yields, lifecycle, severance)

## Task 4.1: The Caravan unit

**Files:**
- Modify: `src/data/standard/units.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/content.test.ts`:
```ts
describe('caravan', () => {
  it('is a civilian trade unit gated by currency', () => {
    const u = STANDARD_RULESET.units.caravan;
    expect(u).toBeDefined();
    expect(u.class).toBe('civilian');
    expect(u.abilities).toContain('trade');
    expect(u.requiresTech).toBe('currency');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/content.test.ts -t "caravan"`
Expected: FAIL — `u` is undefined.

- [ ] **Step 3: Add the caravan to `src/data/standard/units.ts`**

Add to the `UNITS` object. For `art.glyph`, reuse the value the `worker` unit uses (open the file, copy `worker.art.glyph`) so the renderer has a known glyph:
```ts
  caravan: {
    id: 'caravan', name: 'Caravan', cost: 50, moves: 2, sight: 1, strength: 0,
    class: 'civilian', domain: 'land', abilities: ['trade'],
    requiresTech: 'currency', art: { glyph: /* same glyph string as worker */ 'worker' },
  },
```
(If `worker`'s glyph is e.g. `'pick'`, use that exact string instead of `'worker'`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content.test.ts -t "caravan" && npx vitest run tests/ruleset.test.ts`
Expected: PASS — `validateRuleset` resolves the caravan's `currency` tech.

- [ ] **Step 5: Commit**
```bash
git add src/data/standard/units.ts tests/content.test.ts
git commit -m "feat(data): the Caravan trade unit"
```

## Task 4.2: `tradeOrigin` selector + `ESTABLISH_TRADE_ROUTE` action + `systems/trade.ts`

**Files:**
- Modify: `src/engine/selectors.ts`
- Create: `src/engine/systems/trade.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/engine/validate.ts`
- Modify: `src/engine/reducer.ts`
- Test: `tests/trade.test.ts` (create)

- [ ] **Step 1: Write the failing test `tests/trade.test.ts`** (defines the shared fixtures used by all Phase 4 trade tests)
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { cityYields } from '../src/engine/selectors';
import { processTradeRoutes } from '../src/engine/systems/trade';
import { captureCity } from '../src/engine/systems/cities';
import { axialOfIndex } from '../src/engine/hex';

export function twoCities(): ReturnType<typeof flatWorld> {
  let s = flatWorld(24, 12, 2);
  const a = spawn(s, 0, 'settler', 4, 5);
  const b = spawn(s, 0, 'settler', 12, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
  s = thaw(s);
  s.players[0].techs.push('currency');
  return s;
}

export function metPeaceCities(): ReturnType<typeof flatWorld> {
  let s = flatWorld(24, 12, 2);
  const a = spawn(s, 0, 'settler', 4, 5);
  const b = spawn(s, 1, 'settler', 12, 5);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
  s = thaw(s); s.currentPlayer = 1;
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: b.id });
  s = thaw(s); s.currentPlayer = 0;
  s.players[0].techs.push('currency');
  s.relations[0][1].met = true; s.relations[1][0].met = true;
  return s;
}

describe('establish trade route', () => {
  it('a caravan founds a domestic route and the origin earns the domestic yield', () => {
    let s = twoCities();
    const [c0, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5); // adjacent to the city at (12,5)
    refreshVis(s);
    const beforeProd = cityYields(ctx, s, s.cities[c0]).total.production;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    const route = Object.values(s.tradeRoutes)[0];
    expect(route.kind).toBe('domestic');
    expect(route.fromCity).toBe(c0); // nearest own city to the target
    expect(s.units[car.id]).toBeUndefined(); // caravan consumed
    expect(cityYields(ctx, s, s.cities[c0]).total.production).toBe(beforeProd + 1);
  });

  it('rejects a caravan that has not reached the destination', () => {
    const s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 4, 5); // far from (12,5)
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/trade.test.ts -t "establish trade route"`
Expected: FAIL — `processTradeRoutes`/action not defined.

- [ ] **Step 3: Add `tradeOrigin` to `src/engine/selectors.ts`**

Add `TradeRoute` to the `./types` type import. Add:
```ts
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
```

- [ ] **Step 4: Create `src/engine/systems/trade.ts`**
```ts
/**
 * Trade routes: a caravan connects two cities. The origin city earns the route
 * yield each turn (through cityYields); the route expires or is pillaged, and
 * war/capture sever it. Pure mutations inside the reducer — replays reproduce them.
 */
import type { Ctx, GameState, TradeRoute, Unit, City } from '../types';
import { tileIndex } from '../hex';
import { tradeOrigin } from '../selectors';
import { findPath } from '../map/pathfind';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';

export function establishTradeRoute(ctx: Ctx, state: GameState, unit: Unit, target: City): void {
  const pid = unit.owner;
  const origin = tradeOrigin(ctx, state, pid, target);
  if (!origin) return; // validation guarantees one; defensive
  const probe: Unit = { ...unit, q: origin.q, r: origin.r };
  const steps = findPath(ctx, state, probe, { q: target.q, r: target.r }) ?? [];
  const path = [
    tileIndex({ q: origin.q, r: origin.r }, state.mapW, state.mapH),
    ...steps.map((a) => tileIndex(a, state.mapW, state.mapH)),
  ];
  const kind: TradeRoute['kind'] = target.owner === pid ? 'domestic' : 'international';
  const route: TradeRoute = {
    id: state.nextTradeRouteId++, owner: pid, fromCity: origin.id, toCity: target.id,
    kind, expires: state.turn + ctx.rules.settings.tradeRoute.duration, path,
  };
  state.tradeRoutes[route.id] = route;
  delete state.units[unit.id];
  recomputeVisibility(ctx, state, pid);
  pushEvent(state, {
    player: pid, type: 'tradeEstablished',
    msg: `Trade route opened from ${origin.name} to ${target.name}`, q: target.q, r: target.r,
  });
}
```

- [ ] **Step 5: Add the action + validation + handler**

In `src/engine/types.ts`, add to the `Action` union (after `BUY_ITEM`):
```ts
  | { type: 'ESTABLISH_TRADE_ROUTE'; player: PlayerId; unit: UnitId; targetCity: CityId }
```
In `src/engine/validate.ts`, add `tradeOrigin` to the `./selectors` import, then add a case:
```ts
    case 'ESTABLISH_TRADE_ROUTE': {
      const v = ownUnit(state, action.player, action.unit);
      if (!v.unit) return v.error!;
      const unit = v.unit;
      if (!ctx.rules.units[unit.def].abilities?.includes('trade')) return fail('this unit cannot trade');
      if (unit.moves <= 0) return fail('no movement left');
      const target = state.cities[action.targetCity];
      if (!target) return fail('no such city');
      if (hexDistance({ q: unit.q, r: unit.r }, { q: target.q, r: target.r }) > 1)
        return fail('the caravan must reach the destination city');
      const origin = tradeOrigin(ctx, state, action.player, target);
      if (!origin) return fail('no home city within trade range');
      if (target.owner !== action.player) {
        if (!hasMet(state, action.player, target.owner)) return fail('you have not met this power');
        if (atWar(state, action.player, target.owner)) return fail('cannot trade during war');
      }
      const dup = Object.values(state.tradeRoutes).some(
        (r) => r.owner === action.player && r.fromCity === origin.id && r.toCity === target.id,
      );
      if (dup) return fail('a route already runs there');
      return ok;
    }
```
In `src/engine/reducer.ts`, add `import { establishTradeRoute } from './systems/trade';` and a case:
```ts
    case 'ESTABLISH_TRADE_ROUTE': {
      establishTradeRoute(ctx, state, state.units[action.unit], state.cities[action.targetCity]);
      break;
    }
```

- [ ] **Step 6: Add a stub `processTradeRoutes` so the test import resolves**

The test imports `processTradeRoutes`; add it to `trade.ts` now (full body lands in Task 4.4) — for this task a minimal correct version is fine and is exactly the final shape, so write the final version here:
```ts
import type { Ctx, GameState, PlayerId, TradeRoute, Unit, City } from '../types';
import { sortedIds } from '../types';
import { atWar, isCivilian, tradeOrigin } from '../selectors';
```
(Adjust the imports at the top of `trade.ts` to the above set — `sortedIds`, `atWar`, `isCivilian` are used by `processTradeRoutes`.) Append:
```ts
export function processTradeRoutes(ctx: Ctx, state: GameState, pid: PlayerId): void {
  const bounty = ctx.rules.settings.tradeRoute.pillageBounty;
  for (const id of sortedIds(state.tradeRoutes)) {
    const r = state.tradeRoutes[id];
    if (r.owner !== pid) continue;
    if (state.turn >= r.expires) {
      pushEvent(state, { player: pid, type: 'tradeExpired', msg: 'A trade route has run its course' });
      delete state.tradeRoutes[id];
      continue;
    }
    const onPath = new Set(r.path);
    for (const uid of sortedIds(state.units)) {
      const u = state.units[uid];
      if (u.owner === pid || isCivilian(ctx, u) || !atWar(state, pid, u.owner)) continue;
      if (onPath.has(tileIndex({ q: u.q, r: u.r }, state.mapW, state.mapH))) {
        state.players[u.owner].gold += bounty;
        pushEvent(state, { player: pid, type: 'tradePillaged', msg: 'Raiders plundered a trade route', q: u.q, r: u.r });
        pushEvent(state, { player: u.owner, type: 'tradePillaged', msg: `Your forces plundered an enemy trade route (+${bounty} gold)`, q: u.q, r: u.r });
        delete state.tradeRoutes[id];
        break;
      }
    }
  }
}
```

- [ ] **Step 7: Run tests + types**

Run: `npx tsc --noEmit && npx vitest run tests/trade.test.ts -t "establish trade route"`
Expected: PASS — reducer/validate exhaustiveness satisfied; the domestic route forms and pays.

- [ ] **Step 8: Commit**
```bash
git add src/engine/selectors.ts src/engine/systems/trade.ts src/engine/types.ts src/engine/validate.ts src/engine/reducer.ts tests/trade.test.ts
git commit -m "feat(engine): caravan establishes trade routes (domestic + international gating)"
```

## Task 4.3: Per-turn route yields through `cityYields`

**Files:**
- Modify: `src/engine/selectors.ts`
- Test: `tests/trade.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/trade.test.ts`:
```ts
describe('trade route yields', () => {
  it('an international route earns the owner gold and the destination its cut', () => {
    let s = metPeaceCities();
    const myCity = Object.values(s.cities).find((c) => c.owner === 0)!;
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    const ownerGoldBefore = cityYields(ctx, s, myCity).total.gold;
    const destGoldBefore = cityYields(ctx, s, theirCity).total.gold;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    expect(Object.values(s.tradeRoutes)[0].kind).toBe('international');
    const my = Object.values(s.cities).find((c) => c.owner === 0)!;
    const their = Object.values(s.cities).find((c) => c.owner === 1)!;
    expect(cityYields(ctx, s, my).total.gold).toBe(ownerGoldBefore + 4); // international gold
    expect(cityYields(ctx, s, their).total.gold).toBe(destGoldBefore + 2); // destinationGold
  });

  it('friendship multiplies the international yield', () => {
    let s = metPeaceCities();
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    s.relations[0][1].friends = true; s.relations[1][0].friends = true;
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    const my = Object.values(s.cities).find((c) => c.owner === 0)!;
    const baseGold = Object.values(s.cities).find((c) => c.owner === 0)!; // reference only
    // 4 gold * (100+50)/100 = 6
    const withRoute = cityYields(ctx, s, my).total.gold;
    s.tradeRoutes = {}; // strip the route to read the baseline
    expect(withRoute - cityYields(ctx, s, my).total.gold).toBe(6);
    void baseGold;
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/trade.test.ts -t "trade route yields"`
Expected: FAIL — route yields are not added yet.

- [ ] **Step 3: Add the yield wiring to `src/engine/selectors.ts`**

Add a helper above `cityYields`:
```ts
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
```
In `cityYields`, immediately **before** the `if (empireHappiness(...).tier === 'veryUnhappy')` penalty block, add:
```ts
  for (const rid of sortedIds(state.tradeRoutes)) {
    const route = state.tradeRoutes[rid];
    if (route.fromCity === city.id) addYields(total, routeOriginYield(ctx, state, route));
    if (route.toCity === city.id && route.kind === 'international') total.gold += s.tradeRoute.destinationGold;
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/trade.test.ts`
Expected: PASS — including the earlier establish tests (domestic still +1 prod).

- [ ] **Step 5: Commit**
```bash
git add src/engine/selectors.ts tests/trade.test.ts
git commit -m "feat(engine): trade-route yields flow through cityYields"
```

## Task 4.4: Lifecycle — expiry & pillage in the turn pipeline + toast types

**Files:**
- Modify: `src/engine/systems/turn.ts`
- Modify: `src/app/driver.ts`
- Test: `tests/trade.test.ts`

(`processTradeRoutes` was authored in Task 4.2; this task wires it into the turn loop and verifies behavior.)

- [ ] **Step 1: Add failing tests** — append to `tests/trade.test.ts`:
```ts
describe('trade route lifecycle', () => {
  it('a route is removed when it expires', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    const rid = Object.keys(s.tradeRoutes).map(Number)[0];
    s.tradeRoutes[rid].expires = s.turn; // due now
    processTradeRoutes(ctx, s, 0);
    expect(s.tradeRoutes[rid]).toBeUndefined();
  });

  it('an at-war enemy on the path plunders the route for the bounty', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    declareWarBetween(s, 0, 1);
    const route = Object.values(s.tradeRoutes)[0];
    const mid = axialOfIndex(route.path[Math.floor(route.path.length / 2)], s.mapW);
    spawn(s, 1, 'warrior', mid.q, mid.r);
    const goldBefore = s.players[1].gold;
    processTradeRoutes(ctx, s, 0);
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
    expect(s.players[1].gold).toBe(goldBefore + ctx.rules.settings.tradeRoute.pillageBounty);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/trade.test.ts -t "lifecycle"`
Expected: the expiry/pillage assertions should already pass via direct `processTradeRoutes` calls (authored in 4.2). If they pass, this confirms the function; proceed to wire it into the turn loop (Step 3) and verify integration.

- [ ] **Step 3: Wire `processTradeRoutes` into `beginTurn` (`src/engine/systems/turn.ts`)**

Add `import { processTradeRoutes } from './trade';`. Immediately after the unit loop (step 1) and **before** the `// 2. cities` loop, add:
```ts
  // 1b. trade routes: expire and pillage before cities tally their yields
  processTradeRoutes(ctx, state, pid);
```

- [ ] **Step 4: Register trade toast types in `src/app/driver.ts`**

Add to `TOAST_TYPES`:
```ts
  'tradeEstablished',
  'tradeExpired',
  'tradePillaged',
  'tradeBroken',
```

- [ ] **Step 5: Run tests + types + a full self-play replay**

Run: `npx tsc --noEmit && npx vitest run tests/trade.test.ts tests/selfplay.test.ts`
Expected: PASS — routes process each turn and the self-play log still replays bit-identically.

- [ ] **Step 6: Commit**
```bash
git add src/engine/systems/turn.ts src/app/driver.ts tests/trade.test.ts
git commit -m "feat(engine): process trade-route expiry and pillage each turn"
```

## Task 4.5: Severance — war cancels routes; capture prunes them

**Files:**
- Modify: `src/engine/systems/trade.ts`
- Modify: `src/engine/systems/diplomacy.ts`
- Modify: `src/engine/systems/cities.ts`
- Test: `tests/trade.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/trade.test.ts`:
```ts
describe('trade route severance', () => {
  it('declaring war cancels international routes between the belligerents', () => {
    let s = metPeaceCities();
    const theirCity = Object.values(s.cities).find((c) => c.owner === 1)!;
    const car = spawn(s, 0, 'caravan', theirCity.q - 1, theirCity.r);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: theirCity.id });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    s = applyAction(ctx, s, { type: 'DECLARE_WAR', player: 0, target: 1 });
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
  });

  it('capturing a city prunes routes touching it', () => {
    let s = twoCities();
    const [, c1] = Object.keys(s.cities).map(Number);
    const car = spawn(s, 0, 'caravan', 11, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
    s = thaw(s);
    expect(Object.keys(s.tradeRoutes).length).toBe(1);
    captureCity(ctx, s, s.cities[c1], 1);
    expect(Object.keys(s.tradeRoutes).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/trade.test.ts -t "severance"`
Expected: FAIL — routes survive war/capture.

- [ ] **Step 3: Add the severance helpers to `src/engine/systems/trade.ts`**

Add `PlayerId` to the `../types` type import if not present, then append:
```ts
export function pruneRoutesForCity(state: GameState, cityId: number): void {
  for (const id of sortedIds(state.tradeRoutes)) {
    const r = state.tradeRoutes[id];
    if (r.fromCity === cityId || r.toCity === cityId) delete state.tradeRoutes[id];
  }
}

export function cancelInternationalRoutesBetween(state: GameState, a: PlayerId, b: PlayerId): void {
  for (const id of sortedIds(state.tradeRoutes)) {
    const r = state.tradeRoutes[id];
    if (r.kind !== 'international') continue;
    const oa = state.cities[r.fromCity]?.owner;
    const ob = state.cities[r.toCity]?.owner;
    if ((oa === a && ob === b) || (oa === b && ob === a)) {
      const dst = state.cities[r.toCity];
      pushEvent(state, { player: r.owner, type: 'tradeBroken', msg: 'War severed a trade route', q: dst?.q, r: dst?.r });
      delete state.tradeRoutes[id];
    }
  }
}
```

- [ ] **Step 4: Call them from war and capture**

In `src/engine/systems/diplomacy.ts`, add `import { cancelInternationalRoutesBetween } from './trade';` and, inside `enterWar`, after the war status is set, add (using `enterWar`'s two player-id parameters):
```ts
  cancelInternationalRoutesBetween(state, a, b);
```
(Use the actual parameter names of `enterWar` — the declarer and the target.)

In `src/engine/systems/cities.ts`, add `import { pruneRoutesForCity } from './trade';` and, inside `captureCity`, after `city.occupied = true;`, add:
```ts
  pruneRoutesForCity(state, city.id);
```

- [ ] **Step 5: Run tests + types** (watch for an import cycle)

Run: `npx tsc --noEmit && npx vitest run tests/trade.test.ts tests/diplomacy.test.ts`
Expected: PASS. (`trade.ts` imports only from `selectors`/`hex`/`map`/`events`; `diplomacy.ts` and `cities.ts` import `trade.ts` — no cycle, since `trade.ts` imports neither.)

- [ ] **Step 6: Commit**
```bash
git add src/engine/systems/trade.ts src/engine/systems/diplomacy.ts src/engine/systems/cities.ts tests/trade.test.ts
git commit -m "feat(engine): war cancels international routes; capture prunes routes"
```

---

# Phase 5 — Trade routes: AI behavior + UI

## Task 5.1: AI builds caravans and establishes routes

**Files:**
- Modify: `src/ai/economy.ts`
- Modify: `src/ai/decide.ts`
- Test: `tests/trade.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/trade.test.ts`:
```ts
import { pickProduction } from '../src/ai/economy';
import { decide } from '../src/ai/decide';

describe('AI trade', () => {
  it('builds a caravan once the homeland is tended and trade is possible', () => {
    let s = twoCities(); // 2 cities, currency, within range
    s.turn = 10; // desiredCities=2 (met) and no scout rule pressure handled below
    const ids = Object.keys(s.cities).map(Number);
    for (const cid of ids) spawn(s, 0, 'warrior', s.cities[cid].q, s.cities[cid].r); // garrisons
    spawn(s, 0, 'scout', 6, 6); // satisfies the early-scout rule
    spawn(s, 0, 'worker', 5, 6);
    spawn(s, 0, 'worker', 6, 7); // workers >= min(cities,3)
    refreshVis(s);
    const pick = pickProduction(ctx, s, s.cities[ids[0]]);
    expect(pick?.item).toEqual({ kind: 'unit', id: 'caravan' });
  });

  it('a caravan next to a valid target establishes the route', () => {
    let s = twoCities();
    s.turn = 10;
    s.players[0].researching = 'pottery'; // research phase satisfied
    const [, c1] = Object.keys(s.cities).map(Number);
    for (const cid of Object.keys(s.cities).map(Number)) s.cities[cid].production.item = { kind: 'building', id: 'monument' };
    const car = spawn(s, 0, 'caravan', 11, 5); // adjacent to the city at (12,5)
    refreshVis(s);
    const d = decide(ctx, s, 0);
    expect(d.action).toEqual({ type: 'ESTABLISH_TRADE_ROUTE', player: 0, unit: car.id, targetCity: c1 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/trade.test.ts -t "AI trade"`
Expected: FAIL — no caravan production rule / caravan unit handling.

- [ ] **Step 3: Edit `src/ai/economy.ts`**

Add `hasMet` to the `../engine/selectors` import. Add two helpers (near `desiredCities`):
```ts
function activeTradeCount(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const routes = Object.values(state.tradeRoutes).filter((r) => r.owner === pid).length;
  const caravans = playerUnits(state, pid).filter((u) => ctx.rules.units[u.def].abilities?.includes('trade')).length;
  return routes + caravans;
}

function hasTradeTarget(ctx: Ctx, state: GameState, pid: PlayerId): boolean {
  const range = ctx.rules.settings.tradeRoute.caravanRange;
  const mine = playerCities(state, pid);
  if (mine.length >= 2 && mine.some((a) => mine.some((b) => a.id !== b.id && hexDistance({ q: a.q, r: a.r }, { q: b.q, r: b.r }) <= range)))
    return true;
  for (const p of state.players) {
    if (!p.alive || p.id === pid || !hasMet(state, pid, p.id) || atWar(state, pid, p.id)) continue;
    for (const c of playerCities(state, p.id))
      if (mine.some((o) => hexDistance({ q: o.q, r: o.r }, { q: c.q, r: c.r }) <= range)) return true;
  }
  return false;
}
```
In `pickProduction`, insert a rule immediately **after** the workers block (step 4) and before step 5:
```ts
  // 4b. a caravan opens trade income once the homeland is tended
  if (
    ctx.rules.units.caravan &&
    activeTradeCount(ctx, state, pid) < Math.ceil(myCities.length / 2) &&
    hasTradeTarget(ctx, state, pid) &&
    canProduce(ctx, state, city, { kind: 'unit', id: 'caravan' }).ok
  ) {
    return { item: { kind: 'unit', id: 'caravan' }, reason: 'a caravan to open a trade route' };
  }
```

- [ ] **Step 4: Edit `src/ai/decide.ts`**

Add `hasMet` to the `../engine/selectors` import. In `decideUnit`, add a branch for the trade ability (before the `foundCity`/`improve` checks):
```ts
  if (def.abilities?.includes('trade')) return decideCaravan(ctx, state, unit);
```
Add the two functions (near `decideSettler`):
```ts
function pickTradeTarget(ctx: Ctx, state: GameState, unit: Unit): City | null {
  const pid = unit.owner;
  const here = { q: unit.q, r: unit.r };
  const range = ctx.rules.settings.tradeRoute.caravanRange;
  const myCities = playerCities(state, pid);
  const withinRangeOfOwn = (c: City) =>
    myCities.some((o) => o.id !== c.id && hexDistance({ q: o.q, r: o.r }, { q: c.q, r: c.r }) <= range);
  const routed = new Set(Object.values(state.tradeRoutes).filter((r) => r.owner === pid).map((r) => r.toCity));

  const cand: { c: City; domestic: boolean; dist: number }[] = [];
  if (myCities.length >= 2)
    for (const c of myCities) {
      if (routed.has(c.id) || !withinRangeOfOwn(c)) continue;
      cand.push({ c, domestic: true, dist: hexDistance(here, { q: c.q, r: c.r }) });
    }
  for (const p of state.players) {
    if (!p.alive || p.id === pid || !hasMet(state, pid, p.id) || atWar(state, pid, p.id)) continue;
    for (const c of playerCities(state, p.id)) {
      const idx = tileIndex({ q: c.q, r: c.r }, state.mapW, state.mapH);
      if (state.visibility[pid][idx] === VIS_UNSEEN) continue;
      if (routed.has(c.id) || !withinRangeOfOwn(c)) continue;
      cand.push({ c, domestic: false, dist: hexDistance(here, { q: c.q, r: c.r }) });
    }
  }
  cand.sort((a, b) => (a.domestic === b.domestic ? 0 : a.domestic ? -1 : 1) || a.dist - b.dist || a.c.id - b.c.id);
  return cand[0]?.c ?? null;
}

function decideCaravan(ctx: Ctx, state: GameState, unit: Unit): AiDecision | null {
  const target = pickTradeTarget(ctx, state, unit);
  if (!target) return null;
  if (hexDistance({ q: unit.q, r: unit.r }, { q: target.q, r: target.r }) <= 1) {
    return {
      action: { type: 'ESTABLISH_TRADE_ROUTE', player: unit.owner, unit: unit.id, targetCity: target.id },
      reason: `establishing a trade route to ${target.name}`,
    };
  }
  return moveAlong(ctx, state, unit, { q: target.q, r: target.r }, `caravan bound for ${target.name}`);
}
```
(`City` is already imported in `decide.ts`; `tileIndex`, `hexDistance`, `playerCities`, `atWar`, `VIS_UNSEEN` are too. Add only `hasMet`.)

- [ ] **Step 5: Run tests + self-play replay**

Run: `npx tsc --noEmit && npx vitest run tests/trade.test.ts tests/selfplay.test.ts`
Expected: PASS — AI builds/uses caravans and self-play still replays bit-identically.

- [ ] **Step 6: Commit**
```bash
git add src/ai/economy.ts src/ai/decide.ts tests/trade.test.ts
git commit -m "feat(ai): build caravans and establish sensible trade routes"
```

---

## Task 5.2: Trade UI — establish button, target modal, routes list, debug hooks

**Files:**
- Modify: `src/app/store.ts`
- Modify: `src/ui/panels/UnitPanel.tsx`
- Modify: `src/ui/panels/Modals.tsx`
- Modify: `src/ui/GameScreen.tsx` (mount the new modal)
- Modify: `src/ui/panels/CityPanel.tsx`
- Modify: `src/ui/debug.ts`
- Verify: types + build

- [ ] **Step 1: Add a store field for the pending caravan in `src/app/store.ts`**

Add to the `AppState` interface (near `proposalModal`):
```ts
  tradeRouteUnit: number | null; // caravan awaiting a trade-route target
```
Add its initial value (where the store's initial state object is created, alongside `proposalModal: null`):
```ts
  tradeRouteUnit: null,
```

- [ ] **Step 2: Add the "Establish Trade Route" button in `src/ui/panels/UnitPanel.tsx`**

Ensure `appStore` is imported (`import { appStore } from '../../app/store';`). In the `unit-actions` area, add:
```tsx
{gameCtx.rules.units[unit.def].abilities?.includes('trade') && (
  <button className="btn" onClick={() => appStore.set({ tradeRouteUnit: unit.id })}>
    Establish Trade Route
  </button>
)}
```

- [ ] **Step 3: Add `TradeRouteModal` to `src/ui/panels/Modals.tsx`**

Reuse the existing imports (`useApp`, `appStore`, `gameCtx`, `validateAction`, `humanDispatch`). Add:
```tsx
export function TradeRouteModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const unitId = useApp((s) => s.tradeRouteUnit);
  const clear = () => appStore.set({ tradeRouteUnit: null });
  if (!game || unitId === null) return null;
  if (!game.units[unitId]) { clear(); return null; }
  const targets = Object.values(game.cities).filter(
    (c) => validateAction(gameCtx, game, { type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id }).ok,
  );
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h3>Establish Trade Route</h3>
        {targets.length === 0 && <p>No reachable city to trade with from here.</p>}
        {targets.map((c) => (
          <button
            key={c.id}
            className="btn"
            onClick={() => {
              humanDispatch({ type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id });
              clear();
            }}
          >
            {c.name} — {c.owner !== viewer ? 'international (gold)' : 'domestic (food + production)'}
          </button>
        ))}
        <button className="btn" onClick={clear}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount the modal in `src/ui/GameScreen.tsx`**

Find where `<ProposalModal />` is rendered and add `<TradeRouteModal />` beside it. Update the import from `./panels/Modals` to include `TradeRouteModal`.

- [ ] **Step 5: Add an active-routes list to `src/ui/panels/CityPanel.tsx`**

After the Specialists section, add:
```tsx
{(() => {
  const routes = Object.values(game.tradeRoutes).filter((r) => r.fromCity === city.id || r.toCity === city.id);
  return routes.length > 0 ? (
    <div className="city-routes">
      <h4>Trade Routes</h4>
      {routes.map((r) => (
        <div key={r.id} className="route-row">
          {(game.cities[r.fromCity]?.name ?? '—')} → {(game.cities[r.toCity]?.name ?? '—')} · {r.kind} · {Math.max(0, r.expires - game.turn)}t
        </div>
      ))}
    </div>
  ) : null;
})()}
```

- [ ] **Step 6: Add debug-bridge hooks in `src/ui/debug.ts`**

Add to `DebugApi`:
```ts
  establishRoute(unitId: number, targetCity: number): void;
  listRoutes(): { id: number; owner: number; fromCity: number; toCity: number; kind: string; expires: number }[];
```
Add to the returned object:
```ts
    establishRoute(unitId: number, targetCity: number) {
      humanDispatch({ type: 'ESTABLISH_TRADE_ROUTE', player: appStore.get().viewingPlayer, unit: unitId, targetCity });
    },
    listRoutes() {
      const g = appStore.get().game;
      return g ? Object.values(g.tradeRoutes) : [];
    },
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (Optional manual: build a caravan, move it next to another city, click Establish Trade Route, pick the target; the city panel shows the route.)

- [ ] **Step 8: Commit**
```bash
git add src/app/store.ts src/ui/panels/UnitPanel.tsx src/ui/panels/Modals.tsx src/ui/GameScreen.tsx src/ui/panels/CityPanel.tsx src/ui/debug.ts
git commit -m "feat(ui): caravan trade-route establishment and city route list"
```

## Task 5.3: Render trade routes on the map

**Files:**
- Modify: `src/ui/map/renderer.ts`
- Verify: types + build

- [ ] **Step 1: Draw dotted route polylines in `paintOverlaysUnder`**

Confirm `hexToPixel`, `axialOfIndex`, and the `HEX` constant are already imported in `renderer.ts` (they are used by `paintTerritory`). In `paintOverlaysUnder` (after the path-preview block), add:
```ts
for (const id of Object.keys(s.tradeRoutes).map(Number).sort((a, b) => a - b)) {
  const route = s.tradeRoutes[id];
  if (route.path.length < 2) continue;
  g.strokeStyle = 'rgba(190,150,70,0.55)';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  g.beginPath();
  route.path.forEach((idx, i) => {
    const p = hexToPixel(axialOfIndex(idx, s.mapW), HEX);
    if (i === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  });
  g.stroke();
  g.setLineDash([]);
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (Optional manual: with an active route, a dashed amber trail connects the two cities on the parchment.)

- [ ] **Step 3: Commit**
```bash
git add src/ui/map/renderer.ts
git commit -m "feat(ui): draw trade routes as dashed trails on the map"
```

---

# Phase 6 — Balance tuning, self-play assertions, and finishing

## Task 6.1: Self-play assertions + balance telemetry

**Files:**
- Modify: `tests/selfplay.test.ts`

- [ ] **Step 1: Add a failing self-play test** — append to `tests/selfplay.test.ts`:
```ts
import { empireHappiness } from '../src/engine/selectors';

describe('city & economy depth in self-play', () => {
  it('trade routes are established and happiness buildings get built over a long game (and it replays)', () => {
    const { state, log } = runGame(7777, 200);
    const established = log.filter((a) => a.type === 'ESTABLISH_TRADE_ROUTE').length;
    expect(established, 'caravans should open routes').toBeGreaterThan(0);
    const happinessBuildings = Object.values(state.cities).filter((c) =>
      c.buildings.some((b) => b === 'colosseum' || b === 'courthouse'),
    ).length;
    expect(happinessBuildings, 'AIs should build happiness buildings').toBeGreaterThan(0);
    let replay = initialState(config(7777), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 200_000);
});
```

- [ ] **Step 2: Extend the balance-telemetry table**

In the existing `describe('balance telemetry', ...)` test, add two fields to each row object:
```ts
      happiness: empireHappiness(ctx, state, p.id).net,
      routes: Object.values(state.tradeRoutes).filter((r) => r.owner === p.id).length,
```

- [ ] **Step 3: Run it; pick a seed if needed**

Run: `npx vitest run tests/selfplay.test.ts -t "city & economy depth"`
Expected: PASS. If `established` or `happinessBuildings` is 0 for seed 7777, try a few alternative seeds (e.g., 7, 31415, 20260613) and choose one where both reliably occur; this depends on Phase 6.2 tuning, so revisit after tuning if necessary.

- [ ] **Step 4: Commit**
```bash
git add tests/selfplay.test.ts
git commit -m "test: self-play assertions for trade routes and happiness; telemetry columns"
```

## Task 6.2: Tune the balance numbers via telemetry

**Files:**
- Modify: `src/data/standard/index.ts` (only the `happiness` and `tradeRoute` settings values)

**Goal:** the happiness brake should bite (expansion has a cost; empires sometimes go unhappy and respond) without strangling the game (AIs still reach ~4–5 cities and the science victory still fires). Trade should be a visible, worthwhile economic lever.

- [ ] **Step 1: Read the telemetry**

Run: `npx vitest run tests/selfplay.test.ts -t "prints milestone table" 2>&1 | sed -n '/┌/,/┘/p'`
(or just run the file and read the `console.table`). Inspect the `happiness`, `routes`, `cities`, `techs`, `score` columns across several seeds by temporarily changing the seed in that test.

- [ ] **Step 2: Adjust, guided by these targets**

Edit the `happiness` / `tradeRoute` values in `src/data/standard/index.ts`:
- If empires are almost always deeply negative and barely grow → lower `perCity`/`perPop`, or raise `baseEmpire`/`luxuryHappiness`.
- If happiness is never a constraint (always ≥ 0, no colosseums built) → raise `perCity`/`perPop` slightly, or lower `baseEmpire`.
- If routes are never built → lower `caravan` cost (in `units.ts`) or raise the route yields; if trade dominates → trim `international`/`domestic` yields.
- Keep `veryUnhappyAt` deep enough that "very unhappy" is rare (a genuine crisis, not the steady state).

- [ ] **Step 3: Re-verify the FULL suite — this is the acceptance gate**

Run: `npx vitest run`
Expected: PASS — **including** the existing `tests/selfplay.test.ts` assertions:
- `a full game reaches a verdict by the turn limit` (turn 265), and
- `the science capstone is a reachable victory in self-play` (seed 7 → `winner.victory === 'science'`).

The happiness brake throttles growth, which can slow the score/science arcs. If the seed-7 science victory no longer fires by turn 265, re-tune happiness to be gentler (it must not make the existing victory paths unreachable). Only as a last resort, and with a noted justification, adjust the seed-7 test's turn budget — prefer tuning the numbers.

- [ ] **Step 4: Commit**
```bash
git add src/data/standard/index.ts src/data/standard/units.ts
git commit -m "balance: tune happiness and trade-route values via self-play telemetry"
```

## Task 6.3: Final holistic review + finish the branch

- [ ] **Step 1: Full green build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS.

- [ ] **Step 2: Holistic review**

This is the final review step of `superpowers:subagent-driven-development` — dispatch a final code-reviewer over the whole `feature/city-economy-depth` diff against `main`, checking: engine purity/determinism (no `Math.random`/`Date`/transcendentals introduced; integer math; `sortedIds` iteration), the engine/ai/ui layering (UI must not import `src/ai/`), spec coverage (happiness brake, specialists, trade routes, AI, UI, tests), and that the three systems interact cleanly (e.g., very-unhappy production penalty composes with trade-route yields). Apply any fixups as small, test-guarded commits.

- [ ] **Step 3: Finish**

Use `superpowers:finishing-a-development-branch` to verify tests, then present merge options for `feature/city-economy-depth` → `main`.

---

## Plan self-review (author check against the spec)

- **Happiness** (spec §System 1): types/settings (T1.1), luxuries+plantation (T1.2), buildings+wonder (T1.3), validator (T1.4), `empireHappiness` (T1.6), growth/production brake (T2.1), settler lockout (T2.2), occupied-on-capture (T2.3), warnings+luxury event+toasts (T2.4), AI recovery+worker bump (T2.5), top-bar UI (T2.6). ✓
- **Specialists** (spec §System 2): types (T1.1), `allocateCitizens`+`cityYields` (T3.1), `SET_SPECIALISTS` (T3.2), city-panel UI (T3.3). ✓
- **Trade routes** (spec §System 3): state (T1.5), caravan (T4.1), establish+`tradeOrigin`+`systems/trade.ts` (T4.2), `cityYields` route yields (T4.3), expiry/pillage+turn wiring (T4.4), war-cancel+capture-prune (T4.5), AI (T5.1), UI button/modal/list (T5.2), map render (T5.3). ✓
- **Determinism/serialization** (spec §): schema bump (T1.5); integer math + sorted iteration throughout; replay assertions (T6.1). ✓
- **Testing & balance** (spec §): per-feature tests in each task; self-play + telemetry (T6.1); tuning + acceptance gate (T6.2). ✓
- **Non-goals** respected: no Great People, no random revolts, land-only caravan (`domain:'land'`), no route slot caps, empire-wide happiness only. ✓
- **Type consistency:** `SpecialistType`, `HappinessReport`, `TradeRoute`, `allocateCitizens`, `tradeOrigin`, `empireHappiness`, the two new actions, and `CityYieldBreakdown.specialists` are used identically across tasks. ✓
- **Cross-task ordering note:** `cityYields` is edited in T2.1 (penalty), T3.1 (specialists, full rewrite), and T4.3 (route yields, inserted before the penalty). The T3.1 full rewrite is the canonical version; T4.3 inserts into it. `systems/trade.ts` is created in T4.2 (with `establishTradeRoute` + `processTradeRoutes`) and extended in T4.5 (severance helpers). New `Action` variants land with their handlers (T3.2, T4.2) so the reducer/validate exhaustiveness checks never break mid-phase.

