# Living World — Plan 1: Foundations & Civ Uniques

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the 4 civs a real identity — a unique ability (UA), a unique unit (UU), and a unique building (UB) — closing the "all civs are cosmetic" hole.

**Architecture:** Civ uniques are *pure ruleset data plus two small read-model hooks* — they do **not** change `GameState`, so there is **no schema bump** in this plan. Unique units/buildings are ordinary `UnitDef`/`BuildingDef` entries tagged `civ` + `replaces`; the existing `canProduce`/`productionOptions` path swaps the base for the civ's version. Unique abilities are a small `CivAbility` union (mirroring the existing `WonderEffect` union); `empireCivic` abilities ride the existing `empireCivicEffects` aggregation (so they affect both `cityYields` and `empireHappiness` for free), and `wonderProduction` is one hook in `processCity`.

**Tech Stack:** TypeScript, Vitest. Pure deterministic engine (`src/engine`), data-driven ruleset (`src/data`). Tests via `npm test`; type-check + bundle via `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-16-living-world-design.md` §1, §4.6, §9 (the leaders/agendas/events portions are Plans 2 & 3).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/data/types.ts` | Ruleset type definitions | Add `CivAbility` union; add `uniqueAbility?` to `CivDef`; add `civ?`/`replaces?` to `UnitDef` and `BuildingDef` |
| `src/data/validate.ts` | Startup cross-validation | Validate `civ`/`replaces`/`uniqueAbility` references |
| `src/engine/selectors.ts` | Pure read-model | `canProduce` civ-gating + base-replaced rule (new `replacedByUnique` helper); `empireCivicEffects` appends civ `empireCivic` abilities |
| `src/engine/systems/cities.ts` | City turn processing | `processCity` adds `wonderProduction` hammers when building a World Wonder |
| `src/data/standard/units.ts` | Unit content | Add 4 unique units (legion, war_chariot, bowman, hoplite) |
| `src/data/standard/buildings.ts` | Building content | Add 4 unique buildings (bath, nilometer, etemenanki, acropolis) |
| `src/data/standard/civs.ts` | Civ content | Add `uniqueAbility` to the 4 playable civs |
| `tests/uniques.test.ts` | **new** test file | Mechanism tests (via `customCtx` fixtures) + real-content tests |

**Civ kits (values are starting points; balanced via `npm run sim` in Plan 3):**

| Civ | UA | UU (replaces) | UB (replaces) |
|---|---|---|---|
| Rome | Pax Romana — `empireCivic { happiness: 3 }` | Legion (swordsman): str 18, +50% vs city | Roman Bath (aqueduct): +1 happiness |
| Egypt | Iteru — `wonderProduction { amount: 3 }` | War Chariot (horseman): moves 5, no horse req | Nilometer (granary): +1 faith |
| Babylon | Cradle of Learning — `empireCivic { yields:{science:1} }` (per city) | Bowman (archer): ranged str 9 | Etemenanki (library): science 2 + culture 1 |
| Hellas | Hellenic League — `empireCivic { yields:{culture:1} }` (per city) | Hoplite (spearman): str 13, +50% vs mounted | Acropolis (monument): culture 3 |

---

### Task 1: Ruleset types for civ uniques

**Files:**
- Modify: `src/data/types.ts` (CivDef ~164-170; UnitDef ~113-128; BuildingDef ~138-153; add `CivAbility` near `WonderEffect` ~130-136)

- [ ] **Step 1: Add the `CivAbility` union**

In `src/data/types.ts`, immediately **after** the `WonderEffect` type (the block ending with `{ kind: 'happiness'; amount: number };`), add:

```ts
/**
 * A civ's signature ability. `empireCivic` reuses the policy/belief CivicEffect path
 * (per-city yields + empire happiness); `wonderProduction` adds flat hammers toward a
 * World Wonder. All values additive/integer (no multipliers) — see spec §2.
 */
