# ALVORADA — Architecture Plan

A browser-based, single-player 4X turn-based strategy game in the spirit of Civilization.
"Alvorada" — Portuguese for *daybreak* — the dawn of a people, from first settler to empire.

This document is the engineering contract for the project. Three priorities override
convenience everywhere; when a shortcut conflicts with one of them, the shortcut loses.

1. **Data-driven extensibility.** Content (terrain, units, techs, buildings, resources,
   improvements, civs) is data, not code. Adding content means adding a definition;
   adding a *system* (diplomacy, religion, eras) means a new state slice + actions +
   handlers, not a refactor of the core.
2. **Multiplayer-ready, local for v1.** No netcode now, but the engine is a pure,
   deterministic, serializable action/reducer machine that could run authoritatively on
   a server with zero rewrite. Nothing in engine or state assumes a single local player.
3. **Beautiful as a requirement.** See DESIGN.md. The renderer and UI get the same
   engineering seriousness as the engine.

---

## 1. Stack

| Choice | What | Why |
|---|---|---|
| Language | TypeScript (strict) | Type-checked state shape and action union are the backbone of a reducer engine. |
| Build | Vite | Instant dev loop, trivial static deploy. |
| Map rendering | **Canvas 2D**, layered offscreen canvases | We want a *crafted, textured* look: per-tile color jitter, procedural terrain art, feathered parchment fog. Canvas gives pixel-level control with zero asset pipeline. DOM/SVG per-hex (~1,300 nodes × layers) gets janky on pan/zoom and fights the painterly look; WebGL is overkill for ~1,300 tiles and would tax the "crafted" goal (shaders for parchment edges cost far more effort than 2D compositing). Canvas redraws a culled viewport at 60fps trivially at this scale. |
| UI panels | React 19 (DOM overlay) | Panels (city, tech tree, production chooser) are deeply stateful trees — React's sweet spot. The map canvas is one React-managed `<canvas>` whose internals React never touches. |
| Engine state | Plain JSON objects + **Immer** in the reducer | Readable immutable updates, structural sharing (cheap re-render checks), works identically in Node for a future server. |
| Tests | Vitest | Engine and AI are pure functions — perfect unit-test material. Self-play simulation doubles as a balance harness. |
| Fonts | `@fontsource/*` (bundled) | Deterministic builds, no CDN dependency, works offline. |

No state-management library: the store is ~40 lines around `useSyncExternalStore`.
No CSS framework: the visual identity is bespoke (DESIGN.md); utility frameworks pull
toward the generic dashboard look we're explicitly avoiding.

---

## 2. Layering (the hard rule)

```
src/
  data/      Ruleset definitions (pure data + def types). Imports: nothing.
  engine/    Pure game logic. Imports: data types only. NO DOM, NO React, NO Date/random.
  ai/        Decision module. Imports: engine (read-only selectors + action types), data.
  app/       Driver: owns the action log, applies actions, schedules AI turns, save/load.
  ui/        React components + canvas renderer. Imports: app, engine selectors, data.
```

- `engine/` is the future server. It must run in Node untouched.
- `ai/` is a *client* of the engine: it reads state and emits the same `Action` objects a
  human emits. It never mutates state and never uses hidden information (fair AI).
- `ui/` renders state and emits actions. It can be deleted and rebuilt without touching
  game rules — that separation is what makes a future networked client cheap.

## 3. The engine: state, actions, determinism

### 3.1 GameState (all serializable JSON)

```ts
GameState {
  schema: 1                       // save-format version
  rulesetId: 'standard'
  config: GameConfig              // seed, map size, players spec, victory settings
  seed, rngState: number          // mulberry32 state lives IN the state
  turn: number                    // 1-based round
  currentPlayer: PlayerId         // whose turn it is (sequential turns, Civ-style)
  phase: 'playing' | 'ended'
  mapW, mapH: number
  tiles: Tile[]                   // flat array, odd-r offset rows; axial math in hex.ts
  players: Player[]               // techs, research, gold, controller tag, alive flag
  relations: Relation[][]         // 'peace' | 'war' symmetric matrix (diplomacy seed)
  units: Record<UnitId, Unit>     // hp, moves, stance, persistent order (goto/build)
  cities: Record<CityId, City>    // pop, food, production, buildings, culture, hp
  visibility: number[][]          // per player, per tile: 0 unseen / 1 explored / 2 visible
  nextUnitId, nextCityId, eventSeq: number
  events: GameEvent[]             // bounded ring of notifications (audience-tagged)
  winner: { player, victory: 'conquest' | 'score' } | null
}
```

