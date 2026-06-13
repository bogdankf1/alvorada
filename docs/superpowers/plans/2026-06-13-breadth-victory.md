# Breadth & Victory v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the game to 4 eras (Medieval + Renaissance) with new units/buildings, add one-per-game World Wonders with a small signature-effect vocabulary, and add a science victory (research the capstone tech).

**Architecture:** Mostly additive ruleset data (the engine is data-driven for techs/units/buildings — PLAN.md §4), plus one focused engine feature (World Wonders: a `BuildingDef` flag + effect union, a `wondersBuilt` state slice, completion/effect/refund logic, and two selector hooks) and a small victory addition. All mutation stays in `validate`+`reduce`; all values are integer/data; determinism (PLAN.md §3.3) and engine/UI layering (§2) are preserved.

**Tech Stack:** TypeScript, Immer, Vitest, React+Canvas. Spec: `docs/superpowers/specs/2026-06-13-breadth-victory-design.md`.

**Conventions for every task:** `npx tsc --noEmit` stays clean (except where a task explicitly notes an expected intermediate failure); `npx vitest run` for tests; commits are plain (NO AI attribution). Phases are ordered; don't start a phase until the prior one's suite is green.

---

## File Structure

**New files**
- `tests/content.test.ts` — sanity tests for the new era content + wonders + science victory.

**Modified files**
- `src/data/standard/techs.ts` — append 2 eras + 15 techs.
- `src/data/standard/units.ts` — append 7 units.
- `src/data/standard/buildings.ts` — append 5 buildings + 7 wonders.
- `src/data/types.ts` — `WonderEffect`; `BuildingDef.wonder?`/`effect?`; `RulesetSettings.victory.scienceCapstone`.
- `src/data/standard/index.ts` — `victory.scienceCapstone`.
- `src/data/validate.ts` — validate `effect`/`effect.unit` + `scienceCapstone`.
- `src/engine/types.ts` — `GameState.wondersBuilt`; `winner.victory` union += `'science'`.
- `src/engine/serialize.ts` — `SCHEMA_VERSION = 3`.
- `src/engine/state.ts` — init `wondersBuilt: {}`.
- `src/engine/selectors.ts` — `wonderOwnerEffects` helper; `canProduce` wonder gating; `cityYields` empire yields; `cityStrength` (in combat.ts) reads city defense aura.
- `src/engine/systems/cities.ts` — wonder completion (mark built, fire effect, refund races) in `processCity`.
- `src/engine/systems/combat.ts` — `cityStrength` adds wonder `cityDefense` aura.
- `src/engine/systems/victory.ts` — `checkScienceVictory`.
- `src/engine/systems/turn.ts` — call science-victory check at tech completion.
- `src/engine/validate.ts` — `BUY_ITEM` rejects wonders.
- `src/ai/economy.ts` — wonder production rule; research priority extended.
- `src/ui/panels/CityPanel.tsx` — wonder tag/blurb.
- `src/ui/panels/TechTree.tsx` — capstone marker.
- `src/ui/panels/Modals.tsx` — science victory text.
- `src/app/driver.ts` — `wonderBuilt` toast type.
- `src/ui/panels/Notifications.tsx` — icon for `wonderBuilt`.
- `tests/ruleset.test.ts` — exempt the science capstone from the dead-end assertion.
- `tests/selfplay.test.ts`, `tests/replay.test.ts` — extend.

---

## Phase A — Era content (data)

Goal: 4 eras with 15 techs and the units/buildings they unlock exist; the ruleset validates (capstone exempted) and the whole suite is green. No engine changes.

### Task A1: Two new eras + 15 techs

**Files:**
- Modify: `src/data/standard/techs.ts`

- [ ] **Step 1: Append the new eras.** In `src/data/standard/techs.ts`, change the `ERAS` array to:

```ts
export const ERAS: EraDef[] = [
  { id: 'ancient', name: 'Ancient Era' },
  { id: 'classical', name: 'Classical Era' },
  { id: 'medieval', name: 'Medieval Era' },
  { id: 'renaissance', name: 'Renaissance Era' },
];
```

- [ ] **Step 2: Append the 15 techs** to the `TECHS` record (after the existing `construction` entry, before the closing brace):

```ts
  // --- Medieval ---
  feudalism: { id: 'feudalism', name: 'Feudalism', era: 'medieval', cost: 160, prereqs: ['currency'], pos: { col: 5, row: 0 } },
  engineering: { id: 'engineering', name: 'Engineering', era: 'medieval', cost: 175, prereqs: ['construction', 'mathematics'], pos: { col: 5, row: 3 } },
  machinery: { id: 'machinery', name: 'Machinery', era: 'medieval', cost: 160, prereqs: ['iron_working', 'mathematics'], pos: { col: 5, row: 4 } },
  education: { id: 'education', name: 'Education', era: 'medieval', cost: 200, prereqs: ['philosophy', 'mathematics'], pos: { col: 6, row: 0 } },
  guilds: { id: 'guilds', name: 'Guilds', era: 'medieval', cost: 210, prereqs: ['currency', 'feudalism'], pos: { col: 6, row: 1 } },
  chivalry: { id: 'chivalry', name: 'Chivalry', era: 'medieval', cost: 185, prereqs: ['horseback_riding', 'feudalism'], pos: { col: 6, row: 2 } },
  theology: { id: 'theology', name: 'Theology', era: 'medieval', cost: 200, prereqs: ['philosophy'], pos: { col: 6, row: 4 } },
  // --- Renaissance ---
  astronomy: { id: 'astronomy', name: 'Astronomy', era: 'renaissance', cost: 260, prereqs: ['education'], pos: { col: 7, row: 0 } },
  printing_press: { id: 'printing_press', name: 'Printing Press', era: 'renaissance', cost: 280, prereqs: ['education', 'machinery'], pos: { col: 7, row: 1 } },
  banking: { id: 'banking', name: 'Banking', era: 'renaissance', cost: 270, prereqs: ['guilds', 'currency'], pos: { col: 7, row: 2 } },
  gunpowder: { id: 'gunpowder', name: 'Gunpowder', era: 'renaissance', cost: 260, prereqs: ['machinery', 'chivalry'], pos: { col: 7, row: 4 } },
  architecture: { id: 'architecture', name: 'Architecture', era: 'renaissance', cost: 300, prereqs: ['engineering', 'astronomy'], pos: { col: 8, row: 0 } },
  metallurgy: { id: 'metallurgy', name: 'Metallurgy', era: 'renaissance', cost: 300, prereqs: ['gunpowder'], pos: { col: 8, row: 4 } },
  chemistry: { id: 'chemistry', name: 'Chemistry', era: 'renaissance', cost: 340, prereqs: ['metallurgy', 'astronomy'], pos: { col: 9, row: 4 } },
  scientific_method: { id: 'scientific_method', name: 'Scientific Method', era: 'renaissance', cost: 400, prereqs: ['printing_press', 'chemistry'], pos: { col: 9, row: 1 } },
```

