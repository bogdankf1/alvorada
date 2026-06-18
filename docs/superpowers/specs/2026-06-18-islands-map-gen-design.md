# Islands Map-Gen Design (Track C, Spec A of 2)

**Status:** Approved (2026-06-18)
**Successor:** Spec B — Naval AI (makes the AI competent on island maps). This spec ships an opt-in island map type; Spec B follows as its own brainstorm → spec → plan cycle.

## Goal

Add an opt-in `'islands'` map type: a few large landmasses (the "continents + islands" topology) separated by open ocean, with scattered neutral islets, and starts distributed ≈2 civs per landmass. The existing single-continent generator stays the default and is left byte-identical, so no current seed or self-play test changes.

## Context

`generateMap(config, rules)` (src/engine/map/generate.ts) today:
1. Builds an elevation field = `fbm` noise minus a single **central radial falloff** (→ one central landmass, forced ocean rim).
2. Solves a sea-level threshold for `LAND_FRACTION = 0.4`.
3. Connected-component labels the land; picks the **largest** component as `mainContinent`.
4. Climate → terrain; percentile hills/mountains; coast pass; weighted resources (consumes a `makeRng(seed)` stream); start placement **on `mainContinent` only** (`placeStarts` filters `component === mainContinent`); per-start strategic-resource fairness.
5. Wrapped in an 8-attempt deterministic retry that re-rolls a seed offset until starts fit (else throws).

Smaller landmasses already generate — they're just never used for starts. `GameConfig` is `{ seed, mapW, mapH, players }`. New games are built in `MainMenu.tsx` (a "The World" section with size presets) → `LocalGame.newGame(config)` → `initialState` → `generateMap`.

Helpers available in generate.ts: `axialOfIndex`, `hexToPixel`, `neighbors`, `tileIndex`, `hexDistance`, `hexesWithin`, `makeRng` (`.next()` → 0..1), `hash2(a, b, seed)` → 0..1 (a **stateless** positional hash), `fbm`.

## Scope

In scope: a new `'islands'` generation path + `mapType` config field + a MainMenu toggle + tests.

Out of scope:
- **Naval AI** (Spec B). On an island map the current land-only AI just develops its home continent; games still terminate legally via the score path. No island victory-seed test in this spec.
- **Changing the default map.** Default stays `'continents'`; islands is opt-in.
- **New terrain/resource content, rivers, straits-as-special-tiles.** Islands reuses all existing climate/resource passes unchanged.

## Design

### 1. Config field + dispatch

Add to `GameConfig` (src/engine/types.ts):
```ts
mapType?: 'continents' | 'islands';
```
Optional; absent/`'continents'` ⇒ the existing behavior. In `generateMap`, branch at the top:
```ts
export function generateMap(config, rules) {
  if (config.mapType === 'islands') return generateIslandsMap(config, rules);
  // ...existing continents body, UNCHANGED...
}
```
The existing function body becomes the continents path verbatim (no edits to its logic). `generateIslandsMap` is a new sibling function reusing the existing module-level helpers and passes.

### 2. `generateIslandsMap` — the islands path

A near-copy of `tryGenerate`'s structure wrapped in the same 8-attempt retry, differing in exactly two places: the **land mask** (step A) and **start distribution** (step E). Steps B–D (climate, hills, coast, resources) and F (fairness) are identical to today and should be factored so they're shared, not duplicated (see "Refactor note").

**A. Multi-center land mask.**
- `K = Math.max(2, Math.round(playerCount / 2))` continent centers.
- Place centers deterministically on a jittered interior grid: `cols = Math.ceil(Math.sqrt(K))`, `rows = Math.ceil(K / cols)`; for center `k` at grid cell `(cx, cy)`, its normalized position is the cell center plus a jitter of `±~0.5` cell from `hash2(k, 1, seed)` / `hash2(k, 2, seed)`, clamped to keep it within `[0.18, 0.82]` of the map interior (off the rim). Convert to pixel space via the map's pixel extent.
- For each tile, `dNear` = min over centers of the **aspect-true normalized pixel distance** to that center (same ellipse metric the current falloff uses). Falloff = `Math.max(0, dNear - INNER) * STRENGTH` with starting values `INNER = 0.28`, `STRENGTH = 1.6` (tunable during smoke-testing so blobs are clearly separated yet large enough). Elevation = `fbm(px*NOISE_SCALE, py*NOISE_SCALE, seed) - falloff`.
- Sea level solves for `LAND_FRACTION_ISLANDS = 0.32` (lower than 0.4 so continents are cleanly separated by ocean). Forced ocean rim unchanged.

**B–D.** Climate→terrain, percentile hills/mountains, coast pass, weighted resources — **identical** to the continents path (call the shared helpers).

