# Combat Depth — Design Spec

**Track:** 5a of 5 (first half of "Combat & Map Depth"; the map/world half — naval/embark, rivers, natural wonders, city-states — is the deferred follow-up).
**Date:** 2026-06-14
**Status:** Approved (models + implementation shape), ready for planning.

## Goal

Make war richer and the early game dangerous: **unit promotions/XP** (units earn experience and pick combat upgrades — finally, deferred from the Breadth track), **soft zone-of-control** (enemy units lock down adjacent tiles), and **barbarians** (a hostile independent faction whose encampments spawn raiders and pay bounties when cleared). All three are additive in the established mold and preserve the engine's determinism/serialization contract. Naval/embark, rivers, natural wonders, and city-states are explicitly out of scope (see Non-goals).

## Design decisions (locked via brainstorming)

1. **Promotions: catalog + player choice.** XP from combat; at thresholds a unit picks a promotion from a data catalog (class-gated, prereq chains). Human picks via UI; AI auto-picks.
2. **Zone-of-control: soft.** Moving onto a tile adjacent to an at-war enemy military unit ends that unit's movement for the turn (a `commando` promotion is exempt).
3. **Barbarians: encampments + bounties.** Camps placed at map-gen spawn raiders; clearing a camp (occupying its tile) pays gold + XP. A real hostile faction with a simple aggressive AI.

## Architecture fit

All three plug into existing systems and the data-driven engine. Promotions add per-unit state read by `combat.ts` (strength functions) and `turn.ts` (movement/healing). Zone-of-control is a few lines in the `executeMovePath` walker. Barbarians are a real `Player` appended at init so `owner`/`relations`/combat work unchanged — the cost is *exclusion* touch-points across victory/elimination/diplomacy. Determinism holds: integer math, `sortedIds` iteration, and the seeded `rngState` (mulberry32) for camp placement + spawning. No `Math.random`/`Date`/transcendentals.

---

## System 1 — Promotions & XP

### State & data

```ts
// engine/types.ts — Unit gains:
xp?: number;            // experience, accumulates from combat
promotions?: string[];  // earned promotion ids

// data/types.ts
export interface PromotionEffect {
  attackPct?: number;                          // +% attack strength
  defensePct?: number;                         // +% defense strength
  vsClassPct?: { class: UnitClass; pct: number }; // +% vs a unit class
  vsCityPct?: number;                          // +% vs cities
  movement?: number;                           // +moves per turn
  healPerTurn?: number;                        // extra HP healed each turn (Medic)
  healAlways?: boolean;                        // heal even after acting (March)
  ignoreZoc?: boolean;                         // immune to zone-of-control (Commando)
}
export interface PromotionDef {
  id: string; name: string;
  classes?: UnitClass[];   // gating: which unit classes may take it (undefined = any)
  requires?: string[];     // prerequisite promotion ids
  effect: PromotionEffect;
}
// Ruleset gains: promotions: Record<string, PromotionDef>;

// settings.combat:
combat: {
  xpPerAttack: number;     // start: 4
  xpPerKill: number;       // start: 6 (added on a kill)
  xpPerDefend: number;     // start: 3 (a surviving defender)
  xpVsBarbCap: number;     // start: 30 — a unit earns no XP from barb/city combat once xp >= this (anti-farm)
  promotionThresholds: number[]; // cumulative XP for slots; start: [10, 25, 45, 70, 100]
};
```

### XP & slots

XP is awarded in the `combat.ts` resolvers: the attacker gets `xpPerAttack` (+`xpPerKill` on a kill); a defender that survives gets `xpPerDefend`. When the opponent is a **barbarian unit or a city**, the award is suppressed once the unit's `xp >= xpVsBarbCap` (prevents barb-farming). A unit has earned `promotionSlots = count(promotionThresholds[i] <= xp)`; `pendingPromotions = promotionSlots − promotions.length`.

### Picking

`CHOOSE_PROMOTION { player, unit, promotion }` — valid when: the unit is the player's, `pendingPromotions > 0`, the promotion exists, the unit's class is allowed (`def.class ∈ promotion.classes` if set), all `requires` are in `unit.promotions`, and it isn't already taken. The handler pushes it onto `unit.promotions`. Human picks via the UnitPanel; AI auto-picks by priority.

