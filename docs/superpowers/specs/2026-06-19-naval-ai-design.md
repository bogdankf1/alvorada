# Naval AI — Presence & Expansion Design (Track C, Spec B of 2)

**Status:** Approved (2026-06-19)
**Predecessor:** `2026-06-18-islands-map-gen-design.md` (Spec A — opt-in island maps).
**Successor (deferred):** Spec B2 — Naval War (amphibious invasions / capturing enemy cities across water). Out of scope here.

## Goal

Make the AI competent on island maps: it explores the seas, colonizes land across water, runs a coastal economy (the Work Boats/Harbors from the Sea Economy slice), and fields a defensive/escort navy that screens settlers, patrols home waters, and raids enemy coasts. Cross-water conflict is naval skirmishing + coastal bombardment (no city capture — that's the deferred Spec B2). This stops island games from stalling in isolation and makes them feel alive.

## Context: what already works, and the one gap

- **Ships route natively.** A sea-domain unit's `findPath` already routes on water (`moveRulesFor.canEnter`: `domain === 'sea'` ⇒ water-only). Naval-unit *movement* is solved; the AI just needs to *build* and *direct* them.
- **Embarked land units route natively.** `canEnter` blocks a land unit from water **only when it's on land** (`water && !unitOnWater`). Once embarked (`unitOnWater`), `findPath` routes it across the sea and back onto land, and `executeMovePath` carries it across (permissive `unitCanOccupy`). `MOVE_UNIT` validation only deep-checks the first step and has an explicit embark special-case.
- **The single gap:** planning the *initial embark step*. A land unit standing on land can't get `findPath` to produce a coast→sea route (strict `canEnter`). Everything after the first water step already works.
- **The AI already "sees" overseas sites.** `knownGoodSpots` (ai/economy.ts) returns any visible, unowned, city-distance-OK land tile scored ≥18 — including tiles on other landmasses — but `decideSettler` reaches them via strict `findPath`, which fails across water.
- **Where the AI is deliberately land-only today:** `bestMilitary` filters `u.domain !== 'sea'` (economy.ts:129); `bestWorkerJob` skips water (its own `isImpassable` guard, economy.ts:309); `decideScout` skips water frontier tiles; `decideUnit` sends a sea-domain `improve` unit (Work Boat) to `decideWorker` (ability-based, domain-blind) → it finds no job. `pickProduction` never builds Work Boats/Harbors/ships.

## Scope

In scope (Tier A — Presence & Expansion):
1. Embark-pathfinding primitive (the infrastructure gap).
2. Overseas settling (embark + escort).
3. Coastal economy in the AI (Work Boats + Harbors).
4. Naval units: production (need-gated) + combat behavior (bombard/escort/defend) + sea exploration.

Out of scope:
- **Amphibious invasions / capturing cities across water** (Spec B2). Cross-water conflict stays naval skirmish + coastal bombardment (combat-core already allows ranged ships to bombard coastal cities with no capture).
- **New units/buildings/content.** Reuses Galley/Galleass/Frigate + Work Boat/Harbor/Fishing Boats already shipped.
- **Map-gen changes** (Spec A is done).

## Design

All AI changes live under `src/ai/` (a pure function of `(state, player)`); the one engine touch is the pathfinding option. The AI layer never imports UI.

### 1. Embark pathfinding (engine: `src/engine/map/pathfind.ts`)

Add an opt-in `embark` mode threaded through `moveRulesFor` and `findPath`:
- `moveRulesFor(ctx, state, unit, opts?: { embark?: boolean })` — when `opts.embark` is true **and** the unit is a land unit holding `settings.naval.embarkTech`, treat the unit as if `unitOnWater` for the terrain filter (i.e. drop the `water && !unitOnWater` block) so water tiles are enterable. Everything else (mountains, occupancy, borders) unchanged.
- `findPath(ctx, state, unit, dest, opts?: { embark?: boolean })` — passes `opts` to `moveRulesFor`.
- **Default behavior (`opts` absent) is byte-identical** — strict routing, land units never plan into water. Only AI overseas intents pass `{ embark: true }`.

The move cost on water uses the existing `cost`/`moveCostOf` (embarked travel already costs the scaled water move). The executor + validation already embark/cross/disembark when handed such a path, so no change there.

A small AI helper `seaPath(ctx, state, unit, dest)` wraps `findPath(..., { embark: true })` and returns null if the unit lacks the embark tech, so call sites stay clean.

### 2. Overseas settling (`src/ai/decide.ts` `decideSettler`, + a reachability helper)

- Split `knownGoodSpots` results into **land-reachable** (`findPath` strict succeeds) and **overseas** (strict fails but `seaPath` succeeds).
- Priority: settle the best **land-reachable** spot (current behavior). Only when no land-reachable spot exists (or the best overseas spot outscores the best land spot by a margin) **and** the player holds the embark tech, pick the best overseas spot and move via `seaPath` (walk-to-coast → embark → cross → disembark). Found on arrival via the existing `canFoundHere` logic.
- **Escort gate:** a settler only begins an overseas crossing when the player has at least one Galley (or the crossing is short, ≤ a few water tiles). This avoids feeding lone settlers to the sea (embarked defense 5, dies if lost). If no escort and the crossing is long, the settler waits/settles a land spot instead.
- **Embarked continuation is automatic.** Only the first step (land→water) needs `seaPath`/embark mode. Once the settler is embarked (on water, `unitOnWater` true), the *default strict* `findPath` already routes it across the sea and onto the destination land — so the natural logic is "try strict `findPath` first (handles land-reachable spots AND already-embarked continuation); if it fails, fall back to `seaPath` to begin a crossing." Each subsequent turn the AI re-plans from the unit's current position and continues until disembark + found.

### 3. Coastal economy (`src/ai/economy.ts` `pickProduction`, + a sea-worker job finder)

- **Work Boat production:** in `pickProduction`, after the worker step, a coastal city builds a `work_boat` when it has an owned, unimproved `fish` tile in range and lacks a Work Boat heading there. Reuse `isCoastal` + the existing per-city tile scan.
- **Harbor production:** add `harbor` to the building options a coastal city considers (e.g. in `buildingPriorityFor` gated by `isCoastal`, or a coastal-buildings check in `pickProduction`). Built when affordable and not present.
- **Work Boat orders:** in `decideUnit`, branch a sea-domain `improve` unit to a new `decideWorkBoat` → a `bestSeaWorkerJob` that scans owned water tiles for a `fishing_boats` target (the matching-resource path), routes the Work Boat there via normal `findPath` (sea unit on water), and issues `BUILD_IMPROVEMENT`. (`bestWorkerJob` stays land-only; this is the parallel sea path.)

### 4. Naval units — production, combat, exploration (`src/ai/economy.ts`, `src/ai/decide.ts`)

- **Need-gated production.** `bestMilitary` currently excludes all sea units. Introduce a **naval need** signal for a coastal city — true when any of: an enemy ship is visible near our waters/cities, we have (or are about to send) an embarked civilian needing escort, or we're at war with a rival we can only reach by sea. When naval need holds and the city is coastal, allow `bestMilitary` to consider sea units (best available by strength). When there's no naval need, behavior is unchanged (land-only), which keeps non-coastal/continent games close to today.
- **Naval combat (`decideMilitary` sea branch).** For a sea-domain unit:
  - **Bombard** (ranged ships): reuse the existing ranged target scan — enemy ships, enemy embarked units, and enemy **coastal cities** (combat-core already permits ranged ships to bombard cities; no capture).
  - **Attack** (melee galley): hit adjacent enemy ships / embarked units (never cities — `ATTACK` validation already forbids ships storming cities).
  - **Escort:** if a friendly embarked civilian is crossing, move to stay adjacent to the nearest one.
  - **Defend/patrol:** otherwise hold near the nearest coastal city (fortify) or move to cover an undefended coastal city.
- **Sea exploration.** Idle galleys (peacetime, no escort/defend duty) explore the **water frontier** — the nearest sea tile that touches an unexplored tile — via a naval analogue of `decideScout` (scan water tiles instead of land). Embarked scouts may also explore, but galleys are the primary explorers (native water movement). This is what makes overseas rivals get discovered.

### 5. Determinism

This changes AI behavior, so **expect a self-play re-tune** (re-seed the science seed 314 and culture seed 949 if they flip). Mitigating factors, all need-gated so continents games shift minimally:
- Overseas settling, sea exploration, and naval production only fire when **water-gated** (no land-reachable spot / unexplored sea / sea-only rival / escort needed). On a single continent with land to spare and land-reachable rivals, these stay dormant.
- The combat-core review found self-play continents cities aren't very coastal, so Work Boat/Harbor production may rarely trigger on the tested seeds.
- The `embark` pathfinding option is default-off → strict routing unchanged for all normal movement.

The full self-play suite is the gate: if a victory seed flips, re-seed it (documented, like every prior balance change) — do not weaken the determinism tests. Replay/`gameHash` determinism must stay bit-identical (all new AI logic is a pure function of state + fog).

### 6. Testing

New `tests/naval-ai.test.ts` (hand-built worlds via the `coastWorld`-style fixtures from `tests/naval.test.ts`):
1. **Embark pathfinding:** `findPath(..., { embark: true })` returns a coast→sea→land route for a tech'd land settler to an overseas tile; without `{ embark: true }` it returns null; without the embark tech `{ embark: true }` still returns null.
2. **Overseas settle decision:** given a settler with only an overseas good spot and the embark tech + a galley, `decide`/`decideSettler` issues a `MOVE_UNIT` whose path embarks (first/early water step) toward the spot.
3. **Work Boat job:** a sea-domain Work Boat in a coastal city with an owned `fish` tile is directed to build `fishing_boats` there.
4. **Coastal production:** a coastal city with an unimproved fish tile / no harbor offers `work_boat` / `harbor` via `pickProduction`; an inland city does not.
5. **Naval combat target:** a ranged ship adjacent-in-range to an enemy embarked unit / coastal city issues `RANGED_ATTACK`; a melee galley hits an adjacent enemy ship.
6. **Sea exploration:** an idle galley with unexplored sea nearby issues a `MOVE_UNIT` toward the water frontier.

Plus:
- **Island self-play upgrade (`tests/islands-mapgen.test.ts` or a new island self-play test):** over a longer island game (e.g. ~120 turns, seed 2025), assert AIs **expand overseas** (a city founded on a different landmass than its capital) and **meet across water** (≥2 players `met`). This is the behavioral proof that naval AI works. Replays bit-identically.
- **Full self-play suite** green; re-seed 314/949 if the new behavior shifts them (record the re-seed reason in `selfplay.test.ts`, matching the existing convention).

## File-touch summary

- `src/engine/map/pathfind.ts` — `moveRulesFor`/`findPath` gain `opts?: { embark?: boolean }` (default-off, byte-identical when absent).
- `src/ai/decide.ts` — `decideSettler` overseas branch; `decideWorkBoat` (sea-domain `improve`); `decideMilitary` sea branch (bombard/melee/escort/defend); naval `decideScout` analogue; a `seaPath` helper.
- `src/ai/economy.ts` — `pickProduction` Work Boat + Harbor for coastal cities; `bestMilitary` need-gated sea units; `bestSeaWorkerJob`; a `navalNeed` signal.
- `tests/naval-ai.test.ts` — new unit tests.
- `tests/islands-mapgen.test.ts` (or new) — island self-play behavioral test.
- `tests/selfplay.test.ts` — re-seed 314/949 only if the gate shows they flipped.

## No schema change

All changes are AI logic + a default-off pathfinding option. No new state, no `SCHEMA_VERSION` bump.
