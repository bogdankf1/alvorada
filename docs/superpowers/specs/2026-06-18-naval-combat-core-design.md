# Naval — Combat Core — Design (Spec 1 of 2)

*2026-06-18. The coastal-first naval slice, split into two specs. THIS spec is the structural
foundation: the sea domain, embarkation, naval units, and naval combat. **Spec 2 (Sea economy)**
— sea resources, fishing boats, Work Boats, coastal cities working sea tiles, harbor — follows.
Islands/multi-landmass map-gen and a full naval AI are a separate later **track C**.*

## Scope

In: `domain:'sea'` + domain-aware movement/pathfinding · embarkation of land units · era-specific
naval units built in coastal cities · naval combat incl. coastal raiding · an AI guard that keeps
the AI off the water.

Out (later): all sea **economy** (resources/improvements/Work-Boats/coastal-tile-working/harbor)
→ Spec 2. Islands + naval AI → track C.

## Constraints — keep Spec 1 re-tune-free

- **Determinism (the headline goal):** the AI builds **no** naval units and **never embarks**, so
  AI behavior must be byte-identical → self-play replays unchanged, **no seed re-tune**. Two things
  protect this: (a) naval units gate behind **existing** techs (NO new tech → the AI's research
  graph is unchanged), and (b) embarkation is a **deliberate** move the AI never issues, while
  **non-embarked land units treat water as impassable in pathfinding** (as today) so the AI's
  land routing can't shortcut through the sea. The self-play gate confirms re-tune-free; if AI
  pathing shifts, we treat water as a higher land-cost or re-tune (as past slices did).
- **Layering / data-driven:** naval units/combat are `data` + `engine`; UI renders. Content
  (units, the embark tech gate) lives in the ruleset.
- **Schema:** bump 10→11 (new `domain` value + naval content; old autosaves drop). No new *state*
  field — "embarked" is derived (a land-domain unit standing on a water tile).
- **2D canvas only.**

## Decisions locked

1. Coastal-first, single continent (islands deferred). AI stays off the water (defer naval AI).
2. Embarkation is a deliberate move, gated behind an **existing** tech; embarked units can't
   attack, defend weakly, and are destroyed if they lose.
3. Naval units build in **coastal cities only**, gated behind existing techs (no new tech).
4. Coastal raiding: ranged ships bombard the coast; land ranged units shoot ships; ships don't
   capture cities (land melee still does).
5. Dedicated Work Boat + sea resources/improvements are **Spec 2**, not here.

---

## 1 · Domain system

- `UnitDef.domain: 'land' | 'sea'` (the field exists, typed `'land'` only — widen it).
- A domain-aware passability check (extend `isImpassable`/`moveRulesFor` to take the unit, or add
  `canEnter(ctx, state, unit, idx, embarked)`):
  - **sea unit** → may enter **water** tiles only; land/mountain impassable.
  - **land unit, not embarked** → land only; **water impassable** (unchanged from today).
  - **land unit, embarked** (already on a water tile, has the embark tech) → may enter water
    (and may disembark onto adjacent land).
- `moveRulesFor`'s auto-routing keeps water impassable for on-land land units, so neither the AI
  nor a human `goto` auto-paths through the sea — embarking is always deliberate.

## 2 · Embarkation

- **Derived state:** a unit is *embarked* iff its `domain === 'land'` and it stands on a `water`
  tile. No new `Unit` field.
- **Gate:** embarkation (and the first naval unit) unlock at an existing tech — proposed
  **`bronze_working`** (ancient; "shipwright's bronze"). Before it, water is impassable for land
  units, exactly as today.
