# Naval Sea Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coastal improvement loop — a Work Boat that builds a Fishing Boats improvement on fish tiles — plus a Harbor building that gives coastal cities production from worked water tiles.

**Architecture:** Almost entirely data (`src/data/standard/`) plus four small, localized engine hooks. Coastal cities already work sea tiles and `fish` already grants +2 food when revealed, so this adds only the *improvement* on top of fish and a coastal building. The AI builds neither new unit nor building, so AI self-play stays byte-identical (the determinism gate).

**Tech Stack:** TypeScript, Vitest. Deterministic reducer engine (`state' = reduce(state, action)`), data-driven rulesets, canvas renderer.

**Spec:** `docs/superpowers/specs/2026-06-18-naval-sea-economy-design.md`

---

## File Structure

- `src/engine/serialize.ts` — bump `SCHEMA_VERSION` 11 → 12.
- `src/data/standard/units.ts` — add `work_boat` unit.
- `src/data/standard/resources.ts` — add `fishing_boats` improvement; wire `fish.improvedBy`/`bonusImproved`.
- `src/data/standard/buildings.ts` — add `harbor` building.
- `src/engine/types.ts` — `BuildingDef.perWorkedWater` + `BuildingDef.requiresCoastal`.
- `src/engine/selectors.ts` — `cityYields` `perWorkedWater` loop; `canProduce` coastal-building gate.
- `src/engine/validate.ts` — `BUILD_IMPROVEMENT` elevation-only impassable reject.
- `src/ui/map/art.ts` — `paintImprovement` `fishing_boats` case + `paintFishingBoats`.
- `tests/sea-economy.test.ts` — new test file (all behavior tests).
- `tests/naval.test.ts`, `tests/events.test.ts`, `tests/leaders.test.ts`, `tests/roads.test.ts` — schema assertion 11 → 12.

**Task order & dependencies:** Task 1 (schema) is independent. Task 2 (Work Boat) and Task 3 (Fishing Boats) are needed before the sea-economy tests for Harbor reference a coastal city, but each task's tests are self-contained. Task 4 (Harbor) depends on the `BuildingDef` type change within itself. Task 5 (rendering) depends on `fishing_boats` existing (Task 3). Task 6 is the determinism gate over everything.

---

## Task 1: Schema bump 11 → 12

**Files:**
- Modify: `src/engine/serialize.ts:7`
- Modify: `tests/naval.test.ts:24`, `tests/events.test.ts:21`, `tests/leaders.test.ts:35`, `tests/roads.test.ts:15`

- [ ] **Step 1: Update the four schema assertions to 12 (make them fail first)**

In `tests/naval.test.ts:24`:
```ts
  it('schema is 12', () => { expect(SCHEMA_VERSION).toBe(12); });
```
In `tests/leaders.test.ts:35`:
```ts
  it('schema is 12', () => { expect(SCHEMA_VERSION).toBe(12); });
```
In `tests/events.test.ts:21` (inside its existing test — change only the literal):
```ts
    expect(SCHEMA_VERSION).toBe(12);
```
In `tests/roads.test.ts:15` (inside its existing test — change only the literal):
```ts
    expect(SCHEMA_VERSION).toBe(12);
```

- [ ] **Step 2: Run the schema tests to verify they fail**

Run: `npx vitest run tests/naval.test.ts tests/leaders.test.ts tests/events.test.ts tests/roads.test.ts -t schema`
Expected: FAIL — `expected 11 to be 12` (and the events/roads tests that embed the assertion also fail).

- [ ] **Step 3: Bump SCHEMA_VERSION**

In `src/engine/serialize.ts:7`:
```ts
export const SCHEMA_VERSION = 12;
```

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `npx vitest run tests/naval.test.ts tests/leaders.test.ts tests/events.test.ts tests/roads.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/serialize.ts tests/naval.test.ts tests/leaders.test.ts tests/events.test.ts tests/roads.test.ts
git commit -m "chore(engine): bump schema 11 -> 12 for sea economy"
```

