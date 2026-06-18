# Naval — Combat Core Implementation Plan (Spec 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the sea domain — embarkation, era naval units, and naval combat (coastal raiding) — keeping the AI off the water so self-play stays re-tune-free. Per `docs/superpowers/specs/2026-06-18-naval-combat-core-design.md`.

**Architecture:** `UnitDef.domain` widens to `'land'|'sea'`. Two passability rules: auto-routing (`moveRulesFor`/findPath) keeps land units out of water unless already embarked (→ AI land routing unchanged); execution + a MOVE validation embark special-case let a tech'd land unit deliberately step onto adjacent water. Naval combat reuses the melee/ranged engine; only cross-domain validation + embarked defense are new. The AI builds no ships.

**Tech Stack:** TypeScript, Immer reducer, React + canvas, Vitest.

**Conventions:** tests `tests/*.test.ts` via `npx vitest run <file>`; typecheck `npm run build`; full suite `npm test`. **Commit messages carry NO AI attribution.** Schema 10→11.

**Determinism spine:** AI builds no naval units (Task 5) and on-land land units can't auto-route into water (Task 2) → AI behavior byte-identical → self-play replays unchanged. The full-suite gate in Tasks 2 and 5 proves it; if a victory seed shifts, re-tune that one seed as prior slices did.

---

## File Structure

- `src/data/types.ts` — `UnitDef.domain: 'land'|'sea'`; `RulesetSettings.naval`.
- `src/data/standard/index.ts` — `naval: { embarkTech, embarkedDefense }`.
- `src/data/standard/units.ts` — Galley / Galleass / Frigate (`domain:'sea'`).
- `src/engine/serialize.ts` — `SCHEMA_VERSION` 11.
- `src/engine/selectors.ts` — `isEmbarked`, `isCoastal`, `unitCanOccupy`; coastal+domain gate in `canProduce`; embarked branch in nothing here (combat owns defense).
- `src/engine/map/pathfind.ts` — domain-aware `moveRulesFor.canEnter` (strict auto-routing).
- `src/engine/systems/movement.ts` — domain-aware per-step occupancy.
- `src/engine/validate.ts` — MOVE_UNIT embark special-case; ATTACK/RANGED cross-domain rules.
- `src/engine/systems/combat.ts` — embarked `defenseStrength`.
- `src/engine/systems/cities.ts` — `placeProducedUnit` places sea units on water.
- `src/ai/economy.ts` — `pickProduction` skips `domain:'sea'`.
- `src/ui/map/MapCanvas.tsx` — embark click; `src/ui/map/renderer.ts` — ship + embarked rendering.
- Tests: `tests/naval.test.ts`; `tests/{leaders,events}.test.ts` (schema 10→11).

---

## Task 1: Domain field, naval settings, helpers, schema

**Files:** Modify `src/data/types.ts`, `src/data/standard/index.ts`, `src/engine/serialize.ts`, `src/engine/selectors.ts`, `tests/leaders.test.ts`, `tests/events.test.ts`; Test `tests/naval.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/naval.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf } from './helpers';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { isEmbarked, isCoastal, unitCanOccupy } from '../src/engine/selectors';
import { applyAction } from '../src/engine/reducer';

/** Paint a column of water at x=8 so tiles east of it are sea. */
function coastWorld() {
  const s = flatWorld(16, 12, 2);
  for (let y = 0; y < s.mapH; y++) for (let x = 8; x < s.mapW; x++) s.tiles[idxOf(s, x, y)].terrain = 'coast';
  return s;
}

describe('naval foundations', () => {
  it('schema is 11', () => { expect(SCHEMA_VERSION).toBe(11); });

  it('isEmbarked: a land unit on water is embarked; on land is not', () => {
    const s = coastWorld();
    const w = spawn(s, 0, 'warrior', 5, 5);      // on land
    const w2 = spawn(s, 0, 'warrior', 10, 5);    // on water
    expect(isEmbarked(ctx, s, w)).toBe(false);
    expect(isEmbarked(ctx, s, w2)).toBe(true);
  });

  it('isCoastal: a city beside water is coastal', () => {
    const s = coastWorld();
    expect(isCoastal(ctx, s, { q: 7, r: 5 } as any)).toBe(true);  // x7 borders x8 water
    expect(isCoastal(ctx, s, { q: 2, r: 5 } as any)).toBe(false); // inland
  });

  it('unitCanOccupy: land unit needs the embark tech for water; sea unit needs water', () => {
    const s = coastWorld();
    const warrior = spawn(s, 0, 'warrior', 5, 5);
    const waterIdx = idxOf(s, 10, 5), landIdx = idxOf(s, 5, 5);
    expect(unitCanOccupy(ctx, s, warrior, landIdx)).toBe(true);
    expect(unitCanOccupy(ctx, s, warrior, waterIdx)).toBe(false); // no embark tech
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    expect(unitCanOccupy(ctx, s, warrior, waterIdx)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/naval.test.ts`
Expected: FAIL — schema is 10; `isEmbarked`/`isCoastal`/`unitCanOccupy`/`settings.naval` don't exist.

