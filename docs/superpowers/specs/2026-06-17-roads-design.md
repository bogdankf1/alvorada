# Roads — Design

*2026-06-17. From the testing-feedback backlog: workers build roads that speed unit movement.
Designed data-driven & typed so future eras can add modernized road tiers (railroad, …).*

## Scope

In: a data-driven **road type** system, a **move-point rescale** so roads are faster (2× on
flat, and they cancel rough-terrain cost), a `BUILD_ROAD` worker action, road rendering under
resource/improvement icons, and a moves-display fix.

Out (later / own specs): modernized road tiers themselves (the infra supports them, but no
`railroad` def ships now), road maintenance/upkeep, city-connection economic bonuses, road
pillaging, AI road-building, naval, modern-era tech tree. Backlog stays in the feedback doc.

## Constraints (unchanged project rules)

- **Determinism:** no `Math.random`/`Date`/transcendentals. The rescale must preserve off-road
  movement bit-identically; the AI builds no roads, so self-play replays identically **after**
  the move-literal audit (below). No seed re-tune expected.
- **Data-driven:** road types + the move scale live in `Ruleset` data, not logic.
- **Layering:** engine owns movement/build; UI owns rendering/buttons (never imports `src/ai`).
- **Schema:** bump **9 → 10** (new `tile.road` field + new `road` order kind).
- **2D canvas only.**

## Decisions locked

1. Movement = rescale ×2 in code (`MOVE_SCALE = 2`); a road tile costs the road type's
   `moveCost` (basic road = 1) → 2× on flat, cancels rough terrain.
2. Road types are data (`roads` table, `tile.road: string | null`); ship one basic `road`.
3. Basic road is free from the start (no tech); the `requiresTech?` field exists for future tiers.
4. Build via a dedicated `BUILD_ROAD` action + a `road` unit-order kind.
5. Roads render under resources & improvements, as connected segments, subtly.
6. AI does not build roads in v1.

---

## 1 · Road types (data)

New `RoadDef` (`src/data/types.ts`):
```ts
export interface RoadDef {
  id: string;
  name: string;
  moveCost: number;     // points to ENTER a tile carrying this road (unscaled)
  turns: number;        // worker-turns to build
  requiresTech?: string; // undefined = available from the start
}
```
New `roads: Record<string, RoadDef>` on `Ruleset`. Standard catalog ships exactly one:
```ts
road: { id: 'road', name: 'Road', moveCost: 1, turns: 2 }
```
The `Tile` interface (`src/engine/types.ts`) gains `road: string | null` (a `RoadDef` id, or
null). Roads coexist with `resource` and `improvement` — independent fields. `SCHEMA_VERSION`
→ 10 (`serialize.ts`); `state.ts`/fixtures stamp `road: null` on every tile.

A `moveScale: number` (value **2**) is added to `RulesetSettings` (`= 2` in standard data).

## 2 · Movement model (the rescale)

The scale is applied **in code**, leaving every unit/terrain/promotion data value untouched:

- **`moveCostOf`** (`selectors.ts`) — gains a road branch and a scale on the terrain path:
  ```ts
  export function moveCostOf(ctx, state, idx): number {
    const t = state.tiles[idx];
    if (t.road) return ctx.rules.roads[t.road].moveCost;            // unscaled (1)
    const terr = ctx.rules.terrains[t.terrain];
    const elev = ctx.rules.elevations[t.elevation];
    const feat = t.feature ? ctx.rules.features[t.feature] : null;
    return Math.max(1, terr.moveCost + elev.moveCostDelta + (feat?.moveCostDelta ?? 0))
      * ctx.rules.settings.moveScale;
  }
  ```
  Result: flat = 2, hill/forest = 4, road = 1 → 2× on flat, ≥4× across rough terrain.