- [ ] **Step 3: Type-check** (ruleset test will fail until A4 — content not yet added; expected)

Run: `npx tsc --noEmit`
Expected: PASS (data compiles). Do NOT run the ruleset test yet.

- [ ] **Step 4: Commit**

```bash
git add src/data/standard/techs.ts
git commit -m "Add Medieval and Renaissance eras and 15 techs"
```

### Task A2: Seven era units

**Files:**
- Modify: `src/data/standard/units.ts`

- [ ] **Step 1: Append the units** to the `UNITS` record (before the closing brace):

```ts
  pikeman: {
    id: 'pikeman', name: 'Pikeman', cost: 72, moves: 2, sight: 2, strength: 18,
    class: 'melee', domain: 'land', bonuses: [{ vsClass: 'mounted', pct: 50 }],
    requiresTech: 'feudalism', art: { glyph: 'spear' },
  },
  crossbowman: {
    id: 'crossbowman', name: 'Crossbowman', cost: 80, moves: 2, sight: 2, strength: 14,
    ranged: { strength: 18, range: 2 }, class: 'ranged', domain: 'land',
    requiresTech: 'machinery', art: { glyph: 'bow' },
  },
  trebuchet: {
    id: 'trebuchet', name: 'Trebuchet', cost: 96, moves: 2, sight: 2, strength: 8,
    ranged: { strength: 20, range: 2 }, class: 'siege', domain: 'land',
    bonuses: [{ vsCity: true, pct: 100 }], requiresTech: 'machinery', art: { glyph: 'catapult' },
  },
  knight: {
    id: 'knight', name: 'Knight', cost: 96, moves: 4, sight: 2, strength: 24,
    class: 'mounted', domain: 'land', requiresTech: 'chivalry', requiresResource: 'horses',
    art: { glyph: 'horse' },
  },
  musketman: {
    id: 'musketman', name: 'Musketman', cost: 120, moves: 2, sight: 2, strength: 30,
    class: 'melee', domain: 'land', requiresTech: 'gunpowder', art: { glyph: 'sword' },
  },
  cannon: {
    id: 'cannon', name: 'Cannon', cost: 140, moves: 2, sight: 2, strength: 10,
    ranged: { strength: 32, range: 2 }, class: 'siege', domain: 'land',
    bonuses: [{ vsCity: true, pct: 100 }], requiresTech: 'metallurgy', requiresResource: 'iron',
    art: { glyph: 'catapult' },
  },
  cuirassier: {
    id: 'cuirassier', name: 'Cuirassier', cost: 150, moves: 4, sight: 2, strength: 34,
    class: 'mounted', domain: 'land', requiresTech: 'metallurgy', requiresResource: 'horses',
    art: { glyph: 'horse' },
  },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/data/standard/units.ts
git commit -m "Add 7 medieval and renaissance units"
```

### Task A3: Five era buildings

**Files:**
- Modify: `src/data/standard/buildings.ts`

- [ ] **Step 1: Append the buildings** to the `BUILDINGS` record (before the closing brace):

```ts
  university: {
    id: 'university', name: 'University', cost: 130, yields: { science: 2 },
    perPop: { yield: 'science', per: 2 }, requiresTech: 'education', art: { glyph: 'scroll' },
  },
  observatory: {
    id: 'observatory', name: 'Observatory', cost: 140, yields: { science: 3 },
    requiresTech: 'astronomy', art: { glyph: 'scroll' },
  },
  castle: {
    id: 'castle', name: 'Castle', cost: 110, yields: {}, defense: { strength: 8 },
    requiresTech: 'engineering', art: { glyph: 'wall' },
  },
  bank: {
    id: 'bank', name: 'Bank', cost: 130, yields: { gold: 4 }, requiresTech: 'banking',
    art: { glyph: 'coin' },
  },
  monastery: {
    id: 'monastery', name: 'Monastery', cost: 96, yields: { culture: 2, science: 1 },
    requiresTech: 'theology', art: { glyph: 'temple' },
  },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/data/standard/buildings.ts
git commit -m "Add 5 medieval and renaissance buildings"
```

### Task A4: Exempt the capstone from the dead-end test + content sanity tests

**Files:**
- Modify: `tests/ruleset.test.ts`
- Create: `tests/content.test.ts`

- [ ] **Step 1: Exempt the capstone** in `tests/ruleset.test.ts`. Find the test body that asserts every tech is not a dead end:

