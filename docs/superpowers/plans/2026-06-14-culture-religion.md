# Culture & Religion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Faith (a 6th yield), Religions (pantheons/religions with beliefs that spread by pressure), a Civics/policy tree fueled by culture, and the Culture victory — completing Alvorada's "soft power" layer while preserving the deterministic, serializable, data-driven engine.

**Architecture:** All four systems plug into the existing funnels — `cityYields` (yields), `empireHappiness` (happiness), `beginTurn` (the turn pipeline), `victory.ts` (a new evaluator). Faith is a real 6th yield (the `YIELD_KEYS`-driven loops absorb most of it). Civic effects (beliefs + policies) share one `CivicEffect` shape resolved by `empireCivicEffects` / `followerBelief` selectors. Religion spread is deterministic integer pressure. Integer math + `sortedIds` iteration keep replays bit-identical.

**Tech Stack:** TypeScript, Immer reducer, Vitest, React + canvas. Spec: `docs/superpowers/specs/2026-06-14-culture-religion-design.md`.

**Branch:** `feature/culture-religion` (already created; the spec is committed there).

**Verification commands:** types `npx tsc --noEmit`; a test file `npx vitest run tests/<file>.test.ts`; full suite `npx vitest run`; build `npm run build`.

> **Self-play note (applies to every phase that runs `tests/selfplay.test.ts`):** the science-victory test uses **seed 314**. Adding new systems can shift self-play timing; if the science-victory test (and only that one) regresses mid-track, it's a balance item for **Phase 8** — note it and proceed; do not modify the test or other tuning to chase it before Phase 8. Legality, determinism+replay, verdict-by-turn-limit, diplomacy, breadth, and city/economy self-play tests MUST stay green.

---

## Shared contracts (defined once; each task that creates a symbol shows full code)

```ts
// data/types.ts
// Yields gains `faith`; YIELD_KEYS gains 'faith'; ZERO_YIELDS gains faith:0
type BeliefKind = 'pantheon' | 'founder' | 'follower';
interface CivicEffect { yields?: PartialYields; happiness?: number; perBuilding?: { building: string; yields: PartialYields }; influenceMult?: number }
interface BeliefDef { id: string; name: string; kind: BeliefKind; effect: CivicEffect }
interface PolicyDef { id: string; name: string; branch: string; cost: number; prereqs: string[]; effect: CivicEffect }
interface ReligionSettings { pantheonCost; religionCost; religionTech: string; maxReligions; spreadRange; pressurePerCity; holyCityBonus; holyCityFaithDiv }
// RulesetSettings gains: religion: ReligionSettings; victory gains culture: { dominanceFactor; minTurn; perWonder }
// Ruleset gains: beliefs: Record<string,BeliefDef>; policies: Record<string,PolicyDef>

// engine/types.ts
interface ReligionState { id: string; name: string; founder: PlayerId; holyCity: CityId; founderBelief: string; followerBelief: string }
// Player gains: faith: number; pantheon: string|null; policies: string[]; policyProgress: number; cultureTotal: number
// City gains:   religion?: string|null; religiousPressure?: Record<string, number>
// GameState gains: religions: Record<string, ReligionState>; winner victory union gains 'culture'
// Action gains: FOUND_PANTHEON {player,belief}; FOUND_RELIGION {player,name,holyCity,founderBelief,followerBelief}; ADOPT_POLICY {player,policy}

// engine/selectors.ts
function empireCivicEffects(ctx, state, pid): CivicEffect[]   // owner pantheon + founder belief + adopted policies
function followerBelief(ctx, state, city): BeliefDef | null   // city.religion → that religion's follower belief def
function influence(ctx, state, pid): number                  // cultureTotal × policy mult + wonders × perWonder
// cityYields gains per-city civic yields; empireHappiness gains civic happiness

// engine/systems/religion.ts (new): foundPantheon, foundReligion, spreadReligions
// engine/systems/cities.ts: CityTurnOutput gains faith (P1), culture (P4)
// engine/systems/victory.ts: checkCultureVictory; 'culture' winner
// SCHEMA_VERSION 4 → 5
```

**Starting numbers** (tuned in Phase 8): `religion { pantheonCost:20, religionCost:60, religionTech:'theology', maxReligions:4, spreadRange:6, pressurePerCity:2, holyCityBonus:30, holyCityFaithDiv:2 }`; `victory.culture { dominanceFactor:2, minTurn:150, perWonder:40 }`; Shrine `{ cost:40, yields:{faith:1} }`; Temple gains `faith:1`.

---

# Phase 1 — Faith: the 6th yield, end to end

## Task 1.1: Add `faith` to the yield system + its icon

**Files:** Modify `src/data/types.ts`, `src/ui/icons.tsx`

- [ ] **Step 1: Edit `src/data/types.ts`** — add faith to the three yield primitives:
```ts
export interface Yields {
  food: number;
  production: number;
  gold: number;
  science: number;
  culture: number;
  faith: number;
}
```
```ts
export const YIELD_KEYS = ['food', 'production', 'gold', 'science', 'culture', 'faith'] as const;
```
```ts
export const ZERO_YIELDS: Yields = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
```
(`addYields`/`emptyYields` iterate `YIELD_KEYS`, so they handle faith automatically.)