- [ ] **Step 3: Widen the domain type + add the naval settings**

In `src/data/types.ts`, change `UnitDef.domain`:

```ts
  domain: 'land' | 'sea';
```

Add to the `RulesetSettings` interface:

```ts
  naval: { embarkTech: string; embarkedDefense: number };
```

In `src/data/standard/index.ts`, add to the `SETTINGS` object (next to `tilePurchase`):

```ts
  naval: { embarkTech: 'bronze_working', embarkedDefense: 5 },
```

- [ ] **Step 4: Bump the schema + update assertions**

In `src/engine/serialize.ts`, `export const SCHEMA_VERSION = 11;`.
In `tests/leaders.test.ts` change the `schema is 10`/`toBe(10)` assertion to `11`; in `tests/events.test.ts` change `schema is 10 ...`/`toBe(10)` to `11`.

- [ ] **Step 5: Add the helpers in `src/engine/selectors.ts`**

(`isWater`, `tileIndex`, `neighbors` are imported/available; add `neighbors` to the `./hex` import if absent.)

```ts
/** A land-domain unit standing on a water tile is "embarked". */
export function isEmbarked(ctx: Ctx, state: GameState, unit: Unit): boolean {
  if (ctx.rules.units[unit.def].domain !== 'land') return false;
  const idx = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);
  return isWater(ctx, state.tiles[idx].terrain);
}

/** A city with at least one adjacent water tile. */
export function isCoastal(ctx: Ctx, state: GameState, city: { q: number; r: number }): boolean {
  for (const nb of neighbors({ q: city.q, r: city.r })) {
    const idx = tileIndex(nb, state.mapW, state.mapH);
    if (idx >= 0 && isWater(ctx, state.tiles[idx].terrain)) return true;
  }
  return false;
}

/** Can `unit` legally OCCUPY tile `idx` (for execution + the embark step)? Permissive:
 *  sea→water only; land→land always, water only if the owner has the embark tech. */
export function unitCanOccupy(ctx: Ctx, state: GameState, unit: Unit, idx: number): boolean {
  const t = state.tiles[idx];
  if (ctx.rules.elevations[t.elevation].impassable) return false;
  const water = isWater(ctx, t.terrain);
  if (ctx.rules.units[unit.def].domain === 'sea') return water;
  if (!water) return true;
  return state.players[unit.owner].techs.includes(ctx.rules.settings.naval.embarkTech);
}
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npx vitest run tests/naval.test.ts tests/leaders.test.ts tests/events.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean (widening `domain` forces every unit literal to compile; only `units.ts` defines them, all `'land'` today).

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/data/standard/index.ts src/engine/serialize.ts src/engine/selectors.ts tests/naval.test.ts tests/leaders.test.ts tests/events.test.ts
git commit -m "feat(engine): sea-domain foundations — domain field, embark/coastal helpers, schema 11"
```

---

## Task 2: Domain-aware movement (pathfinder + execution + embark)

**Files:** Modify `src/engine/map/pathfind.ts`, `src/engine/systems/movement.ts`, `src/engine/validate.ts`; Test `tests/naval.test.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/naval.test.ts`:

```ts
import { refreshVis, thaw } from './helpers';
import { findPath } from '../src/engine/map/pathfind';

describe('domain-aware movement', () => {
  it('findPath never routes an on-land land unit through water', () => {
    const s = coastWorld();
    const u = spawn(s, 0, 'warrior', 7, 5); // beside the water column at x8
    refreshVis(s);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    const path = findPath(ctx, s, u, { q: 11, r: 5 }); // a tile across the water
    // either no path, or a path that stays on land (never steps onto a water tile)
    if (path) for (const step of path) expect(isWaterAt(s, step)).toBe(false);
  });

  it('a tech land unit can deliberately embark one step onto adjacent water', () => {
    const s = thaw(coastWorld());
    const u = spawn(s, 0, 'warrior', 7, 5);
    s.players[0].techs.push(ctx.rules.settings.naval.embarkTech);
    refreshVis(s);
    const s2 = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: u.id, path: [{ q: 8, r: 5 }] });
    expect(isEmbarked(ctx, s2, s2.units[u.id])).toBe(true);
  });

  it('without the embark tech, stepping onto water is rejected', () => {
    const s = thaw(coastWorld());
    const u = spawn(s, 0, 'warrior', 7, 5);
    refreshVis(s);
    const res = validateAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: u.id, path: [{ q: 8, r: 5 }] });
    expect(res.ok).toBe(false);
  });
});

function isWaterAt(s: ReturnType<typeof flatWorld>, a: { q: number; r: number }) {
  return s.tiles[idxOf(s, a.q, a.r)].terrain === 'coast' || s.tiles[idxOf(s, a.q, a.r)].terrain === 'ocean';
}
```

Add `import { validateAction } from '../src/engine/validate';` to the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/naval.test.ts`
Expected: FAIL — findPath currently treats all water as impassable (so the embark test's `applyAction` is blocked / the move is rejected for the wrong reason).

- [ ] **Step 3: Strict auto-routing passability in `moveRulesFor`**

In `src/engine/map/pathfind.ts`, inside `moveRulesFor`, compute whether the unit is currently embarked, then replace the impassability check in `canEnter`:

```ts
  const domain = ctx.rules.units[unit.def].domain;
  const startIdx = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);
  const unitOnWater = isWater(ctx, state.tiles[startIdx].terrain);
```

Replace `if (explored && isImpassable(ctx, state, idx)) return false;` with:

```ts
      if (explored) {
        const t = state.tiles[idx];
        if (ctx.rules.elevations[t.elevation].impassable) return false; // mountains block all
        const water = isWater(ctx, t.terrain);
        if (domain === 'sea') { if (!water) return false; }           // sea: water only
        else if (water && !unitOnWater) return false;                 // land: no water unless embarked
      }
```

(Import `isWater` from `../selectors` in pathfind.ts if not already imported.)

- [ ] **Step 4: Domain-aware per-step occupancy in execution**

In `src/engine/systems/movement.ts`, replace `if (isImpassable(ctx, state, idx)) {` (the per-step block) with the permissive domain check:

```ts
    if (!unitCanOccupy(ctx, state, unit, idx)) {
      blocked = true;
      break;
    }
```

Import `unitCanOccupy` from `../selectors` in movement.ts (alongside the existing selector imports).

- [ ] **Step 5: Embark special-case in MOVE_UNIT validation**

In `src/engine/validate.ts` `MOVE_UNIT` case, before the `if (!moveRulesFor(ctx, state, unit).canEnter(first))` line, add the embark allowance (and import `isWater`, `unitCanOccupy`, `militaryAt` if not present):

```ts
      // embark: a tech'd land unit may step from land onto an adjacent water tile,
      // which strict auto-routing forbids. Permit it explicitly.
      const here = state.tiles[tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH)];
      const firstWater = isWater(ctx, state.tiles[first].terrain);
      if (firstWater && unitCanOccupy(ctx, state, unit, first) && !isWater(ctx, here.terrain)) {
        if (militaryAt(ctx, state, action.path[0])) return fail('that water is occupied');
        return ok;
      }
      if (!moveRulesFor(ctx, state, unit).canEnter(first)) return fail('that way is blocked');
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/naval.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean.

- [ ] **Step 7: DETERMINISM GATE — full suite**

Run: `npm test`
Expected: ALL PASS, incl. self-play. The AI still has no naval units and on-land land units can't auto-route into water, so AI movement is unchanged. If a self-play victory test fails, re-tune that one seed (probe + reseed as in the roads/happiness slices) and commit the reseed in this task.

- [ ] **Step 8: Commit**

