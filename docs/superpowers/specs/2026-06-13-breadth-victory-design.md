# Breadth & Victory v1 — Design Spec

**Date:** 2026-06-13
**Status:** Approved (ready for implementation planning)
**Sub-project:** second of the "completed Civ" expansion sequence (after Diplomacy v1)

## 1. Goal & summary

Give the game a fuller historical arc and more ways to win. Extend the tech tree from 2 eras
to **4** (add **Medieval** and **Renaissance**, 15 new techs) with era-appropriate **units**
and **buildings** so the new techs unlock real content; add **World Wonders** — one-per-game,
tech-gated buildings with strong yields and a small **signature-effect vocabulary**; and add a
**science victory** (first to research a capstone tech). Conquest stays; the score/turn-limit
ending stays as the fallback. Culture victory is deferred to the Culture & religion track.

This track is mostly **additive data** (the engine is already data-driven for
techs/units/buildings — PLAN.md §4) plus one focused engine feature (wonders) and a small
victory addition. It must preserve the determinism contract (PLAN.md §3.3) and layering (§2).

## 2. Scope

**In:**
- 2 new eras (`medieval`, `renaissance`) and 15 new techs with prereqs + tree layout.
- ~7 new units and ~5 new buildings filling those eras (data).
- World Wonders: a buildable building subtype, globally unique, tech-gated, **not rush-buyable**,
  with strong yields + one optional signature effect each. ~7 wonders.
- A 5-kind, extensible **wonder-effect vocabulary** (below).
- Science victory via a capstone tech; victory record gains `'science'`.
- AI: builds wonders when safe; research naturally climbs to the capstone.
- UI: wonder tag + "built by" state in the city panel; 4-era tech tree with the capstone marked;
  a global "wonder completed" toast; science-victory overlay text.

**Out (deferred; hooks noted):**
- **Unit upgrading / obsolescence** → Combat & map track. Old units remain usable; the AI already
  prefers the strongest *buildable* unit, so era progression still works.
- National (per-civ) wonders; coastal-only buildings (harbor) — needs a tile-adjacency build
  condition we don't have yet.
- Culture/tourism victory → Culture & religion track.
- AI actively *racing to block* a rival's imminent science win (it competes by teching, not by
  sabotage) — note for a later AI pass.
- Wonder rush-buying, multi-effect wonders, yield *multipliers* (we stay additive/integer).

## 3. Eras & tech tree (data)

`ERAS` becomes `[ancient, classical, medieval, renaissance]`. The tech panel auto-lays-out from
each tech's `pos: {col,row}` and already scrolls horizontally, so the tree just grows wider.
Ancient/Classical occupy cols 0–4 today; Medieval = cols 5–7, Renaissance = cols 8–10.

**New techs (16).** Costs continue the curve (Classical caps at 120). `prereqs` reference
existing/earlier techs; `era` set accordingly.

| id | era | cost | prereqs | unlocks |
|---|---|---|---|---|
| `feudalism` | medieval | 160 | currency | pikeman (prereq for chivalry, guilds) |
| `machinery` | medieval | 160 | iron_working, mathematics | crossbowman, trebuchet |
| `engineering` | medieval | 175 | construction, mathematics | castle, great_wall |
| `chivalry` | medieval | 185 | horseback_riding, feudalism | knight |
| `education` | medieval | 200 | philosophy, mathematics | university (prereq for astronomy, printing_press) |
| `theology` | medieval | 200 | philosophy | monastery, notre_dame |
| `guilds` | medieval | 210 | currency, feudalism | (prereq for banking) |
| `astronomy` | renaissance | 260 | education | observatory (prereq for architecture) |
| `gunpowder` | renaissance | 260 | machinery, chivalry | musketman (prereq for metallurgy) |
| `banking` | renaissance | 270 | guilds, currency | bank |
| `printing_press` | renaissance | 280 | education, machinery | leonardos_workshop (prereq for capstone) |
| `metallurgy` | renaissance | 300 | gunpowder | cannon, cuirassier (prereq for chemistry) |
| `architecture` | renaissance | 300 | engineering, astronomy | sistine_chapel |
| `chemistry` | renaissance | 340 | metallurgy, astronomy | (prereq for capstone) |
| `scientific_method` | renaissance | 400 | printing_press, chemistry | **science-victory capstone** (terminal leaf) |

