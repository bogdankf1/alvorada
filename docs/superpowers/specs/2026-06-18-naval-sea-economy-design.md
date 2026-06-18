# Naval Spec 2 — Sea Economy Design

**Status:** Approved (2026-06-18)
**Predecessor:** `2026-06-18-naval-combat-core-design.md` (Spec 1 of 2). This spec is the deferred "sea economy" half listed in that spec's *Out of scope*.

## Goal

Give coastal cities an improvement loop and a distinct economic identity, by building on the sea-tile-working and the `fish` resource that **already exist** in the engine. One new civilian unit (Work Boat), one new improvement (Fishing Boats), one new building (Harbor), and four small localized engine hooks.

## Context: what already exists (the determinism baseline)

Before listing changes, the important discovery that shapes this spec — most of "sea economy" is already live:

- **Coastal cities already work sea tiles.** City founding claims all adjacent tiles including water (`cities.ts` founding loop, no water-skip); border expansion can claim water tiles (`pickBorderTile`, no water-skip); and `allocateCitizens` (`selectors.ts:188`) excludes only **elevation-impassable** tiles (mountains), not water. So owned coast/ocean tiles are already valid worked tiles.
- **`fish` already exists** as a bonus resource (`resources.ts`): `{ kind: 'bonus', yields: { food: 2 }, spawn: { terrains: ['coast'], weight: 9 } }`.
- **Resources contribute their yield whenever revealed**, not only when improved (`tileYields`, `selectors.ts:160-165`): a coastal city working a fish tile already gets +2 food today.

Therefore "cities work sea tiles" and "sea resources" are already in the determinism baseline. This spec adds only the *improvement loop on top* of fish, plus the Harbor.

## Scope

In scope:
1. **Work Boat** — a sea-domain civilian that builds water improvements.
2. **Fishing Boats** — an improvement that rewards working a fish tile.
3. **Harbor** — a building giving coastal cities production from worked water tiles.

Out of scope (unchanged from prior decisions):
- **New sea resources** (whales/pearls). Adding resources shifts map-gen RNG; deliberately omitted to keep the slice re-tune-free. Fish alone is the Work Boat's target.
- **Naval AI.** The AI builds no Work Boats and no Harbors (deferred to "track C"). This is what keeps the slice deterministic.
- **Ocean-specific buildings / lighthouses / city sea-connection trade.** Not needed for this slice.

## Data additions

All in `src/data/standard/`. No engine logic in these — pure ruleset content.

### `units.ts` — Work Boat

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

- `domain: 'sea'` + `class: 'civilian'` + `abilities: ['improve']`. Reusable (builds repeatedly, like the land Worker — no consumption mechanic).
- Built only by coastal cities: the sea-unit coastal gate already in `canProduce` (added in Spec 1) enforces this for `domain: 'sea'` units. No new gate needed for the unit.
- `art.glyph: 'gear'` reuses the Worker glyph (reads as "worker"; no new art).

### `resources.ts` — Fishing Boats improvement + fish wiring

Add to `IMPROVEMENTS`:

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

Modify `fish` in `RESOURCES` to point at it:

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

- `requiresResource: true` + only `fish` having `improvedBy: 'fishing_boats'` means a Work Boat can build it **only on a fish tile** (the `matchesResource` path in `BUILD_IMPROVEMENT` validation). The improvement's own `yields` are empty; the reward comes entirely from `fish.bonusImproved`.
- Net effect on the full tile yield (coast terrain itself yields food 1 / gold 1): an **un**improved fish-coast tile = food 3 / gold 1 (coast 1/1 + fish food 2); an **improved** fish-coast tile = **food 4 / gold 2** (+ bonusImproved food 1 / gold 1). Fish's *base* +2 food is unchanged → AI (which never builds Fishing Boats) sees the identical fish yield it sees today.

### `buildings.ts` — Harbor

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

- `requiresCoastal: true` → only coastal cities can build it (new gate, below).
- `perWorkedWater: { yield: 'production', amount: 1 }` → +1 production for each worked water tile (new effect, below).
- `requiresTech: 'bronze_working'` puts it alongside the Galley + embarking, so bronze_working is the coherent "go to sea" tech.
- `art.glyph: 'amphora'` reuses an existing building glyph (no new art).