### Promotion catalog (`rules.promotions`, ~11; finalized in the plan)

- `combat_i` (melee/mounted/ranged/siege) `{attackPct:15, defensePct:15}` → `combat_ii` (requires combat_i) `{attackPct:15, defensePct:15}`
- `shock` (melee) `{vsClassPct:{class:'melee',pct:33}}`; `formation` (melee/ranged) `{vsClassPct:{class:'mounted',pct:33}}`
- `cover` (ranged/melee) `{defensePct:33}`; `siege` (siege/melee) `{vsCityPct:50}`; `accuracy` (ranged/siege) `{attackPct:33}`
- `mobility` (mounted/melee) `{movement:1}`; `medic` (any) `{healPerTurn:10}` → `march` (requires medic) `{healAlways:true}`; `commando` (melee/mounted) `{ignoreZoc:true}`

### Application

`promotionBonus(ctx, unit, kind, vs)` sums the relevant percentages (attack: `attackPct` + matching `vsClassPct` + `vsCityPct`; defense: `defensePct`) and is added — as `floor(baseStrength × pct/100)` — inside `attackStrength`/`rangedStrength`/`defenseStrength`, exactly like the existing `classBonus`. In `beginTurn`: a unit's `moves` = `def.moves + Σ movement`; healing gains `Σ healPerTurn` and, with `healAlways`, heals even after acting.

---

## System 2 — Zone-of-control (soft)

In `executeMovePath`, immediately after a unit successfully steps onto a tile `a`, if the unit does **not** have `ignoreZoc` and `a` is adjacent to an at-war enemy **military** unit, the unit's `moves` are set to 0, the move loop stops, and its `order` is cleared. So:
- A unit that **moves** adjacent to an at-war enemy line halts there and engages **next turn**.
- A unit that **starts** its turn already adjacent attacks normally (ZoC only triggers on a move-step *entering* an adjacent tile).
- The `commando` promotion (`ignoreZoc`) passes through freely.

