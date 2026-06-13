# City & Economy Depth — Design Spec

**Track:** 3 of 5 in the "completed Civ" expansion (after Diplomacy and Breadth & Victory).
**Date:** 2026-06-13
**Status:** Approved (models + implementation shape), ready for planning.

## Goal

Add the three city/economy systems that turn Alvorada from "expand freely, build, win" into a game with real management tension: **empire happiness** (a brake on reckless expansion), **typed specialists** (where excess citizens go), and **trade routes** (a trader unit connecting cities for yield, tied into diplomacy). All three are additive in the established mold — data + state slice + handlers + selectors + AI hints + UI — and preserve the engine's determinism/serialization contract.

## Design decisions (locked via brainstorming)

1. **Happiness is empire-wide** (one global pool per civ, Civ V style) — the clearest, sharpest expansion brake. *Not* per-city amenities.
2. **Specialists are typed building slots** (Scientist/Merchant/Artist/Engineer), auto-assigned by best yield with a manual pinned override. **No Great People** in v1 — slots just give yields.
3. **Trade routes use an expiring trader unit** (Caravan) — tactile, reuses the unit/movement/fog systems, and routes can be pillaged. *Not* abstract menu-based capacity.

## Architectural fit

- **Happiness is a pure derived selector** — `empireHappiness(ctx, state, pid)`. No new per-player serialized field; no desync risk. It reads cities, their buildings, connected luxuries, and happiness wonders.
- **Specialists extend the existing allocator.** `assignWorkedTiles` becomes `allocateCitizens`, distributing `pop` across worked tiles **and** open specialist slots with the same deterministic best-yield greedy and id tiebreaks.
- **Per-turn trade-route yields flow through `cityYields`** (the single yield funnel) — the origin city receives them like any other yield, so they appear in the breakdown UI and AI valuations automatically. A small `processTradeRoutes` step handles only lifecycle (expiry, pillage). War-cancel lives in the `DECLARE_WAR` handler; capture/elimination prune dependent routes.

Determinism is preserved throughout: integer math, `sortedIds` iteration, the existing A\* pathfinder for route paths. No `Math.random`/`Date`/transcendentals are introduced.

---

## System 1 — Empire Happiness

### State & data

No new `GameState`/`Player` field (happiness is derived). New data:

```ts
// data/types.ts — ResourceDef.kind gains 'luxury'; optional per-resource happiness override
kind: 'bonus' | 'strategic' | 'luxury';
happiness?: number; // luxury only; defaults to settings.happiness.luxuryHappiness

// BuildingDef gains:
happiness?: number;   // empire-wide happiness this building contributes (per city that has it)
pacifies?: boolean;   // clears an occupied city's unrest (Courthouse)

// WonderEffect gains a new ongoing variant:
| { kind: 'happiness'; amount: number } // empire-wide happiness while the owner holds the wonder

// City gains one optional field:
occupied?: boolean;   // set on capture; an occupied city without a pacifying building adds extra unhappiness

// RulesetSettings gains:
happiness: {
  baseEmpire: number;            // starting happiness buffer (start: 9)
  perCity: number;               // unhappiness per owned city (start: 2)
  perPop: number;                // unhappiness per citizen (start: 1)
  occupiedExtra: number;         // extra unhappiness per occupied, un-pacified city (start: 3)
  luxuryHappiness: number;       // happiness per DISTINCT connected luxury (start: 4)
  unhappyGrowthDivisor: number;  // when Unhappy, positive food surplus is divided by this (start: 4)
  veryUnhappyAt: number;         // net <= this → Very Unhappy tier (start: -10)
  veryUnhappyProdPenaltyPct: number; // each city's production reduced by this % when Very Unhappy (start: 33)
};
```

### `empireHappiness(ctx, state, pid)` — pure selector

Returns `{ happy: number; unhappy: number; net: number; tier: 'content' | 'unhappy' | 'veryUnhappy'; connectedLuxuries: string[] }`.

```
happy   = settings.happiness.baseEmpire
        + Σ (building.happiness ?? 0)  over every building in every city pid owns
        + (count of DISTINCT connected luxuries) * luxuryHappiness   // per-luxury override allowed
        + Σ (effect.amount) over happiness-wonder effects pid owns   // sorted iteration of wondersBuilt

unhappy = (#cities) * perCity
        + (Σ city.pop) * perPop
        + (#occupied cities without a pacifying building) * occupiedExtra

net  = happy - unhappy
tier = net >= 0 ? 'content' : (net <= veryUnhappyAt ? 'veryUnhappy' : 'unhappy')
```