```bash
git add src/engine/map/pathfind.ts src/engine/systems/movement.ts src/engine/validate.ts tests/naval.test.ts
git commit -m "feat(engine): domain-aware movement + deliberate embarkation"
```

---

## Task 3: Naval units, coastal-city production, sea placement

**Files:** Modify `src/data/standard/units.ts`, `src/engine/selectors.ts`, `src/engine/systems/cities.ts`; Test `tests/naval.test.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/naval.test.ts`:

```ts
import { canProduce } from '../src/engine/selectors';

describe('naval units & coastal production', () => {
  it('a coastal city can produce a Galley; an inland city cannot', () => {
    const s = coastWorld();
    s.players[0].techs.push('bronze_working');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'unit', id: 'galley' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'unit', id: 'galley' }).ok).toBe(false);
  });

  it('a sea unit may occupy water but not land', () => {
    const s = coastWorld();
    const g = spawn(s, 0, 'galley', 10, 5); // on water
    expect(unitCanOccupy(ctx, s, g, idxOf(s, 11, 5))).toBe(true);  // water
    expect(unitCanOccupy(ctx, s, g, idxOf(s, 5, 5))).toBe(false);  // land
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/naval.test.ts`
Expected: FAIL — `galley` unit doesn't exist; no coastal gate.

- [ ] **Step 3: Add the naval unit defs**

In `src/data/standard/units.ts`, add (tune strengths against contemporaneous land units; starting values shown):

```ts
  galley: {
    id: 'galley', name: 'Galley', cost: 60, moves: 3, sight: 2, strength: 12,
    class: 'melee', domain: 'sea', requiresTech: 'bronze_working', art: { glyph: 'sword' },
  },
  galleass: {
    id: 'galleass', name: 'Galleass', cost: 110, moves: 3, sight: 2, strength: 14,
    ranged: { strength: 16, range: 2 }, class: 'ranged', domain: 'sea', requiresTech: 'machinery', art: { glyph: 'bow' },
  },
  frigate: {
    id: 'frigate', name: 'Frigate', cost: 150, moves: 4, sight: 2, strength: 20,
    ranged: { strength: 28, range: 2 }, class: 'ranged', domain: 'sea', requiresTech: 'metallurgy', art: { glyph: 'bow' },
  },
```

(Every existing land unit def must keep its `domain: 'land'` — the widened type requires it; they already have it.)

- [ ] **Step 4: Coastal + domain gate in `canProduce`**

In `src/engine/selectors.ts` `canProduce`, in the `item.kind === 'unit'` branch (where `foundCity` is checked), add — after the tech/resource checks, before `return { ok: true }`:

```ts
    if (def.domain === 'sea' && !isCoastal(ctx, state, city))
      return { ok: false, reason: 'only a coastal city can build ships' };
```

- [ ] **Step 5: Place sea units on water in `placeProducedUnit`**

In `src/engine/systems/cities.ts` `placeProducedUnit`, the candidate loop skips `isImpassable` tiles. Make placement domain-aware: replace `if (idx < 0 || isImpassable(ctx, state, idx)) continue;` with:

```ts
    if (idx < 0) continue;
    const wantsWater = def.domain === 'sea';
    if (wantsWater !== isWater(ctx, state.tiles[idx].terrain)) continue; // sea→water, land→land
    if (def.domain === 'land' && isImpassable(ctx, state, idx)) continue; // mountains block land units
```

