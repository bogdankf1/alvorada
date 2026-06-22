# Wave 3 — UI/QoL Batch Design

**Status:** Approved (2026-06-22)
**Source:** Batch 3 playtest feedback (`docs/2026-06-17-testing-feedback.md`) — the first islands/naval hands-on round.

## Goal

Five small, mostly-UI fixes from playtesting, bundled as one wave (the established Wave pattern). One is a real bug (specialists controls), the rest are QoL/discoverability. Two content items from the same batch (lumber mill, unit obsolescence) are deliberately separate follow-ups.

## Determinism headline

**Re-tune-free, no schema bump.** Verified: the AI never dispatches `SET_SPECIALISTS`/sets `forcedSpecialists` (so the allocator fix only affects human-pinned cities → AI self-play byte-identical), the AI never issues `REMOVE_ROAD` (new action, AI-unused → self-play unchanged), and the rest is UI/read-model only. `forcedSpecialists` and `tile.road` are existing state. The full self-play suite is the gate; seeds must not move.

## Components

### 1. Specialists controls (the bug)

**Root cause:** clicking `−` to 0 dispatches `SET_SPECIALISTS count=0`; the reducer treats `count <= 0` as "unpin" (deletes the entry); then `allocateCitizens` greedily re-adds the specialist (its slot out-yields the freed tile), so the count snaps back. You cannot force a specialist *off*. The `+` at max is correctly disabled.

**Fix — pins become explicit/exact:**
- **Reducer** (`src/engine/reducer.ts` `SET_SPECIALISTS`): set `city.forcedSpecialists[t] = count` *always*, including 0. Remove the `count <= 0 → delete` branch. (A pin of 0 now means "force zero," not "no pin.")
- **`allocateCitizens`** (`src/engine/selectors.ts`): a **pinned** type (any key present in `forcedSpecialists`) is fully manual — assign exactly its clamped count, then **set its remaining `slotCounts[t] = 0`** so the greedy fill can't re-add it. Untouched types keep auto-allocating exactly as today. Concretely, in the forced-specialists loop: iterate only types present in `forcedSpecialists`, assign `min(forced, slots, remaining)`, and zero out `slotCounts[t]` regardless of the forced amount.
- **UI** (`src/ui/panels/CityPanel.tsx`): `−`/`+` adjust the forced count within `[0, slots]` and dispatch it; the row shows the resulting assigned count. `−` enabled when the current count > 0; `+` enabled when assigned < total slots. Fix the cramped row CSS — space out `name · count · [−] [+]`, give the count room (the screenshot shows `Merchant1/1[−][+]` jammed together).
- **Deferred (YAGNI):** no explicit "reset to auto" affordance — the buttons fully express intent (set it where you want; pins persist).

### 2. Roads connect to the adjacent city (renderer-only)

In the road-drawing pass (`src/ui/map/renderer.ts` ~396-407), a road tile currently draws a segment only to neighbors that *also* have a road. Extend it to also draw a stub to any adjacent tile that is an **owned city center** (`cityAt`), so a road reaching a city visually joins it. Pure visual; no engine/determinism impact. Remember the `tilesStamp` content-hash already accounts for `tile.road` (Roads track) — no cache change needed since the city position is static.

*(Side note from the report — improvements are buildable on a city-center tile. Left as-is: harmless, out of scope for this wave.)*

### 3. Remove-road order (small)

A worker (a unit with the `improve` ability) standing on a tile that has a road may remove it.
- **Action:** new `REMOVE_ROAD` (`{ type, player, unit }`).
- **Validation** (`src/engine/validate.ts`): own unit with `improve`, `moves > 0`, the unit's tile has a `road`, and the tile is own-or-neutral (mirror BUILD_ROAD's tile-ownership rule). 
- **Reducer** (`src/engine/reducer.ts`): clear `tile.road = null`, set `unit.moves = 0; unit.acted = true` — **instant** (no multi-turn order, unlike BUILD_ROAD). Wakes a sleeper like other orders.
- **UI** (`src/ui/panels/UnitPanel.tsx`): a "Remove Road" button (via the existing `tryButton` validate-gated pattern) shown when the unit is on a road tile.