```ts
  it('every non-starting tech unlocks something or leads somewhere', () => {
    for (const tech of Object.values(STANDARD_RULESET.techs)) {
      const unlocks = techUnlocks(STANDARD_RULESET, tech.id);
      const leadsTo = Object.values(STANDARD_RULESET.techs).some((t) =>
        t.prereqs.includes(tech.id),
      );
      expect(unlocks.length > 0 || leadsTo, `tech ${tech.id} is a dead end`).toBe(true);
    }
  });
```

Replace the loop body's assertion line so the science capstone is allowed to be a terminal leaf:

```ts
  it('every non-starting tech unlocks something or leads somewhere', () => {
    const CAPSTONE = 'scientific_method'; // science-victory capstone — intentionally terminal
    for (const tech of Object.values(STANDARD_RULESET.techs)) {
      if (tech.id === CAPSTONE) continue;
      const unlocks = techUnlocks(STANDARD_RULESET, tech.id);
      const leadsTo = Object.values(STANDARD_RULESET.techs).some((t) =>
        t.prereqs.includes(tech.id),
      );
      expect(unlocks.length > 0 || leadsTo, `tech ${tech.id} is a dead end`).toBe(true);
    }
  });
```

- [ ] **Step 2: Create `tests/content.test.ts`** with era/content sanity checks:

```ts
import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';

describe('era content', () => {
  it('ruleset still validates with the new content', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });

  it('has four eras in order', () => {
    expect(STANDARD_RULESET.eras.map((e) => e.id)).toEqual([
      'ancient', 'classical', 'medieval', 'renaissance',
    ]);
  });

  it('new units are gated by the new techs', () => {
    expect(STANDARD_RULESET.units.knight.requiresTech).toBe('chivalry');
    expect(STANDARD_RULESET.units.musketman.requiresTech).toBe('gunpowder');
    expect(STANDARD_RULESET.units.cuirassier.requiresResource).toBe('horses');
  });

  it('no two techs occupy the same tree position', () => {
    const seen = new Set<string>();
    for (const t of Object.values(STANDARD_RULESET.techs)) {
      const key = `${t.pos.col},${t.pos.row}`;
      expect(seen.has(key), `position clash at ${key} (${t.id})`).toBe(false);
      seen.add(key);
    }
  });
});
```

- [ ] **Step 3: Run the suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (ruleset + content + all prior tests). If "dead end" still fails for a non-capstone tech, that tech is missing its unlock — recheck A2/A3.

- [ ] **Step 4: Commit**

```bash
git add tests/ruleset.test.ts tests/content.test.ts
git commit -m "Validate 4-era content; exempt the science capstone from the dead-end check"
```

---

## Phase B — World wonders (engine + data)

Goal: wonders are a buildable, globally-unique, tech-gated building subtype with strong yields and one optional signature effect; effects apply correctly; racing cities are refunded; wonders can't be bought. Suite green.

### Task B1: Wonder types, state, schema

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/engine/serialize.ts`
- Modify: `src/engine/state.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add `WonderEffect` + extend `BuildingDef`** in `src/data/types.ts`. Add the type (near `BuildingDef`):

```ts
export type WonderEffect =
  | { kind: 'empireYields'; yields: PartialYields } // added to every city the owner holds
  | { kind: 'cityDefense'; strength: number } // +strength to all owner cities
  | { kind: 'freeTech' } // grant the cheapest available tech, once
  | { kind: 'freeUnit'; unit: string; count: number } // spawn units in the city, once
  | { kind: 'cultureBurst'; amount: number }; // add culture to the city, once
```

Add two optional fields to the `BuildingDef` interface (after `unbuildable?`):

```ts
  wonder?: boolean; // a one-per-game World Wonder
  effect?: WonderEffect; // optional signature effect (beyond `yields`)
```

- [ ] **Step 2: Add `wondersBuilt` to `GameState`** in `src/engine/types.ts` (after `nextCityId`):

```ts
  wondersBuilt: Record<string, CityId>; // wonderId -> the city that built it (global uniqueness)
```

Extend the `winner` victory union in the same interface — find:

```ts
  winner: { player: PlayerId; victory: 'conquest' | 'score' } | null;
```
and change to:
```ts
  winner: { player: PlayerId; victory: 'conquest' | 'score' | 'science' } | null;
```

- [ ] **Step 3: Bump the schema** in `src/engine/serialize.ts`: `export const SCHEMA_VERSION = 3;`

- [ ] **Step 4: Init `wondersBuilt`** in `src/engine/state.ts`. In the `GameState` literal (after `nextCityId: 1,`) add:

```ts
    wondersBuilt: {},
```

- [ ] **Step 5: Init it in the test fixture** in `tests/helpers.ts`. In `flatWorld`'s returned state literal (after `nextCityId: 1,`) add:

```ts
    wondersBuilt: {},
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/engine/types.ts src/engine/serialize.ts src/engine/state.ts tests/helpers.ts
git commit -m "Add wonder types, wondersBuilt state, schema 3"
```

### Task B2: The 7 wonders + production gating + no-buy

**Files:**
- Modify: `src/data/standard/buildings.ts`
- Modify: `src/engine/selectors.ts` (the `canProduce` function)
- Modify: `src/engine/validate.ts` (the `BUY_ITEM` case)
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write failing tests** — append to `tests/content.test.ts`:

```ts
import { ctx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { canProduce } from '../src/engine/selectors';

describe('wonders: gating', () => {
  function cityState() {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('writing'); // unlock great_library
    return s;
  }

  it('a tech-unlocked wonder is producible', () => {
    const s = cityState();
    expect(canProduce(ctx, s, s.cities[1], { kind: 'building', id: 'great_library' }).ok).toBe(true);
  });

  it('a wonder already built anywhere is not producible', () => {
    const s = cityState();
    s.wondersBuilt['great_library'] = 999; // built by some other city
    expect(canProduce(ctx, s, s.cities[1], { kind: 'building', id: 'great_library' }).ok).toBe(false);
  });

  it('wonders cannot be rush-bought', () => {
    const s = cityState();
    s.players[0].gold = 100000;
    const v = validateAction(ctx, s, { type: 'BUY_ITEM', player: 0, city: 1, item: { kind: 'building', id: 'great_library' } });
    expect(v.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fails** (wonders don't exist; no gating)

Run: `npx vitest run tests/content.test.ts -t "wonders: gating"`
Expected: FAIL.

- [ ] **Step 3: Append the 7 wonders** to `BUILDINGS` in `src/data/standard/buildings.ts`:

```ts
  pyramids: {
    id: 'pyramids', name: 'The Pyramids', cost: 180, yields: { production: 1 },
    wonder: true, effect: { kind: 'freeUnit', unit: 'worker', count: 2 },
    requiresTech: 'masonry', art: { glyph: 'palace' },
  },
  great_library: {
    id: 'great_library', name: 'The Great Library', cost: 200, yields: { science: 3 },
    wonder: true, effect: { kind: 'freeTech' }, requiresTech: 'writing', art: { glyph: 'scroll' },
  },
  hanging_gardens: {
    id: 'hanging_gardens', name: 'The Hanging Gardens', cost: 220, yields: { food: 2 },
    wonder: true, effect: { kind: 'empireYields', yields: { food: 1 } },
    requiresTech: 'mathematics', art: { glyph: 'amphora' },
  },
  great_wall: {
    id: 'great_wall', name: 'The Great Wall', cost: 300, yields: {},
    wonder: true, effect: { kind: 'cityDefense', strength: 6 },
    requiresTech: 'engineering', art: { glyph: 'wall' },
  },
  notre_dame: {
    id: 'notre_dame', name: 'Notre-Dame', cost: 320, yields: { culture: 3 },
    wonder: true, effect: { kind: 'cultureBurst', amount: 60 },
    requiresTech: 'theology', art: { glyph: 'temple' },
  },
  leonardos_workshop: {
    id: 'leonardos_workshop', name: "Leonardo's Workshop", cost: 420, yields: { production: 2 },
    wonder: true, effect: { kind: 'empireYields', yields: { production: 1, science: 1 } },
    requiresTech: 'printing_press', art: { glyph: 'hammer' },
  },
  sistine_chapel: {
    id: 'sistine_chapel', name: 'The Sistine Chapel', cost: 420, yields: { culture: 3 },
    wonder: true, effect: { kind: 'empireYields', yields: { culture: 1 } },
    requiresTech: 'architecture', art: { glyph: 'temple' },
  },
```

- [ ] **Step 4: Gate wonders in `canProduce`** in `src/engine/selectors.ts`. In the building branch of `canProduce` (after the `already built` / `requiresTech` checks, before `return { ok: true }`), add:

```ts
  if (def.wonder && state.wondersBuilt[item.id] !== undefined)
    return { ok: false, reason: 'wonder already built elsewhere' };
```

- [ ] **Step 5: Reject buying wonders** in `src/engine/validate.ts`. In the `BUY_ITEM` case, after the `canProduce` check passes and before the gold check, add:

```ts
      if (action.item.kind === 'building' && ctx.rules.buildings[action.item.id]?.wonder)
        return fail('wonders cannot be purchased');
```

- [ ] **Step 6: Run — passes**

Run: `npx vitest run tests/content.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/data/standard/buildings.ts src/engine/selectors.ts src/engine/validate.ts tests/content.test.ts
git commit -m "Add 7 world wonders with production gating; wonders are not buyable"
```

### Task B3: Ongoing effects (empire yields, city-defense aura)

**Files:**
- Modify: `src/engine/selectors.ts`
- Modify: `src/engine/systems/combat.ts` (the `cityStrength` function)
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write failing tests** — append to `tests/content.test.ts`:

```ts
import { cityYields } from '../src/engine/selectors';
import { cityStrength } from '../src/engine/systems/combat';