**A′. Scattered islets** (after the land mask, before component labeling). For each ocean tile `i` whose `dNear > ISLET_BAND` (deep ocean, `ISLET_BAND = 0.55`), set it to land iff `hash2(i, 17, seed) > 0.985`. The high threshold keeps islets small and sparse (≈1–6 tiles each via natural clustering). Islets then flow through the coast/resource passes like any land. (Uses `hash2`, not the `rng` stream, so it doesn't perturb the resource RNG ordering.)

**E. Start distribution** (new `placeStartsIslands`).
- Connected-component label (existing logic).
- Take the `K` largest components as "continents" (sort by size desc; ties by lowest min tile index for determinism).
- Quota per continent: distribute `playerCount` across the `K` continents as evenly as possible, largest-first (e.g. 4 players / 2 continents → [2, 2]; 3 / 2 → [2, 1]).
- Within each continent, gather candidate start tiles (reuse the existing `startScore` quality metric and the same exclusions: no mountain/snow/desert, off the 2-tile rim), then greedily pick the quota with a min-distance (descending min-distance search like today's `placeStarts`, scoped to that component).
- If any continent can't host its quota, or fewer than `K` components are large enough (define "large enough" = `≥ 3 × quota` tiles), **return `null`** → the 8-attempt retry re-rolls. Starts never land on islets (islets aren't among the K largest components on any reasonable seed; the size floor guarantees it).

**F. Strategic-resource fairness** — identical to today (`ensureResourceNear` per start).

**Refactor note (in service of this work, not gratuitous):** extract steps B–D and F from `tryGenerate` into small shared helpers (e.g. `paintClimate`, `placeResources`, `fairnessPass`) so both paths call them. Keep the changes surgical — the continents path must produce identical output (guarded by the regression test below). If a clean extraction proves risky, the fallback is to duplicate the few passes in `generateIslandsMap`; prefer extraction but never at the cost of perturbing the continents output.

### 3. UI

In `MainMenu.tsx`, add a "Continents / Islands" choice to the existing "The World" section (mirroring the size-choice markup). State `mapType`, default `'continents'`. Thread it into the config:
```ts
LocalGame.newGame({ seed, mapW: cfg.w, mapH: cfg.h, players, mapType }),
```

### 4. Determinism

- **Continents path byte-identical.** It's the same code; `mapType` absent or `'continents'` routes to it. Guarded by a regression test (fixed seed → unchanged tile hash). All existing seeds/self-play tests untouched.
- **Islands path deterministic.** Same seed + config → identical tiles & starts (all randomness from `seed` via `makeRng`/`hash2`/`fbm`). The islet and center passes use stateless `hash2`, so the resource `rng` stream ordering is independent.
- No island victory-seed test (naval AI absent → island games stall to the score-timeout, which is the expected legal outcome until Spec B).

### 5. Testing

New `tests/islands-mapgen.test.ts` (uses the real `STANDARD_RULESET` + `generateMap` directly):
1. **Continents unchanged.** The primary guard is the **existing self-play suite**: any change to the continents output flips the victory seeds, so seeds 314 (science) and 949 (culture) and the bit-identical replay tests must still pass after the refactor — run the full suite. In addition, a focused test asserts the dispatch is a pure pass-through: `generateMap` with `mapType` undefined and `mapType: 'continents'` yield identical `tiles`/`starts` for a fixed seed, and are deterministic across two calls. (No pre-captured snapshot needed.)
2. **Islands is deterministic:** two calls with the same islands config produce identical `tiles` + `starts`.
3. **Distributed starts:** for a 4-player islands map, the 4 starts span **≥ 2 distinct components** (label the result and map each start to its component).
4. **Enough landmasses:** ≥ `K` components of size `≥ 3×quota`.
5. **Islets exist:** ≥ 1 land component of size ≤ 6 sitting in deep ocean (a start-free small component).
6. **No start on an islet:** every start's component size is `≥ 3×quota` (i.e. a continent, not an islet).
7. **Smoke (self-play):** a 4-player islands game (reuse `tests/selfplay.test.ts` harness shape) runs ~40 turns with every AI action passing validation, terminates/continues legally, and its action log replays bit-identically. Asserts no crash with the current land-only AI on water-separated starts.

## File-touch summary

- `src/engine/types.ts` — add `GameConfig.mapType`.
- `src/engine/map/generate.ts` — top-level dispatch; new `generateIslandsMap` + `placeStartsIslands`; extract shared climate/resource/fairness helpers (continents output unchanged).
- `src/ui/MainMenu.tsx` — Continents/Islands toggle threaded into the config.
- `tests/islands-mapgen.test.ts` — new test file (determinism, distribution, islets, smoke).

## Open knobs (tunable during implementation smoke-testing, not blockers)

`LAND_FRACTION_ISLANDS` (0.32), falloff `INNER`/`STRENGTH` (0.28 / 1.6), `ISLET_BAND` (0.55), islet threshold (0.985), the "large enough" floor (`3×quota`). These are tuned so a standard 4-player islands map yields 2 clearly separated continents of comfortable size + a handful of islets. The smoke test + an eyeball of a rendered seed validate them.