---

## Task 2: Work Boat unit

A sea-domain civilian with the `improve` ability, buildable only by coastal cities. The coastal gate already exists in `canProduce` for `domain: 'sea'` units (added in Spec 1), so adding the unit def is all that's required for production.

**Files:**
- Modify: `src/data/standard/units.ts`
- Test: `tests/sea-economy.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/sea-economy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw, fullRound } from './helpers';
import { tileIndex } from '../src/engine/hex';
import { canProduce, tileYields, cityYields } from '../src/engine/selectors';
import { validateAction } from '../src/engine/validate';
import { applyAction } from '../src/engine/reducer';

/** A coastal city for player 0 at (7,5); everything east of q=8 is coast. Returns state + city id. */
function seaWorld(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  for (let r = 0; r < s.mapH; r++) {
    for (let q = 8; q < s.mapW; q++) {
      const i = tileIndex({ q, r }, s.mapW, s.mapH);
      if (i >= 0) s.tiles[i].terrain = 'coast';
    }
  }
  const settler = spawn(s, 0, 'settler', 7, 5);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  return { s, id };
}

describe('Work Boat', () => {
  it('a coastal city can build a Work Boat; an inland city cannot', () => {
    const { s } = seaWorld();
    s.players[0].techs.push('pottery');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'unit', id: 'work_boat' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'unit', id: 'work_boat' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sea-economy.test.ts -t "Work Boat"`
Expected: FAIL — `canProduce` returns `{ ok: false, reason: 'unknown unit' }` for `work_boat`.

- [ ] **Step 3: Add the Work Boat unit def**

In `src/data/standard/units.ts`, add this entry (place it near the other naval units `galley`/`galleass`/`frigate`):
```ts
  work_boat: {
    id: 'work_boat',
    name: 'Work Boat',
    cost: 40,
    moves: 3,
    sight: 2,
    strength: 0,
    class: 'civilian',
    domain: 'sea',
    requiresTech: 'pottery',
    abilities: ['improve'],
    art: { glyph: 'gear' },
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sea-economy.test.ts -t "Work Boat"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/standard/units.ts tests/sea-economy.test.ts
git commit -m "feat(data): Work Boat — a coastal sea-domain worker"
```

---

## Task 3: Fishing Boats improvement (buildable on water by a Work Boat)

Add the `fishing_boats` improvement, wire `fish` to it, and relax `BUILD_IMPROVEMENT` so a Work Boat can build on a water tile while a land Worker still cannot build on water and the AI is unaffected (its `bestWorkerJob` keeps its own `isImpassable` water guard).