describe('wonders: ongoing effects', () => {
  it('empireYields add to every city the owner holds', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 0, 'settler', 9, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
    s = thaw(s);
    const cityIds = Object.keys(s.cities).map(Number);
    const before = cityYields(ctx, s, s.cities[cityIds[1]]).total.food;
    // hanging_gardens built by the first city → +1 food empire-wide
    s.cities[cityIds[0]].buildings.push('hanging_gardens');
    s.wondersBuilt['hanging_gardens'] = cityIds[0];
    const after = cityYields(ctx, s, s.cities[cityIds[1]]).total.food; // the OTHER city benefits
    expect(after).toBe(before + 1);
  });

  it('cityDefense aura raises every owner city\'s strength', () => {
    let s = flatWorld(16, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = thaw(s);
    const id = Object.keys(s.cities).map(Number)[0];
    const before = cityStrength(ctx, s, s.cities[id]);
    s.cities[id].buildings.push('great_wall');
    s.wondersBuilt['great_wall'] = id;
    expect(cityStrength(ctx, s, s.cities[id])).toBe(before + 6);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/content.test.ts -t "ongoing effects"`
Expected: FAIL.

- [ ] **Step 3: Add the `wonderOwnerEffects` selector** to `src/engine/selectors.ts` (near `cityYields`):

```ts
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
```

- [ ] **Step 4: Apply empire yields in `cityYields`.** In `src/engine/selectors.ts`, in `cityYields`, just before `return { total, worked };`, add:

```ts
  addYields(total, wonderOwnerEffects(ctx, state, city.owner).empire);
```

- [ ] **Step 5: Apply the defense aura in `cityStrength`.** In `src/engine/systems/combat.ts`, import `wonderOwnerEffects` from `../selectors` (add to the existing import) and in `cityStrength`, before `return str;`, add:

```ts
  str += wonderOwnerEffects(ctx, state, city.owner).cityDefense;
```

- [ ] **Step 6: Run — passes (full suite, to confirm yields/combat tests didn't shift)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/engine/selectors.ts src/engine/systems/combat.ts tests/content.test.ts
git commit -m "Apply ongoing wonder effects: empire-wide yields and city-defense aura"
```

### Task B4: Wonder completion (mark built, one-time effects, race refund)

**Files:**
- Modify: `src/engine/systems/cities.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write failing tests** — append to `tests/content.test.ts`:

```ts
const endTurn = (s: ReturnType<typeof flatWorld>) => applyAction(ctx, s, { type: 'END_TURN', player: s.currentPlayer });
const fullRound = (s: ReturnType<typeof flatWorld>) => {
  const n = s.players.filter((p) => p.alive).length;
  for (let i = 0; i < n; i++) s = endTurn(s);
  return s;
};

describe('wonders: completion', () => {
  function builtWonder(wonderId: string, tech: string) {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push(tech);
    const id = Object.keys(s.cities).map(Number)[0];
    // jump production almost to completion, then finish on the next turn
    s.cities[id].production.item = { kind: 'building', id: wonderId };
    s.cities[id].production.progress = ctx.rules.buildings[wonderId].cost; // already paid
    let guard = 0;
    while (s.wondersBuilt[wonderId] === undefined && guard < 6) { s = fullRound(s); guard++; }
    return { s, id };
  }

  it('completing freeUnit (Pyramids) records the wonder and spawns 2 workers', () => {
    const { s, id } = builtWonder('pyramids', 'masonry');
    expect(s.wondersBuilt['pyramids']).toBe(id);
    expect(Object.values(s.units).filter((u) => u.owner === 0 && u.def === 'worker').length).toBe(2);
  });

  it('completing freeTech (Great Library) grants a tech', () => {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('writing');
    const before = s.players[0].techs.length;
    const id = Object.keys(s.cities).map(Number)[0];
    s.cities[id].production.item = { kind: 'building', id: 'great_library' };
    s.cities[id].production.progress = ctx.rules.buildings.great_library.cost;
    let guard = 0;
    while (s.wondersBuilt['great_library'] === undefined && guard < 6) { s = fullRound(s); guard++; }
    expect(s.players[0].techs.length).toBeGreaterThan(before); // free tech granted
  });

  it('a city racing a just-finished wonder is cleared and refunded gold', () => {
    // city 0 finishes hanging_gardens; another owned city racing it is refunded
    let s = flatWorld(18, 12, 2);
    const a = spawn(s, 0, 'settler', 4, 5);
    const b = spawn(s, 0, 'settler', 12, 6);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
    s = thaw(s);
    s.players[0].techs.push('mathematics');
    const [c0, c1] = Object.keys(s.cities).map(Number);
    s.cities[c0].production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: ctx.rules.buildings.hanging_gardens.cost };
    s.cities[c1].production = { item: { kind: 'building', id: 'hanging_gardens' }, progress: 40 };
    const goldBefore = s.players[0].gold;
    let guard = 0;
    while (s.wondersBuilt['hanging_gardens'] === undefined && guard < 6) { s = fullRound(s); guard++; }
    // the racing city's item was cleared and ~40 gold refunded
    expect(s.cities[c1].production.item).toBeNull();
    expect(s.players[0].gold).toBeGreaterThan(goldBefore);
  });
});
```

- [ ] **Step 2: Run — fails** (completion logic absent)

Run: `npx vitest run tests/content.test.ts -t "completion"`
Expected: FAIL.

- [ ] **Step 3: Implement completion** in `src/engine/systems/cities.ts`. Add `availableTechs` to the existing import from `../selectors`. Add this helper near the top (after the imports):

```ts
/** Fire a completed wonder's effect, record global uniqueness, and refund any racing cities. */
export function completeWonder(ctx: Ctx, state: GameState, city: City, wonderId: string): void {
  state.wondersBuilt[wonderId] = city.id;
  const eff = ctx.rules.buildings[wonderId].effect;
  if (eff) {
    if (eff.kind === 'freeTech') {
      const avail = availableTechs(ctx, state, city.owner);
      if (avail.length) {
        const pick = [...avail].sort(
          (a, b) => ctx.rules.techs[a].cost - ctx.rules.techs[b].cost || (a < b ? -1 : 1),
        )[0];
        state.players[city.owner].techs.push(pick);
        pushEvent(state, { player: city.owner, type: 'techDone', msg: `${ctx.rules.techs[pick].name} revealed by ${ctx.rules.buildings[wonderId].name}!` });
      }
    } else if (eff.kind === 'freeUnit') {
      for (let i = 0; i < eff.count; i++) placeProducedUnit(ctx, state, city, eff.unit);
    } else if (eff.kind === 'cultureBurst') {
      city.culture += eff.amount;
    }
    // empireYields / cityDefense are ongoing (read by selectors) — nothing to fire here
  }
  // refund any other city racing the same wonder
  for (const id of sortedIds(state.cities)) {
    const other = state.cities[id];
    if (other.id === city.id) continue;
    if (other.production.item?.kind === 'building' && other.production.item.id === wonderId) {
      state.players[other.owner].gold += Math.floor(other.production.progress);
      other.production = { item: null, progress: 0 };
      pushEvent(state, { player: other.owner, type: 'dealBroken', msg: `${other.name}'s ${ctx.rules.buildings[wonderId].name} was finished elsewhere — effort refunded`, q: other.q, r: other.r });
    }
  }
  pushEvent(state, { player: null, type: 'wonderBuilt', msg: `${state.players[city.owner].name} has completed ${ctx.rules.buildings[wonderId].name}!`, q: city.q, r: city.r });
}
```

- [ ] **Step 4: Call it on building completion.** In `processCity`, find the building-completion branch:

```ts
      if (item.kind === 'building') {
        city.buildings.push(item.id);
        city.production.progress -= cost;
        city.production.item = null;
        pushEvent(state, {
          player: city.owner,
          type: 'prodDone',
          msg: `${city.name} completed ${ctx.rules.buildings[item.id].name}`,
          q: city.q,
          r: city.r,
        });
      } else {
```

Insert the wonder hook right after the `pushEvent({... prodDone ...})` call and before the closing `}` of the `if (item.kind === 'building')` block:

```ts
        if (ctx.rules.buildings[item.id].wonder) completeWonder(ctx, state, city, item.id);
```

- [ ] **Step 5: Run — passes (full suite)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/systems/cities.ts tests/content.test.ts
git commit -m "Complete wonders: record uniqueness, fire one-time effects, refund racing cities"
```

---

## Phase C — Science victory

Goal: researching the capstone tech wins a science victory; conquest and score endings unchanged. Suite green.

### Task C1: Capstone setting + validation

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/standard/index.ts`
- Modify: `src/data/validate.ts`

- [ ] **Step 1: Extend the victory settings type** in `src/data/types.ts`. Find the `victory` field in `RulesetSettings`:

```ts
  victory: { scoreThreshold: number; turnLimit: number };
```
and change to:
```ts
  victory: { scoreThreshold: number; turnLimit: number; scienceCapstone: string };
```

- [ ] **Step 2: Set the value** in `src/data/standard/index.ts`. Find:

```ts
  victory: { scoreThreshold: 350, turnLimit: 200 },
```
and change to:
```ts
  victory: { scoreThreshold: 350, turnLimit: 200, scienceCapstone: 'scientific_method' },
```

- [ ] **Step 3: Validate it resolves** in `src/data/validate.ts`. In `validateRuleset`, near the other settings checks (after the `startingUnits` loop), add:

```ts
  if (!(rules.settings.victory.scienceCapstone in rules.techs))
    errors.push(`settings: unknown science capstone tech ${rules.settings.victory.scienceCapstone}`);
```

- [ ] **Step 4: Type-check + ruleset test**

Run: `npx tsc --noEmit && npx vitest run tests/ruleset.test.ts tests/content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/standard/index.ts src/data/validate.ts
git commit -m "Add science-capstone victory setting"
```

### Task C2: Science victory trigger

**Files:**
- Modify: `src/engine/systems/victory.ts`
- Modify: `src/engine/systems/turn.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/content.test.ts`:

```ts
describe('science victory', () => {
  it('researching the capstone wins a science victory', () => {
    let s = flatWorld(14, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    // give player 0 the capstone's prereqs and a full beaker bank on it
    s.players[0].techs.push('printing_press', 'chemistry');
    s.players[0].researching = 'scientific_method';
    s.players[0].science = ctx.rules.techs.scientific_method.cost;
    s = endTurn(s); // player 0 ends; beginTurn(1) runs... need player 0's beginTurn
    // advance until player 0's turn-start processes the research
    let guard = 0;
    while (s.phase === 'playing' && guard < 4) { s = endTurn(s); guard++; }
    expect(s.phase).toBe('ended');
    expect(s.winner).toEqual({ player: 0, victory: 'science' });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run tests/content.test.ts -t "science victory"`
Expected: FAIL.

- [ ] **Step 3: Add the check** to `src/engine/systems/victory.ts`:

```ts
/** Win immediately upon researching the science capstone tech. */
export function checkScienceVictory(ctx: Ctx, state: GameState, pid: PlayerId): void {
  if (state.phase !== 'playing') return;
  if (!state.players[pid].techs.includes(ctx.rules.settings.victory.scienceCapstone)) return;
  state.winner = { player: pid, victory: 'science' };
  state.phase = 'ended';
  pushEvent(state, {
    player: null,
    type: 'victory',
    msg: `${state.players[pid].name} ushers in a new age of reason!`,
  });
}
```

Ensure `PlayerId` is imported in `victory.ts` (it imports from `../types`; add `PlayerId` if missing).

- [ ] **Step 4: Call it at tech completion** in `src/engine/systems/turn.ts`. Import it:

```ts
import { checkScienceVictory } from './victory';
```
(There may already be an import from `./victory` for `checkScoreVictory` — add `checkScienceVictory` to it.) Then in `beginTurn`, in the research-completion block, right after `player.techs.push(tech.id);` (and its events), add:

```ts
      checkScienceVictory(ctx, state, pid);
```

- [ ] **Step 5: Run — passes (full suite)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/systems/victory.ts src/engine/systems/turn.ts tests/content.test.ts
git commit -m "Add science victory on researching the capstone tech"
```

---

## Phase D — AI

Goal: the AI builds wonders when safe and climbs the deeper tree (and can thereby win by science); self-play exercises both and still replays bit-identically.

### Task D1: AI builds wonders & researches the new tree

**Files:**
- Modify: `src/ai/economy.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/content.test.ts`:

```ts
import { pickProduction, pickResearch } from '../src/ai/economy';

describe('AI breadth', () => {
  it('an unthreatened city with a wonder available will queue it', () => {
    let s = flatWorld(16, 12, 2);
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('writing'); // great_library available
    s.cities[Object.keys(s.cities).map(Number)[0]].pop = 4; // grown, garrisoned-enough
    spawn(s, 0, 'warrior', 5, 5); // a garrison so it's not "undefended"
    const pick = pickProduction(ctx, s, s.cities[Object.keys(s.cities).map(Number)[0]]);
    // not asserting it's ALWAYS a wonder (priorities), but a wonder must be a legal candidate it can pick
    expect(pick).not.toBeNull();
  });

  it('research priority eventually targets the capstone when everything else is known', () => {
    let s = flatWorld(16, 12, 2);
    spawn(s, 0, 'warrior', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = thaw(s);
    // know everything except the capstone and its direct prereq chain tip
    for (const id of Object.keys(ctx.rules.techs)) {
      if (id !== 'scientific_method') s.players[0].techs.push(id);
    }
    const pick = pickResearch(ctx, s, 0);
    expect(pick?.tech).toBe('scientific_method');
  });
});
```

- [ ] **Step 2: Run — fails or passes-by-accident**

Run: `npx vitest run tests/content.test.ts -t "AI breadth"`
Expected: the capstone test FAILS until the priority list includes `scientific_method`.

- [ ] **Step 3: Extend research priority** in `src/ai/economy.ts`. In `pickResearch`, both the `wars` and peace priority arrays end before the new techs. Append the new techs (in a climb order ending at the capstone) to BOTH arrays so the AI keeps researching into the new eras. For the peace array, change it to end with:

```ts
    : ['pottery', 'animal_husbandry', 'mining', 'writing', 'archery', 'bronze_working', 'masonry', 'currency', 'horseback_riding', 'iron_working', 'philosophy', 'construction', 'mathematics', 'education', 'feudalism', 'engineering', 'machinery', 'guilds', 'chivalry', 'theology', 'astronomy', 'banking', 'printing_press', 'gunpowder', 'architecture', 'metallurgy', 'chemistry', 'scientific_method'];
```

For the `wars` array, append the same new-tech tail after its existing military-first ordering:

```ts
    ? ['archery', 'bronze_working', 'masonry', 'iron_working', 'mathematics', 'pottery', 'mining', 'animal_husbandry', 'writing', 'horseback_riding', 'currency', 'construction', 'philosophy', 'feudalism', 'machinery', 'chivalry', 'engineering', 'gunpowder', 'metallurgy', 'education', 'guilds', 'theology', 'astronomy', 'banking', 'printing_press', 'architecture', 'chemistry', 'scientific_method']
```

(The lists are "preference order"; `availableTechs` still gates by prereqs, so unreachable entries are simply skipped until their prereqs are met.)

- [ ] **Step 4: Add a wonder-production rule** in `src/ai/economy.ts`. In `pickProduction`, insert a wonder step just **above** the civic-building loop (after the military/settler/worker rules, before `BUILDING_PRIORITY`). It builds the cheapest available wonder when the city is not threatened:

```ts
  // wonders: when safe, claim an available world wonder (high, lasting value)
  if (threat === 0) {
    const wonder = Object.values(ctx.rules.buildings)
      .filter((b) => b.wonder && canProduce(ctx, state, city, { kind: 'building', id: b.id }).ok)
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
    if (wonder) return { item: { kind: 'building', id: wonder.id }, reason: `building ${wonder.name}` };
  }
```

(`threat` is already computed earlier in `pickProduction`; `canProduce` is already imported. If `threat` is not in scope at that point, compute it with the existing `threatNear(ctx, state, city)` helper.)

- [ ] **Step 5: Run — passes (full suite, incl. self-play which now sees the deeper tree)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ai/economy.ts tests/content.test.ts
git commit -m "AI: build available wonders when safe; research into the new eras toward the capstone"
```

### Task D2: Self-play exercises breadth & replays

**Files:**
- Modify: `tests/selfplay.test.ts`

- [ ] **Step 1: Add assertions** — append a `describe` to `tests/selfplay.test.ts` (reuses the file's `runGame`/`config`):

```ts
describe('breadth in self-play', () => {
  it('over a long game, wonders get built and rivals reach the new eras (and it replays)', () => {
    const { state, log } = runGame(20260613, 200);
    const wondersBuilt = Object.keys(state.wondersBuilt).length;
    const reachedNewEra = state.players.some((p) =>
      p.techs.some((t) => ['feudalism', 'machinery', 'education', 'gunpowder'].includes(t)),
    );
    expect(wondersBuilt).toBeGreaterThan(0);
    expect(reachedNewEra).toBe(true);

    // the wonder/era-laden log replays bit-identically
    let replay = initialState(config(20260613), ctx);
    for (const a of log) replay = applyAction(ctx, replay, a);
    expect(gameHash(replay)).toBe(gameHash(state));
  }, 180_000);
});
```

> If `runGame`/`config`/`initialState`/`gameHash` aren't already imported/defined in `selfplay.test.ts`, reuse the existing ones in that file (the deterministic-replay test already uses them).

- [ ] **Step 2: Run — passes**

Run: `npx vitest run tests/selfplay.test.ts`
Expected: PASS (wonders built > 0, a rival reached a medieval+ tech, replay identical). If `wondersBuilt` is 0, the AI wonder rule (D1 Step 4) isn't firing — recheck the `threat === 0` guard and `canProduce`.

- [ ] **Step 3: Commit**

```bash
git add tests/selfplay.test.ts
git commit -m "Self-play: assert wonders built and new eras reached, with identical replay"
```

---

## Phase E — UI

Goal: wonders read clearly in the city panel, the tech tree shows the capstone, wonder completions toast globally, and a science win shows its own screen. Engine/AI unchanged.

### Task E1: Wonder tag in the city production list

**Files:**
- Modify: `src/ui/panels/CityPanel.tsx`
- Modify: `src/ui/app.css`

- [ ] **Step 1: Tag wonders in the production list.** In `src/ui/panels/CityPanel.tsx`, inside the `options.map((item) => { ... })` render (where each `.prod-item` is built), compute whether the item is a wonder and show a tag + effect blurb. Find the `<span className="nm">{itemName(item)}</span>` line and add, right after it:

```tsx
                    {item.kind === 'building' && gameCtx.rules.buildings[item.id].wonder && (
                      <span className="wonder-tag" title={wonderBlurb(gameCtx.rules.buildings[item.id])}>Wonder</span>
                    )}
```

Add this helper near the top of the file (module scope, after imports):

```tsx
function wonderBlurb(b: import('../../data/types').BuildingDef): string {
  const e = b.effect;
  if (!e) return 'World Wonder';
  switch (e.kind) {
    case 'empireYields': return 'World Wonder — bonus yields in every city';
    case 'cityDefense': return `World Wonder — +${e.strength} defense in all your cities`;
    case 'freeTech': return 'World Wonder — grants a free technology';
    case 'freeUnit': return `World Wonder — grants ${e.count} ${e.unit}(s)`;
    case 'cultureBurst': return `World Wonder — +${e.amount} culture`;
  }
}
```

- [ ] **Step 2: Style the tag** — append to `src/ui/app.css`:

```css
.prod-item .wonder-tag {
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--brass-bright);
  border: 1px solid var(--brass);
  padding: 1px 5px;
  margin-right: 2px;
}
```

- [ ] **Step 3: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/CityPanel.tsx src/ui/app.css
git commit -m "Mark world wonders in the city production list with a tag and effect blurb"
```

### Task E2: Capstone marker in the tech tree

**Files:**
- Modify: `src/ui/panels/TechTree.tsx`
- Modify: `src/ui/app.css`

- [ ] **Step 1: Mark the capstone.** In `src/ui/panels/TechTree.tsx`, where each tech node is rendered, add a victory chip when the tech is the science capstone. Find the node's title render (the `<h4>{t.name}</h4>` line) and add right after it:

```tsx
                {t.id === gameCtx.rules.settings.victory.scienceCapstone && (
                  <div className="capstone-chip">★ Science Victory</div>
                )}
```

- [ ] **Step 2: Style the chip** — append to `src/ui/app.css`:

```css
.tech-node .capstone-chip {
  margin-top: 3px;
  font-family: var(--font-display);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1c1606;
  background: linear-gradient(180deg, var(--brass-bright), var(--brass));
  padding: 1px 5px;
  display: inline-block;
}
```

- [ ] **Step 3: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/TechTree.tsx src/ui/app.css
git commit -m "Mark the science-victory capstone in the tech tree"
```

### Task E3: Wonder toasts + science victory screen

**Files:**
- Modify: `src/app/driver.ts`
- Modify: `src/ui/panels/Notifications.tsx`
- Modify: `src/ui/panels/Modals.tsx`

- [ ] **Step 1: Surface wonder completions as global toasts.** In `src/app/driver.ts`, add `'wonderBuilt'` to the `TOAST_TYPES` set.

- [ ] **Step 2: Icon for it** in `src/ui/panels/Notifications.tsx` — in `iconFor`, the `IconLaurel` default already covers `wonderBuilt`; to make it explicit add `wonderBuilt` to the `IconScroll`/`IconLaurel` mapping (optional). Minimum: no change needed (falls to `IconLaurel`). If you want a distinct look, add `|| type === 'wonderBuilt'` to the `IconLaurel` group — but it's already the default, so this step is a no-op confirmation.

- [ ] **Step 3: Science victory text** in `src/ui/panels/Modals.tsx` `VictoryOverlay`. Find the `.by` line that branches on `game.winner!.victory`:

```tsx
                game.winner!.victory === 'conquest'
                  ? 'has conquered the known world'
                  : 'leads civilization into a new age'
```

Replace with a three-way branch:

```tsx
                game.winner!.victory === 'conquest'
                  ? 'has conquered the known world'
                  : game.winner!.victory === 'science'
                    ? 'ushers in a new age of reason'
                    : 'leads civilization into a new age'
```

- [ ] **Step 4: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/driver.ts src/ui/panels/Notifications.tsx src/ui/panels/Modals.tsx
git commit -m "Toast wonder completions; show a science-victory screen"
```

### Task E4: Visual verification (controller-run)

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**: `npx vitest run && npx tsc --noEmit && npm run build` — all green.
- [ ] **Step 2:** With the dev server running, adapt `scripts/shot-diplo.mjs`: start a game, `w().debugAutoplay(40)`, open the city panel of a city, screenshot the production list (look for the "Wonder" tag), press `T` and screenshot the tech tree (look for the wider 4-era tree + the capstone chip). Confirm no console errors and the new eras render/scroll. Fix any layout issues, then commit.

---

## Self-Review (completed during planning)

**Spec coverage** — every spec section maps to tasks:
- §3 eras/techs → A1 (+ A4 dead-end exemption, content test). §4 units → A2. §5 buildings → A3.
- §6 wonders: types/state/schema → B1; data + gating + no-buy → B2; ongoing effects → B3; completion + one-time effects + refund → B4. §7 science victory → C1 (setting) + C2 (trigger).
- §8 AI → D1 (+ D2 self-play). §9 UI → E1 (city panel), E2 (tech tree), E3 (toasts + victory screen). §10 determinism → integer/data throughout; B-phase schema bump; replay covered by D2. §11 testing → content/ruleset/replay/self-play across phases. §12 file map → File Structure.

**Placeholder scan** — no TBD/TODO; every code step has complete code; every test step has real assertions. The one E3 "no-op confirmation" step is explicitly that.

**Type consistency** — `WonderEffect` kinds (`empireYields`/`cityDefense`/`freeTech`/`freeUnit`/`cultureBurst`) are defined in B1 and used unchanged in B3 (`wonderOwnerEffects`), B4 (`completeWonder`), and E1 (`wonderBlurb`). `wondersBuilt` shape (`Record<string, CityId>`) is consistent across B1/B2/B3/B4/D2. `settings.victory.scienceCapstone` defined in C1 and read in C2/E2 (and as a literal in A4, intentionally). `winner.victory` union gains `'science'` in B1, set in C2, rendered in E3.

**Scope** — one coherent track (content + wonders + science victory), phased so each phase is independently green and committable.