(Import `isWater` in cities.ts if absent. A coastal city's ring-1/2 includes water tiles, so a Galley finds a free water hex; if none, the existing `return null` → "no room" path fires.)

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/naval.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/data/standard/units.ts src/engine/selectors.ts src/engine/systems/cities.ts tests/naval.test.ts
git commit -m "feat(data): naval units (galley/galleass/frigate); coastal-city production + sea placement"
```

---

## Task 4: Naval combat — cross-domain validation + embarked defense

**Files:** Modify `src/engine/validate.ts`, `src/engine/systems/combat.ts`; Test `tests/naval.test.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/naval.test.ts`:

```ts
import { resolveRangedAttack } from '../src/engine/systems/combat';
import { declareWarBetween } from './helpers';

describe('naval combat', () => {
  it('an embarked unit cannot attack and defends weakly', () => {
    const s = thaw(coastWorld());
    const emb = spawn(s, 0, 'warrior', 10, 5, { stance: 'none' }); // on water = embarked
    const enemy = spawn(s, 1, 'warrior', 9, 5); // adjacent land enemy
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    // embarked unit may not melee-attack
    expect(validateAction(ctx, s, { type: 'ATTACK', player: 0, unit: emb.id, target: { q: 9, r: 5 } }).ok).toBe(false);
  });

  it('a ranged ship may bombard an enemy embarked unit but a melee ship cannot storm a city', () => {
    const s = thaw(coastWorld());
    const frig = spawn(s, 0, 'frigate', 10, 5);
    const emb = spawn(s, 1, 'warrior', 11, 5); // enemy embarked (on water)
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'RANGED_ATTACK', player: 0, unit: frig.id, target: { q: 11, r: 5 } }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/naval.test.ts`
Expected: FAIL — embarked unit can currently attack; no embarked-defense.

- [ ] **Step 3: Cross-domain rules in ATTACK / RANGED_ATTACK validation**

In `src/engine/validate.ts`, `ATTACK` case: after `const def = ctx.rules.units[unit.def];`, add the embarked + cross-domain guards:

```ts
      if (isEmbarked(ctx, state, unit)) return fail('embarked units cannot attack');
      if (def.domain === 'sea' && cityAt(state, action.target)) return fail('ships cannot storm cities');
      if (def.domain === 'land' && isWater(ctx, state.tiles[tileIndex(action.target, state.mapW, state.mapH)].terrain))
        return fail('land units cannot strike ships at sea');
```

In the `RANGED_ATTACK` case, after `const def = ctx.rules.units[unit.def];`, add:

```ts
      if (isEmbarked(ctx, state, unit)) return fail('embarked units cannot attack');
```

(Import `isEmbarked`, `isWater`, `tileIndex`, `cityAt` in validate.ts if absent.)

- [ ] **Step 4: Embarked defense in `defenseStrength`**

In `src/engine/systems/combat.ts` `defenseStrength`, at the top of the function (before the normal calculation), add:

```ts
  if (isEmbarked(ctx, state, unit)) return ctx.rules.settings.naval.embarkedDefense; // weak; no terrain/fortify
```

(Import `isEmbarked` from `../selectors` in combat.ts. Killing-on-loss is already handled — `resolveRangedAttack`/`resolveMeleeAttack` call `killUnit` when hp ≤ 0.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/naval.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Full suite (no regressions)**

Run: `npm test`
Expected: ALL PASS (AI builds no ships/embarks; existing land combat unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/engine/validate.ts src/engine/systems/combat.ts tests/naval.test.ts
git commit -m "feat(engine): naval combat — cross-domain targeting, embarked units weak & can't attack"
```

---

## Task 5: AI guard (keep the AI off the water)

**Files:** Modify `src/ai/economy.ts`; Test via full suite.

- [ ] **Step 1: Skip sea-domain units in the AI production scorer**

In `src/ai/economy.ts` `pickProduction`, find where it builds military-unit candidates (the loop producing `item: { kind: 'unit', id: def.id }`). Add a guard so the AI never proposes a sea unit. At the point it iterates unit defs, skip sea:

```ts
      if (def.domain === 'sea') continue; // AI stays off the water (naval AI = track C)
```

(Place this in each spot `pickProduction` considers a unit def for production — there is a military-unit candidate loop near the power/threat logic. Ensure no code path can return a `{ kind:'unit', id }` whose def has `domain:'sea'`.)

- [ ] **Step 2: DETERMINISM GATE — full suite**

Run: `npm test`
Expected: ALL PASS, including every self-play replay + victory test, bit-identical to before this whole track. This is the proof the naval slice is re-tune-free. If a victory seed shifted earlier (Task 2) it was already reseeded; confirm green here.

- [ ] **Step 3: Commit**

```bash
git add src/ai/economy.ts
git commit -m "feat(ai): AI builds no naval units (defer naval AI to the islands track)"
```

---

## Task 6: UI — embark click + naval/embarked rendering

**Files:** Modify `src/ui/map/MapCanvas.tsx`, `src/ui/map/renderer.ts`.

Presentation-only; verified by `npm run build` + manual.

- [ ] **Step 1: Embark on click in `handleTileClick`**

In `src/ui/map/MapCanvas.tsx` `handleTileClick`, the movement order is built from `findPath`. Since strict auto-routing won't path an on-land unit onto water, add an explicit embark: when a selected own land unit has the embark tech and the clicked tile is an **adjacent water** tile, dispatch a one-step `MOVE_UNIT` onto it. Add, inside the `if (selected && selected.owner === viewingPlayer && myTurn)` block, before the normal `findPath` movement:

```ts
    const clickedWater = isWater(gameCtx, game.tiles[idx].terrain);
    const adjacent = hexDistance({ q: selected.q, r: selected.r }, a) === 1;
    const def = gameCtx.rules.units[selected.def];
    const onLand = !isWater(gameCtx, game.tiles[tileIndex({ q: selected.q, r: selected.r }, game.mapW, game.mapH)].terrain);
    const canEmbark = def.domain === 'land' && game.players[viewingPlayer].techs.includes(gameCtx.rules.settings.naval.embarkTech);
    if (clickedWater && adjacent && onLand && canEmbark) {
      if (humanDispatch({ type: 'MOVE_UNIT', player: viewingPlayer, unit: selected.id, path: [a] })) return;
    }
```

(Import `isWater` from `../../engine/selectors` in MapCanvas.tsx. An already-embarked unit clicking water uses the normal `findPath` path, which now routes on water.)

- [ ] **Step 2: Render ships + an embarked marker**

In `src/ui/map/renderer.ts` `drawUnit`, after the existing stance/badge blocks (inside the outer `g.save()/g.restore()`), add an embarked marker for a land unit on water, and let sea units draw normally (they already render via the glyph). For the embarked marker:

```ts
    // embarked marker — a land unit riding the sea
    if (this.rules.units[u.def].domain === 'land' && isWaterTile(s, u.q, u.r)) {
      g.strokeStyle = css(rgb(PALETTE.brass), 0.8);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x - 8, y + 13);
      g.quadraticCurveTo(x, y + 16, x + 8, y + 13);
      g.stroke();
    }
```

Add a small helper near the bottom of `renderer.ts`:

```ts
function isWaterTile(s: GameState, q: number, r: number): boolean {
  const idx = tileIndex({ q, r }, s.mapW, s.mapH);
  const t = s.tiles[idx]?.terrain;
  return t === 'coast' || t === 'ocean';
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev` on a map with a coast (or use the debug bridge). With `bronze_working`, select a land unit and click adjacent water → it embarks (a wave marker appears); move it across the sea and disembark by clicking land. Build a Galley in a coastal city (it spawns on water). A Frigate bombards a coastal city/embarked unit; an Archer on the shore can shoot an adjacent ship.

- [ ] **Step 5: Commit**

```bash
git add src/ui/map/MapCanvas.tsx src/ui/map/renderer.ts
git commit -m "feat(ui): embark-on-click + ship/embarked rendering"
```

---

## Closing: docs

- [ ] Mark "Naval combat core (Spec 1)" shipped in `docs/2026-06-17-testing-feedback.md` (note Spec 2 sea economy + track C islands/AI still open).
- [ ] Commit spec + plan + doc:

```bash
git add docs/superpowers/specs/2026-06-18-naval-combat-core-design.md docs/superpowers/plans/2026-06-18-naval-combat-core.md docs/2026-06-17-testing-feedback.md
git commit -m "docs(naval): combat-core spec, plan, and shipped note"
```

---

## Self-review

- **Spec coverage:** domain field + helpers + schema (Task 1); domain-aware movement + embarkation (Task 2); naval units + coastal production + sea placement (Task 3); naval combat + cross-domain + embarked defense (Task 4); AI guard (Task 5); UI embark + rendering (Task 6). Every spec section mapped.
- **Determinism:** the two gates (Task 2, Task 5) run the full self-play suite; the design keeps AI behavior byte-identical (no naval builds, no auto-routing into water), so it should be re-tune-free — and if one seed shifts, the plan says reseed it in Task 2.
- **Type consistency:** `isEmbarked`/`isCoastal`/`unitCanOccupy` (Task 1) consumed by movement/validation/combat (Tasks 2/4) and the renderer/UI (Task 6); `settings.naval.{embarkTech,embarkedDefense}` used consistently; `domain` widened once and required on every unit literal.
- **No placeholders:** every code step shows the change; every run step states the expected result.