Design notes:
- `Tile = { terrain, elevation, feature, resource, improvement, ownerCity }` — all ids
  into the ruleset; `ownerCity` makes territory a derived-from-one-place fact.
- `controller: 'human' | 'ai'` on Player is *setup* data the driver uses; the engine
  never branches on it. Human and AI submit identical actions through identical
  validation — which is exactly the server-authoritative posture.
- Events are how the engine talks to UIs without coupling: appended in the reducer,
  audience-tagged (`player: id | null` for all), consumed by sequence number.

### 3.2 Actions

```
FOUND_CITY | MOVE_UNIT(path) | ATTACK | RANGED_ATTACK | BUILD_IMPROVEMENT | FORTIFY |
SKIP_UNIT | DISBAND | SET_PRODUCTION | BUY_ITEM | SET_RESEARCH | DECLARE_WAR | END_TURN
```

Every action carries `player: PlayerId`. The pipeline is:

```
validate(state, action) -> ok | { error }     // pure; the future server's gatekeeper
reduce(state, action)   -> nextState          // Immer produce; throws only on engine bugs
```

- `MOVE_UNIT` carries an explicit tile path (not just a destination): the server-to-be
  validates each step, and replays don't depend on pathfinder version. Unspent path is
  stored on the unit as a `goto` order and auto-continued on later turns.
- `END_TURN` advances `currentPlayer` and runs the *next* player's turn-start processing
  inside the reducer (healing, orders, city yields/growth/production, science, culture,
  borders, visibility, victory checks) in a documented, sorted order — see §3.4.
- There is no hidden tick anywhere: **state' = reduce(state, action), nothing else.**

### 3.3 Determinism contract

The game must replay bit-identically from `(config, actions[])` — that's what makes
saves trivial, bugs reproducible, and a future authoritative server possible.

1. All randomness flows through `rngState` (mulberry32) stored in state; map generation
   derives from `seed` alone.
2. Engine math is integer or exact-IEEE only: `+ - * /`, `Math.sqrt`, `Math.floor`.
   **No `Math.exp/pow/sin`** (transcendentals aren't bit-specified cross-platform —
   a Node server and a browser client must agree). Combat is a linear formula (§6).
3. Every iteration over a Record sorts keys numerically first.
4. Pathfinding tie-breaks are total (f, then h, then tile index).
5. The AI is a pure function of (state, playerId) — deterministic tie-breaks, no RNG, no
   memory outside state. Same state in, same action out, forever.
6. `Date`, `performance.now`, `Math.random` are banned from engine and ai. (UI uses them
   freely for animation.)

A replay test (§10) enforces this every run.

### 3.4 Turn-start processing order (normative)

When a player's turn begins, in this exact order:
1. Units (sorted by id): reset moves; heal if `!actedLastTurn` (+10 own territory, +5
   neutral/enemy, +20 in own city, cap 100); tick worker build orders; auto-continue
   goto orders (re-path with current knowledge; cancel + event if blocked).
2. Cities (sorted by id): auto-assign worked tiles (pop best-yield tiles, deterministic
   scoring); accumulate food/production/gold/science/culture; production completion
   (spawn unit / add building + event, or prompt if queue empty); growth/starvation;
   city HP regen (+15, cap); culture border expansion (cheapest unowned tile in radius 3,
   quadratic threshold `10 + 8n + 2n²`).
3. Player: science into current research; tech completion (event; unlocks live purely in
   defs); gold accrual.
4. Recompute that player's visibility (union of unit/city sight; +1 range on hills).
5. Victory evaluation (also evaluated on every city capture): conquest = last empire
   standing (a player with no cities and no settlers is eliminated); score = threshold
   reached, or highest score at the turn limit.

## 4. Data-driven ruleset

`src/data/standard/` exports one `Ruleset` object; the engine receives it everywhere as
a parameter (`ctx = { rules }`), never imports content directly.