`adjacentToEnemyMilitary(ctx, state, a, owner)` iterates `neighbors(a)`, checking `militaryAt` + `atWar`. Applies to all movers (civilians can't slip past either). No new serialized state.

---

## System 3 — Barbarians (encampments + bounties)

### State & data

```ts
// engine/types.ts
// Player gains: barbarian?: boolean
// GameState gains:
camps: { id: number; q: number; r: number }[];
nextCampId: number;

// data/standard/civs.ts — a barbarians CivDef:
barbarians: { id:'barbarians', name:'Barbarians', leader:'Barbarian Clans', color:'#8a4a3a', cityNames:['Encampment'] }
// (cityNames non-empty only to satisfy the validator; barbarians never found cities.)

// settings.barbarians:
barbarians: {
  campCount: number;       // camps placed at map-gen (start: 6)
  startSafeRadius: number; // no camp within this many hexes of any start (start: 6)
  spawnRadius: number;     // a camp spawns a raider within this radius (start: 2)
  spawnEveryTurns: number; // a camp may spawn on turns where turn % this === 0 (start: 6)
  maxNearCamp: number;     // skip spawning if >= this many barb units already within spawnRadius (start: 2)
  campBounty: number;      // gold paid to the player who clears a camp (start: 25)
};
```

### The faction

`initialState` appends a single barbarian `Player` at index `config.players.length` (controller `'ai'`, `civ:'barbarians'`, `barbarian:true`, all yield/culture/religion fields zero-initialized like any player). The `relations` matrix (sized to `playerCount + 1`) sets the barbarian row and column to `status: 'war'` both ways for every other player — so the existing combat/movement war checks need no special-casing. A `visibility` array is allocated for it too.

### Camps

At init, `campCount` camps are placed on unowned, passable land tiles at least `startSafeRadius` hexes from every start, chosen deterministically by drawing from `rngState`. Each camp gets one barbarian defender (a `warrior`) so it isn't trivially walked over. `state.camps` + `nextCampId` are set.

### Spawning

In `beginTurn` for the barbarian player: for each camp (sorted by id), when `state.turn % spawnEveryTurns === 0` and fewer than `maxNearCamp` barbarian units are within `spawnRadius`, spawn one barbarian unit on a free tile within `spawnRadius` (drawn from `rngState`). The unit type follows a simple era schedule (`warrior` early; `archer`/`horseman` mid; `swordsman` later).

### Clearing & bounty

In `executeMovePath`, when a **non-barbarian** unit steps onto a camp tile (reachable only after defeating any defender via normal combat), the camp is removed, the unit's owner gains `campBounty` gold, the unit gains XP (capped per `xpVsBarbCap`), and a `campCleared` event fires.

### Barbarian AI (`src/ai/barbarian.ts`)

`decide` routes a `barbarian` player to `barbarianDecide`. For each barbarian unit (sorted, with moves): attack the weakest adjacent at-war non-barb military unit or city; else move toward the nearest visible non-barb unit/city; else roam toward unexplored land. Deterministic (sorted iteration, owner-fog honest), one action per call, `END_TURN` when done.

### Exclusion touch-points

A helper `isBarbarian(state, pid)` (= `state.players[pid].barbarian === true`) threads through:
- **`checkElimination`** — the barbarian faction is never eliminated (it has no cities by design), and the "sole survivor → conquest" check counts only **non-barbarian** alive players.
- **`checkScoreVictory`** — `alive` rivals exclude the barbarian; it is never a score winner.
- **`checkCultureVictory`** / **`checkScienceVictory`** — the barbarian is excluded as a rival and guarded from ever winning.
- **Diplomacy** — `metPlayers`/`initiateDiplomacy` skip the barbarian; `PROPOSE_DEAL`/`DECLARE_WAR`/`DENOUNCE` validation rejects a barbarian target (you are permanently at war and cannot treat with them). The Foreign Affairs UI (driven by `metPlayers`) therefore never lists it.
- **AI `considerWar`** — skips the always-at-war barbarian as a war target.
- **Any code/tests that iterate or count `state.players` assuming "real civs"** — must filter out the barbarian (`!p.barbarian`). Notably the existing self-play tests assert per-alive-player invariants ("≥1 city, ≥4 techs") and a fixed player count (`rows.length === 4`); the plan updates `tests/selfplay.test.ts` to exclude the barbarian from those.

---

## AI

- **Barbarians:** `barbarianDecide` (above), routed from `decide`.
- **Promotion auto-pick:** for non-barbarian AI players, a `decide` step emits `CHOOSE_PROMOTION` (a `pickPromotion` priority over the unit's `availablePromotions`) whenever one of its units has a pending slot — so AI veterans actually promote.
- The existing military AI already treats barbarian units as enemies (they're at war), so AIs defend against raids without further change beyond the `considerWar` exclusion.

---

## UI (`src/ui/`)

- **UnitPanel:** an **XP bar** toward the next threshold + earned-promotion chips; when a unit has a pending slot, a **"Choose Promotion"** picker listing `availablePromotions`, dispatching `CHOOSE_PROMOTION`.
- **Map renderer:** barbarian units already draw by owner color (the barbarian `CivDef` has one); add a **camp marker** (a tent/skull glyph) on camp tiles.
- **Toasts (`driver.ts` TOAST_TYPES):** `promotionReady`, `campCleared` (barbarian attacks reuse the existing `unitKilled`/`cityBombarded`/`cityCaptured`). Optional HUD nudge for "units awaiting promotion."
- **Debug bridge (`ui/debug.ts`):** `choosePromotion(unitId, promotion)`, `listCamps()` for verification scripts.

UI must not import `src/ai/` (the `debug.ts` composition-root exception aside). All XP/promotion/ZoC math lives in engine selectors/systems shared by engine, AI, and UI.

---

## Determinism & serialization

- All new computation is integer math over `sortedIds`/sorted iteration. Camp placement (init) and barbarian spawning (`beginTurn`) draw from the serialized `rngState` (mulberry32) deterministically — the first runtime consumers of `rngState`. ZoC uses `neighbors`/`atWar`. No `Math.random`/`Date`/transcendentals.
- Barbarian turns and `CHOOSE_PROMOTION` are ordinary logged actions; spawning happens inside the reducer (`beginTurn`). The full action log must still replay bit-identically (`gameHash`).
- `SCHEMA_VERSION` bumps **5 → 6**; old autosaves dropped on load (established pattern). `initialState` and the `flatWorld` fixture gain `camps: []`, `nextCampId: 1`, and (for `flatWorld`'s hand-built states) any barbarian-player handling its tests need.

---

## Testing

- **Promotions:** XP awarded on attack/kill/defend (and suppressed past `xpVsBarbCap` vs barb/city); thresholds yield pending slots; `CHOOSE_PROMOTION` validation (class gate, prereqs, dup, no pending) + effects on `attackStrength`/`defenseStrength` (and movement/medic/march/ignoreZoc); AI auto-pick.
- **Zone-of-control:** moving adjacent to an at-war enemy military unit zeroes moves and stops; a unit already adjacent at turn start attacks normally; `commando` is exempt; a civilian is also halted.
- **Barbarians:** the faction is appended and at war with all; a camp is placed (deterministically) with a defender; spawning is deterministic and capped; occupying a camp tile clears it → bounty + XP + event; **the exclusions** — a cityless barbarian is NOT eliminated, the sole non-barb survivor still wins a conquest victory, and the barbarian is not a culture/score rival or a diplomacy target.
- **Content/ruleset:** promotions cross-validate (class gates are valid `UnitClass`es, `requires` resolve); the `barbarians` CivDef validates.
- **Self-play:** over a game, barbarians spawn/raid and get cleared, promotions are earned, the game still reaches a verdict, and the log **replays bit-identically**. Telemetry gains promotions-earned / camps-remaining columns.
- **Replay:** the new action + barbarian turns + RNG-driven spawning replay deterministically.

---

## Non-goals (deferred to the map/world track)

- **No naval / embark** — the world stays land-only (the single biggest deferred change).
- **No rivers, no natural wonders, no city-states.**
- **Soft ZoC only** (no strict "can't move ZoC-to-ZoC" variant).
- Camps **don't respawn** after map-gen, and barbarian units follow a fixed era schedule (no escalating barbarian tech tree).
- **No great-general/leader units**, no promotion effects beyond the catalog vocabulary, **minimal/no new unit classes** (depth comes from promotions on the existing rich roster).
- Barbarians never found cities or conduct diplomacy.

---

## Phase plan (for `writing-plans`) — ~7 phases

1. **Promotions data + XP + combat bonuses** — `PromotionEffect`/`PromotionDef` + catalog + `settings.combat`; `Unit.xp`/`promotions`; XP awards in `combat.ts`; `promotionBonus` in the strength functions; `promotionSlots`/`pendingPromotions`/`availablePromotions` selectors. Schema → 6.
2. **`CHOOSE_PROMOTION` + turn effects + AI pick** — the action (validate/reducer); `beginTurn` movement + medic/march healing from promotions; AI auto-pick step in `decide`.
3. **Zone-of-control** — `executeMovePath` ZoC halt + `ignoreZoc` exemption.
4. **Barbarian faction + camps** — `Player.barbarian`, `barbarians` CivDef, `state.camps`/`nextCampId`, `initialState` append + war-relations + deterministic camp placement (+ defenders); `beginTurn` spawning; camp clearing + bounty in `executeMovePath`.
5. **Barbarian AI + exclusions** — `src/ai/barbarian.ts`; `decide` routing; the victory/elimination/diplomacy/considerWar exclusions via `isBarbarian`.
6. **UI** — UnitPanel XP bar + promotion picker; camp/barbarian rendering; toasts; debug hooks.
7. **Balance & holistic** — tune XP/thresholds/spawn cadence/bounty via self-play telemetry; reachability + replay assertions (barbs spawn/cleared, promotions earned, verdict reached, exclusions hold); final holistic review; finish the branch.