- **Embark/disembark:** a deliberate one-step `MOVE_UNIT` from a land tile onto an adjacent water
  tile (validation allows it when the unit's owner has the gate tech), and the reverse onto land.
  Embarked units then move on water at their normal move budget (`water moveCost × moveScale`).
- **Combat while embarked:** an embarked unit **cannot attack** (no melee or ranged). It **defends
  at a small fixed strength** (`settings.naval.embarkedDefense`, e.g. 5) with no terrain/fortify
  bonus, and is **destroyed if it loses** (no retreat — lost at sea).
- Settlers/civilians may embark to cross water; founding on water stays blocked (already enforced
  in `FOUND_CITY` validation).

## 3 · Naval units (era-specific, coastal cities only)

A small roster reusing existing techs (no new tech → no research-graph change). Proposed:

| Unit | Class | Domain | Gate (existing tech) | Role |
|---|---|---|---|---|
| **Galley** | melee | sea | `bronze_working` (ancient) | basic warship — rams adjacent ships/embarked units |
| **Galleass** | ranged (range 2) | sea | `machinery` (medieval) | ship-mounted siege — bombards |
| **Frigate** | ranged (range 2) | sea | `metallurgy` (renaissance) | cannon ship — strong bombard |

Naval units are buildable only in **coastal cities** (a city with ≥1 adjacent water tile). The
`canProduce` path gains a coastal + domain check. Strength/cost numbers are tuned in the ruleset
(balanced against the contemporaneous land units; values set in the plan and refined in testing).

**Placement:** a sea-domain unit can't spawn on the city's land tile — `placeProducedUnit` must
place a new naval unit on an adjacent **water** tile (the nearest free coastal water hex); if a
coastal city has no free adjacent water, production is blocked with a clear reason (same shape as
the existing "no room for the new unit").

## 4 · Naval combat (coastal raiding)

Reuses the existing melee/ranged engine (`combat.ts`) — naval units carry `class:'melee'|'ranged'`,
so strength math, promotions, and HP all work unchanged. The only new piece is **cross-domain
targeting** in attack validation:

- **Ship vs ship / embarked:** melee ships (Galley) attack adjacent ships and embarked units;
  ranged ships (Galleass/Frigate) bombard within range. Standard rules.
- **Ship vs coast:** a **ranged** ship may target an adjacent/in-range **coastal land** tile — a
  land unit, an embarked unit, or a **coastal city** (reduces HP like a catapult; **cannot
  capture** — only land melee captures, the existing rule). Melee ships attack only units, not
  cities/land tiles.
- **Land vs ship:** a **ranged land** unit (archer, catapult) may target a ship within range
  (coastal defense). Land melee cannot attack into water.
- Soft zone-of-control extends to naval military (a ship can stop an enemy ship), reusing the
  existing ZoC.

## 5 · Coastal cities

- **Coastal** = a city with ≥1 adjacent water tile (derived helper `isCoastal(state, city)`).
- Only coastal cities may build naval units (the `canProduce`/`productionOptions` gate). Non-coastal
  cities see no naval options.
- (Working sea tiles, the harbor building, and Work-Boat production are **Spec 2**.)

## 6 · AI guard (keeps the AI off the water → determinism)

- The AI production scorer (`src/ai/economy.ts` `pickProduction`) **skips `domain:'sea'` units** —
  the AI never builds ships.
- The AI movement/decision logic never issues an embark move (it targets land tiles; water is
  impassable for its on-land units), so AI land units never enter the sea.
- Net: AI behavior is byte-identical to today → self-play unchanged (the gate confirms).

## 7 · Schema & determinism

Schema 10→11. No new serialized field (embarked is derived). The self-play suite is the gate: with
the AI off the water and naval gated behind existing techs, all replay/victory tests should pass
unchanged. If a victory seed shifts (e.g. the AI's land pathing finds a water shortcut despite the
impassable rule), re-tune that one seed as in prior slices and document it.

## 8 · Testing (TDD, engine)

`tests/naval.test.ts`:
- Domain passability: a sea unit can't enter land; a land unit can't enter water without the gate
  tech; with the tech it can step onto adjacent water (embark); an embarked unit can move on water
  and disembark onto land.
- Embarked combat: an embarked unit can't attack; defends at `embarkedDefense`; is destroyed on a
  loss.
- Naval combat: Galley vs Galley (melee), Frigate bombards an embarked unit and a coastal city
  (city not captured), an archer hits an adjacent ship.
- Coastal-city gate: a coastal city can produce a Galley; an inland city cannot.
- Determinism: a self-play run replays bit-identically (AI builds no naval).

## Out of scope (explicit)

Sea resources · fishing boats · Work Boats · cities working sea tiles · harbor (all **Spec 2**) ·
multi-landmass map-gen · naval AI (**track C**) · a dedicated `sailing` tech (deferred — adding a
tech changes the AI research graph and would force a re-tune; revisit when track C re-tunes anyway).
