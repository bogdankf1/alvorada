# Batch 3 Content — Lumber Mill + Unit Obsolescence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Lumber Mill improvement (build on un-cleared forest, keep the trees, +2 production) and unit obsolescence (`obsoletedBy` tech → unit drops from the build menu).

**Architecture:** Both are ruleset data + one small engine hook each (a `requiresFeature` validation branch; an `obsoletedBy` gate in `canProduce`). The AI needs no changes — `bestWorkerJob` will build the mill, and `pickProduction` already gates on `canProduce`.

**Tech Stack:** TypeScript, Vitest. Deterministic engine; self-play replay is the gate.

**Spec:** `docs/superpowers/specs/2026-06-22-batch3-content-design.md`

---

## File Structure

- `src/data/types.ts` — `ImprovementDef.requiresFeature`, `UnitDef.obsoletedBy`.
- `src/data/standard/resources.ts` — `lumber_mill` improvement.
- `src/data/standard/units.ts` — `obsoletedBy` on the catalog units.
- `src/engine/validate.ts` — `requiresFeature` branch in `BUILD_IMPROVEMENT`.
- `src/engine/selectors.ts` — `obsoletedBy` gate in `canProduce`.
- `src/ui/map/art.ts` — `lumber_mill` paint case.
- `tests/batch3-content.test.ts` — new tests.
- `tests/selfplay.test.ts` — re-seed 314/960 only if the gate shows they flipped.

**Task order:** Task 1 (lumber mill data+engine) and Task 3 (obsolescence) are independent; Task 2 (render) follows Task 1; Task 4 is the gate.

---

## Task 1: Lumber Mill — `requiresFeature` + improvement + validation

**Files:**
- Modify: `src/data/types.ts`, `src/data/standard/resources.ts`, `src/engine/validate.ts`
- Test: `tests/batch3-content.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/batch3-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, idxOf, refreshVis, thaw } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { tileYields } from '../src/engine/selectors';

/** A founded city for player 0; returns state + city id (owns its ring). */
function cityWorld() {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 6, 6);
  spawn(s, 1, 'warrior', 1, 10); // keep player 1 alive
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  return { s, id };
}

describe('lumber mill', () => {
  it('a worker builds a lumber mill on an owned forest (keeps the forest)', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6); // beside the city, in its borders
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    s.players[0].techs.push('construction');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'lumber_mill' }).ok).toBe(true);
  });

  it('a lumber mill needs the forest — fails on cleared land', () => {
    const { s, id } = cityWorld();
    const gIdx = idxOf(s, 7, 6);
    s.tiles[gIdx].ownerCity = id; // grassland, no feature
    s.players[0].techs.push('construction');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'lumber_mill' }).ok).toBe(false);
  });

  it('a normal improvement (farm) still cannot be built on a forest tile', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6);
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    s.players[0].techs.push('agriculture');
    const w = spawn(s, 0, 'worker', 7, 6);
    refreshVis(s);
    expect(validateAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: w.id, improvement: 'farm' }).ok).toBe(false);
  });

  it('a lumber-milled forest yields +2 production on top of the forest', () => {
    const { s, id } = cityWorld();
    const fIdx = idxOf(s, 7, 6);
    s.tiles[fIdx].ownerCity = id;
    s.tiles[fIdx].feature = 'forest';
    const before = tileYields(ctx, s, fIdx, 0).production; // includes forest +1
    s.tiles[fIdx].improvement = 'lumber_mill';
    const after = tileYields(ctx, s, fIdx, 0).production;
    expect(after - before).toBe(2);              // mill adds +2
    expect(s.tiles[fIdx].feature).toBe('forest'); // forest still there (coexists)
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/batch3-content.test.ts -t "lumber mill"`
Expected: FAIL — `lumber_mill` is an unknown improvement (and the `requiresFeature` branch doesn't exist, so it'd fail "must be cleared first" even once added).

- [ ] **Step 3: Add the `requiresFeature` field + the improvement**

In `src/data/types.ts`, add to `interface ImprovementDef` (next to `clearsFeature`):
```ts
  requiresFeature?: string; // builds only on a tile that HAS this feature, and does not clear it
```
In `src/data/standard/resources.ts`, add to IMPROVEMENTS:
```ts
  lumber_mill: {
    id: 'lumber_mill',
    name: 'Lumber Mill',
    turns: 4,
    yields: { production: 2 },
    requiresFeature: 'forest',
    requiresTech: 'construction',
  },
```