```ts
TerrainDef     { id, name, yields, moveCost, defenseBonus, art: { fill, accent } }
ElevationDef   { id, yields(delta), moveCostDelta, defenseBonus, impassable?, sightBonus? }
FeatureDef     { id, name, yields(delta), moveCostDelta, defenseBonus, removable? }
ResourceDef    { id, name, kind: 'bonus'|'strategic', yields(delta), revealedBy?: techId,
                 improvedBy: improvementId, spawn: { terrains, features?, weight } }
ImprovementDef { id, name, turns, yields(delta), validTerrains?, validElevations?,
                 requiresResource?, clearsFeature?, requiresTech }
UnitDef        { id, name, cost, moves, sight, strength, ranged?: {strength, range},
                 class: 'civilian'|'melee'|'ranged'|'mounted'|'siege',
                 abilities: ('foundCity'|'improve')[], bonuses?: [{vsClass, pct}],
                 requiresTech?, requiresResource?, art: { glyph } }
BuildingDef    { id, name, cost, yields, perPop?: {yield, per}, defense?: {strength},
                 requiresTech, art: { glyph } }
TechDef        { id, name, era, cost, prereqs: techId[], pos: {col, row} }  // tree layout is data
CivDef         { id, name, leader, color, cityNames: string[] }
Settings       { workRadius, cityMinDist, growth/combat/score constants, victory: {...} }
```

Key property: **unlocks are reverse-derived** — a unit says `requiresTech: 'archery'`;
the tech panel and AI compute "what does Archery unlock" by scanning defs. Adding a
unit never touches the tech tree code.

`data/validate.ts` cross-checks every id reference at startup (and in a test): broken
content fails loudly, immediately.

### Extension points (how future systems land)

| Future feature | What it takes — and what v1 already provides |
|---|---|
| New unit/building/tech/terrain/resource/civ | Add one def object. Engine/UI/AI pick it up via defs + reverse-derived unlocks. Art = palette fill + glyph id (procedural). |
| Diplomacy | `relations` matrix already exists ('peace'/'war', `DECLARE_WAR` action). Add states (treaties, deals), a `ProposeDeal` action family, and an AI evaluator. No core refactor: it's a state slice + actions, the pattern every system follows. |
| More eras | `TechDef.era` is an ordered label today. Add era defs + per-era unit upgrades (`upgradesTo` on UnitDef) and obsolescence (`obsoletedBy`). |
| Rivers | Edge-based data on Tile (`riverEdges: bitmask`), a yields/defense hook in tile-yield + combat selectors, and a renderer pass. Confined by design to those three sites. |
| Naval / embark | `domain` field exists on UnitDef; movement validation reads passability from defs. Add 'sea' domain + embark action. Map gen already guarantees same-continent starts so v1 is honest without boats. |
| Religion/culture systems | New state slice + yields already flow through one `cityYields` selector — new yield types are added in one type + that selector. |
| City work micromanagement | Worked tiles are computed by one pure `assignWorkedTiles` function; a `SET_TILE_FOCUS` action overriding it is additive. |
| Production queues | `city.production` is a single slot v1; widen to an array + same validation. |
| Multiplayer | §9. The big-ticket items (serializable state, action protocol, validation, determinism, no-local-player assumption) are done from commit one. |
| Mods / second ruleset | `rulesetId` in state; `Ruleset` is one object — ship an alternate folder. |

## 5. Map generation (seeded, in-engine)

1. Fractal value noise (4 octaves, integer-hash based — no trig) for elevation;
   radial falloff toward map edges → one major continent, ~40% land, ocean border.
2. Latitude bands + moisture noise → terrain (snow/tundra/grassland/plains/desert);
   high elevation → hills (top ~14%) / mountains (~4%, impassable).
3. Coast = water adjacent to land. Features: forest (temperate+wet), jungle (hot+wet),
   oasis (desert, rare). 
4. Resources by per-def spawn tables; then a fairness pass guarantees ≥2 horses and
   ≥2 iron within radius 4 of each start.
5. Starts: all on the largest landmass, pairwise distance maximized, candidate tiles
   scored by surrounding yields; bounded deterministic retries (seed+attempt) if the
   continent can't fit everyone. Each player starts with settler + warrior.

## 6. Combat (simple, readable, deterministic)

- Effective strength = `floor(strength × (50 + hp/2) / 100)` (a wounded unit fights at
  50–100%), plus flat situational bonuses **from defs**: terrain defense, elevation,
  feature, fortified +4, class bonuses (spear vs mounted), siege vs cities.
- Damage: `clamp(30 + 2×(attEff − defEff), 8, 64)`. Melee: both sides take their
  formula's damage. Ranged: defender only, no retaliation, min city HP 1 (ranged can't
  capture).
- Cities: `strength = 6 + pop + walls + 4 if garrisoned`, HP 200. Melee kill = capture:
  pop −25%, walls razed, production cleared, tiles & buildings transfer; garrison dies.