export type CivAbility =
  | { kind: 'empireCivic'; effect: CivicEffect }
  | { kind: 'wonderProduction'; amount: number };
```

- [ ] **Step 2: Add `uniqueAbility` to `CivDef`**

Replace the `CivDef` interface with:

```ts
export interface CivDef {
  id: string;
  name: string;
  leader: string;
  color: string;
  cityNames: string[];
  uniqueAbility?: CivAbility[];
}
```

- [ ] **Step 3: Add `civ`/`replaces` to `UnitDef`**

In `UnitDef`, add these two fields directly after `requiresResource?: string;`:

```ts
  civ?: string; // if set, only this civ may build it
  replaces?: string; // base unit id this unique stands in for (that civ no longer builds the base)
```

- [ ] **Step 4: Add `civ`/`replaces` to `BuildingDef`**

In `BuildingDef`, add these two fields directly after `requiresTech?: string;`:

```ts
  civ?: string; // if set, only this civ may build it
  replaces?: string; // base building id this unique stands in for
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: PASS (no behavior change yet; the new optional fields are unused).

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts
git commit -m "feat(data): ruleset types for civ uniques (CivAbility, civ/replaces tags)"
```

---

### Task 2: Validate civ-unique references

**Files:**
- Modify: `src/data/validate.ts` (append a block before `return errors;` at line ~112)
- Test: `tests/uniques.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/uniques.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { ctx, customCtx, flatWorld, spawn, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { canProduce, cityYields, empireHappiness, productionOptions } from '../src/engine/selectors';
import { processCity } from '../src/engine/systems/cities';

describe('civ-unique validation', () => {
  it('the standard ruleset validates clean', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });

  it('flags a unique that points at an unknown civ or base', () => {
    const bad = customCtx((r) => {
      r.units.broken = { id: 'broken', name: 'Broken', cost: 10, moves: 1, sight: 1, strength: 1,
        class: 'melee', domain: 'land', civ: 'atlantis', replaces: 'nope', art: { glyph: 'club' } };
    }).rules;
    const errs = validateRuleset(bad);
    expect(errs.some((e) => e.includes('unknown civ atlantis'))).toBe(true);
    expect(errs.some((e) => e.includes('replaces unknown'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uniques.test.ts -t "flags a unique"`
Expected: FAIL (validator does not yet check civ/replaces, so no such errors are produced).

- [ ] **Step 3: Add the validation block**

In `src/data/validate.ts`, insert immediately **before** the final `return errors;`:

```ts
  // civ uniques: civ must exist; replaces must point at a real base of the same record
  // (and requires a civ); a base may be replaced by at most one unique per civ.
  const checkUniques = (
    kind: string,
    defs: Record<string, { id: string; civ?: string; replaces?: string }>,
  ) => {
    const seen = new Set<string>();
    for (const d of Object.values(defs)) {
      if (d.civ !== undefined && !(d.civ in rules.civs))
        errors.push(`${kind} ${d.id}: unknown civ ${d.civ}`);
      if (d.replaces !== undefined) {
        if (!(d.replaces in defs)) errors.push(`${kind} ${d.id}: replaces unknown ${kind} ${d.replaces}`);
        if (d.civ === undefined) errors.push(`${kind} ${d.id}: replaces set without civ`);
        const key = `${d.civ}/${d.replaces}`;
        if (seen.has(key)) errors.push(`${kind}: ${d.civ} has two replacements for ${d.replaces}`);
        seen.add(key);
      }
    }
  };
  checkUniques('unit', rules.units);
  checkUniques('building', rules.buildings);

  for (const civ of Object.values(rules.civs))
    for (const ab of civ.uniqueAbility ?? [])
      if (ab.kind === 'empireCivic' && ab.effect.perBuilding && !(ab.effect.perBuilding.building in rules.buildings))
        errors.push(`civ ${civ.id}: unknown perBuilding ${ab.effect.perBuilding.building}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/uniques.test.ts`
Expected: PASS (both `civ-unique validation` tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/validate.ts tests/uniques.test.ts
git commit -m "feat(data): validate civ-unique references (civ/replaces/uniqueAbility)"
```

---

### Task 3: `canProduce` swaps unique for base

**Files:**
- Modify: `src/engine/selectors.ts` (`canProduce` ~445-475; add `replacedByUnique` helper above it)
- Test: `tests/uniques.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/uniques.test.ts`:

```ts
describe('canProduce: unique <-> base swap', () => {
  function romeCity(c = ctx) {
    let s = flatWorld(14, 12, 2); // player 0 = rome (helpers civOrder)
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    return { s, city: s.cities[Object.keys(s.cities).map(Number)[0]] };
  }

  it('a civ builds its unique and not the base it replaces; other civs are unaffected', () => {
    const c = customCtx((r) => {
      r.units.test_axe = { id: 'test_axe', name: 'Test Axe', cost: 40, moves: 2, sight: 2, strength: 9,
        class: 'melee', domain: 'land', civ: 'rome', replaces: 'warrior', art: { glyph: 'club' } };
    });
    const { s, city } = romeCity(c);
    expect(canProduce(c, s, city, { kind: 'unit', id: 'test_axe' }).ok).toBe(true);
    expect(canProduce(c, s, city, { kind: 'unit', id: 'warrior' }).ok).toBe(false); // replaced
    s.players[0].civ = 'egypt';
    expect(canProduce(c, s, city, { kind: 'unit', id: 'test_axe' }).ok).toBe(false); // not egypt's
    expect(canProduce(c, s, city, { kind: 'unit', id: 'warrior' }).ok).toBe(true); // egypt keeps the base
  });

  it('productionOptions offers the unique and hides the replaced base', () => {
    const c = customCtx((r) => {
      r.units.test_axe = { id: 'test_axe', name: 'Test Axe', cost: 40, moves: 2, sight: 2, strength: 9,
        class: 'melee', domain: 'land', civ: 'rome', replaces: 'warrior', art: { glyph: 'club' } };
    });
    const { s, city } = romeCity(c);
    const ids = productionOptions(c, s, city).filter((i) => i.kind === 'unit').map((i) => i.id);
    expect(ids).toContain('test_axe');
    expect(ids).not.toContain('warrior');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uniques.test.ts -t "swap"`
Expected: FAIL (base `warrior` is still producible; the unique is not civ-gated).

- [ ] **Step 3: Add the helper + gating**

In `src/engine/selectors.ts`, add this helper directly **above** `export function canProduce(`:

```ts
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
```

In `canProduce`, in the **unit** branch, immediately after `if (!def) return { ok: false, reason: 'unknown unit' };`, add:

```ts
    if (def.civ && def.civ !== player.civ) return { ok: false, reason: 'unique to another civ' };
    if (replacedByUnique(ctx.rules.units, player.civ, item.id)) return { ok: false, reason: 'replaced by a unique unit' };
```

In the **building** branch, immediately after `if (!def) return { ok: false, reason: 'unknown building' };`, add:

```ts
  if (def.civ && def.civ !== player.civ) return { ok: false, reason: 'unique to another civ' };
  if (replacedByUnique(ctx.rules.buildings, player.civ, item.id)) return { ok: false, reason: 'replaced by a unique building' };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/uniques.test.ts`
Expected: PASS (all uniques tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/engine/selectors.ts tests/uniques.test.ts
git commit -m "feat(engine): canProduce swaps a civ's unique for the base it replaces"
```

---

### Task 4: `empireCivic` abilities flow through yields & happiness

**Files:**
- Modify: `src/engine/selectors.ts` (`empireCivicEffects` ~298-306)
- Test: `tests/uniques.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/uniques.test.ts`:

```ts
describe('empireCivic ability', () => {
  it('adds per-city yields and empire happiness like a free policy', () => {
    const c = customCtx((r) => {
      r.civs.rome.uniqueAbility = [{ kind: 'empireCivic', effect: { yields: { science: 1 }, happiness: 2 } }];
    });
    let s = flatWorld(14, 12, 2); // player 0 = rome
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    const city = s.cities[Object.keys(s.cities).map(Number)[0]];
    const sci = cityYields(c, s, city).total.science;
    const hap = empireHappiness(c, s, 0).happy;
    s.players[0].civ = 'egypt'; // egypt has no ability in this custom ctx
    expect(sci).toBe(cityYields(c, s, city).total.science + 1);
    expect(hap).toBe(empireHappiness(c, s, 0).happy + 2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uniques.test.ts -t "empireCivic"`
Expected: FAIL (abilities are not yet aggregated; science/happiness unchanged between civs).

- [ ] **Step 3: Aggregate civ abilities in `empireCivicEffects`**

Replace `empireCivicEffects` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/uniques.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/selectors.ts tests/uniques.test.ts
git commit -m "feat(engine): empireCivic civ abilities flow through yields and happiness"
```

---

### Task 5: `wonderProduction` ability speeds wonders

**Files:**
- Modify: `src/engine/systems/cities.ts` (`processCity` production block ~184-189)
- Test: `tests/uniques.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/uniques.test.ts`:

```ts
describe('wonderProduction ability', () => {
  it('adds flat hammers toward a World Wonder each turn (not to normal builds)', () => {
    const c = customCtx((r) => { r.civs.rome.uniqueAbility = [{ kind: 'wonderProduction', amount: 5 }]; });
    let s = flatWorld(14, 12, 2); // player 0 = rome
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(c, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('masonry'); // pyramids (a wonder) available
    const city = s.cities[Object.keys(s.cities).map(Number)[0]];
    city.production = { item: { kind: 'building', id: 'pyramids' }, progress: 0 };
    const base = cityYields(c, s, city).total.production;
    processCity(c, s, city);
    expect(city.production.progress).toBe(base + 5); // base hammers + the +5 wonder bonus
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uniques.test.ts -t "wonderProduction"`
Expected: FAIL (progress is `base`, missing the +5).

- [ ] **Step 3: Add the hook in `processCity`**

In `src/engine/systems/cities.ts`, replace these three lines at the top of the production block:

```ts
  if (city.production.item) {
    city.production.progress += total.production;
    const item = city.production.item;
    const cost = itemCost(ctx, item);
```

with:

```ts
  if (city.production.item) {
    const item = city.production.item;
    city.production.progress += total.production;
    // Egypt's Iteru and similar abilities add flat hammers toward a World Wonder.
    if (item.kind === 'building' && ctx.rules.buildings[item.id]?.wonder) {
      for (const ab of ctx.rules.civs[state.players[city.owner].civ].uniqueAbility ?? [])
        if (ab.kind === 'wonderProduction') city.production.progress += ab.amount;
    }
    const cost = itemCost(ctx, item);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/uniques.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/systems/cities.ts tests/uniques.test.ts
git commit -m "feat(engine): wonderProduction civ ability speeds World Wonders"
```

---

### Task 6: Real civ content (4 UUs, 4 UBs, 4 UAs)

**Files:**
- Modify: `src/data/standard/units.ts` (add before the closing `};` after `caravan`)
- Modify: `src/data/standard/buildings.ts` (add before the closing `};` after `circus_maximus`)
- Modify: `src/data/standard/civs.ts` (add `uniqueAbility` to the 4 playable civs)
- Test: `tests/uniques.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/uniques.test.ts`:

```ts
describe('the four civ kits (real content)', () => {
  it('tags each unique with its civ and base', () => {
    const u = STANDARD_RULESET.units, b = STANDARD_RULESET.buildings, c = STANDARD_RULESET.civs;
    expect(u.legion).toMatchObject({ civ: 'rome', replaces: 'swordsman' });
    expect(u.war_chariot).toMatchObject({ civ: 'egypt', replaces: 'horseman' });
    expect(u.bowman).toMatchObject({ civ: 'babylon', replaces: 'archer' });
    expect(u.hoplite).toMatchObject({ civ: 'hellas', replaces: 'spearman' });
    expect(b.bath).toMatchObject({ civ: 'rome', replaces: 'aqueduct' });
    expect(b.nilometer).toMatchObject({ civ: 'egypt', replaces: 'granary' });
    expect(b.etemenanki).toMatchObject({ civ: 'babylon', replaces: 'library' });
    expect(b.acropolis).toMatchObject({ civ: 'hellas', replaces: 'monument' });
    expect(c.rome.uniqueAbility).toEqual([{ kind: 'empireCivic', effect: { happiness: 3 } }]);
    expect(c.egypt.uniqueAbility).toEqual([{ kind: 'wonderProduction', amount: 3 }]);
    expect(c.babylon.uniqueAbility).toEqual([{ kind: 'empireCivic', effect: { yields: { science: 1 } } }]);
    expect(c.hellas.uniqueAbility).toEqual([{ kind: 'empireCivic', effect: { yields: { culture: 1 } } }]);
  });

  it('a civ can build its unique unit end-to-end and not the base', () => {
    let s = flatWorld(14, 12, 2);
    s.players[0].civ = 'hellas';
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 10);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('bronze_working');
    const city = s.cities[Object.keys(s.cities).map(Number)[0]];
    expect(canProduce(ctx, s, city, { kind: 'unit', id: 'hoplite' }).ok).toBe(true);
    expect(canProduce(ctx, s, city, { kind: 'unit', id: 'spearman' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uniques.test.ts -t "civ kits"`
Expected: FAIL (`u.legion` etc. are undefined).

- [ ] **Step 3: Add the 4 unique units**

In `src/data/standard/units.ts`, add before the final closing `};`:

```ts
  // --- civ uniques ---
  legion: {
    id: 'legion', name: 'Legion', cost: 88, moves: 2, sight: 2, strength: 18,
    class: 'melee', domain: 'land', requiresTech: 'iron_working', requiresResource: 'iron',
    bonuses: [{ vsCity: true, pct: 50 }], civ: 'rome', replaces: 'swordsman', art: { glyph: 'sword' },
  },
  war_chariot: {
    id: 'war_chariot', name: 'War Chariot', cost: 80, moves: 5, sight: 2, strength: 14,
    class: 'mounted', domain: 'land', requiresTech: 'horseback_riding',
    civ: 'egypt', replaces: 'horseman', art: { glyph: 'horse' },
  },
  bowman: {
    id: 'bowman', name: 'Bowman', cost: 48, moves: 2, sight: 2, strength: 6,
    ranged: { strength: 9, range: 2 }, class: 'ranged', domain: 'land',
    requiresTech: 'archery', civ: 'babylon', replaces: 'archer', art: { glyph: 'bow' },
  },
  hoplite: {
    id: 'hoplite', name: 'Hoplite', cost: 56, moves: 2, sight: 2, strength: 13,
    class: 'melee', domain: 'land', bonuses: [{ vsClass: 'mounted', pct: 50 }],
    requiresTech: 'bronze_working', civ: 'hellas', replaces: 'spearman', art: { glyph: 'spear' },
  },
```

- [ ] **Step 4: Add the 4 unique buildings**

In `src/data/standard/buildings.ts`, add before the final closing `};`:

```ts
  // --- civ uniques ---
  bath: {
    id: 'bath', name: 'Roman Bath', cost: 104, yields: { food: 3 }, happiness: 1,
    requiresTech: 'construction', civ: 'rome', replaces: 'aqueduct', art: { glyph: 'arch' },
  },
  nilometer: {
    id: 'nilometer', name: 'Nilometer', cost: 60, yields: { food: 2, faith: 1 },
    requiresTech: 'pottery', civ: 'egypt', replaces: 'granary', art: { glyph: 'amphora' },
  },
  etemenanki: {
    id: 'etemenanki', name: 'Etemenanki', cost: 72, yields: { science: 2, culture: 1 },
    perPop: { yield: 'science', per: 2 }, specialistSlots: { type: 'scientist', count: 1 },
    requiresTech: 'writing', civ: 'babylon', replaces: 'library', art: { glyph: 'scroll' },
  },
  acropolis: {
    id: 'acropolis', name: 'Acropolis', cost: 40, yields: { culture: 3 },
    civ: 'hellas', replaces: 'monument', art: { glyph: 'obelisk' },
  },
```

- [ ] **Step 5: Wire the unique abilities**

In `src/data/standard/civs.ts`, add a `uniqueAbility` field to each of the four playable civs (leave `barbarians` unchanged). Insert after each civ's `cityNames` line:

```ts
// rome:
    uniqueAbility: [{ kind: 'empireCivic', effect: { happiness: 3 } }],
// egypt:
    uniqueAbility: [{ kind: 'wonderProduction', amount: 3 }],
// babylon:
    uniqueAbility: [{ kind: 'empireCivic', effect: { yields: { science: 1 } } }],
// hellas:
    uniqueAbility: [{ kind: 'empireCivic', effect: { yields: { culture: 1 } } }],
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/uniques.test.ts`
Expected: PASS (all groups, including `civ kits`).

- [ ] **Step 7: Commit**

```bash
git add src/data/standard/units.ts src/data/standard/buildings.ts src/data/standard/civs.ts tests/uniques.test.ts
git commit -m "feat(data): unique unit, building, and ability for Rome/Egypt/Babylon/Hellas"
```

---

### Task 7: Full-suite + determinism verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all prior tests plus `tests/uniques.test.ts`. In particular `tests/replay.test.ts` and `tests/selfplay.test.ts` (determinism + bit-identical replay) must stay green: this plan adds no RNG and no state fields, so replays are unaffected.

- [ ] **Step 2: Type-check + production bundle**

Run: `npm run build`
Expected: PASS (`tsc -b` clean, Vite bundle succeeds).

- [ ] **Step 3: Self-play smoke (optional sanity)**

Run: `npm run sim`
Expected: completes without error; civs now differ (e.g., Egypt completes wonders sooner). No assertion is added here — formal balance tuning happens in Plan 3 once events/agendas are in.

- [ ] **Step 4: Commit (if anything was adjusted)**

```bash
git commit -am "test: verify civ uniques pass full suite and determinism" || echo "nothing to commit"
```

---

## Spec coverage check (self-review)

- **UA per civ** → Task 6 (4 abilities), mechanism in Tasks 4–5. ✓
- **UU per civ** → Task 6 (4 units), swap mechanism in Task 3. ✓
- **UB per civ** → Task 6 (4 buildings), swap mechanism in Task 3. ✓
- **`civ`/`replaces` data fields** → Task 1. ✓
- **Validation of new ids** → Task 2. ✓
- **No schema bump** (uniques are ruleset-only) → confirmed in architecture; Task 7 verifies determinism. ✓
- **Additive/integer, no multipliers** → all kit values are flat integers. ✓
- **Deferred to later plans:** traits, agendas, opinion/memory, reactivity, events, chronicle, and the UI surfacing of uniques (MainMenu civ-select / tile-info) — Plans 2 & 3. The uniques are fully *functional* in-game via `productionOptions` without new UI; explicit display is folded into the Plan 2/3 UI pass.

**Placeholder scan:** none — every step has concrete code/commands.
**Type consistency:** `CivAbility` kinds (`empireCivic`, `wonderProduction`) and field names (`civ`, `replaces`, `uniqueAbility`, `effect`, `amount`) are identical across Tasks 1–6 and the tests. `replacedByUnique` is named consistently. ✓