## Engine changes

Four small, localized hooks. Each is a no-op for everything that exists today (no land tile, no AI city is affected), which is the basis of the re-tune-free claim.

### 1. `BuildingDef` type — `src/data/types.ts`

Add two optional fields to the `BuildingDef` interface:

```ts
perWorkedWater?: { yield: keyof Yields; amount: number };
requiresCoastal?: boolean;
```

(`keyof Yields` matches how `perPop.yield` is already typed.)

### 2. `cityYields` — `src/engine/selectors.ts` (~line 268)

Inside the existing `for (const b of city.buildings)` loop, after the `perPop` handling, add:

```ts
if (def.perWorkedWater) {
  const n = alloc.worked.filter(
    (idx) => ctx.rules.terrains[state.tiles[idx].terrain].water,
  ).length;
  total[def.perWorkedWater.yield] += n * def.perWorkedWater.amount;
}
```

`alloc.worked` (the worked tile indices) is already computed earlier in the function (line ~260). Water is detected via the canonical `terrains[...].water` flag (same predicate `isWater` uses). This loop only does anything when a building has `perWorkedWater` — i.e. only the Harbor — so for every city without a Harbor (every AI city) the computation is byte-identical.

### 3. `canProduce` building branch — `src/engine/selectors.ts`

In the `kind: 'building'` validation path (the branch starting `const def = ctx.rules.buildings[item.id]`, ~line 518), after the existing `requiresTech` building check (~line 525) and before the wonder check, add a coastal gate mirroring the sea-unit one at lines 514-515:

```ts
if (def.requiresCoastal && !isCoastal(ctx, state, city))
  return { ok: false, reason: 'only a coastal city can build a harbor' };
```

`canProduce` returns `{ ok: true } | { ok: false; reason: string }` literals (no `fail()` helper — that lives in `validate.ts`). `isCoastal(ctx, state, city)` already exists (added in Spec 1).

### 4. `BUILD_IMPROVEMENT` validation — `src/engine/validate.ts:188`

Replace the blanket impassable reject:

```ts
if (isImpassable(ctx, state, idx)) return fail('cannot improve this terrain');
```

with an **elevation-only** reject:

```ts
if (ctx.rules.elevations[tile.elevation].impassable) return fail('cannot improve this terrain');
```