- **`beginTurn`** (`systems/turn.ts`) — reset becomes
  `u.moves = (def.moves + promotionMovementBonus(ctx, u)) * ctx.rules.settings.moveScale;`
  (the `mobility` promotion's `movement:1` scales naturally — no data change).
- **Pathfinder unexplored fallback** (`map/pathfind.ts`) — `: 1` becomes
  `: ctx.rules.settings.moveScale` so planning over fog matches the new flat baseline.

**Determinism audit (critical, its own task):** grep `src/engine` + `src/ai` for every read of
`.moves` and rescale any comparison/arithmetic that uses a non-zero literal (e.g. `moves >= 2`,
`moves / 2`). Pure `moves > 0` / `moves <= 0` / `moves === 0` checks are scale-safe and stay.
Because the AI never builds roads, once the audit is clean every AI unit sees only ×-scaled
terrain costs from a ×-scaled budget → identical reach → identical decisions → self-play
(incl. the replay tests) passes unchanged.

## 3 · Building roads

- **Action:** `{ type: 'BUILD_ROAD'; player: PlayerId; unit: UnitId; road: string }`.
- **Order kind:** `UnitOrder` gains `{ kind: 'road'; road: string; turnsLeft: number }`.
- **Validate** (`validate.ts`): own unit; the unit has the `improve` ability (workers); the
  road id exists and its `requiresTech` (if any) is researched; the unit's tile is land
  (not water/impassable); the tile does **not** already have that road. A road may be built on
  a tile that already has an improvement (independent fields).
- **Reducer** (`reducer.ts`): set `unit.order = { kind:'road', road, turnsLeft: roads[road].turns }`,
  `unit.moves = 0`, `unit.acted = true` (mirrors `BUILD_IMPROVEMENT`).
- **Turn-tick** (`systems/turn.ts` `beginTurn`): the existing `order?.kind === 'build'` branch
  gets a sibling `order?.kind === 'road'` branch — decrement `turnsLeft`; on `<= 0`, set
  `state.tiles[idx].road = order.road` and clear the order.
- **UI:** `UnitPanel` shows a "Build Road" button (one per available, tech-passing road type)
  for a worker, dispatching `BUILD_ROAD`. The existing `orderLabel` gains a `road` case
  ("Building Road (Nt)").

## 4 · Rendering (per the user's spec)

In `map/renderer.ts`, draw roads in the **ground pass, after terrain but before resources and
improvements**, so they sit *under* those icons and never obscure them. For each tile with
`tile.road`, draw a subtle segment from the tile center toward the center of each **adjacent
road tile** (a connected network); isolated road tiles draw a small stub/node. Styling: a thin,
low-alpha earthen tone consistent with the parchment art (a tunable color/width). Only the
basic road renders in v1; the draw reads `tile.road` generically so future tiers can restyle.

## 5 · Moves display

Internal `unit.moves` is now ×`moveScale`. `UnitPanel`'s `{unit.moves}/{def.moves}` becomes
`{unit.moves / scale}/{def.moves}` so the player still sees familiar values ("2/2"); show one
decimal when fractional (a unit mid-road shows e.g. "1.5/2"). `def.moves` stays the unscaled base.

## 6 · AI

No AI road-building in v1 (human-only, like buy-tiles) → `decide`/self-play unchanged.

## 7 · Testing (TDD)

Engine unit tests (`tests/roads.test.ts`):
- `moveCostOf`: a road tile costs the road's `moveCost` (1); a flat tile costs `1*scale` (2); a
  hill costs `2*scale` (4).
- Rescale preserves off-road reach: `reachableTiles` for a unit on open flat terrain returns the
  same tile set it would at scale 1 (i.e. count of reachable tiles is unchanged by the scale).
- A road lets a unit travel farther: a unit moving along road tiles reaches more tiles than the
  same unit on flat (cost-1 vs cost-2 steps).
- `BUILD_ROAD`: sets the road order + zeroes moves; after `turns` of `beginTurn` ticks,
  `tile.road` is set; a tile keeps its existing `improvement` through road construction.
- Validation: rejects a road that already exists; rejects a tech-gated road type without the
  tech (add a throwaway tech-gated road via `customCtx`); accepts a basic road on a worker tile.
- Determinism: a self-play run still replays bit-identically (guards the rescale audit).
Rendering + the moves-display format are verified manually.

## Out of scope (explicit)

`railroad`/modernized tiers · road upkeep · city-connection bonuses · road pillaging · AI
road-building · naval · modern-era tech tree. Tracked in `docs/2026-06-17-testing-feedback.md`.