- [ ] **Step 4: Add the validation branch**

In `src/engine/validate.ts`, in `BUILD_IMPROVEMENT`, immediately after the `clearsFeature` branch (before `if (tile.feature) return fail('the land must be cleared first');`), add:
```ts
      if (imp.requiresFeature) {
        if (tile.feature !== imp.requiresFeature) return fail(`needs ${ctx.rules.features[imp.requiresFeature].name}`);
        if (tile.improvement === imp.id) return fail('already improved');
        return ok;
      }
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/batch3-content.test.ts -t "lumber mill"`
Expected: PASS (all four).

- [ ] **Step 6: Regression**

Run: `npx vitest run tests/sea-economy.test.ts tests/engine.test.ts`
Expected: PASS — other improvements (farm/fishing_boats) unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/data/standard/resources.ts src/engine/validate.ts tests/batch3-content.test.ts
git commit -m "feat(data): Lumber Mill — build on un-cleared forest for +2 production"
```

---

## Task 2: Lumber Mill rendering

**Files:**
- Modify: `src/ui/map/art.ts`

- [ ] **Step 1: Add the paint case + painter**

In `src/ui/map/art.ts`, in the `paintImprovement` `switch (impId)`, add:
```ts
    case 'lumber_mill':
      paintLumberMill(g, cx, cy, q, r, seed);
      break;