Rationale: `isImpassable` = `elevation.impassable OR isWater`. Dropping the water half lets a Work Boat (standing on a fish-coast tile) reach the `matchesResource` path and build Fishing Boats. It does **not** open water to land improvements: a land Worker cannot occupy a water tile in the first place, and even hypothetically the `validTerrains`/`requiresResource` checks below still reject (e.g. a farm's `validTerrains` is grassland/plains, so water fails "wrong terrain"). For every tile a land Worker can actually stand on (land), `elevation.impassable` and `isImpassable` give the identical result, so land-Worker behavior is unchanged.

Do **not** modify the shared `isImpassable` selector itself — it is used by movement/pathfinding and must keep treating water as impassable. Only this one validation line changes.

## Determinism analysis

The slice is **re-tune-free**. Verified against the AI and the yield/movement paths:

- **AI never builds the Work Boat.** `pickProduction` (`src/ai/economy.ts`) selects units only by explicit id (`scout`, `settler`, `worker`, `caravan`) and military via `bestMilitary` (which already excludes `domain: 'sea'` and civilians). It never enumerates buildable units generically. `work_boat` is referenced nowhere in the AI, and this spec adds no such reference.
- **AI never builds the Harbor.** Buildings are chosen from `buildingPriorityFor(tw)` (a fixed list) plus the wonders pass. Harbor is not a wonder and must **not** be added to `buildingPriorityFor`. So no AI city gets a Harbor → the new `perWorkedWater` loop is inert for every AI city.
- **Fish base yield unchanged.** Only `improvedBy`/`bonusImproved` are added; the bonus requires the Fishing Boats improvement, which only a Work Boat builds, which only a human commands.
- **No map-gen RNG change.** No resources are added or removed; the resource-placement pass is byte-identical.
- **The two shared-path edits are no-ops for existing cases.** `cityYields`' new branch is gated on `def.perWorkedWater` (Harbor-only); `BUILD_IMPROVEMENT`'s edit is identical to the old behavior for every land tile.

**Proof gate:** the full `tests/selfplay.test.ts` suite (deterministic replay + the science seed 314 and culture seed 949 victory seeds) must remain green with no seed changes. If a seed flips, the determinism assumption was violated and must be investigated before the slice ships — do not silently re-tune.

## UI

Minimal; reuses existing surfaces.

- **Work Boat** appears automatically in a coastal city's production list (existing list rendering).
- **Harbor** appears automatically in a coastal city's buildings list.
- **Work Boat `improve` order** already exists in the unit action bar (the `improve` ability drives it); on a fish tile inside the player's borders it offers `fishing_boats` as the build target through the existing improvement-selection path.
- **Fishing Boats rendering:** `paintImprovement` in `src/ui/map/art.ts:484` is a `switch (impId)` with cases for farm/mine/pasture/quarry/plantation. Add `case 'fishing_boats': paintFishingBoats(g, cx, cy, q, r, seed); break;` and a small `paintFishingBoats` painter (a couple of dark stakes / net marks in the palette, in the style of the existing painters). Without a case the improvement would simply not render; the case is required.

## Testing

New file `tests/sea-economy.test.ts` (reuse the `coastWorld()` fixture pattern from `tests/naval.test.ts` — paints axial `q >= 8` as coast). Cover:

1. **Work Boat is coastal-gated:** a coastal city `canProduce` `work_boat` is ok; an inland city is not. (After `players[0].techs.push('pottery')`.)
2. **Work Boat builds Fishing Boats on a fish tile:** place fish on a coast tile owned by the player, a Work Boat on it, push `pottery`; `BUILD_IMPROVEMENT` with `improvement: 'fishing_boats'` is ok and sets `tile.improvement === 'fishing_boats'`.
3. **Fishing Boats is fish-only:** the same build on a plain coast tile (no resource) fails (`needs a matching resource`); on a land tile fails.
4. **Improved fish yield:** `tileYields` on a fish-coast tile = food 3 / gold 1 unimproved; after building `fishing_boats` = food 4 / gold 2 (the +1 food / +1 gold delta is `bonusImproved`).
5. **Harbor production:** a coastal city with a `harbor` and N worked water tiles gets +N production vs the same city without it; assert via `cityYields`. Also: `canProduce` `harbor` is ok for a coastal city and fails for an inland city.
6. **Land Worker still can't build on water:** a land `worker` cannot `BUILD_IMPROVEMENT` a `farm` (or `fishing_boats`) on a water tile.

Plus:
- **Schema bump 11 → 12** asserted in **all four** schema tests — `tests/naval.test.ts:24`, `tests/events.test.ts:21`, `tests/leaders.test.ts:35`, `tests/roads.test.ts:15` (each currently asserts `SCHEMA_VERSION).toBe(11)`). Bump `SCHEMA_VERSION` 11 → 12 in `src/engine/serialize.ts` and update all four. (`tests/helpers.ts` also imports `SCHEMA_VERSION` but does not assert a literal — no change needed there.)
- **Full self-play suite** green with seeds 314 / 949 unchanged (the determinism gate).

## Schema

Bump `SCHEMA_VERSION` 11 → 12 in `src/engine/serialize.ts`. Old autosaves drop (project convention).

## File-touch summary

- `src/data/standard/units.ts` — add `work_boat`.
- `src/data/standard/resources.ts` — add `fishing_boats` improvement; wire `fish.improvedBy`/`bonusImproved`.
- `src/data/standard/buildings.ts` — add `harbor`.
- `src/data/types.ts` — `BuildingDef.perWorkedWater`, `BuildingDef.requiresCoastal`.
- `src/engine/selectors.ts` — `cityYields` perWorkedWater loop; `canProduce` coastal-building gate.
- `src/engine/validate.ts` — `BUILD_IMPROVEMENT` elevation-only impassable reject.
- `src/engine/serialize.ts` — `SCHEMA_VERSION` 11 → 12.
- `src/ui/map/art.ts` — `paintImprovement` `fishing_boats` case + `paintFishingBoats`.
- `tests/sea-economy.test.ts` — new test file.
- `tests/naval.test.ts`, `tests/events.test.ts`, `tests/leaders.test.ts`, `tests/roads.test.ts` — schema assertion 11 → 12.