**Files:**
- Modify: `src/data/standard/resources.ts`
- Modify: `src/engine/validate.ts:188`
- Test: `tests/sea-economy.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/sea-economy.test.ts`:
```ts
describe('Fishing Boats', () => {
  it('a Work Boat builds Fishing Boats on an owned fish tile (and it completes)', () => {
    let { s, id } = seaWorld();
    spawn(s, 1, 'warrior', 1, 8); // keep player 1 alive so fullRound can cycle without ending the game
    const fishIdx = idxOf(s, 8, 5); // claimed by the city at founding (ring 1), water
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    s.players[0].techs.push('pottery');
    const wb = spawn(s, 0, 'work_boat', 8, 5);
    refreshVis(s);
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' }).ok,
    ).toBe(true);
    s = applyAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' });
    for (let i = 0; i < ctx.rules.improvements.fishing_boats.turns; i++) s = fullRound(s);
    expect(s.tiles[fishIdx].improvement).toBe('fishing_boats');
    expect(s.units[wb.id].order).toBeNull();
  });

  it('Fishing Boats needs the fish resource — fails on plain coast and on land', () => {
    const { s, id } = seaWorld();
    const plainCoast = idxOf(s, 8, 5);
    s.tiles[plainCoast].ownerCity = id; // owned water, no resource
    s.players[0].techs.push('pottery');
    const wb = spawn(s, 0, 'work_boat', 8, 5);
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: wb.id, improvement: 'fishing_boats' }).ok,
    ).toBe(false);
  });

  it('an improved fish tile yields food 4 / gold 2 (un-improved is food 3 / gold 1)', () => {
    const { s, id } = seaWorld();
    const fishIdx = idxOf(s, 8, 5);
    s.tiles[fishIdx].ownerCity = id;
    s.tiles[fishIdx].resource = 'fish';
    const before = tileYields(ctx, s, fishIdx, 0);
    expect(before.food).toBe(3); // coast food1 + fish food2
    expect(before.gold).toBe(1); // coast gold1
    s.tiles[fishIdx].improvement = 'fishing_boats';
    const after = tileYields(ctx, s, fishIdx, 0);
    expect(after.food).toBe(4); // + bonusImproved food1
    expect(after.gold).toBe(2); // + bonusImproved gold1
  });

  it('a land Worker still cannot build a farm on water', () => {
    const { s, id } = seaWorld();
    const waterIdx = idxOf(s, 8, 5);
    s.tiles[waterIdx].ownerCity = id;
    s.players[0].techs.push('agriculture');
    const worker = spawn(s, 0, 'worker', 8, 5); // land unit force-placed on water for the assertion
    expect(
      validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: worker.id, improvement: 'farm' }).ok,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sea-economy.test.ts -t "Fishing Boats"`
Expected: FAIL — `unknown improvement` (no `fishing_boats`), and the build-on-fish test fails on `isImpassable` ("cannot improve this terrain") even once the improvement exists.

- [ ] **Step 3: Add the improvement and wire `fish`**

In `src/data/standard/resources.ts`, add to `IMPROVEMENTS`:
```ts
  fishing_boats: {
    id: 'fishing_boats',
    name: 'Fishing Boats',
    turns: 4,
    yields: {},
    requiresResource: true,
    requiresTech: 'pottery',
  },
```

And modify the existing `fish` entry in `RESOURCES` to:
```ts
  fish: {
    id: 'fish',
    name: 'Fish',
    kind: 'bonus',
    yields: { food: 2 },
    improvedBy: 'fishing_boats',
    bonusImproved: { food: 1, gold: 1 },
    spawn: { terrains: ['coast'], weight: 9 },
  },
```

- [ ] **Step 4: Relax `BUILD_IMPROVEMENT` to elevation-only impassable**

