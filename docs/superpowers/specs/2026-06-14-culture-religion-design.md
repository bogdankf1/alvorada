# Culture & Religion — Design Spec

**Track:** 4 of 5 in the "completed Civ" expansion (after Diplomacy, Breadth & Victory, City & Economy Depth).
**Date:** 2026-06-14
**Status:** Approved (models + implementation shape), ready for planning.

## Goal

Add the four "soft power" systems that complete the Civ feel: **Faith** (a new sixth yield), **Religion** (found pantheons and religions with beliefs that spread across the map), a **Civics/policy tree** (culture finally does something beyond borders), and the **Culture victory** (out-culture the world). All four are additive in the established mold and preserve the engine's determinism/serialization contract. This is the largest track yet, so each sub-system is scoped tightly (see Non-goals).

## Design decisions (locked via brainstorming)

1. **Faith is a real 6th yield** (food/production/gold/science/culture/**faith**), accumulating into a per-player pool — not a separate special-case resource.
2. **Religions: faith-cost founding + pressure spread.** Spend faith to found a Pantheon then a Religion; it spreads automatically as deterministic per-turn pressure. No Great Prophets, missionaries, or religious units.
3. **Civics: permanent unlocks.** Accumulated culture unlocks policies from a small tree; each adopted policy is a permanent empire-wide bonus. No slots, no swapping.
4. **Culture victory: cultural dominance.** Win when your influence outweighs every living rival's accumulated culture by a tunable margin, past a minimum turn.

## Architecture fit

Every system plugs into the existing funnels: `cityYields` (the single yield read-model), `empireHappiness`, `beginTurn` (the turn pipeline), and `victory.ts` (whose header already anticipates a culture victory). The one cross-cutting change is faith as a 6th yield — but the engine's `YIELD_KEYS`-driven loops (`addYields`, `emptyYields`, the city/tile yield rows) absorb most of it; only a few hardcoded spots change (enumerated below). Determinism is preserved: integer math, `sortedIds`/sorted-key iteration, no `Math.random`/`Date`/transcendentals.

---

## System 1 — Faith (6th yield)

### State & data

```ts
// data/types.ts
Yields gains `faith: number`; YIELD_KEYS gains 'faith'; ZERO_YIELDS gains faith: 0.

// engine/types.ts — Player gains:
faith: number;   // faith pool, accumulates each turn like gold/science
```

New content:
- **Shrine** building — `{ cost: 40, yields: { faith: 1 }, art: { glyph: 'temple' } }`, no tech (early, like Monument).
- **Temple** gains `faith: 1` (keeps its existing `culture: 3`).
- Beliefs and policies may grant faith (via the effect vocabulary).

### Generation & banking

Faith flows through `cityYields` automatically (it's a yield; `addYields` iterates `YIELD_KEYS`). Each city's faith is banked into `player.faith` in `beginTurn`, exactly as science/gold are. `CityTurnOutput` grows from `{ science, gold }` to `{ science, gold, faith, culture }` (culture is surfaced for civics/victory — see Systems 3–4).

### Spending

Faith is spent to found a Pantheon then a Religion (System 2). After founding, the owner's ongoing faith **income** boosts their Holy City's spread pressure (keeps faith relevant all game). Faith-buying of buildings/units is out of scope (Non-goals).

### The 6th-yield touch points (bounded)

- `data/types.ts`: `Yields`, `YIELD_KEYS`, `ZERO_YIELDS` (the `addYields`/`emptyYields` loops then handle faith).
- `ui/icons.tsx`: a new faith icon (e.g. a flame/dove, 1.6px stroke) added to `YIELD_ICONS` + a color in `YIELD_COLORS`.
- Auto-extending (already `YIELD_KEYS`-driven): `CityPanel` yields-row, `TileInfo` yields list.
- `selectors.ts` `allocateCitizens` weight: add a small `+ (y.faith ?? 0) * 1` term (faith rarely sits on tiles, so low weight).
- `ui/panels/TopBar.tsx`: a faith chip (pool + per-turn), added manually like the gold/science chips.
- `engine/systems/cities.ts` `CityTurnOutput` + `engine/systems/turn.ts` `beginTurn` banking.

---

## System 2 — Religion (pantheons → religions → spread)

### State & data

```ts
// data/types.ts
export type BeliefKind = 'pantheon' | 'founder' | 'follower';
export interface BeliefDef { id: string; name: string; kind: BeliefKind; effect: CivicEffect; }
// Ruleset gains: beliefs: Record<string, BeliefDef>;

// engine/types.ts
export interface ReligionState {
  id: string;            // `rel_${founderPid}` (at most one religion per player)
  name: string;          // player-chosen (or defaulted to a civ name)
  founder: PlayerId;
  holyCity: CityId;
  founderBelief: string; // belief id (kind 'founder')
  followerBelief: string;// belief id (kind 'follower')
}
// Player gains:  pantheon: string | null;  // chosen pantheon belief id
// City gains:    religion: string | null;  religiousPressure: Record<string, number>;
// GameState gains: religions: Record<string, ReligionState>;

// settings (rules.settings.religion):
religion: {
  pantheonCost: number;      // faith to found a pantheon (start: 20)
  religionCost: number;      // faith to found a religion (start: 60)
  religionTech: string;      // 'theology'
  maxReligions: number;      // cap on total founded (start: 4)
  spreadRange: number;       // hex range pressure travels (start: 6)
  pressurePerCity: number;   // pressure a following city emits to in-range cities (start: 2)
  holyCityBonus: number;     // extra standing pressure a holy city has for its own religion (start: 30)
  holyCityFaithDiv: number;  // holy city emits +floor(ownerFaithIncome / this) extra pressure (start: 2)
};
```

### Pantheon

When `player.faith >= pantheonCost` and `player.pantheon === null`, the player may found a Pantheon (`FOUND_PANTHEON { player, belief }`, `belief.kind === 'pantheon'`). It subtracts `pantheonCost` faith and sets `player.pantheon`. The belief's effect applies to **every city the player owns**.

### Religion

When `player.faith >= religionCost`, the player has the `religionTech` (theology), no religion of their own yet, and `Object.keys(state.religions).length < maxReligions`, they may found a Religion (`FOUND_RELIGION { player, name, holyCity, founderBelief, followerBelief }`). It subtracts `religionCost` faith, creates `state.religions['rel_'+pid]`, sets the Holy City's `religion` to it (with `religiousPressure['rel_'+pid] = holyCityBonus`), and records the two beliefs. The **Founder belief** applies to all the founder's cities; the **Follower belief** applies to every city that follows the religion.

### Spread (deterministic pressure)

`spreadReligions(ctx, state, pid)` runs in `beginTurn` for `pid`'s cities. For each owned city, in sorted id order:
- For every other city within `spreadRange` that has a `religion`, add `pressurePerCity` to this city's `religiousPressure[thatReligion]`. A **Holy City** source adds `pressurePerCity + holyCityBonus + floor(ownerFaithIncome / holyCityFaithDiv)` instead, where `ownerFaithIncome` = the sum of that Holy City owner's cities' faith yield this turn (from `cityYields`).
- The city's **majority religion** = `argmax(religiousPressure)` (ties → lexicographically lowest religion id). A Holy City's standing `holyCityBonus` keeps it loyal to its own religion. Pressure only accumulates (monotonic) → stable, no flapping.
- On a change of majority religion, push a `cityConverted` event.

### Follower bonus

A city whose `religion === R` gains R's Follower-belief effect (`yields`/`happiness`) on top of its own output — so spreading your religion **exports your bonus across the map**, including into converted rival cities.

### Beliefs catalog (representative; finalized in the plan, tuned in balance)

- **Pantheon (~6):** flat +1 to a yield per owner city, or per-building — e.g. `god_of_harvest {yields:{food:1}}`, `god_of_craftsmen {yields:{production:1}}`, `god_of_commerce {yields:{gold:1}}`, `oral_tradition {yields:{science:1}}`, `goddess_of_festivals {yields:{culture:1}}`, `stone_circles {perBuilding:{building:'shrine', yields:{faith:1}}}`.
- **Founder (~4, founder empire-wide):** `tithe {perBuilding:{building:'temple', yields:{gold:2}}}`, `papal_primacy {happiness:3}`, `world_church {yields:{culture:1}}`, `ceremonial_burial {yields:{faith:1}}`.
- **Follower (~4, in following cities):** `feed_the_world {yields:{food:1}}`, `religious_art {yields:{culture:1}}`, `cathedral_of_learning {yields:{science:1}}`, `peace_gardens {happiness:1}`.

### Actions

`FOUND_PANTHEON { player, belief }`, `FOUND_RELIGION { player, name, holyCity, founderBelief, followerBelief }` — validated and handled in `validate.ts`/`reducer.ts` (exhaustiveness preserved). Founding logic lives in a new `src/engine/systems/religion.ts` (`foundPantheon`, `foundReligion`, `spreadReligions`).

---

## System 3 — Civics / Policies (culture → permanent unlocks)

### State & data

```ts
// data/types.ts
export interface PolicyDef {
  id: string; name: string; branch: string; cost: number; prereqs: string[]; effect: CivicEffect;
}
// Ruleset gains: policies: Record<string, PolicyDef>;

// engine/types.ts — Player gains:
policies: string[];       // adopted policy ids (permanent)
policyProgress: number;   // empire culture accumulated toward the next policy
```

Culture now does double duty: **per-city culture still grows borders** (unchanged in `processCity`), **and** the empire's total culture-per-turn is banked into `player.policyProgress` in `beginTurn`.

### Adoption

`ADOPT_POLICY { player, policy }` — valid when the policy's `prereqs` are all in `player.policies`, `player.policyProgress >= policy.cost`, and it isn't already adopted. The handler subtracts `policy.cost` from `policyProgress` and appends to `player.policies`. Permanent; never removed. The policy's effect applies to **every city the player owns** (+ `influenceMult` toward the culture victory).

### Policy tree (representative; ~10–12 in 2–3 branches)

- **Tradition** (tall/growth): `aristocracy {yields:{culture:1}}` (cost 50) → `monarchy {happiness:2}` (80), `landed_elite {yields:{food:1}}` (80).
- **Liberty** (wide/expansion): `citizenship {yields:{production:1}}` (50) → `republic {yields:{gold:1}}` (80), `meritocracy {happiness:2}` (80).
- **Piety** (faith/culture): `organized_religion {yields:{faith:1}}` (50) → `theocracy {influenceMult:25}` (80), `free_thought {yields:{science:1}}` (80).

Flat per-policy costs in v1; the balance phase may scale cost by adopted count. The opening policy of each branch has no prereqs.

---

## System 4 — Culture victory (cultural dominance)

### State & influence

```ts
// engine/types.ts — Player gains:
cultureTotal: number;  // lifetime empire culture (banked each turn in beginTurn)

// settings.victory gains:
culture: { dominanceFactor: number; minTurn: number };  // start: { dominanceFactor: 2, minTurn: 150 }
```

`influence(ctx, state, pid)` = `cultureTotal × (1 + Σ adopted-policy influenceMult / 100)` + a flat per-wonder bonus (wonders are "great culture"). Deterministic, integer-floored.

### Win condition

`checkCultureVictory(ctx, state, pid)` (called from `beginTurn` like `checkScienceVictory`): if `state.turn >= victory.culture.minTurn` and, for **every** living rival `r`, `influence(pid) >= cultureTotal(r) × dominanceFactor`, then `pid` wins. Adds `'culture'` to the winner union (`engine/types.ts` `GameState.winner`) and to `declareWinner`/`checkScoreVictory`'s victory type.

---

## Effect vocabulary (beliefs + policies share one shape)

```ts
// data/types.ts
export interface CivicEffect {
  yields?: PartialYields;                                     // per city it applies to
  happiness?: number;                                         // empire happiness
  perBuilding?: { building: string; yields: PartialYields };  // e.g. +1 faith per Shrine
  influenceMult?: number;                                     // % tourism/influence (policies)
}
```

**Application (all through existing funnels):**

| Source | Applies to | Read by |
|---|---|---|
| Pantheon belief | owner's every city | `cityYields`, `empireHappiness` |
| Founder belief | founder's every city | `cityYields`, `empireHappiness` |
| Follower belief | each city following that religion | `cityYields`, `empireHappiness` |
| Adopted policy | owner's every city | `cityYields`, `empireHappiness`, `influence` |

`cityYields` gains the `yields`/`perBuilding` from the applicable sources; `empireHappiness` gains their `happiness`; `influence` reads policies' `influenceMult`. A small `civicEffectsFor(ctx, state, city)` helper resolves the set of effects active in a city (owner pantheon + founder + adopted policies + the city's follower belief) so the funnels stay readable.

---

## Engine flow — where each plugs in

- **`beginTurn` (turn.ts)** gains, in order: (1b) `spreadReligions(ctx, state, pid)` before the city loop; the city loop banks `faith`→`player.faith`, empire `culture`→`player.policyProgress` **and** `player.cultureTotal`; after the research/treasury step, `checkCultureVictory(ctx, state, pid)`.
- **`cityYields` (selectors.ts)** adds civic-effect yields (via `civicEffectsFor`) before the very-unhappy penalty.
- **`empireHappiness` (selectors.ts)** adds civic-effect happiness (pantheon/founder/policy empire-wide; follower per following city).
- **`processCity` / `CityTurnOutput`** surface `faith` and `culture` to `beginTurn`.
- **`victory.ts`** gains `checkCultureVictory` + the `'culture'` winner variant.
- **`reducer.ts` / `validate.ts`** gain the three new actions.
- **New files:** `src/engine/systems/religion.ts` (found + spread), and a small `src/engine/systems/civics.ts` or selector for policy adoption/effects.

---

## AI (pure, fair, deterministic — `src/ai/`)

Bounded heuristics, no deep planning:
- **Faith/religion:** found a Pantheon when `faith >= pantheonCost` (pick the highest-yield-score pantheon belief); research `theology` then found a Religion when affordable + a slot is free (Holy City = capital; pick beliefs by yield score). Add **Shrine** to `BUILDING_PRIORITY`; bump `theology`/`philosophy` in `pickResearch`.
- **Policies:** adopt a policy whenever `policyProgress` allows, by a fixed priority order over the tree.
- **Culture victory:** no dedicated planner in v1 — a culture/wonder-leaning AI reaches it implicitly and the dominance check fires.
- `decide.ts` emits the new pantheon/religion/policy actions in its per-turn loop (alongside research/diplomacy), each gated by `validateAction`.

---

## UI (`src/ui/`)

- **TopBar:** a faith chip (pool + per-turn).
- **Founding modals (`Modals.tsx`):** when the viewer can found a Pantheon or Religion, a belief-picker modal (same nullable-store-flag pattern as the trade-route modal); religion founding also takes a name and shows the Holy City.
- **Civics overlay:** a policy-tree screen mirroring the existing `TechTree` overlay (branches, costs, prereq lines, Adopt buttons → `ADOPT_POLICY`), opened from a new "Civics" button in the TopBar; an `overlay: 'civics'` store value.
- **City panel:** show the city's majority religion + (via the auto `YIELD_KEYS` row) its faith.
- **Religion/influence readouts:** a compact religions overview (who founded what, your beliefs, Holy Cities) and a culture-victory influence indicator (you vs each rival) so the win path is legible.
- **Toasts (`driver.ts` TOAST_TYPES):** `pantheonFounded`, `religionFounded`, `cityConverted`, `policyAdopted`, plus the culture victory.
- **Debug bridge (`ui/debug.ts`):** hooks to found pantheon/religion, adopt policy, and read religion/influence state for verification scripts.

UI must not import `src/ai/` (the composition-root `debug.ts` exception aside). All belief/policy/influence math lives in engine selectors shared by engine, AI, and UI.

---

## Determinism & serialization

- All new computation is integer math over sorted iteration (religion spread is the sensitive one — sorted cities × sorted religions, integer pressure, monotonic accumulation). No `Math.random`/`Date`/transcendentals.
- `SCHEMA_VERSION` bumps **4 → 5**. Old autosaves dropped on load (established pattern).
- `initialState` and the `flatWorld` test fixture initialize the new Player fields (`faith:0`, `pantheon:null`, `policies:[]`, `policyProgress:0`, `cultureTotal:0`), City fields (`religion:null`, `religiousPressure:{}` — optional, default empty), and `GameState.religions: {}`.
- The full action log must still replay bit-identically (`gameHash`), now exercising faith, religion spread, policies, and the culture victory.

---

## Testing

- **Faith:** Shrine/Temple grant faith; faith flows through `cityYields` and banks into `player.faith`.
- **Religion:** `FOUND_PANTHEON`/`FOUND_RELIGION` validation (cost, tech, slot, ownership) + belief effects on yields/happiness; `spreadReligions` deterministically converts a nearby city and the follower belief then applies to it; a Holy City never converts away.
- **Civics:** culture banks into `policyProgress`; `ADOPT_POLICY` validation (prereqs, cost, dup) + the permanent effect applies empire-wide.
- **Culture victory:** dominance fires when `influence` dominates all rivals past `minTurn`; does NOT fire prematurely.
- **Content/ruleset:** beliefs/policies cross-validate (effect building refs exist, policy prereqs resolve, belief kinds valid); the 6th yield is consistent across `YIELD_KEYS`/icons.
- **Self-play:** over a long game, religions are founded and spread, policies are adopted, and a culture victory is reachable on some seed; the log replays bit-identically. Balance telemetry gains faith / policies-adopted / religion-spread / cultureTotal columns.
- **Replay:** the new actions replay deterministically.

---

## Non-goals (deliberately deferred to keep this track reviewable)

- **No Great Prophets / Missionaries / Apostles / religious combat / inquisitors** — pressure-only spread.
- **No faith-buying** of buildings or units — faith funds founding + boosts spread only.
- **No great-works / great-people system** — influence derives from culture + wonders/policies, not artworks.
- **No policy slots/swapping/categories** — permanent unlocks only.
- **One founder + one follower belief per religion** — no multiple beliefs, no "enhancing" a religion.
- **Diplomacy unchanged** — no shared-religion attitude modifier in v1 (a natural future hook).

---

## Phase plan (for `writing-plans`) — ~8 phases, the largest track yet

1. **Faith yield** end-to-end: `data/types` (`Yields`/`YIELD_KEYS`/`ZERO_YIELDS`), faith icon+color, `cityYields` flow, `CityTurnOutput`+`beginTurn` banking to `player.faith`, `allocateCitizens` weight, TopBar faith chip, **Shrine** + Temple faith. Schema → 5; state/fixture init. No religion yet.
2. **Beliefs + religion state + founding:** `CivicEffect`, `rules.beliefs`, `ReligionState`, `player.pantheon`, `FOUND_PANTHEON` + `FOUND_RELIGION` (validate/reducer/`religion.ts`), and pantheon+founder effect application via `civicEffectsFor` in `cityYields`/`empireHappiness`.
3. **Spread + follower beliefs:** `spreadReligions` in `beginTurn`, `city.religion`/`religiousPressure`, follower-belief application, `cityConverted` events, Holy-City loyalty.
4. **Civics/policies:** `rules.policies`, `player.policies`/`policyProgress`, culture banking, `ADOPT_POLICY` (validate/reducer), policy effects in `cityYields`/`empireHappiness`.
5. **Culture victory:** `player.cultureTotal` banking, `influence` selector, `checkCultureVictory`, `'culture'` winner variant + events.
6. **AI:** found pantheon/religion, adopt policies, build Shrine, prioritize theology; `decide.ts` emission.
7. **UI:** founding modals, civics overlay, religion display + influence readout, toasts, debug hooks.
8. **Balance & holistic:** tune faith/spread/policy/victory numbers via self-play telemetry; reachability assertions (religion spreads, policies adopted, culture victory reachable); final holistic review; finish the branch.