- **Connected luxury** = pid owns at least one tile carrying a luxury resource whose `improvedBy` improvement is present on that tile (mirrors `strategicAvailability`'s source-counting). Distinct by resource id — duplicates of the same luxury do **not** stack (classic Civ rule).
- **Pacifying building** = any building in the city with `pacifies: true` (the Courthouse).
- All sums use sorted iteration; all values integer.

### The brake (two deterministic tiers)

- **Content (net ≥ 0):** normal play.
- **Unhappy (net < 0):**
  - **Growth throttle** — in `processCity`, a positive food surplus becomes `Math.floor(surplus / unhappyGrowthDivisor)` before being added to `city.food`. Starvation (negative food) is unaffected.
  - **Settler lockout** — `canProduce` returns `{ ok:false, reason:'the empire is too unhappy to support settlers' }` for any unit with the `foundCity` ability. This greys the option out in the UI and blocks it at validation for AI and human alike.
- **Very Unhappy (net ≤ veryUnhappyAt):** the above **plus**
  - **Growth fully stops** (positive surplus contributes 0).
  - **Production penalty** — in `cityYields`, `total.production = Math.floor(total.production * (100 - veryUnhappyProdPenaltyPct) / 100)`.

`processCity` computes the tier once for growth; `cityYields` computes it for the production penalty (cheap, pure). No random revolts in v1 (see Non-goals).

### New content

| Kind | Id | Notes |
|---|---|---|
| Resource (luxury) | `wine` | improvedBy `plantation`; spawn grassland/plains flat |
| Resource (luxury) | `silk` | improvedBy `plantation`; spawn grassland/plains |
| Resource (luxury) | `spices` | improvedBy `plantation`; spawn plains/grassland |
| Resource (luxury) | `incense` | improvedBy `plantation`; spawn desert/plains |
| Resource (luxury) | `gems` | improvedBy `mine`; spawn `terrains: [grassland, plains, desert]`, `elevations: [hill]` |
| Improvement | `plantation` | turns 5, yields `{gold:1}`, `requiresResource:true`, `requiresTech:'pottery'` |
| Building | `colosseum` | cost 100, `happiness:3`, `requiresTech:'construction'` |
| Building | `courthouse` | cost 100, `pacifies:true`, `requiresTech:'mathematics'` |
| Wonder | `circus_maximus` | cost 250, yields `{culture:1}`, `effect:{kind:'happiness', amount:5}`, `requiresTech:'construction'` |

Luxury resources are visible from the start (no `revealedBy`) unless a value is later assigned. Each luxury carries small base yields (e.g. `wine {gold:1}`, `gems {gold:2}`) and may define `bonusImproved` for when the plantation/mine is built. Starting numbers are tuned in the balance phase.

---

## System 2 — Specialists

### State & data

```ts
// data/types.ts
export type SpecialistType = 'scientist' | 'merchant' | 'artist' | 'engineer';

// Ruleset gains:
specialists: Record<SpecialistType, { name: string; yields: PartialYields }>;

// BuildingDef gains:
specialistSlots?: { type: SpecialistType; count: number };

// City gains one optional field:
forcedSpecialists?: Partial<Record<SpecialistType, number>>; // manual pinned minimums
```

Specialist definitions (starting values, tunable):

```
scientist: { name: 'Scientist', yields: { science: 3 } }
merchant:  { name: 'Merchant',  yields: { gold: 3 } }
artist:    { name: 'Artist',    yields: { culture: 3 } }
engineer:  { name: 'Engineer',  yields: { production: 2 } }
```

Slots on existing buildings: `library`→`{scientist,1}`, `university`→`{scientist,1}`, `observatory`→`{scientist,1}`, `market`→`{merchant,1}`, `bank`→`{merchant,1}`, `temple`→`{artist,1}`, `workshop`→`{engineer,1}`.

### `allocateCitizens(ctx, state, city)` — replaces `assignWorkedTiles`

Returns `{ worked: number[]; specialists: Partial<Record<SpecialistType, number>> }`.

1. Build candidates: every owned workable non-center tile (value = `food*4 + production*3 + gold*2 + science*2 + culture`, the existing weights) **plus** every open specialist slot instance (value computed from its type's yields with the same weights).
2. Place `forcedSpecialists` first: for each type, reserve `min(forced[type], totalSlotsOfType, remainingPop)` citizens as that specialist.
3. Fill the remaining `pop` by descending value across the remaining tiles + slots. Tiebreak deterministically: tiles by ascending tile index, slots by `(SpecialistType order, then slot index)`, tiles before slots on exact ties.
4. The center tile remains free (added separately in `cityYields`, as today) and is not part of the `pop` allocation.

`cityYields` adds the worked-tile yields (as today) **and** the specialist yields (sum over `specialists` of `count * rules.specialists[type].yields`). The `worked` list returned in the breakdown is unchanged in meaning; a `specialists` field is added to `CityYieldBreakdown` for the UI.

### `SET_SPECIALISTS` action

```ts
| { type: 'SET_SPECIALISTS'; player: PlayerId; city: CityId; specialist: SpecialistType; count: number }
```

- **Validate:** own city; `specialist` exists in `rules.specialists`; `count` is a non-negative integer; `count ≤` total slots of that type present in the city.
- **Handle:** set `city.forcedSpecialists[specialist] = count` (delete the key when `count === 0`). The allocator re-clamps to available pop each turn, so the stored value is robust to population loss.

The AI does not use this action — auto-allocation already maximizes yield, so the AI simply benefits.

---

## System 3 — Trade Routes

### State & data

```ts
// GameState gains:
tradeRoutes: Record<number, TradeRoute>;
nextTradeRouteId: number;

export interface TradeRoute {
  id: number;
  owner: PlayerId;
  fromCity: CityId;        // origin (always owner's city)
  toCity: CityId;          // destination
  kind: 'domestic' | 'international';
  expires: number;         // absolute turn the route ends (state.turn >= expires → removed)
  path: number[];          // tile indices, A* origin→destination at establish time (pillage + rendering)
}

// UnitAbility gains 'trade'.
// New unit:
caravan: {
  id: 'caravan', name: 'Caravan', cost: 50, moves: 2, sight: 1, strength: 0,
  class: 'civilian', domain: 'land', abilities: ['trade'], requiresTech: 'currency',
  art: { glyph: 'caravan' }, // add a caravan glyph to the unit atlas; fall back to the worker/settler civilian glyph if needed
}

// RulesetSettings gains:
tradeRoute: {
  caravanRange: number;            // max hex distance origin↔destination (start: 12)
  duration: number;                // route lifetime in turns; expires = turn + duration (start: 30)
  domestic: PartialYields;         // per-turn to the origin city (start: { food: 1, production: 1 })
  international: PartialYields;     // per-turn to the owner via the origin city (start: { gold: 4 })
  internationalScience: number;    // science added to international routes once the tech below is known (start: 2)
  internationalScienceTech: string;// tech that unlocks trade science (start: 'guilds')
  destinationGold: number;         // per-turn gold to the destination civ on international routes (start: 2)
  friendshipBonusPct: number;      // +% to international yield when friends or open borders exist (start: 50)
  pillageBounty: number;           // gold to a raider who plunders a route (start: 25)
};
```

### Establishing a route

```ts
| { type: 'ESTABLISH_TRADE_ROUTE'; player: PlayerId; unit: UnitId; targetCity: CityId }
```

- **Validate:**
  - Own unit with the `trade` ability and `moves > 0`.
  - `targetCity` exists; the unit is on or adjacent to the target city tile (`hexDistance(unit, targetCity) ≤ 1`).
  - **Origin** = the player's city nearest to `targetCity` with a different id (tie → lowest id). It must exist and satisfy `hexDistance(origin, targetCity) ≤ caravanRange`.
  - If `targetCity.owner === player` → **domestic** (origin ≠ target enforced above).
  - Else → **international**: require `hasMet(player, target.owner)` and **not** `atWar(player, target.owner)`.
  - No identical active route already exists (same `fromCity`+`toCity`+`owner`).
- **Handle:** compute `path = A*(origin → target)` for the caravan's move rules; if no path exists, fail (`'no land route to that city'`). Create the `TradeRoute` with `expires = state.turn + duration`, delete the caravan unit, push a `tradeEstablished` event, recompute visibility for the owner.

### Per-turn yields (via `cityYields`)

`cityYields(ctx, state, city)` adds, after tiles/buildings/specialists:

- For each route with `fromCity === city.id`:
  - **domestic** → add `settings.tradeRoute.domestic` (food + production help the origin grow/build).
  - **international** → add `settings.tradeRoute.international` (gold); add `internationalScience` as science if the owner has `internationalScienceTech`. If the owner and destination owner are friends **or** open borders exist either way, multiply the international gold (and science) by `(100 + friendshipBonusPct)/100`, integer-floored.
- For each **international** route with `toCity === city.id`: add `settings.tradeRoute.destinationGold` gold (the trade partner's cut — this is what gives the diplomacy AI a concrete reason to value peace/friendship).

All integer math. Because yields run through `cityYields`, they show up in the city's yield breakdown and in AI tile/site valuations with no extra wiring.

### Lifecycle — `processTradeRoutes(ctx, state, pid)`

Called in `beginTurn` as **step 2b**, immediately after the `processCity` loop and before the research/treasury step (so plundered/expired routes stop paying the same turn they end). For routes **owned by `pid`**, in sorted id order:

- **Expiry:** if `state.turn >= route.expires`, remove it and push a `tradeExpired` event to the owner.
- **Pillage:** else, if any non-civilian unit `u` with `atWar(pid, u.owner)` occupies a tile in `route.path` (sorted unit iteration), remove the route, grant the raider's owner `pillageBounty` gold, and push a `tradePillaged` event to both parties.

### War & city changes

- **`DECLARE_WAR` (in `systems/diplomacy.ts` `enterWar`):** remove every **international** route between the two players (either direction); push a `tradeBroken` event to each owner.
- **Capture / elimination:** a helper `pruneRoutesForCity(state, cityId)` removes every route with `fromCity === cityId || toCity === cityId`. Called from `captureCity` (the city changed hands) and wherever cities are removed. (A player's elimination removes their cities, which prunes their routes.)

---

## AI (pure, fair, deterministic — `src/ai/`)

### Economy (`economy.ts`)

- **Happiness recovery (high priority in `pickProduction`, before wonders/civic works):** when `empireHappiness(...).net < 0`:
  - if the city is `occupied` and a Courthouse is buildable and absent → build the Courthouse;
  - else if a Colosseum is buildable and absent → build the Colosseum.
- **Expansion gating:** the settler branch additionally requires `empireHappiness(...).net >= 0` (graceful skip; `canProduce` already hard-blocks it).
- **`BUILDING_PRIORITY`** gains `'colosseum'` and `'courthouse'`.
- **Worker AI (`bestWorkerJob`):** a plantation/mine on a *luxury* tile gets a large value bump (connecting a luxury relieves the empire-wide brake) — larger than the existing strategic/resource bump.
- **Trade (`pickTradeRoute` + caravan handling):**
  - Build a Caravan when the empire runs fewer than `ceil(cities / 2)` active routes, the city has no urgent military need, and a sensible target exists.
  - Caravan unit handling (in the AI civilian movement path, mirroring how settlers travel to a site and found): pick a target via `pickTradeTarget` (domestic → a young/newer own city within range; else international → the nearest met, at-peace civ's city within range), `goto` it, and `ESTABLISH_TRADE_ROUTE` when on/adjacent.

### Diplomacy (`diplomacy.ts`)

Unchanged in v1. The international destination-gold trickle simply flows into rivals' treasuries; deeper "value my trade partners" attitude weighting is a future touch (noted in Non-goals).

---

## UI (`src/ui/`)

- **Top HUD bar:** an empire-happiness readout (net value + a face icon, color-coded by tier) with a breakdown tooltip listing happy/unhappy sources (cities, pop, luxuries, buildings, wonders, occupied unrest). Mirrors the existing yield readouts.
- **`CityPanel.tsx`:**
  - a **Specialists** section: per type, `assigned / available` with +/− controls dispatching `SET_SPECIALISTS`, showing the per-specialist yield;
  - an **occupied** note ("Occupied — build a Courthouse to quell unrest") when applicable;
  - an **active routes** list (origin→destination, kind, turns remaining) for routes touching this city.
- **Unit action bar:** a selected Caravan gains an **Establish Trade Route** action (alongside Fortify/Build) when on/adjacent to a valid target city.
- **`Modals.tsx`:** a trade-route target picker — valid destination cities with projected per-turn yield; confirm dispatches `ESTABLISH_TRADE_ROUTE`.
- **Map renderer:** active trade routes drawn as a dotted caravan trail along `route.path` — the signature-visual tie-in on the parchment map.
- **`driver.ts` TOAST_TYPES / `Notifications.tsx`:** add `unhappy`, `veryUnhappy`, `luxuryConnected`, `tradeEstablished`, `tradeExpired`, `tradePillaged`, `tradeBroken`.
- **Debug bridge (`ui/debug.ts`):** extend so verification scripts can read empire happiness, set specialists, and establish/list routes through the public action path.

UI must not import `src/ai/` — all happiness/specialist/route math lives in engine selectors (`empireHappiness`, `allocateCitizens`, `cityYields`), which UI, AI, and the reducer share.

---

## Determinism & serialization

- All new computation is integer math over `sortedIds`/sorted-key iteration; route paths use the existing deterministic A\*. No `Math.random`, `Date`, or transcendental functions are introduced.
- `SCHEMA_VERSION` bumps **3 → 4**. Old autosaves are dropped on load (the established pattern; `loadAutosave` swallows the schema mismatch).
- `initialState` initializes `tradeRoutes: {}` and `nextTradeRouteId: 1`. `City.forcedSpecialists`/`occupied` and the new optional def fields are absent by default (default behavior).
- The full action log must still replay bit-identically (`gameHash`), now exercising specialists, happiness penalties, and trade routes.

---

## Testing

- **`tests/happiness.test.ts` (new):** `empireHappiness` sources and totals; luxury de-duplication (two of the same luxury = one bonus); the three tiers at boundary values; growth throttle and Very-Unhappy production penalty; settler lockout via `canProduce`; Courthouse clears occupied unrest.
- **`tests/specialists.test.ts` (new):** `allocateCitizens` distributes across tiles and slots; forced specialists are honored and clamped to available slots/pop; population loss re-clamps without error; `SET_SPECIALISTS` validation (bad type, over-cap, negative).
- **`tests/trade.test.ts` (new):** establish validation (range, peace/met, adjacency, origin selection, duplicate, no-path); domestic vs international yields through `cityYields`; friendship/open-borders bonus; destination trickle; expiry; pillage + bounty; `DECLARE_WAR` cancels international routes; capture prunes routes.
- **`tests/content.test.ts` + `tests/ruleset.test.ts`:** new luxuries/improvement/buildings/wonder/unit cross-validate; `validateRuleset` extended so building `specialistSlots.type` resolves against `rules.specialists`, luxury `improvedBy` resolves, and the `caravan`'s tech/ability are valid.
- **`tests/selfplay.test.ts`:** assert over a long game that (a) some AI empire goes Unhappy and recovers (builds happiness buildings / stops over-settling), and (b) caravans are built and routes established — and the game still **replays bit-identically**. Extend the balance-telemetry table with happiness and route columns.
- **`tests/replay.test.ts`:** ensure the new actions replay deterministically.

---

## Non-goals (deliberately deferred to keep this track reviewable)

- **No Great People** — specialists yield only.
- **No random revolts / city defection** — Very-Unhappy is a deterministic growth/production penalty. (Revolts could be a later combat/map-depth item.)
- **No naval / sea trade routes** — the Caravan is land-only (`domain: 'land'`); sea trade waits for the naval/embark track.
- **No trade-route slot caps or trade-boosting buildings** — the caravan's production cost is the natural limiter.
- **No per-city happiness / amenities** — empire-wide was the chosen model.
- **No diplomacy-AI re-weighting for trade partners** — the destination-gold trickle is the v1 hook; richer weighting is future.

---

## Phase shape (for `writing-plans`)

1. **Happiness model** — data (`kind:'luxury'`, building `happiness`/`pacifies`, `WonderEffect` happiness, settings, `specialists` placeholder not yet), `empireHappiness` selector, `City.occupied`, schema bump, unit tests. No behavior wired into play yet.
2. **Happiness brake + content** — wire growth throttle, Very-Unhappy production penalty, and settler lockout (`processCity`/`cityYields`/`canProduce`); add luxuries + plantation + colosseum + courthouse + circus_maximus; `captureCity` sets `occupied`; AI happiness-recovery + settler gating + worker luxury bump; top-bar happiness UI + toasts.
3. **Specialists** — `specialists` data + building slots, `allocateCitizens` (refactor of `assignWorkedTiles`), `cityYields` specialist output, `SET_SPECIALISTS` action + validation, city-panel specialists UI, tests.
4. **Trade routes — engine** — `TradeRoute` state + `caravan` unit + `ESTABLISH_TRADE_ROUTE` (validate/handle, A\* path), `cityYields` route yields, `processTradeRoutes` lifecycle (expiry, pillage), `DECLARE_WAR` cancel, `pruneRoutesForCity` on capture, tests.
5. **Trade routes — AI & UI** — `pickTradeRoute`/`pickTradeTarget` + caravan movement/establish in the AI, unit-action + target-picker modal + active-routes list + dotted route rendering, toasts, debug-bridge hooks.
6. **Balance & holistic** — tune happiness/trade numbers via self-play telemetry (as the victory thresholds were tuned), self-play assertions for the brake and trade, final holistic review, finish the branch.