```
Add a small painter near the others (match the existing painters' signature `(g, cx, cy, q, r, seed)` and use the same `HEX`/`hash2` helpers). A simple stacked-logs motif:
```ts
function paintLumberMill(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx, y = cy + 2;
  g.strokeStyle = 'rgba(74,52,32,0.9)';
  g.fillStyle = 'rgba(150,110,70,0.9)';
  g.lineWidth = 1.4;
  // three stacked log ends
  for (let i = 0; i < 3; i++) {
    const lx = x + (i - 1) * 5;
    g.beginPath();
    g.ellipse(lx, y, 2.4, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // a saw stroke above
  g.strokeStyle = 'rgba(60,48,34,0.7)';
  const jitter = (hash2(q, r, seed + 41) - 0.5) * 2;
  g.beginPath();
  g.moveTo(x - 7, y - 5 + jitter);
  g.lineTo(x + 7, y - 5 - jitter);
  g.stroke();
}
```
(If `hash2`'s signature differs in this file, match what the neighbouring painters use; if `HEX` is needed for scale, use it like the others.)

- [ ] **Step 2: Build sanity**

Run: `npm run build`
Expected: clean. (Canvas isn't unit-tested; verify visually when running the app.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/map/art.ts
git commit -m "feat(ui): render the Lumber Mill improvement"
```

---

## Task 3: Unit obsolescence

**Files:**
- Modify: `src/data/types.ts`, `src/data/standard/units.ts`, `src/engine/selectors.ts`
- Test: `tests/batch3-content.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/batch3-content.test.ts` (add `import { canProduce, productionOptions } from '../src/engine/selectors';`):
```ts
describe('unit obsolescence', () => {
  function cityFor(techs: string[]) {
    const s = flatWorld(16, 12, 2);
    s.players[0].techs.push(...techs);
    const city = { q: 6, r: 6, owner: 0, buildings: [] as string[], pop: 3 } as any;
    return { s, city };
  }
  it('an archer is buildable before machinery, obsolete after', () => {
    const { s, city } = cityFor(['archery']);
    expect(canProduce(ctx, s, city, { kind: 'unit', id: 'archer' }).ok).toBe(true);
    s.players[0].techs.push('machinery');
    const res = canProduce(ctx, s, city, { kind: 'unit', id: 'archer' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/obsolete/i);
  });
  it('obsolete units drop out of productionOptions', () => {
    const { s, city } = cityFor(['archery', 'machinery']);
    expect(productionOptions(ctx, s, city).some((o) => o.kind === 'unit' && o.id === 'archer')).toBe(false);
  });
  it('a latest-tier unit (crossbowman) is not obsoleted by any tech', () => {
    const { s, city } = cityFor(['machinery', 'metallurgy', 'gunpowder']);
    expect(canProduce(ctx, s, city, { kind: 'unit', id: 'crossbowman' }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/batch3-content.test.ts -t "obsolescence"`
Expected: FAIL — `archer` is still buildable after machinery (no `obsoletedBy` gate).

- [ ] **Step 3: Add the field + catalog + gate**

In `src/data/types.ts`, add to `interface UnitDef`:
```ts
  obsoletedBy?: string; // tech id; once researched, this unit can no longer be built (existing units are unaffected)
```
In `src/data/standard/units.ts`, add `obsoletedBy` to each catalog unit (place it inline with the other fields of each def):
- `warrior`: `obsoletedBy: 'iron_working'`
- `spearman`: `obsoletedBy: 'feudalism'`
- `archer`: `obsoletedBy: 'machinery'`
- `horseman`: `obsoletedBy: 'chivalry'`
- `swordsman`: `obsoletedBy: 'gunpowder'`
- `catapult`: `obsoletedBy: 'machinery'`
- `pikeman`: `obsoletedBy: 'gunpowder'`
- `knight`: `obsoletedBy: 'metallurgy'`
- `trebuchet`: `obsoletedBy: 'metallurgy'`
- `galleass`: `obsoletedBy: 'metallurgy'`
- `legion`: `obsoletedBy: 'gunpowder'`
- `war_chariot`: `obsoletedBy: 'chivalry'`
- `bowman`: `obsoletedBy: 'machinery'`
- `hoplite`: `obsoletedBy: 'feudalism'`
(Leave musketman, crossbowman, cannon, cuirassier, frigate, galley, scout, settler, worker, work_boat, caravan with NO `obsoletedBy`.)

In `src/engine/selectors.ts`, in the `canProduce` unit branch, after the `requiresTech` check, add:
```ts
    if (def.obsoletedBy && player.techs.includes(def.obsoletedBy))
      return { ok: false, reason: 'obsolete' };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/batch3-content.test.ts -t "obsolescence"`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/standard/units.ts src/engine/selectors.ts tests/batch3-content.test.ts
git commit -m "feat(data): unit obsolescence — superseded units leave the build menu"
```

---

## Task 4: Full-suite re-tune gate

**Files:** possibly `tests/selfplay.test.ts` (re-seed only if needed).

- [ ] **Step 1: Build (tsc)**

Run: `npm run build`
Expected: clean (the Spec B2 lesson — run the build, not just tests).

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: ALL green except possibly the victory seeds (314 science / 960 culture) may flip — the Lumber Mill changes AI forest economies. The bit-identical replay tests must still pass.

- [ ] **Step 3: Re-seed 314/960 only if they flipped**

If a victory test fails, re-tune as before: sweep for a new seed that fires the same victory by the turn limit (science ~300–360; culture ~960–1010), update `tests/selfplay.test.ts`, append a one-line reason to the comment block ("Lumber Mill / obsolescence (Batch 3 content) shifted AI economies"). Re-run `npm test`. Do NOT weaken the victory assertions. If both hold, note it.

- [ ] **Step 4: Commit (only if a seed changed)**

```bash
git add tests/selfplay.test.ts
git commit -m "test: re-seed victory seed(s) after Batch 3 content (forest economies shifted)"
```

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** lumber mill (`requiresFeature` + improvement + validation, T1; render, T2), obsolescence (`obsoletedBy` + catalog + `canProduce` gate, T3), gate (T4). All spec sections covered. ✓
- **Determinism:** obsolescence is AI-neutral (`pickProduction`/`bestMilitary` already gate on `canProduce` and pick the strongest). The Lumber Mill is the re-tune driver (AI `bestWorkerJob` builds it) — T4 is the gate with a documented re-seed protocol that never weakens assertions. No new state → no schema bump. ✓
- **Type consistency:** `requiresFeature` (string) used in the type, the `lumber_mill` def, and the validation branch; `obsoletedBy` (string) in the type, every catalog unit, and the `canProduce` gate. Tests import `tileYields`/`canProduce`/`productionOptions` (existing exports). ✓
- **Placeholder scan:** no TBD/TODO; complete code in every logic step. The painter (T2) is build-sanity (canvas not unit-tested), consistent with prior UI work; its `hash2`/`HEX` caveat is an explicit "match the file," not a gap. ✓
- **Edge check:** the lumber-mill test asserts `feature === 'forest'` after setting `improvement` (coexistence), and `tile.feature` is never cleared because `lumber_mill` lacks `clearsFeature` (turn.ts completion only clears for `clearsFeature`). The "farm on forest still blocked" test guards that `requiresFeature` didn't loosen normal improvements. ✓