15 new techs. `pos` is assigned per era column with distinct rows to avoid overlap; exact
coordinates are enumerated in the implementation plan. Adding content never edits engine code —
the tech panel, unlock-derivation, and AI read it from data.

**Dead-end test note:** `tests/ruleset.test.ts` asserts every non-starting tech unlocks
something or leads somewhere. `scientific_method` is intentionally a terminal leaf (it grants a
victory, not content), so that test must exempt the tech named by `settings.victory.scienceCapstone`.
Every other new tech above unlocks content or is a prereq, so only the capstone needs the exemption.

## 4. New units (data; strength-scaled per era)

Combat is `damage = clamp(30 + 2·(attEff − defEff), 8, 64)` with `attEff` ≈ strength; scaling
strength up per era keeps newer units decisively better without breaking the clamp.

| id | class | str | ranged | moves | requiresTech | requiresResource | notes |
|---|---|---|---|---|---|---|---|
| `pikeman` | melee | 18 | — | 2 | feudalism | — | +50% vs mounted |
| `crossbowman` | ranged | 14 | str 18, range 2 | 2 | machinery | — | |
| `trebuchet` | siege | 8 | str 20, range 2 | 2 | machinery | — | +100% vs city |
| `knight` | mounted | 24 | — | 4 | chivalry | horses | |
| `musketman` | melee | 30 | — | 2 | gunpowder | — | new staple line |
| `cannon` | siege | 10 | str 32, range 2 | 2 | metallurgy | iron | +100% vs city |
| `cuirassier` | mounted | 34 | — | 4 | metallurgy | horses | |

Art `glyph` reuses the existing procedural glyph set where sensible (sword/spear/bow/horse/
catapult), so no renderer change is required.

## 5. New buildings (data)

All expressible with today's `BuildingDef` (yields / perPop / defense / requiresTech).

| id | yields | perPop | defense | requiresTech |
|---|---|---|---|---|
| `university` | science 2 | science per 2 pop | — | education |
| `observatory` | science 3 | — | — | astronomy |
| `castle` | — | — | strength 8 | engineering |
| `bank` | gold 4 | — | — | banking |
| `monastery` | culture 2, science 1 | — | — | theology |

## 6. World wonders (the engine feature)

### 6.1 Data
Extend `BuildingDef`:
```ts
wonder?: boolean;          // true → a one-per-game World Wonder
effect?: WonderEffect;     // optional signature effect (beyond `yields`)
```
A wonder still uses normal `BuildingDef.yields` for its **own city**; `effect` is the special
sauce. `WonderEffect` is a small discriminated union (one effect per wonder for v1):
```ts
type WonderEffect =
  | { kind: 'empireYields'; yields: PartialYields }   // added to EVERY city the owner holds
  | { kind: 'cityDefense'; strength: number }         // +strength to ALL owner cities
  | { kind: 'freeTech' }                              // grant cheapest available tech, once
  | { kind: 'freeUnit'; unit: string; count: number } // spawn units in the city, once
  | { kind: 'cultureBurst'; amount: number };         // add culture to the city, once
```

### 6.2 The set (~7)
| id | era / requiresTech | yields (own city) | effect | cost |
|---|---|---|---|---|
| `pyramids` | ancient / masonry | production 1 | `freeUnit worker ×2` | 180 |
| `great_library` | classical / writing | science 3 | `freeTech` | 200 |
| `hanging_gardens` | classical / mathematics | food 2 | `empireYields {food:1}` | 220 |
| `great_wall` | medieval / engineering | — | `cityDefense 6` | 300 |
| `notre_dame` | medieval / theology | culture 3 | `cultureBurst 60` | 320 |
| `leonardos_workshop` | renaissance / printing_press | production 2 | `empireYields {production:1, science:1}` | 420 |
| `sistine_chapel` | renaissance / architecture | culture 3 | `empireYields {culture:1}` | 420 |