- [ ] **Step 2: Run `npx tsc --noEmit`** — Expected: FAIL. `YIELD_ICONS[k]` in `CityPanel.tsx`/`TileInfo.tsx` (and `YIELD_ICONS`'s type) now lacks a `faith` key. This is the signal to add the icon next.

- [ ] **Step 3: Edit `src/ui/icons.tsx`** — add a faith icon (a simple flame, matching the 1.6px stroke family) and register it:
```tsx
/** faith */
export function IconFlame(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.2c1.6 2.2 3.4 3.8 3.4 6.4A3.4 3.4 0 0 1 4.6 8.6c0-1 .4-1.8 1-2.5.3 1 .9 1.5 1.6 1.6-.5-1.8.2-3.8.8-5.5Z" />
    </Svg>
  );
}
```
Add to `YIELD_ICONS` and `YIELD_COLORS`:
```ts
export const YIELD_ICONS = {
  food: IconWheat,
  production: IconCog,
  science: IconScroll,
  culture: IconAmphora,
  gold: IconCoin,
  faith: IconFlame,
} as const;
```
```ts
export const YIELD_COLORS: Record<string, string> = {
  food: '#9CC069',
  production: '#D08B4C',
  science: '#7FB6D9',
  culture: '#C490D1',
  gold: '#E3C47D',
  faith: '#E8E2D0',
};
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (PASS), `npx vitest run tests/content.test.ts tests/ruleset.test.ts` (PASS — `ZERO_YIELDS`/yield maths still consistent), `npm run build` (PASS).

- [ ] **Step 5: Commit**
```bash
git add src/data/types.ts src/ui/icons.tsx
git commit -m "feat(data): add faith as the sixth yield, with its icon"
```

## Task 1.2: Shrine building + Temple faith

**Files:** Modify `src/data/standard/buildings.ts`; Test `tests/content.test.ts`

- [ ] **Step 1: Write a failing test** — append to `tests/content.test.ts`:
```ts
describe('faith buildings', () => {
  const b = STANDARD_RULESET.buildings;
  it('adds a Shrine and gives the Temple faith', () => {
    expect(b.shrine.yields.faith).toBe(1);
    expect(b.shrine.requiresTech).toBeUndefined(); // early, like the Monument
    expect(b.temple.yields.faith).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/content.test.ts -t "faith buildings"` — Expected: FAIL (`b.shrine` undefined).

- [ ] **Step 3: Edit `src/data/standard/buildings.ts`** — add `faith: 1` to the existing `temple` (keep its `culture: 3` and `specialistSlots`), and add the Shrine near the other early buildings:
```ts
  shrine: {
    id: 'shrine', name: 'Shrine', cost: 40, yields: { faith: 1 },
    art: { glyph: 'temple' },
  },
```

- [ ] **Step 4: Verify** — `npx vitest run tests/content.test.ts -t "faith buildings"` (PASS), `npx vitest run tests/ruleset.test.ts` (PASS).

- [ ] **Step 5: Commit**
```bash
git add src/data/standard/buildings.ts tests/content.test.ts
git commit -m "feat(data): Shrine building and Temple faith yield"
```

## Task 1.3: Faith pool — `Player.faith`, banking, schema bump

**Files:** Modify `src/engine/types.ts`, `src/engine/systems/cities.ts`, `src/engine/systems/turn.ts`, `src/engine/selectors.ts`, `src/engine/state.ts`, `src/engine/serialize.ts`, `tests/helpers.ts`; Test `tests/religion.test.ts` (create)

- [ ] **Step 1: Write the failing test `tests/religion.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

/** Found one city for player 0, give it a Shrine, return the thawed state + city id. */
function cityWithShrine(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 5, 5);
  spawn(s, 1, 'warrior', 1, 10);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  s.cities[id].buildings.push('shrine'); // +1 faith
  return { s, id };
}

describe('faith pool', () => {
  it("a city's faith banks into the player pool at turn start", () => {
    const { s } = cityWithShrine();
    expect(s.players[0].faith).toBe(0);
    // end player 0's turn; it comes back around (2 players) and beginTurn banks faith
    let s2 = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    s2 = applyAction(ctx, s2, { type: 'END_TURN', player: 1 });
    expect(s2.players[0].faith).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/religion.test.ts` — Expected: FAIL (`players[0].faith` is undefined → not > 0; also TS error).

- [ ] **Step 3: Add `faith` to `Player` (`src/engine/types.ts`)** — after `gold: number;`:
```ts
  faith: number; // accumulates each turn like science/gold
```

- [ ] **Step 4: Surface faith from `processCity` (`src/engine/systems/cities.ts`)** — extend the output type and return:
```ts
export interface CityTurnOutput {
  science: number;
  gold: number;
  faith: number;
}
```
Change the final `return { science: total.science, gold: total.gold };` to:
```ts
  return { science: total.science, gold: total.gold, faith: total.faith };
```

- [ ] **Step 5: Bank faith in `beginTurn` (`src/engine/systems/turn.ts`)** — in the city loop, accumulate and add to the player:
```ts
  let science = 0;
  let gold = 0;
  let faith = 0;
  for (const c of playerCities(state, pid)) {
    const out = processCity(ctx, state, c);
    science += out.science;
    gold += out.gold;
    faith += out.faith;
  }
```
and after `player.science += science;` add:
```ts
  player.faith += faith;
```

- [ ] **Step 6: Faith in the citizen-allocation weight (`src/engine/selectors.ts`)** — in `allocateCitizens`, the `weight` helper, add a faith term (low, since faith rarely sits on tiles):
```ts
  const weight = (y: PartialYields) =>
    (y.food ?? 0) * 4 + (y.production ?? 0) * 3 + (y.gold ?? 0) * 2 + (y.science ?? 0) * 2 + (y.culture ?? 0) + (y.faith ?? 0);
```

- [ ] **Step 7: Initialize the field + bump schema** — `src/engine/state.ts` Player literal, after `gold: 0,`: `faith: 0,`. `tests/helpers.ts` `flatWorld` player literal, after `gold: 0,`: `faith: 0,`. `src/engine/serialize.ts`: `export const SCHEMA_VERSION = 5;`.

- [ ] **Step 8: Verify** — `npx tsc --noEmit`; `npx vitest run tests/religion.test.ts` (PASS); `npx vitest run tests/replay.test.ts tests/selfplay.test.ts` (legality/determinism+replay/verdict/diplomacy/breadth/city-economy PASS; the seed-314 science test is the only acceptable regression — see the self-play note).

- [ ] **Step 9: Commit**
```bash
git add src/engine/types.ts src/engine/systems/cities.ts src/engine/systems/turn.ts src/engine/selectors.ts src/engine/state.ts src/engine/serialize.ts tests/helpers.ts tests/religion.test.ts
git commit -m "feat(engine): faith accumulates into a per-player pool (schema 5)"
```

## Task 1.4: Faith chip in the top bar

**Files:** Modify `src/ui/panels/TopBar.tsx`; Verify build

- [ ] **Step 1: Edit `src/ui/panels/TopBar.tsx`** — the per-turn loop already sums science/culture/gold; add faith. After `gold += y.gold;` inside the loop add `faith += y.faith;`, and declare `let faith = 0;` beside the others. Render a chip after the gold chip (import `IconFlame` from `../icons`):
```tsx
<span className="yield-chip" style={{ color: YIELD_COLORS.faith }} title="Faith">
  <IconFlame />
  <span className="num">{player.faith}</span>
  <span className="per-turn">+{faith}</span>
</span>
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (PASS), `npm run build` (PASS).

- [ ] **Step 3: Commit**
```bash
git add src/ui/panels/TopBar.tsx
git commit -m "feat(ui): faith chip in the top bar"
```

---

# Phase 2 — Beliefs, religion state, and founding

## Task 2.1: Belief/effect/religion-settings types + standard data + validator

**Files:** Modify `src/data/types.ts`, `src/data/standard/index.ts`, `src/data/validate.ts`; Create `src/data/standard/beliefs.ts`; Test `tests/ruleset.test.ts`

- [ ] **Step 1: Add types to `src/data/types.ts`** (after `SpecialistDef`):
```ts
export type BeliefKind = 'pantheon' | 'founder' | 'follower';
export interface CivicEffect {
  yields?: PartialYields;                                      // per city it applies to
  happiness?: number;                                          // empire happiness
  perBuilding?: { building: string; yields: PartialYields };   // e.g. +1 faith per Shrine
  influenceMult?: number;                                      // % tourism/influence (policies)
}
export interface BeliefDef { id: string; name: string; kind: BeliefKind; effect: CivicEffect; }
export interface ReligionSettings {
  pantheonCost: number; religionCost: number; religionTech: string; maxReligions: number;
  spreadRange: number; pressurePerCity: number; holyCityBonus: number; holyCityFaithDiv: number;
}
```
Extend `RulesetSettings`: change the `victory` field and add `religion`:
```ts
  victory: { scoreThreshold: number; turnLimit: number; scienceCapstone: string; culture: { dominanceFactor: number; minTurn: number; perWonder: number } };
  religion: ReligionSettings;
```
Extend `Ruleset`: after `specialists: ...` add `beliefs: Record<string, BeliefDef>;`.

- [ ] **Step 2: Create `src/data/standard/beliefs.ts`**:
```ts
import type { BeliefDef } from '../types';

export const BELIEFS: Record<string, BeliefDef> = {
  // pantheon (apply to the owner's every city)
  god_of_harvest: { id: 'god_of_harvest', name: 'God of the Harvest', kind: 'pantheon', effect: { yields: { food: 1 } } },
  god_of_craftsmen: { id: 'god_of_craftsmen', name: 'God of Craftsmen', kind: 'pantheon', effect: { yields: { production: 1 } } },
  god_of_commerce: { id: 'god_of_commerce', name: 'God of Commerce', kind: 'pantheon', effect: { yields: { gold: 1 } } },
  oral_tradition: { id: 'oral_tradition', name: 'Oral Tradition', kind: 'pantheon', effect: { yields: { science: 1 } } },
  goddess_of_festivals: { id: 'goddess_of_festivals', name: 'Goddess of Festivals', kind: 'pantheon', effect: { yields: { culture: 1 } } },
  stone_circles: { id: 'stone_circles', name: 'Stone Circles', kind: 'pantheon', effect: { perBuilding: { building: 'shrine', yields: { faith: 1 } } } },
  // founder (apply to the founder's every city)
  tithe: { id: 'tithe', name: 'Tithe', kind: 'founder', effect: { perBuilding: { building: 'temple', yields: { gold: 2 } } } },
  papal_primacy: { id: 'papal_primacy', name: 'Papal Primacy', kind: 'founder', effect: { happiness: 3 } },
  world_church: { id: 'world_church', name: 'World Church', kind: 'founder', effect: { yields: { culture: 1 } } },
  ceremonial_burial: { id: 'ceremonial_burial', name: 'Ceremonial Burial', kind: 'founder', effect: { yields: { faith: 1 } } },
  // follower (apply in each city that follows the religion)
  feed_the_world: { id: 'feed_the_world', name: 'Feed the World', kind: 'follower', effect: { yields: { food: 1 } } },
  religious_art: { id: 'religious_art', name: 'Religious Art', kind: 'follower', effect: { yields: { culture: 1 } } },
  cathedral_of_learning: { id: 'cathedral_of_learning', name: 'Cathedral of Learning', kind: 'follower', effect: { yields: { science: 1 } } },
  peace_gardens: { id: 'peace_gardens', name: 'Peace Gardens', kind: 'follower', effect: { happiness: 1 } },
};
```

- [ ] **Step 3: Wire standard data in `src/data/standard/index.ts`** — import `BELIEFS` from `./beliefs`; update the import type line to add `BeliefDef`-bearing types if needed (only `BELIEFS` value import is required). In `SETTINGS`, replace the `victory:` line with:
```ts
  victory: { scoreThreshold: 600, turnLimit: 260, scienceCapstone: 'scientific_method', culture: { dominanceFactor: 2, minTurn: 150, perWonder: 40 } },
```
and add a `religion` block (after `tradeRoute: { ... },`):
```ts
  religion: { pantheonCost: 20, religionCost: 60, religionTech: 'theology', maxReligions: 4, spreadRange: 6, pressurePerCity: 2, holyCityBonus: 30, holyCityFaithDiv: 2 },
```
In `STANDARD_RULESET`, after `specialists: SPECIALISTS,` add `beliefs: BELIEFS,`.

- [ ] **Step 4: Extend `validateRuleset` (`src/data/validate.ts`)** — add, after the building checks:
```ts
  for (const bel of Object.values(rules.beliefs)) {
    const pb = bel.effect.perBuilding;
    if (pb && !(pb.building in rules.buildings))
      errors.push(`belief ${bel.id}: unknown perBuilding ${pb.building}`);
  }
  if (!(rules.settings.religion.religionTech in rules.techs))
    errors.push(`settings: unknown religionTech ${rules.settings.religion.religionTech}`);
```

- [ ] **Step 5: Add a ruleset test** — append inside `describe('standard ruleset', ...)` in `tests/ruleset.test.ts`:
```ts
  it('beliefs and religion settings are valid', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
    const kinds = new Set(Object.values(STANDARD_RULESET.beliefs).map((b) => b.kind));
    expect(kinds).toEqual(new Set(['pantheon', 'founder', 'follower']));
  });
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/ruleset.test.ts tests/content.test.ts` (PASS).

- [ ] **Step 7: Commit**
```bash
git add src/data/types.ts src/data/standard/beliefs.ts src/data/standard/index.ts src/data/validate.ts tests/ruleset.test.ts
git commit -m "feat(data): belief catalog, CivicEffect, and religion settings"
```

## Task 2.2: Religion engine state

**Files:** Modify `src/engine/types.ts`, `src/engine/state.ts`, `tests/helpers.ts`

- [ ] **Step 1: Edit `src/engine/types.ts`** — add `ReligionState` (after `TradeRoute`):
```ts
export interface ReligionState {
  id: string;            // `rel_${founder}` — at most one religion per player
  name: string;
  founder: PlayerId;
  holyCity: CityId;
  founderBelief: string; // belief id (kind 'founder')
  followerBelief: string;// belief id (kind 'follower')
}
```
`Player` gains (after `faith: number;`):
```ts
  pantheon: string | null; // chosen pantheon belief id
```
`City` gains (after `forcedSpecialists?`):
```ts
  religion?: string | null;                    // majority religion id
  religiousPressure?: Record<string, number>;  // accumulated pressure per religion
```
`GameState` gains (after `nextTradeRouteId: number;`):
```ts
  religions: Record<string, ReligionState>;
```

- [ ] **Step 2: Initialize** — `src/engine/state.ts`: Player literal gains `pantheon: null,` (after `faith: 0,`); GameState literal gains `religions: {},` (after `nextTradeRouteId: 1,`). `tests/helpers.ts` `flatWorld`: same two additions (`pantheon: null,` in the player literal, `religions: {},` in the state literal).

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx vitest run tests/replay.test.ts` (PASS — internally consistent).

- [ ] **Step 4: Commit**
```bash
git add src/engine/types.ts src/engine/state.ts tests/helpers.ts
git commit -m "feat(engine): religion state — player pantheon, city religion, religions map"
```

## Task 2.3: Civic effects in the yield/happiness funnels

**Files:** Modify `src/engine/selectors.ts`; Test `tests/religion.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/religion.test.ts`:
```ts
import { cityYields, empireHappiness, empireCivicEffects } from '../src/engine/selectors';

describe('civic effects in the funnels', () => {
  it('a pantheon belief adds its yield to every owner city', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    const before = cityYields(ctx, s, s.cities[id]).total.food;
    s.players[0].pantheon = 'god_of_harvest'; // +1 food/city
    expect(cityYields(ctx, s, s.cities[id]).total.food).toBe(before + 1);
  });

  it('a founder belief with happiness counts once for the empire', () => {
    let s = flatWorld(18, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5); const b = spawn(s, 0, 'settler', 10, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id }); s = thaw(s);
    const cap = Object.keys(s.cities).map(Number)[0];
    const before = empireHappiness(ctx, s, 0).happy;
    s.religions['rel_0'] = { id: 'rel_0', name: 'Test', founder: 0, holyCity: cap, founderBelief: 'papal_primacy', followerBelief: 'feed_the_world' };
    expect(empireHappiness(ctx, s, 0).happy).toBe(before + 3); // +3 once, not +3 per city
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/religion.test.ts -t "civic effects"` — Expected: FAIL (`empireCivicEffects` not exported; no effect applied).

- [ ] **Step 3: Add the selectors (`src/engine/selectors.ts`)** — import `CivicEffect` and `City` types as needed (City already imported). Add near `empireHappiness`:
```ts
export function empireCivicEffects(ctx: Ctx, state: GameState, pid: PlayerId): CivicEffect[] {
  const out: CivicEffect[] = [];
  const p = state.players[pid];
  if (p.pantheon) out.push(ctx.rules.beliefs[p.pantheon].effect);
  const mine = state.religions['rel_' + pid];
  if (mine) out.push(ctx.rules.beliefs[mine.founderBelief].effect);
  // adopted policies are added in Phase 4
  return out;
}

function applyCivicEffect(ctx: Ctx, total: Yields, eff: CivicEffect, city: City): void {
  if (eff.yields) addYields(total, eff.yields);
  if (eff.perBuilding) {
    const n = city.buildings.filter((b) => b === eff.perBuilding!.building).length;
    if (n) for (const k of YIELD_KEYS) total[k] += (eff.perBuilding.yields[k] ?? 0) * n;
  }
}
```
(`CivicEffect` import: add to the `../data/types` type import.)

- [ ] **Step 4: Wire into `cityYields`** — immediately **before** the `if (empireHappiness(...).tier === 'veryUnhappy')` penalty block, add:
```ts
  for (const eff of empireCivicEffects(ctx, state, city.owner)) applyCivicEffect(ctx, total, eff, city);
  // follower belief is added in Phase 3
```

- [ ] **Step 5: Wire into `empireHappiness`** — immediately **before** `const net = happy - unhappy;`, add:
```ts
  for (const eff of empireCivicEffects(ctx, state, pid)) happy += eff.happiness ?? 0;
  // follower-belief happiness (per following city) is added in Phase 3
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/religion.test.ts` (PASS); `npx vitest run tests/happiness.test.ts tests/content.test.ts` (PASS — no civic sources set, so unchanged).

- [ ] **Step 7: Commit**
```bash
git add src/engine/selectors.ts tests/religion.test.ts
git commit -m "feat(engine): empireCivicEffects feed cityYields and empireHappiness"
```

## Task 2.4: Founding actions — pantheon & religion

**Files:** Modify `src/engine/types.ts`, `src/engine/validate.ts`, `src/engine/reducer.ts`; Create `src/engine/systems/religion.ts`; Test `tests/religion.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/religion.test.ts`:
```ts
import { validateAction } from '../src/engine/validate';

describe('founding', () => {
  function capital() {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    return { s, id: Object.keys(s.cities).map(Number)[0] };
  }
  it('founds a pantheon, spending faith', () => {
    const { s } = capital();
    s.players[0].faith = 25;
    const s2 = applyAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'god_of_harvest' });
    expect(s2.players[0].pantheon).toBe('god_of_harvest');
    expect(s2.players[0].faith).toBe(25 - 20);
  });
  it('rejects a pantheon without enough faith or with a non-pantheon belief', () => {
    const { s } = capital();
    s.players[0].faith = 10;
    expect(validateAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'god_of_harvest' }).ok).toBe(false);
    s.players[0].faith = 25;
    expect(validateAction(ctx, s, { type: 'FOUND_PANTHEON', player: 0, belief: 'tithe' }).ok).toBe(false); // founder, not pantheon
  });
  it('founds a religion with theology, faith, and a holy city', () => {
    const { s, id } = capital();
    s.players[0].faith = 70; s.players[0].techs.push('theology');
    const s2 = applyAction(ctx, s, { type: 'FOUND_RELIGION', player: 0, name: 'Sol', holyCity: id, founderBelief: 'tithe', followerBelief: 'feed_the_world' });
    expect(s2.religions['rel_0'].holyCity).toBe(id);
    expect(s2.cities[id].religion).toBe('rel_0');
    expect(s2.players[0].faith).toBe(70 - 60);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/religion.test.ts -t "founding"` — Expected: FAIL (actions unknown).

- [ ] **Step 3: Add the actions to the `Action` union (`src/engine/types.ts`)** (after `SET_SPECIALISTS`):
```ts
  | { type: 'FOUND_PANTHEON'; player: PlayerId; belief: string }
  | { type: 'FOUND_RELIGION'; player: PlayerId; name: string; holyCity: CityId; founderBelief: string; followerBelief: string }
```

- [ ] **Step 4: Create `src/engine/systems/religion.ts`**:
```ts
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
```

- [ ] **Step 5: Validate (`src/engine/validate.ts`)** — add cases:
```ts
    case 'FOUND_PANTHEON': {
      const p = state.players[action.player];
      const bel = ctx.rules.beliefs[action.belief];
      if (!bel || bel.kind !== 'pantheon') return fail('not a pantheon belief');
      if (p.pantheon) return fail('you already have a pantheon');
      if (p.faith < ctx.rules.settings.religion.pantheonCost) return fail('not enough faith');
      return ok;
    }
    case 'FOUND_RELIGION': {
      const p = state.players[action.player];
      const r = ctx.rules.settings.religion;
      if (!p.techs.includes(r.religionTech)) return fail(`requires ${ctx.rules.techs[r.religionTech].name}`);
      if (state.religions['rel_' + action.player]) return fail('you already founded a religion');
      if (Object.keys(state.religions).length >= r.maxReligions) return fail('no religions remain to be founded');
      if (p.faith < r.religionCost) return fail('not enough faith');
      const city = state.cities[action.holyCity];
      if (!city || city.owner !== action.player) return fail('holy city must be yours');
      const fb = ctx.rules.beliefs[action.founderBelief];
      const lb = ctx.rules.beliefs[action.followerBelief];
      if (!fb || fb.kind !== 'founder') return fail('invalid founder belief');
      if (!lb || lb.kind !== 'follower') return fail('invalid follower belief');
      return ok;
    }
```

- [ ] **Step 6: Reducer (`src/engine/reducer.ts`)** — import `foundPantheon, foundReligion` from `./systems/religion`; add cases:
```ts
    case 'FOUND_PANTHEON': {
      foundPantheon(ctx, state, action.player, action.belief);
      break;
    }
    case 'FOUND_RELIGION': {
      foundReligion(ctx, state, action.player, action.name, action.holyCity, action.founderBelief, action.followerBelief);
      break;
    }
```

- [ ] **Step 7: Register toasts** — add `'pantheonFounded'`, `'religionFounded'` to `TOAST_TYPES` in `src/app/driver.ts`.

- [ ] **Step 8: Verify** — `npx tsc --noEmit` (exhaustiveness satisfied); `npx vitest run tests/religion.test.ts` (PASS).

- [ ] **Step 9: Commit**
```bash
git add src/engine/types.ts src/engine/validate.ts src/engine/reducer.ts src/engine/systems/religion.ts src/app/driver.ts tests/religion.test.ts
git commit -m "feat(engine): found pantheons and religions with beliefs"
```

---

# Phase 3 — Spread + follower beliefs

## Task 3.1: `spreadReligions` + turn wiring

**Files:** Modify `src/engine/systems/religion.ts`, `src/engine/systems/turn.ts`, `src/app/driver.ts`; Test `tests/religion.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/religion.test.ts`:
```ts
describe('spread', () => {
  it("a holy city's religion spreads to a nearby city; the holy city stays loyal", () => {
    let s = flatWorld(20, 12, 1);
    const a = spawn(s, 0, 'settler', 4, 5); const b = spawn(s, 0, 'settler', 8, 5); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id }); s = thaw(s);
    const [c0, c1] = Object.keys(s.cities).map(Number);
    s.players[0].faith = 70; s.players[0].techs.push('theology');
    s = applyAction(ctx, s, { type: 'FOUND_RELIGION', player: 0, name: 'Sol', holyCity: c0, founderBelief: 'tithe', followerBelief: 'feed_the_world' });
    for (let i = 0; i < 6; i++) s = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    expect(s.cities[c1].religion).toBe('rel_0'); // converted (dist 4 <= spreadRange 6)
    expect(s.cities[c0].religion).toBe('rel_0'); // holy city loyal
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/religion.test.ts -t "spread"` — Expected: FAIL (c1 never converts).

- [ ] **Step 3: Add `spreadReligions` to `src/engine/systems/religion.ts`** — extend imports to `import type { Ctx, GameState, PlayerId, CityId } from '../types'; import { sortedIds } from '../types'; import { hexDistance } from '../hex'; import { playerCities, cityYields } from '../selectors'; import { pushEvent } from '../events';` and append:
```ts
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
```

- [ ] **Step 4: Wire into `beginTurn` (`src/engine/systems/turn.ts`)** — import `spreadReligions` from `./religion`; add after the `processTradeRoutes(...)` line (step 1b), before the city loop:
```ts
  // 1c. religion spreads by pressure before cities tally their yields
  spreadReligions(ctx, state, pid);
```

- [ ] **Step 5: Toast** — add `'cityConverted'` to `TOAST_TYPES` in `src/app/driver.ts`.

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/religion.test.ts` (PASS); `npx vitest run tests/selfplay.test.ts` (legality/determinism+replay/etc. PASS; seed-314 science per the self-play note).

- [ ] **Step 7: Commit**
```bash
git add src/engine/systems/religion.ts src/engine/systems/turn.ts src/app/driver.ts tests/religion.test.ts
git commit -m "feat(engine): deterministic religion spread by pressure"
```

## Task 3.2: Follower-belief application

**Files:** Modify `src/engine/selectors.ts`; Test `tests/religion.test.ts`

- [ ] **Step 1: Add a failing test** — append to `tests/religion.test.ts`:
```ts
import { followerBelief } from '../src/engine/selectors';

describe('follower belief', () => {
  it('applies its yield in a following city', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    s.religions['rel_0'] = { id: 'rel_0', name: 'Sol', founder: 0, holyCity: id, founderBelief: 'tithe', followerBelief: 'feed_the_world' };
    const before = cityYields(ctx, s, s.cities[id]).total.food;
    s.cities[id].religion = 'rel_0'; // follower feed_the_world → +1 food
    expect(cityYields(ctx, s, s.cities[id]).total.food).toBe(before + 1);
    expect(followerBelief(ctx, s, s.cities[id])?.id).toBe('feed_the_world');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/religion.test.ts -t "follower belief"` — Expected: FAIL (`followerBelief` not exported; no +1).

- [ ] **Step 3: Add `followerBelief` (`src/engine/selectors.ts`)** — import the `BeliefDef` type; add near `empireCivicEffects`:
```ts
export function followerBelief(ctx: Ctx, state: GameState, city: City): BeliefDef | null {
  if (!city.religion) return null;
  const rel = state.religions[city.religion];
  if (!rel) return null;
  return ctx.rules.beliefs[rel.followerBelief] ?? null;
}
```

- [ ] **Step 4: Wire into `cityYields`** — right after the `empireCivicEffects` loop (the `// follower belief is added in Phase 3` comment), add:
```ts
  const fb = followerBelief(ctx, state, city);
  if (fb) applyCivicEffect(ctx, total, fb.effect, city);
```

- [ ] **Step 5: Wire into `empireHappiness`** — right after the `empireCivicEffects` happiness loop (the `// follower-belief happiness ... Phase 3` comment), add:
```ts
  for (const c of cities) {
    const fb = followerBelief(ctx, state, c);
    if (fb?.effect.happiness) happy += fb.effect.happiness;
  }
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/religion.test.ts tests/happiness.test.ts` (PASS).

- [ ] **Step 7: Commit**
```bash
git add src/engine/selectors.ts tests/religion.test.ts
git commit -m "feat(engine): follower beliefs apply in following cities"
```

---

# Phase 4 — Civics / policies

## Task 4.1: Policy type + catalog + validator

**Files:** Modify `src/data/types.ts`, `src/data/standard/index.ts`, `src/data/validate.ts`; Create `src/data/standard/policies.ts`; Test `tests/ruleset.test.ts`

- [ ] **Step 1: Add the type to `src/data/types.ts`** (after `BeliefDef`):
```ts
export interface PolicyDef { id: string; name: string; branch: string; cost: number; prereqs: string[]; effect: CivicEffect; }
```
`Ruleset` gains (after `beliefs: ...`): `policies: Record<string, PolicyDef>;`

- [ ] **Step 2: Create `src/data/standard/policies.ts`**:
```ts
import type { PolicyDef } from '../types';

export const POLICIES: Record<string, PolicyDef> = {
  aristocracy: { id: 'aristocracy', name: 'Aristocracy', branch: 'Tradition', cost: 50, prereqs: [], effect: { yields: { culture: 1 } } },
  monarchy: { id: 'monarchy', name: 'Monarchy', branch: 'Tradition', cost: 80, prereqs: ['aristocracy'], effect: { happiness: 2 } },
  landed_elite: { id: 'landed_elite', name: 'Landed Elite', branch: 'Tradition', cost: 80, prereqs: ['aristocracy'], effect: { yields: { food: 1 } } },
  citizenship: { id: 'citizenship', name: 'Citizenship', branch: 'Liberty', cost: 50, prereqs: [], effect: { yields: { production: 1 } } },
  republic: { id: 'republic', name: 'Republic', branch: 'Liberty', cost: 80, prereqs: ['citizenship'], effect: { yields: { gold: 1 } } },
  meritocracy: { id: 'meritocracy', name: 'Meritocracy', branch: 'Liberty', cost: 80, prereqs: ['citizenship'], effect: { happiness: 2 } },
  organized_religion: { id: 'organized_religion', name: 'Organized Religion', branch: 'Piety', cost: 50, prereqs: [], effect: { yields: { faith: 1 } } },
  theocracy: { id: 'theocracy', name: 'Theocracy', branch: 'Piety', cost: 80, prereqs: ['organized_religion'], effect: { influenceMult: 25 } },
  free_thought: { id: 'free_thought', name: 'Free Thought', branch: 'Piety', cost: 80, prereqs: ['organized_religion'], effect: { yields: { science: 1 } } },
};
```

- [ ] **Step 3: Wire into `src/data/standard/index.ts`** — import `POLICIES` from `./policies`; in `STANDARD_RULESET`, after `beliefs: BELIEFS,` add `policies: POLICIES,`.

- [ ] **Step 4: Extend `validateRuleset` (`src/data/validate.ts`)**:
```ts
  for (const pol of Object.values(rules.policies)) {
    for (const pre of pol.prereqs)
      if (!(pre in rules.policies)) errors.push(`policy ${pol.id}: unknown prereq ${pre}`);
    const pb = pol.effect.perBuilding;
    if (pb && !(pb.building in rules.buildings)) errors.push(`policy ${pol.id}: unknown perBuilding ${pb.building}`);
  }
```

- [ ] **Step 5: Ruleset test** — append inside `describe('standard ruleset', ...)`:
```ts
  it('policy tree is valid and rooted', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
    const roots = Object.values(STANDARD_RULESET.policies).filter((p) => p.prereqs.length === 0);
    expect(roots.length).toBeGreaterThanOrEqual(3); // one opener per branch
  });
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/ruleset.test.ts` (PASS).

- [ ] **Step 7: Commit**
```bash
git add src/data/types.ts src/data/standard/policies.ts src/data/standard/index.ts src/data/validate.ts tests/ruleset.test.ts
git commit -m "feat(data): civics policy tree"
```

## Task 4.2: Policy progress — culture banking

**Files:** Modify `src/engine/types.ts`, `src/engine/systems/cities.ts`, `src/engine/systems/turn.ts`, `src/engine/state.ts`, `tests/helpers.ts`; Test `tests/civics.test.ts` (create)

- [ ] **Step 1: Write the failing test `tests/civics.test.ts`**
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';

function capital() {
  let s = flatWorld(16, 12, 2);
  const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
  return { s, id: Object.keys(s.cities).map(Number)[0] };
}

describe('policy progress', () => {
  it('empire culture banks into policyProgress at turn start', () => {
    const { s, id } = capital();
    s.cities[id].buildings.push('monument'); // +2 culture
    expect(s.players[0].policyProgress).toBe(0);
    let s2 = applyAction(ctx, s, { type: 'END_TURN', player: 0 });
    s2 = applyAction(ctx, s2, { type: 'END_TURN', player: 1 });
    expect(s2.players[0].policyProgress).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/civics.test.ts` — Expected: FAIL (`policyProgress` undefined).

- [ ] **Step 3: `Player` gains policy fields (`src/engine/types.ts`)** — after `pantheon: string | null;`:
```ts
  policies: string[];      // adopted policy ids (permanent)
  policyProgress: number;  // empire culture accumulated toward the next policy
```

- [ ] **Step 4: Surface culture from `processCity` (`src/engine/systems/cities.ts`)** — extend the output and return:
```ts
export interface CityTurnOutput {
  science: number;
  gold: number;
  faith: number;
  culture: number;
}
```
Change the final return to `return { science: total.science, gold: total.gold, faith: total.faith, culture: total.culture };`

- [ ] **Step 5: Bank culture in `beginTurn` (`src/engine/systems/turn.ts`)** — add `let culture = 0;` beside the others, `culture += out.culture;` in the loop, and after `player.faith += faith;` add `player.policyProgress += culture;`

- [ ] **Step 6: Init** — `src/engine/state.ts` Player literal: `policies: [],` and `policyProgress: 0,` (after `pantheon: null,`). `tests/helpers.ts` `flatWorld`: same two.

- [ ] **Step 7: Verify** — `npx tsc --noEmit`; `npx vitest run tests/civics.test.ts tests/replay.test.ts` (PASS).

- [ ] **Step 8: Commit**
```bash
git add src/engine/types.ts src/engine/systems/cities.ts src/engine/systems/turn.ts src/engine/state.ts tests/helpers.ts tests/civics.test.ts
git commit -m "feat(engine): empire culture banks into policy progress"
```

## Task 4.3: `ADOPT_POLICY` + policy effects

**Files:** Modify `src/engine/types.ts`, `src/engine/validate.ts`, `src/engine/reducer.ts`, `src/engine/selectors.ts`, `src/app/driver.ts`; Test `tests/civics.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/civics.test.ts`:
```ts
import { validateAction } from '../src/engine/validate';
import { cityYields } from '../src/engine/selectors';

describe('ADOPT_POLICY', () => {
  it('adopts a policy, spends progress, and the effect applies empire-wide', () => {
    const { s, id } = capital();
    s.players[0].policyProgress = 60;
    const before = cityYields(ctx, s, s.cities[id]).total.culture;
    const s2 = applyAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'aristocracy' }); // +1 culture/city
    expect(s2.players[0].policies).toContain('aristocracy');
    expect(s2.players[0].policyProgress).toBe(60 - 50);
    expect(cityYields(ctx, s2, s2.cities[id]).total.culture).toBe(before + 1);
  });
  it('rejects a policy whose prereq is missing or progress is short', () => {
    const { s } = capital();
    s.players[0].policyProgress = 200;
    expect(validateAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'monarchy' }).ok).toBe(false); // needs aristocracy
    s.players[0].policyProgress = 10;
    expect(validateAction(ctx, s, { type: 'ADOPT_POLICY', player: 0, policy: 'aristocracy' }).ok).toBe(false); // too little culture
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/civics.test.ts -t "ADOPT_POLICY"` — Expected: FAIL (action unknown).

- [ ] **Step 3: Add the action (`src/engine/types.ts`)** (after `FOUND_RELIGION`):
```ts
  | { type: 'ADOPT_POLICY'; player: PlayerId; policy: string }
```

- [ ] **Step 4: Validate (`src/engine/validate.ts`)**:
```ts
    case 'ADOPT_POLICY': {
      const p = state.players[action.player];
      const pol = ctx.rules.policies[action.policy];
      if (!pol) return fail('unknown policy');
      if (p.policies.includes(action.policy)) return fail('already adopted');
      if (!pol.prereqs.every((pre) => p.policies.includes(pre))) return fail('prerequisite policy not yet adopted');
      if (p.policyProgress < pol.cost) return fail('not enough culture');
      return ok;
    }
```

- [ ] **Step 5: Reducer (`src/engine/reducer.ts`)**:
```ts
    case 'ADOPT_POLICY': {
      const p = state.players[action.player];
      p.policyProgress -= ctx.rules.policies[action.policy].cost;
      p.policies.push(action.policy);
      pushEvent(state, { player: action.player, type: 'policyAdopted', msg: `${p.name} adopts ${ctx.rules.policies[action.policy].name}` });
      break;
    }
```

- [ ] **Step 6: Policies feed `empireCivicEffects` (`src/engine/selectors.ts`)** — in `empireCivicEffects`, replace the `// adopted policies are added in Phase 4` comment with:
```ts
  for (const id of p.policies) out.push(ctx.rules.policies[id].effect);
```

- [ ] **Step 7: Toast** — add `'policyAdopted'` to `TOAST_TYPES` in `src/app/driver.ts`.

- [ ] **Step 8: Verify** — `npx tsc --noEmit`; `npx vitest run tests/civics.test.ts tests/happiness.test.ts` (PASS).

- [ ] **Step 9: Commit**
```bash
git add src/engine/types.ts src/engine/validate.ts src/engine/reducer.ts src/engine/selectors.ts src/app/driver.ts tests/civics.test.ts
git commit -m "feat(engine): adopt policies for permanent empire-wide bonuses"
```

---

# Phase 5 — Culture victory (cultural dominance)

## Task 5.1: `cultureTotal`, `influence`, and `checkCultureVictory`

**Files:** Modify `src/engine/types.ts`, `src/engine/state.ts`, `tests/helpers.ts`, `src/engine/systems/turn.ts`, `src/engine/selectors.ts`, `src/engine/systems/victory.ts`; Test `tests/civics.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/civics.test.ts`:
```ts
describe('culture victory', () => {
  function twoEmpires(turn: number) {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 5, 5); spawn(s, 1, 'warrior', 1, 10); refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id }); s = thaw(s);
    s.turn = turn; s.currentPlayer = 1;
    s.players[0].cultureTotal = 1000;
    s.players[1].cultureTotal = 100; // 1000 >= 100 × dominanceFactor(2)
    return s;
  }
  it('cultural dominance wins past minTurn', () => {
    const s = twoEmpires(200);
    const s2 = applyAction(ctx, s, { type: 'END_TURN', player: 1 }); // wraps to player 0's beginTurn
    expect(s2.winner).toEqual({ player: 0, victory: 'culture' });
  });
  it('does not fire before minTurn', () => {
    const s = twoEmpires(100);
    const s2 = applyAction(ctx, s, { type: 'END_TURN', player: 1 });
    expect(s2.winner).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/civics.test.ts -t "culture victory"` — Expected: FAIL (`cultureTotal` undefined; no culture winner).

- [ ] **Step 3: Add `cultureTotal` (`src/engine/types.ts`)** — `Player` after `policyProgress: number;`: `cultureTotal: number;`. Extend the winner union: `winner: { player: PlayerId; victory: 'conquest' | 'score' | 'science' | 'culture' } | null;`

- [ ] **Step 4: Init** — `src/engine/state.ts` Player literal: `cultureTotal: 0,`; `tests/helpers.ts` `flatWorld` player literal: `cultureTotal: 0,`.

- [ ] **Step 5: Bank cultureTotal (`src/engine/systems/turn.ts`)** — after `player.policyProgress += culture;` add `player.cultureTotal += culture;`

- [ ] **Step 6: `influence` selector (`src/engine/selectors.ts`)**:
```ts
export function influence(ctx: Ctx, state: GameState, pid: PlayerId): number {
  const p = state.players[pid];
  let mult = 100;
  for (const eff of empireCivicEffects(ctx, state, pid)) mult += eff.influenceMult ?? 0;
  let wonders = 0;
  for (const wid of Object.keys(state.wondersBuilt))
    if (state.cities[state.wondersBuilt[wid]]?.owner === pid) wonders++;
  return Math.floor((p.cultureTotal * mult) / 100) + wonders * ctx.rules.settings.victory.culture.perWonder;
}
```

- [ ] **Step 7: `checkCultureVictory` (`src/engine/systems/victory.ts`)** — import `influence` from `../selectors` (add to the existing selectors import); add:
```ts
/** Win when, past minTurn, your influence dominates every living rival's culture. */
export function checkCultureVictory(ctx: Ctx, state: GameState, pid: PlayerId): void {
  if (state.phase !== 'playing') return;
  const cv = ctx.rules.settings.victory.culture;
  if (state.turn < cv.minTurn) return;
  const rivals = state.players.filter((r) => r.alive && r.id !== pid);
  if (rivals.length === 0) return;
  const inf = influence(ctx, state, pid);
  for (const r of rivals) if (inf < r.cultureTotal * cv.dominanceFactor) return;
  state.winner = { player: pid, victory: 'culture' };
  state.phase = 'ended';
  pushEvent(state, { player: null, type: 'victory', msg: `${state.players[pid].name}'s culture echoes across the ages!` });
}
```

- [ ] **Step 8: Call it from `beginTurn` (`src/engine/systems/turn.ts`)** — import `checkCultureVictory` from `./victory`; after the `player.cultureTotal += culture;` / research block (before `processObligations`), add:
```ts
  checkCultureVictory(ctx, state, pid);
  if (state.phase === 'ended') return;
```

- [ ] **Step 9: Verify** — `npx tsc --noEmit`; `npx vitest run tests/civics.test.ts` (PASS); `npx vitest run tests/selfplay.test.ts` (legality/determinism/etc. PASS; seed-314 science per the self-play note). NOTE: widening the winner union may make `VictoryOverlay` in `src/ui/panels/Modals.tsx` non-exhaustive — if `tsc` flags it, add the `'culture'` branch now (the change described in Task 7.3 Step 2) to keep `tsc` green.

- [ ] **Step 10: Commit**
```bash
git add src/engine/types.ts src/engine/state.ts tests/helpers.ts src/engine/systems/turn.ts src/engine/selectors.ts src/engine/systems/victory.ts tests/civics.test.ts
git commit -m "feat(engine): cultural-dominance culture victory"
```

---

# Phase 6 — AI: found pantheons/religions, adopt policies, build shrines

## Task 6.1: Civic/religion AI decisions

**Files:** Create `src/ai/civics.ts`; Modify `src/ai/decide.ts`, `src/ai/economy.ts`; Test `tests/civics.test.ts`

- [ ] **Step 1: Add failing tests** — append to `tests/civics.test.ts`:
```ts
import { civicAction } from '../src/ai/civics';

describe('AI civics', () => {
  it('founds a pantheon when it can afford one', () => {
    const { s } = capital();
    s.players[0].faith = 25;
    expect(civicAction(ctx, s, 0)?.type).toBe('FOUND_PANTHEON');
  });
  it('adopts an available policy when no religion step is pending', () => {
    const { s } = capital();
    s.players[0].faith = 0;            // no pantheon/religion step
    s.players[0].policyProgress = 60;  // can afford a 50-cost opener
    expect(civicAction(ctx, s, 0)?.type).toBe('ADOPT_POLICY');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/civics.test.ts -t "AI civics"` — Expected: FAIL (`civicAction` missing).

- [ ] **Step 3: Create `src/ai/civics.ts`**:
```ts
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
```

- [ ] **Step 4: Wire into `decide` (`src/ai/decide.ts`)** — import `civicAction` from `./civics`. After the diplomacy block (the `// 1b. diplomacy` section), before the city-production loop (`// 2. idle cities choose production`), add:
```ts
  // 1d. religion & civics: at most one founding/adoption per turn
  const civic = civicAction(ctx, state, pid);
  if (civic) {
    const d = tryDecision({ action: civic, reason: civic.type === 'ADOPT_POLICY' ? 'adopting a civic policy' : civic.type === 'FOUND_RELIGION' ? 'founding a religion' : 'founding a pantheon' });
    if (d) return d;
  }
```

- [ ] **Step 5: Build shrines + reach theology (`src/ai/economy.ts`)** — add `'shrine'` to `BUILDING_PRIORITY` (after `'monument'`). In `pickResearch`, ensure `'theology'` is reachable: in the peace priority list, move `'theology'` to just after `'philosophy'` so faith-capable AIs pursue religion.

- [ ] **Step 6: Verify** — `npx tsc --noEmit`; `npx vitest run tests/civics.test.ts` (PASS); `npx vitest run tests/selfplay.test.ts` (legality/determinism+replay/etc. PASS; seed-314 science per the self-play note).

- [ ] **Step 7: Commit**
```bash
git add src/ai/civics.ts src/ai/decide.ts src/ai/economy.ts tests/civics.test.ts
git commit -m "feat(ai): found pantheons/religions, adopt policies, build shrines"
```

---

# Phase 7 — UI: civics screen, founding modals, religion readouts

(UI is verified by `npx tsc --noEmit` + `npm run build`, not unit tests. UI must NOT import `src/ai/`.)

## Task 7.1: Civics (policy tree) overlay

**Files:** Create `src/ui/panels/Civics.tsx`; Modify `src/app/store.ts`, `src/ui/GameScreen.tsx`, `src/ui/panels/TopBar.tsx`, `src/ui/debug.ts`

- [ ] **Step 1: Add `'civics'` to the overlay union (`src/app/store.ts`)**:
```ts
  overlay: 'tech' | 'menu' | 'diplomacy' | 'civics' | null;
```

- [ ] **Step 2: Create `src/ui/panels/Civics.tsx`** (mirrors `TechTree`, reusing its CSS classes — `overlay-scrim`, `tech-head`, `tech-scroll`, `tech-grid`, `tech-era-label`, `tech-node`, `is-known`/`is-available`/`is-locked`, `cost`):
```tsx
import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { IconAmphora } from '../icons';

const COL_W = 240;
const ROW_H = 110;

export function Civics() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];
  const policies = Object.values(gameCtx.rules.policies);
  const branches = [...new Set(policies.map((p) => p.branch))].sort();
  const adopted = new Set(player.policies);
  const depth = (id: string): number => {
    const p = gameCtx.rules.policies[id];
    return p.prereqs.length ? 1 + Math.max(...p.prereqs.map(depth)) : 0;
  };
  const canAdopt = (p: (typeof policies)[number]) =>
    !adopted.has(p.id) && p.prereqs.every((pre) => adopted.has(pre)) && player.policyProgress >= p.cost;
  const close = () => appStore.set({ overlay: null });

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="tech-head" onClick={(e) => e.stopPropagation()}>
        <h2>THE SOCIAL ORDER</h2>
        <span style={{ color: 'var(--ivory-dim)', fontSize: 13 }}>
          <IconAmphora size={12} /> {player.policyProgress} culture banked toward the next policy
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={close}>Close (Esc)</button>
      </div>
      <div className="tech-scroll scroll-quiet" onClick={(e) => e.stopPropagation()}>
        <div className="tech-grid" style={{ width: branches.length * COL_W + 40, height: 5 * ROW_H }}>
          {branches.map((br, ci) => (
            <div key={br} className="tech-era-label" style={{ left: ci * COL_W + 6 }}>{br}</div>
          ))}
          {policies.map((p) => {
            const ci = branches.indexOf(p.branch);
            const ri = depth(p.id);
            const state = adopted.has(p.id) ? 'is-known' : canAdopt(p) ? 'is-available' : 'is-locked';
            return (
              <div
                key={p.id}
                className={`tech-node ${state}`}
                style={{ left: ci * COL_W + 6, top: ri * ROW_H + 24 }}
                onClick={() => {
                  if (state === 'is-available' && isMyTurn())
                    humanDispatch({ type: 'ADOPT_POLICY', player: viewer, policy: p.id });
                }}
              >
                <h4>{p.name}</h4>
                <div className="cost"><IconAmphora size={11} /> {p.cost}{adopted.has(p.id) ? ' · adopted' : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount + open it** — `src/ui/GameScreen.tsx`: import `Civics`; add `{overlay === 'civics' && <Civics />}` beside the tech overlay; add a keyboard case `case 'KeyC': appStore.set({ overlay: ov === 'civics' ? null : 'civics' }); break;`. `src/ui/panels/TopBar.tsx`: add a button near the other top-bar buttons: `<button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'civics' })} title="Civics (C)">Civics</button>`.

- [ ] **Step 4: Debug bridge (`src/ui/debug.ts`)** — add `adoptPolicy(policy: string)` to `DebugApi` + impl dispatching `ADOPT_POLICY` for the viewing player.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `npm run build`.

- [ ] **Step 6: Commit**
```bash
git add src/ui/panels/Civics.tsx src/app/store.ts src/ui/GameScreen.tsx src/ui/panels/TopBar.tsx src/ui/debug.ts
git commit -m "feat(ui): civics policy-tree overlay"
```

## Task 7.2: Founding modals (pantheon & religion)

**Files:** Modify `src/app/store.ts`, `src/ui/panels/Modals.tsx`, `src/ui/GameScreen.tsx`, `src/ui/panels/TopBar.tsx`, `src/ui/debug.ts`

- [ ] **Step 1: Store flag (`src/app/store.ts`)** — add to `AppState`: `religionModal: 'pantheon' | 'religion' | null;` and to `initial`: `religionModal: null,`.

- [ ] **Step 2: Add a `ReligionModal` to `src/ui/panels/Modals.tsx`** (follow the `TradeRouteModal` pattern — reuse `useApp`, `appStore`, `gameCtx`, `humanDispatch`). It reads `religionModal`; for `'pantheon'` it lists beliefs with `kind === 'pantheon'` (dispatch `FOUND_PANTHEON`); for `'religion'` it lists `founder` and `follower` beliefs as two pick lists plus a name input (default the civ name) and uses the player's first city (`playerCities(game, viewer)[0]` — note `playerCities(state, pid)` takes no ctx) as the Holy City, dispatching `FOUND_RELIGION`. On dispatch, clear the flag. Outer wrapper: `<div className="modal-center" onClick={clear}><div className="modal-card plate" onClick={(e)=>e.stopPropagation()}>…</div></div>`. Validate each option's enabling with `validateAction` (so only affordable/eligible beliefs are pickable). Render nothing when `religionModal === null`.

- [ ] **Step 3: Mount + triggers** — `src/ui/GameScreen.tsx`: import + render `<ReligionModal />`. `src/ui/panels/TopBar.tsx`: beside the faith chip, conditionally render trigger buttons — a "Found Pantheon" button when `!player.pantheon && player.faith >= gameCtx.rules.settings.religion.pantheonCost` (sets `religionModal: 'pantheon'`), and a "Found Religion" button when the player has the `religionTech`, no `religions['rel_'+viewer]`, a free slot, and `faith >= religionCost` (sets `religionModal: 'religion'`).

- [ ] **Step 4: Debug bridge (`src/ui/debug.ts`)** — add `foundPantheon(belief)`, `foundReligion(name, holyCity, founderBelief, followerBelief)` to `DebugApi` + impls.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `npm run build`.

- [ ] **Step 6: Commit**
```bash
git add src/app/store.ts src/ui/panels/Modals.tsx src/ui/GameScreen.tsx src/ui/panels/TopBar.tsx src/ui/debug.ts
git commit -m "feat(ui): pantheon and religion founding modals"
```

## Task 7.3: Religion readouts + culture-victory text

**Files:** Modify `src/ui/panels/CityPanel.tsx`, `src/ui/panels/Modals.tsx`, `src/ui/debug.ts`

- [ ] **Step 1: City religion line (`src/ui/panels/CityPanel.tsx`)** — under the header, when `city.religion` is set, render the religion name: `{city.religion && <div className="city-religion">Follows {game.religions[city.religion]?.name}</div>}`.

- [ ] **Step 2: Culture-victory text (`src/ui/panels/Modals.tsx`)** — in `VictoryOverlay`, where it renders text by `winner.victory`, add a `'culture'` branch (headline e.g. "A Cultural Triumph", body e.g. "Your culture echoes across the ages."). Match the structure of the existing `conquest`/`score`/`science` branches.

- [ ] **Step 3: Debug bridge (`src/ui/debug.ts`)** — add `influence()` returning `{ [pid]: influence } ` for all players (import `influence` from `../engine/selectors`) and `religions()` returning `Object.values(game.religions)`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`; `npm run build`. (Optional manual: found a religion via the modal, open Civics, adopt a policy, watch the city religion line + faith chip update.)

- [ ] **Step 5: Commit**
```bash
git add src/ui/panels/CityPanel.tsx src/ui/panels/Modals.tsx src/ui/debug.ts
git commit -m "feat(ui): city religion line, culture-victory text, debug hooks"
```

---

# Phase 8 — Balance, self-play assertions, and finishing

## Task 8.1: Self-play assertions + telemetry

**Files:** Modify `tests/selfplay.test.ts`

- [ ] **Step 1: Add a self-play test** — append to `tests/selfplay.test.ts`:
```ts
import { influence } from '../src/engine/selectors';

describe('culture & religion in self-play', () => {
  it('religions are founded and spread, and policies are adopted (and it replays)', () => {
    const { state, log } = runGame(4242, 180);
    const religions = Object.keys(state.religions).length;
    expect(religions, 'religions founded').toBeGreaterThan(0);
    const converted = Object.values(state.cities).filter((c) => c.religion).length;
    expect(converted, 'cities following a religion').toBeGreaterThan(religions); // spread beyond holy cities
    const policies = state.players.reduce((n, p) => n + p.policies.length, 0);
    expect(policies, 'policies adopted').toBeGreaterThan(0);
    let replay = initialState(config(4242), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 200_000);
});
```

- [ ] **Step 2: Extend the balance-telemetry row** — in the `balance telemetry` test, add to each row: `faith: p.faith`, `policies: p.policies.length`, `religion: !!state.religions['rel_' + p.id]`, `influence: influence(ctx, state, p.id)`.

- [ ] **Step 3: Run + pick a seed** — `npx vitest run tests/selfplay.test.ts -t "culture & religion"`. If a count is 0 with seed 4242, try other seeds (7, 314, 31415, 20260613) and pick one where religions/spread/policies all occur; use it.

- [ ] **Step 4: Commit**
```bash
git add tests/selfplay.test.ts
git commit -m "test: self-play assertions for religion spread and policies; telemetry"
```

## Task 8.2: Tune balance + the culture victory's reachability

**Files:** Modify `src/data/standard/index.ts` (religion + victory.culture values; faith of Shrine/Temple if needed)

**Goal (acceptance gate):** the systems are exercised and the culture victory is *reachable* without breaking the others.

- [ ] **Step 1: Read telemetry** — run the `balance telemetry` test and inspect the `faith`/`policies`/`religion`/`influence` columns across several seeds (vary the seed temporarily).
- [ ] **Step 2: Tune** the `religion` and `victory.culture` values in `src/data/standard/index.ts`:
  - If religions never get founded → lower `pantheonCost`/`religionCost`, or raise Shrine/Temple faith.
  - If religions never spread beyond holy cities → raise `pressurePerCity`/`spreadRange` or `holyCityFaithDiv` (more faith→pressure).
  - If no policies adopted → policy `cost`s are too high relative to culture; lower them (in `policies.ts`) or confirm culture banking.
  - The **culture victory must be reachable**: confirm at least one seed ends in a `'culture'` win by ~the turn limit (add it to the self-play assertion if you find a reliable seed, mirroring the science-victory test); tune `dominanceFactor`/`minTurn`/`perWonder` so a culture-leaning AI can win without it being trivial. If it can't be reached without distorting the game, prefer a modest `dominanceFactor` reduction; document the final values in a comment.
- [ ] **Step 3: Acceptance** — `npx vitest run` passes entirely. The science-victory test (seed 314) MUST still pass (re-tune or, only as a documented last resort, re-seed it as Phase-6/Task-6.2 of the prior track did). The known harmless Vitest IPC `onTaskUpdate` timeout prints after long runs — judge by test counts, not that log. `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit**
```bash
git add src/data/standard/index.ts src/data/standard/policies.ts
git commit -m "balance: tune religion, civics, and culture-victory values via self-play"
```

## Task 8.3: Final holistic review + finish

- [ ] **Step 1: Full green** — `npx tsc --noEmit && npx vitest run && npm run build` (all pass).
- [ ] **Step 2: Holistic review** — the final review step of `superpowers:subagent-driven-development`: dispatch a final reviewer over the whole `feature/culture-religion` diff vs `main`, checking engine purity/determinism (no `Math.random`/`Date`/transcendentals; integer math; `sortedIds`; the 6th-yield consistency; religion spread determinism + replay), engine/ai/ui layering (UI must not import `src/ai/`), spec coverage (faith, religion+spread, civics, culture victory, AI, UI), and that the four systems compose cleanly in `cityYields`/`empireHappiness` (no double-counting; empire-vs-follower happiness correct). Apply fixups as small, test-guarded commits.
- [ ] **Step 3: Finish** — use `superpowers:finishing-a-development-branch` to verify tests and present merge options for `feature/culture-religion` → `main`.

---

## Plan self-review (author check against the spec)

- **Faith (spec §1):** 6th yield (T1.1), Shrine/Temple (T1.2), pool banking + allocation weight + schema (T1.3), TopBar chip (T1.4). ✓
- **Religion (spec §2):** belief catalog + settings + validator (T2.1), state (T2.2), `empireCivicEffects` in funnels (T2.3), founding actions + `religion.ts` (T2.4), spread (T3.1), follower beliefs (T3.2). ✓
- **Civics (spec §3):** policy catalog + validator (T4.1), culture banking (T4.2), `ADOPT_POLICY` + policy effects (T4.3). ✓
- **Culture victory (spec §4):** `cultureTotal`/`influence`/`checkCultureVictory` + `'culture'` winner (T5.1), VictoryOverlay text (T7.3). ✓
- **AI:** civic/religion decisions + shrines + theology (T6.1). **UI:** civics overlay (T7.1), founding modals (T7.2), readouts (T7.3). **Balance/testing:** self-play + telemetry (T8.1), tuning gate (T8.2), holistic + finish (T8.3). ✓
- **Effect vocabulary** (`CivicEffect`) shared by beliefs + policies; applied via `applyCivicEffect`; empire-wide happiness counted once (T2.3/T2.5) vs per-following-city follower happiness (T3.2). ✓
- **Determinism/serialization:** integer math + `sortedIds`; schema → 5 (T1.3); replay assertions (T8.1). ✓
- **Non-goals** respected: no prophets/missionaries, no faith-buying, no great-works, no policy swapping, one founder+one follower belief, diplomacy unchanged. ✓
- **Type consistency:** `CivicEffect`, `BeliefDef`/`PolicyDef`, `ReligionState`, `empireCivicEffects`/`followerBelief`/`influence`, `civicAction`, and the three new actions are used identically across tasks. `CityTurnOutput` grows `faith` (T1.3) then `culture` (T4.2); `empireCivicEffects` grows policies (T4.3); `cityYields`/`empireHappiness` gain civic wiring in T2.3 and follower wiring in T3.2 — ordering noted so edits land coherently.