- One military + one civilian per tile (Civ V rule); moving onto an enemy civilian
  captures it (settler converts to worker). Attacking at peace is invalid — the UI
  offers "declare war & attack", the AI declares explicitly.

## 7. Cities & economy

- Yields per tile = terrain + elevation + feature + resource (if revealed by tech) +
  improvement — pure data sum, one selector.
- A city of pop N works its center free + N auto-assigned best tiles within radius 2 of
  its territory. Food surplus after `2×pop` consumption fills a Civ-style bucket
  (`15 + 8(p−1) + floor((p−1)·√(p−1))`); deficit shrinks. Production builds one item;
  gold can rush-buy at 4× remaining cost. Science: palace +2, +1 per 2 pop, library.
  Culture expands borders (§3.4). Strategic resources gate units: each living unit
  consumes one improved source; capture shifts the pool.

## 8. AI (deterministic, explainable, fair)

`ai/decide(state, playerId) -> { action, reason } | null` — called repeatedly by the
driver until it returns `END_TURN`. One action per call, recomputed from fresh state, so
the AI is interruptible, replayable, and testable. Subsystems, in priority order:

1. **Research** — scored priority rules (needs resource tech? threatened → military
   tech? behind in science → economy) with reason strings.
2. **City production** — rule chain: garrison gap → settler (while good spots known &
   not threatened) → worker (improvable tiles per worker) → military (power < 0.8× of a
   known hostile neighbor) → building priority list.
3. **Units** — settlers go to the best *known* spot (uses its own fog: the AI only acts
   on tiles its civ has explored — fair AI); workers improve the highest-value owned
   tile; scouts frontier-seek; military garrisons cities, masses at a staging city when
   a war target is chosen (known force ≥ 1.5× estimated defense), then sieges: ranged
   bombards, melee takes the kill.
4. **War declaration** — power ratio + proximity + score pressure, with a stated reason.

Every decision's `reason` is surfaced in a dev drawer in the UI ("explainable") and in
sim logs. Stuck-guards: driver caps actions/turn and force-ends; tests assert the cap
is never hit in 200-turn self-play.

## 9. Multiplayer-readiness strategy (build now, wire later)

Done in v1 (the expensive-to-retrofit parts):
- State = JSON; game = `init(config) ⊕ actions[]`; replay is bit-identical (§3.3).
- All mutations through `validate` + `reduce`, both pure — the exact functions a server
  runs. Actions carry `player` and are rejected out-of-turn.
- Engine treats every player identically (AI vs human is a driver concern).
- The UI reads through a `viewingPlayer` lens (fog, panels) — hot-seat is a config flag,
  a networked client is "viewingPlayer = my id".

Later (the deliberately deferred parts): a thin server holding `GameState`, accepting
`Action` per connection, validating, broadcasting accepted actions (clients re-reduce —
determinism makes state sync free); fog-filtered state snapshots for join-in-progress
(serialize-per-viewer hook); session links + reconnect. None of this touches `engine/`.

## 10. Testing

- **Unit**: hex math, RNG, noise stability, pathfinding ties, combat table, growth and
  border thresholds, validation (tech/resource gating, illegal moves), capture rules.
- **Map gen**: same seed ⇒ same map (hash); starts on one continent, min spacing,
  strategic-resource guarantee.
- **Replay**: scripted + AI self-play games re-applied from the log ⇒ deep-equal state.
- **Self-play fuzz**: 4 AIs, 200 turns × several seeds: only legal actions, no stuck
  turns, cities founded, techs researched, someone wins by the limit ⇒ also doubles as
  the balance smoke harness (prints a milestone table).
- **Data**: every ruleset reference resolves; every def renders (art ids known).

## 11. Milestones (≈ one commit each)

1. Scaffold + PLAN/DESIGN. 
2. Engine core: hex math, RNG, types, serialization helpers.
3. Standard ruleset data + validation.
4. Map generation + visibility.
5. Movement, pathfinding, found-city, turn skeleton.
6. Cities: yields, growth, production, buy, culture borders.
7. Research + gating (tech/resource).
8. Combat, war, capture, civilian capture.
9. Turn processing, victory, score, events, replay test.
10. AI + self-play harness.
11. App driver + store + canvas terrain renderer + camera.
12. Fog, units, cities, selection, movement UX, animations.
13. HUD panels: top bar, unit, city, production/research choosers.
14. Tech tree overlay, notifications, menus, save/load.
15. Balance pass via sim, visual polish, README.

Cut lines if needed (in order): AI log drawer, minimap, buy action, catapult — never the
determinism contract, the data-driven defs, or the design language.