### 4. Split the build menu into Units / Buildings (UI)

In `CityPanel.tsx`, the "Order Production" list renders `productionOptions` as one flat list. Partition it by `item.kind` into two labeled subsections — **Units** and **Buildings** — each rendering the same `prod-item` rows. Pure UI; ordering within each section unchanged (productionOptions order preserved).

### 5. Naval discoverability (Unavailable list + embark hint)

Two targeted additions, both read-only:

- **"Unavailable" hints in the build menu.** A new pure selector `cityBuildHints(ctx, state, city)` returns `{ item, reason }[]` for units/buildings the player has **tech-unlocked** (its `requiresTech` is satisfied, or none) but **can't build in this city** for a surfaceable, non-tech reason — i.e. `canProduce` fails on `requiresCoastal` (→ "needs a coastal city"), `requiresResource` (→ "needs <resource>"), or the sea-domain coastal gate. Tech-gated items are **excluded** (they'd flood the list with future eras and are already visible in the tech tree). The CityPanel renders these below the buildable list as a muted, non-clickable **"Unavailable"** subsection — so an inland city shows *"Galley — needs a coastal city"* and the player learns the rule. This directly answers "why can't I build a ship?"
- **Embark hint.** In `UnitPanel.tsx`, when the selected unit is a land unit that can embark (holds `settings.naval.embarkTech`) and is adjacent to a water tile, show a one-line hint: *"Can embark — move onto adjacent sea."* (Embarking already works on click via the MOVE_UNIT embark special-case; the player just had no affordance.) This answers "how do I cross the sea?"

## Testing

- **Specialists (unit tests, `tests/` — extend an existing city/specialist test or add one):**
  - Reducer: `SET_SPECIALISTS count=0` leaves `forcedSpecialists[t] === 0` (pin kept, not deleted).
  - `allocateCitizens`: with a market (merchant slot) and a city whose greedy default assigns 1 merchant, pinning merchant to 0 yields **0** merchants (the freed pop works a tile); pinning to 1 yields exactly 1; an untouched type still auto-allocates.
- **Remove-road (unit test):** a worker on a road tile — `validateAction(REMOVE_ROAD)` ok; after `applyAction`, `tile.road === null` and the worker's `moves === 0`. A worker on a road-less tile → validate fails.
- **`cityBuildHints` (unit test):** an inland city with the bronze_working tech surfaces `galley` with a "coastal" reason; a coastal city does not (it's buildable); a building the player lacks the tech for does **not** appear (tech-gated excluded).
- **Renderer / embark hint / split menu:** `npm run build` sanity (canvas + UI not unit-tested), consistent with prior UI waves.
- **Full self-play suite:** green with **seeds 314 / 960 unchanged** (the re-tune-free gate). Also run `npm run build` (tsc) — not just `npm test` — before declaring done (the Spec B2 lesson).

## File-touch summary

- `src/engine/reducer.ts` — `SET_SPECIALISTS` keeps a 0 pin; add `REMOVE_ROAD`.
- `src/engine/selectors.ts` — `allocateCitizens` pinned-type fix; new `cityBuildHints` selector.
- `src/engine/validate.ts` — add `REMOVE_ROAD`.
- `src/engine/types.ts` — add `REMOVE_ROAD` to the `Action` union.
- `src/ui/panels/CityPanel.tsx` — specialist `−/+` behavior + CSS; split Units/Buildings; render the Unavailable list.
- `src/ui/panels/UnitPanel.tsx` — Remove Road button; embark hint.
- `src/ui/app.css` (or the relevant stylesheet) — specialist-row spacing; Unavailable-list styling.
- Tests: specialists + remove-road + cityBuildHints; full-suite gate.

## No schema change

`forcedSpecialists` and `tile.road` are existing state; `REMOVE_ROAD` adds no new state. No `SCHEMA_VERSION` bump.