All five effect kinds are exercised by this set.

### 6.3 Global uniqueness, completion, refund
- `GameState` gains `wondersBuilt: Record<string /*wonderId*/, CityId>`.
- **Gating** (`canProduce`): a `wonder` whose id is in `wondersBuilt` is unbuildable
  ("already built"); also the usual tech gate. Wonders are **never** rush-buyable (`BUY_ITEM`
  rejects any `wonder`).
- **Completion** (in `processCity`, when a building that is a wonder finishes): set
  `wondersBuilt[id] = city.id`; apply `effect` (§6.4); emit a global event
  (`wonderBuilt`, audience `null`); then **resolve the race** — for every *other* city whose
  `production.item` is this wonder, clear it and refund its accumulated `progress` as **gold**
  to that city's owner (`floor(progress)` gold), with a per-owner event.
- A city may begin a wonder only if not yet built; multiple cities may race (no cross-city lock).

### 6.4 Effect application
- **Ongoing** (read by selectors, so they compose with everything):
  - `empireYields`: in `cityYields(city)`, add the `empireYields` of every wonder whose
    owner == `city.owner` (look up `wondersBuilt` → city → owner). O(#wonders), tiny.
  - `cityDefense`: in `cityStrength(city)`, add likewise. Reuses the existing building-defense
    summation path.
- **One-time** (fired once at completion, in the reducer/city processing):
  - `freeTech`: grant the owner the cheapest `availableTechs` entry (sorted by cost then id;
    deterministic). Emits `techDone`. If none available, no-op.
  - `freeUnit`: spawn `count` × `unit` via the existing `placeProducedUnit` placement (nearest
    free ring tile); skips any that can't be placed.
  - `cultureBurst`: `city.culture += amount` (feeds the existing border-growth threshold).

## 7. Science victory

- `settings.victory` gains `scienceCapstone: string` (= `'scientific_method'`). `data/validate.ts`
  asserts the referenced tech exists.
- When a player completes the capstone during turn-start tech resolution (`beginTurn`), declare a
  **science** victory immediately. The `GameState.winner.victory` union becomes
  `'conquest' | 'score' | 'science'`. `victory.ts` gets the declaration; `turn.ts` calls it at
  the tech-completion site.
- Conquest (last empire standing) and score-at-turn-limit are unchanged.

## 8. AI

- **Production** (`ai/economy.ts pickProduction`): add a "build an available wonder when not under
  threat" rule, slotted just above the generic civic-building priority (wonders are high-value).
  Pick the cheapest available wonder deterministically. Don't start a wonder while `threat > 0`.
- **Research** (`ai/economy.ts pickResearch`): extend the priority lists with the new techs in a
  sensible order that climbs through Medieval/Renaissance and includes `scientific_method` last,
  so a science-leading AI naturally completes the capstone and wins. No dedicated "block the
  rival" logic in v1.
- Determinism preserved: sorted iteration, integer math, no RNG.

## 9. UI

- **City panel** (`CityPanel.tsx`): wonders in the production list get a "World Wonder" tag and a
  brief effect blurb; a wonder already taken globally simply doesn't appear as an option (filtered
  by `canProduce`), and the current-production box shows wonder progress like any item.
- **Tech tree** (`TechTree.tsx`): renders 4 eras from data (era labels already derive from
  `ERAS`); the capstone tech gets a distinct marker (a laurel/“Victory” chip). Existing horizontal
  scroll handles the wider tree.
- **Notifications:** add `wonderBuilt` to the driver's `TOAST_TYPES` (+ an icon); it's global news
  (audience `null`).
- **Victory overlay** (`Modals.tsx`): handle `'science'` — e.g. "leads the world into a new age of
  reason."
- No new map art (wonders are city buildings; effects are systemic).

## 10. Determinism & multiplayer-readiness

- All new content is data; all new mutation flows through `validate` + `reduce`. `wondersBuilt`
  is plain JSON in `GameState`. Effects are integer/additive; `freeTech` and the refund are
  deterministic (sorted selection, `floor`). No `Math.random`/transcendentals.