In `src/engine/validate.ts:188`, replace:
```ts
      if (isImpassable(ctx, state, idx)) return fail('cannot improve this terrain');
```
with:
```ts
      if (ctx.rules.elevations[tile.elevation].impassable) return fail('cannot improve this terrain');
```
(`tile` is already in scope from `const tile = state.tiles[idx];` two lines above. Do NOT modify the shared `isImpassable` selector — movement/pathfinding and `bestWorkerJob` rely on it still treating water as impassable. If `isImpassable` is now an unused import in this file, remove it from the import line; otherwise leave it.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/sea-economy.test.ts -t "Fishing Boats"`
Expected: PASS (all four).

- [ ] **Step 6: Run the existing improvement/validation tests to confirm no regression**

Run: `npx vitest run tests/engine.test.ts tests/naval.test.ts tests/roads.test.ts`
Expected: PASS — land improvements and naval movement unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/data/standard/resources.ts src/engine/validate.ts tests/sea-economy.test.ts
git commit -m "feat(data): Fishing Boats improvement; Work Boats may build on water"
```

---

## Task 4: Harbor building (+production per worked water tile, coastal-gated)

Add two optional fields to `BuildingDef`, the `harbor` def, a coastal gate in `canProduce`, and the per-worked-water yield loop in `cityYields`.

**Files:**
- Modify: `src/engine/types.ts` (`BuildingDef`)
- Modify: `src/data/standard/buildings.ts`
- Modify: `src/engine/selectors.ts` (`canProduce` building branch ~line 524; `cityYields` building loop ~line 271)
- Test: `tests/sea-economy.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/sea-economy.test.ts`:
```ts
describe('Harbor', () => {
  it('is coastal-gated', () => {
    const { s } = seaWorld();
    s.players[0].techs.push('bronze_working');
    const coastal = { q: 7, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    const inland = { q: 2, r: 5, owner: 0, buildings: [] as string[], pop: 3 } as any;
    expect(canProduce(ctx, s, coastal, { kind: 'building', id: 'harbor' }).ok).toBe(true);
    expect(canProduce(ctx, s, inland, { kind: 'building', id: 'harbor' }).ok).toBe(false);
  });

  it('adds +1 production per worked water tile', () => {
    const { s, id } = seaWorld();
    const city = s.cities[id];
    city.pop = 4; // enough citizens to work several ring tiles
    const base = cityYields(ctx, s, city);
    const waterWorked = base.worked.filter(
      (idx) => ctx.rules.terrains[s.tiles[idx].terrain].water,
    ).length;
    city.buildings.push('harbor');
    const withHarbor = cityYields(ctx, s, city);
    expect(withHarbor.total.production - base.total.production).toBe(waterWorked);
    expect(waterWorked).toBeGreaterThan(0); // the coastal city actually works water
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sea-economy.test.ts -t Harbor`
Expected: FAIL — `unknown building` for `harbor`.

- [ ] **Step 3: Extend `BuildingDef`**

In `src/engine/types.ts`, add two optional fields to the `BuildingDef` interface (next to the existing `perPop` field):
```ts
  perWorkedWater?: { yield: keyof Yields; amount: number };
  requiresCoastal?: boolean;
```

- [ ] **Step 4: Add the Harbor building def**

In `src/data/standard/buildings.ts`, add:
```ts
  harbor: {
    id: 'harbor',
    name: 'Harbor',
    cost: 90,
    yields: {},
    requiresTech: 'bronze_working',
    requiresCoastal: true,
    perWorkedWater: { yield: 'production', amount: 1 },
    art: { glyph: 'amphora' },
  },
```

- [ ] **Step 5: Add the coastal gate in `canProduce`**

In `src/engine/selectors.ts`, in the `kind: 'building'` branch of `canProduce` (after the existing `requiresTech` check, before the `wonder` check, ~line 525), add:
```ts
  if (def.requiresCoastal && !isCoastal(ctx, state, city))
    return { ok: false, reason: 'only a coastal city can build a harbor' };
```
(`isCoastal` already exists and is imported/defined in this file.)

- [ ] **Step 6: Add the per-worked-water yield in `cityYields`**

In `src/engine/selectors.ts`, inside the `for (const b of city.buildings)` loop in `cityYields` (~line 271, right after the `if (def.perPop) ...` line), add:
```ts
    if (def.perWorkedWater) {
      const n = alloc.worked.filter(
        (idx) => ctx.rules.terrains[state.tiles[idx].terrain].water,
      ).length;
      total[def.perWorkedWater.yield] += n * def.perWorkedWater.amount;
    }
```
(`alloc.worked` and `total` are already in scope from earlier in the function.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/sea-economy.test.ts -t Harbor`
Expected: PASS (both).

- [ ] **Step 8: Run the full sea-economy file**

Run: `npx vitest run tests/sea-economy.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/data/standard/buildings.ts src/engine/selectors.ts tests/sea-economy.test.ts
git commit -m "feat: Harbor — coastal building, +1 production per worked water tile"
```

---

## Task 5: Render the Fishing Boats improvement

`paintImprovement` is a `switch (impId)`; an unhandled improvement simply doesn't render. Add a `fishing_boats` case and a small painter in the style of the existing ones.

**Files:**
- Modify: `src/ui/map/art.ts` (`paintImprovement` switch ~line 484; add `paintFishingBoats`)

- [ ] **Step 1: Add the switch case**

In `src/ui/map/art.ts`, in the `paintImprovement` `switch (impId)` (~line 484), add before the closing brace of the switch:
```ts
    case 'fishing_boats':
      paintFishingBoats(g, cx, cy, q, r, seed);
      break;
```

- [ ] **Step 2: Add the painter**

In `src/ui/map/art.ts`, near the other improvement painters (e.g. after `paintPasture`), add:
```ts
function paintFishingBoats(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx;
  const y = cy + 1;
  const w = HEX * 0.42;
  // a small buoy float
  g.fillStyle = 'rgba(212,196,140,0.95)';
  g.strokeStyle = 'rgba(60,48,34,0.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(x, y - 2, w * 0.34, HEX * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // net stakes poking out of the water
  g.lineCap = 'round';
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(60,48,34,0.8)';
  const stakes = 4;
  for (let i = 0; i < stakes; i++) {
    const t = (i / (stakes - 1) - 0.5) * 2; // -1..1
    const sx = x + t * w;
    const jitter = (hash2(q + i, r, seed + 91) - 0.5) * 2.5;
    g.beginPath();
    g.moveTo(sx, y + 4 + jitter);
    g.lineTo(sx, y - 1 + jitter);
    g.stroke();
  }
}
```
(`HEX` and `hash2` are already used by the neighbouring painters in this file. If `paintPasture` uses a different signature for `hash2`, match it.)

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/map/art.ts
git commit -m "feat(ui): render the Fishing Boats improvement"
```

---

## Task 6: Determinism gate + full suite

No code — the verification checkpoint that proves the slice is re-tune-free.

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: ALL green. Critically:
- `tests/selfplay.test.ts` passes with **seed 314 (science)** and **seed 949 (culture)** unchanged — no seed edits.
- The deterministic-replay tests still pass (logs replay bit-identically).

(Note: a benign vitest `onTaskUpdate` IPC timeout artifact may print at the end of the run; it is not a test failure. Confirm the reported pass/fail counts, not the artifact.)

- [ ] **Step 2: If any self-play seed flipped, STOP and investigate**

A flipped victory seed means the determinism assumption was violated — some new code path is reachable by the AI. Do not silently re-tune the seed. Re-check that:
- `work_boat` is referenced nowhere in `src/ai/`,
- `harbor` was not added to `buildingPriorityFor` in `src/ai/economy.ts`,
- the `cityYields` change is gated on `def.perWorkedWater`,
- the `validate.ts` change is elevation-only and `isImpassable` itself is untouched.
Report the finding rather than masking it.

- [ ] **Step 3: Final commit (only if Step 1 required no changes, this is a no-op checkpoint)**

No commit needed if the suite passed without edits. If a genuine bug was found and fixed, commit it with a descriptive message and re-run `npm test`.

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** Work Boat (Task 2), Fishing Boats + `fish` wiring + `BUILD_IMPROVEMENT` fix (Task 3), Harbor + `perWorkedWater` + `requiresCoastal` + coastal gate (Task 4), rendering (Task 5), schema bump (Task 1), determinism gate (Task 6), all listed spec tests covered. ✓
- **Determinism:** confirmed in the engine — AI picks units by explicit id and buildings from a fixed list; `bestWorkerJob` keeps its own `isImpassable` water guard (`economy.ts:309`); the two shared-path edits are no-ops for land tiles / non-Harbor cities. ✓
- **Type consistency:** `perWorkedWater: { yield: keyof Yields; amount: number }` used identically in the type, the `harbor` def, and the `cityYields` loop; `requiresCoastal` used in type, def, and `canProduce`; `canProduce` returns `{ ok: false, reason }` literals (matches the gate snippet). ✓
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. The Fishing Boats build-completion test mirrors the proven farm-build pattern (`engine.test.ts`): keep player 1 alive with a warrior, apply `BUILD_IMPROVEMENT`, advance `fishing_boats.turns` rounds via `fullRound`, assert the improvement landed and the order cleared. ✓