- Schema: `wondersBuilt` is a new required field. Bump `SCHEMA_VERSION` 2 → 3; old saves drop
  (same mechanism as before — `loadAutosave` already swallows the mismatch). No migrator.

## 11. Testing

- **Ruleset validation** (existing test) automatically covers the new content's id references;
  extend `data/validate.ts` to check `effect.unit` (freeUnit) and `victory.scienceCapstone` resolve.
- **Unit:** wonder global-uniqueness (second city racing the same wonder is refunded gold and its
  item cleared on the first's completion); each effect kind (empireYields in `cityYields`,
  cityDefense in `cityStrength`, freeTech grants the cheapest tech, freeUnit spawns N, cultureBurst
  adds culture); `canProduce` rejects a taken wonder; `BUY_ITEM` rejects a wonder; science victory
  fires on capstone research and ends the game.
- **Replay:** a scripted game that builds a wonder (with a one-time effect) and reaches the
  capstone replays bit-identically.
- **Self-play:** extend the 4-AI harness onto the 4-era tree; assert wonders get built across a long
  game and that a **science victory** occurs in at least one seed, and that the full log still
  replays bit-identically. Balance line: wonders built / victory type distribution.

## 12. File-by-file change map (head start for the plan)

- `src/data/types.ts` — `WonderEffect`; `BuildingDef.wonder?`/`effect?`; `RulesetSettings.victory.scienceCapstone`.
- `src/data/standard/techs.ts` — 2 eras + 16 techs (with `pos`).
- `src/data/standard/units.ts` — 7 units.
- `src/data/standard/buildings.ts` — 5 buildings + 7 wonders.
- `src/data/standard/index.ts` — `victory.scienceCapstone: 'scientific_method'`.
- `src/data/validate.ts` — validate `effect.unit`, `effect` kinds, `scienceCapstone`.
- `src/engine/types.ts` — `GameState.wondersBuilt`; `winner.victory` union += `'science'`.
- `src/engine/serialize.ts` — `SCHEMA_VERSION = 3`.
- `src/engine/state.ts` — init `wondersBuilt: {}`.
- `src/engine/selectors.ts` — `canProduce` wonder gating; `cityYields` empireYields; `cityStrength` cityDefense; a `wonderOwnerEffects(state, owner)` helper.
- `src/engine/systems/cities.ts` — wonder completion (mark built, fire effect, race-refund) in `processCity`.
- `src/engine/systems/victory.ts` — `checkScienceVictory` / declare `'science'`.
- `src/engine/systems/turn.ts` — call the science-victory check at tech completion.
- `src/engine/validate.ts` — `BUY_ITEM` rejects wonders (via `canProduce` + explicit guard).
- `src/ai/economy.ts` — wonder production rule; research priority extended.
- `src/ui/panels/CityPanel.tsx` — wonder tag/blurb in production list.
- `src/ui/panels/TechTree.tsx` — capstone marker (4 eras already data-driven).
- `src/ui/panels/Modals.tsx` — science victory text.
- `src/app/driver.ts` — `wonderBuilt` toast type; `src/ui/panels/Notifications.tsx` icon.
- `tests/content.test.ts` (new) + extend `tests/replay.test.ts`, `tests/selfplay.test.ts`.
- `tests/ruleset.test.ts` — exempt `settings.victory.scienceCapstone` from the dead-end-tech assertion.

## 13. Success criteria

1. The tech tree spans 4 eras; the new techs unlock the new units/buildings; the panel renders and
   scrolls cleanly with the capstone marked.
2. A city can build a world wonder; once built anywhere it's unavailable elsewhere and racing
   cities are refunded; wonders can't be rush-bought.
3. Each of the 5 effect kinds works and composes (empire yields show in every owner city; city
   defense raises city strength; freeTech/freeUnit/cultureBurst fire once on completion).
4. Researching the capstone tech wins a science victory; conquest and score endings still work.
5. AI builds wonders and can win by science; a long 4-AI self-play game ends and replays
   bit-identically with wonders + (sometimes) a science victory in the log.
6. All prior tests pass; new unit/replay/self-play tests pass; no `Math.random`/transcendentals in
   engine or AI; all balance values live in ruleset data.
