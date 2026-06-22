# Alvorada — Testing Feedback & Fix/Add List

*Started 2026-06-17. Running list captured during hands-on testing rounds. Each item is
triaged against `docs/2026-06-15-audit-and-roadmap.md`:*

- 🟢 **NEW** — not in the roadmap
- 🔵 **OVERLAPS #N** — matches an open roadmap item
- ✅ **ALREADY WORKS / DONE** — no change needed (or already shipped)
- 🟠 **CAUTION** — in the roadmap but deliberately de-prioritized; cost/leverage flag

Status: `open` until scoped → planned → done.

---

## ✅ Wave 1 — SHIPPED (2026-06-17, branch `wave-1-qol`)

Implemented via spec→plan→subagent-driven execution (208→220 tests green, self-play
determinism intact, schema 8→9):
- **A — Happiness:** removed the settler-while-unhappy block; added `freePopPerCity: 3`
  buffer (a city's first 3 pop cost no unhappiness). [batch-2 happiness questions]
- **B — Worker build indicator:** brass ⛏-turn badge on units mid-improvement. [batch-2 #2]
- **C — Promotion tooltips:** `effectText()` → hover titles on promotion chips + choose
  buttons. [batch-2 #3]
- **E — Auto-advance:** selection jumps to the next idle unit after a unit acts; shared
  `unitNeedsOrders` predicate. [batch-1 #6]
- **F — Sleep order:** persistent `'sleep'` stance + `SLEEP_UNIT` toggle (panel button,
  `Z` key, asleep marker), excluded from idle cycling, wakes on order or enemy-in-sight.
  [batch-2 #8; keyboard from batch-1 #2 was already shipped]

Out of scope / still open below: buy-tiles-with-gold, audio, roads, naval, modern-era tech
tree, merge-adjacent-improvements.

---

## ✅ Wave 2 — SHIPPED (2026-06-17, merged to `main` locally)

228 tests green, determinism intact, **no schema bump**:
- **Audio** — `src/ui/audio/` synth SFX (Web Audio) + one ambient-music hook (`public/audio/ambient.mp3`,
  silently no-ops if absent) + two `localStorage` toggles (Sound effects / Music) in GameMenu. Wired via
  pure `actionSfx`/`eventSfx` maps (UI layer only). **You still need to drop an approved `ambient.mp3`** for
  music to play; SFX work now.
- **Buy-tiles** — `BUY_TILE` action: distance-based cost (`tilePurchase {baseCost:50, costPerRing:30,
  radius:3}`), gated to unowned tiles in range that touch your territory and that you can afford. City-view
  highlight (gold ring + cost, dim if unaffordable) + click-to-buy + gold hint. [batch-2 #4]
  - **Revisitable balance note:** buying a tile does NOT raise the city's culture-expansion threshold
    (`tilesClaimed` untouched) — a deliberate spec choice; mild asymmetry (gold-bought land doesn't slow
    culture growth). Watch in testing; one-line change if it should.

Still open below: roads, naval, modern-era tech tree, merge-adjacent-improvements.

---

## ✅ Roads — SHIPPED (2026-06-17, merged to `main` locally)

236 tests green, determinism intact, **schema 9→10**. Data-driven typed roads (built
extensible for future "modernized" tiers):
- **Road types as data** — `roads` table + `RoadDef {id,name,moveCost,turns,requiresTech?}`;
  `tile.road: string | null` (coexists with improvements/resources). Ships one basic `road`
  (free, 2 turns). A future `railroad` is just a new data entry.
- **Movement** — a `MOVE_SCALE = 2` rescale in code (`moveCostOf`/`beginTurn`/pathfinder
  fallback; data values untouched). Flat = 2, road = 1 → **2× on flat**; rough terrain
  (cost 4) + road 1 → **crosses fast**. Off-road reach bit-identical; only the marginal
  culture self-play seed re-tuned (924→938). [batch-2 #7]
- **Build** — `BUILD_ROAD` worker action + `road` order + turn-tick; "Build Road" button.
- **Render** — connected road segments drawn *under* resource/improvement icons; UnitPanel
  shows de-scaled moves ("2/2").

**Follow-ups (from the final review — revisitable):**
- **New units are half-mobile their first turn** — spawn/production set `moves = def.moves`
  (unscaled), so a freshly-created unit shows "1/2" and moves 1 tile its creation turn, then
  resets to full next turn. A rescale side-effect; fix = scale moves at the spawn sites
  (`state.ts`/`cities.ts`/`barbarians.ts`) — but that forces another self-play seed re-tune.
  Watch in testing; decide if worth a quick follow-up.
- Roads are buildable across **neutral land** (no own-border requirement) — intentional, but
  note it if future road pillaging/maintenance assumes ownership.

Still open below: naval, modern-era tech tree, merge-adjacent-improvements.

---

## ✅ Legibility — SHIPPED (2026-06-18, merged to `main` locally)

The roadmap's "contained" track (civilopedia deferred per the user). 240 tests green,
**UI-layer + two pure selectors only — no engine logic, no schema bump, no determinism risk:**
- **Victory-progress overlay** (`V`) — `victoryProgress` selector → four bars: conquest (rivals
  eliminated), science (% of the capstone's prereq-closure held), culture (influence vs the
  strongest rival's culture×factor), score (vs threshold + turn/limit). The finish line. [roadmap #6]
- **Demographics overlay** (`B`) — `demographics` selector → you vs **met** rivals across
  score/techs/gold/pop/military/culture; the end-game `VictoryOverlay` got the same metric columns.
- **Era ceremony** — full-screen card when you advance an era (UI hook on `currentEra`).
- **Milestone banners** — prominent centered banner for wonder-built / religion-founded.

Still open below: civilopedia (deferred), naval, modern-era tech tree, merge-adjacent-improvements.

---

## ✅ Naval — Combat Core (Spec 1 of 2) — SHIPPED (2026-06-18, merged to `main` locally)

The structural foundation for naval, coastal-first slice. 251 tests green, **schema 10→11**.
The roadmap's biggest deferred bet (#13), decomposed.
- **Sea domain** — `UnitDef.domain: 'land'|'sea'`; domain-aware movement (sea units → water only;
  land units → land only unless embarked). `isEmbarked`/`isCoastal`/`unitCanOccupy` helpers.
- **Embarkation** — a *deliberate* one-step move onto adjacent water, gated behind `bronze_working`;
  embarked = a land unit on a water tile (derived). Can't attack, defends at a fixed 5, destroyed
  if it loses. Land units never AUTO-route into the sea (keeps AI/determinism clean).
- **Naval units** — Galley (melee), Galleass + Frigate (ranged bombard), built in **coastal cities**
  only, spawned on adjacent water.
- **Coastal raiding** — ranged ships bombard coastal cities (no capture) / land / embarked units;
  land archers shoot ships back. Reuses the combat engine.
- **AI** — builds no naval, never embarks → land self-play byte-identical (only the marginal culture
  seed re-tuned 938→949; science 314 held).
- **UI** — embark-on-click + an embarked wave marker.

**Track C** (still deferred) — islands/multi-landmass map-gen + full naval AI.

## ✅ Naval — Sea Economy (Spec 2 of 2) — SHIPPED (2026-06-18, merged to `main` locally)

Closes the naval coastal-first bet. 258 tests green, **schema 11→12**, **re-tune-free** (both victory
seeds held — no re-seed). The brainstorm reframe: most "sea economy" already existed (coastal cities
already work claimed water tiles; `fish` already gives +2 food when revealed), so the slice shrank to
the improvement loop:
- **Work Boat** — sea-domain civilian, `improve` ability, coastal-only, gated `pottery`, reusable.
- **Fishing Boats** — improvement built only on a `fish` tile (`requiresResource`); `fish.bonusImproved`
  +1 food/+1 gold → improved fish-coast tile = food 4 / gold 2.
- **Harbor** — coastal-only building, gated `bronze_working`, +1 production per worked water tile.
- **Engine:** `BUILD_IMPROVEMENT` validate relaxed to elevation-only (Work Boats build on water; land
  Workers still can't); `BuildingDef.perWorkedWater`/`requiresCoastal`; `cityYields` water-tile bonus.
- **Determinism:** `src/ai` untouched — AI builds neither Work Boat (units picked by explicit id) nor
  Harbor (not in `buildingPriorityFor`), consistent with "defer naval AI to track C". Human-only this slice.

**Naval coastal-first bet COMPLETE (both specs).** Remaining naval = **Track C** (islands + naval AI).

## ✅ Track C — Islands Map-Gen (Spec A of 2) — SHIPPED (2026-06-18, merged to `main` locally)

Opt-in island maps. 264 tests green, **no schema bump** (config-only), **re-tune-free** (continents default + seeds 314/949 untouched). Decomposed Track C into **Spec A (islands map-gen, this)** + **Spec B (naval AI, next)**.
- **Opt-in `mapType: 'continents' | 'islands'`** (default continents) — the existing generator stays byte-identical behind the branch; new `generateIslandsMap` is fully separate.
- **Topology:** "continents + islands" — `K = max(2, round(players/2))` large landmasses (~2 civs each) from multi-center elevation falloff + scattered deep-ocean islets; starts distributed across the K largest components (`placeStartsIslands`, with the 8-attempt retry rejecting seeds that don't separate).
- **UI:** Continents/Islands toggle in the new-game menu.
- **Determinism dual-guard:** a continents-output regression fingerprint + the full self-play suite both prove the default world is unchanged. Island game is a *smoke* test (runs 40 turns legally + replays) — no victory-seed test until naval AI exists.

## ✅ Track C — Naval AI (Spec B of 2, "Presence & Expansion") — SHIPPED (2026-06-19, merged to `main` locally)

The AI now uses the sea on island maps. 275 tests green, **no schema bump**. User capped scope at **Presence & Expansion** (amphibious invasions deferred → Spec B2).
- **One engine change:** opt-in `findPath(…, { embark: true })` (default-off → byte-identical) so the AI can plan a land unit's first step onto water; everything after is the existing pathfinder + executor.
- **AI behaviors (all in `src/ai/`):** overseas settling (escorted, or at peace), coastal economy (builds Work Boats + Harbors, sails Work Boats to fish), need-gated warship production, naval combat (bombard/melee/escort) + sea exploration.
- **Bootstrap fix** (integration test caught it): the AI rarely founds coastal cities + naval need was too narrow → it never built galleys. Fixed with a high-priority "explorer galley" for established coastal cities + peacetime sea crossings. Overseas colonization now works on ~half of seeds (emergent); the behavioral test locks seed 23.
- **Determinism:** re-tuned only the culture seed (949→960); science (314) held; replays bit-identical.

**Track C "Presence" is complete — islands are a real, alive game** (AIs explore, colonize overseas, run coastal economies, skirmish at sea).

## ✅ Track C — Naval War (Spec B2 of 2) — SHIPPED (2026-06-19, merged to `main` locally) — NAVAL BET COMPLETE

Cross-water conquest + coastal reliability. 283 tests green, **no schema bump, no re-tune** (seeds 314/960 held).
- **Amphibious assault rule** (engine, tiny): an embarked melee unit may storm an adjacent land target, **disembarking onto it on capture** (the melee resolver already advances the attacker — no execution change). A new capability for the human too. −33% amphibious attack penalty (data-driven); embarked units still can't fight ships or bombard.
- **Coastal valuing** (AI): a `+6` coastal bonus in `knownGoodSpots` → the AI founds coastal cities → reliable naval bootstrapping.
- **Sea-invasion AI**: `campaignOrders` embarks a gathered army toward a sea-only enemy city; escort warships screen it; ship bombardment softens the city; the amphibious assault auto-fires via the existing `navalFight` once a unit is adjacent.
- **Determinism:** no re-tune — the rule is inert without embarked units (≈all continents play) and the invasion AI only fires on sea-only targets. Replays bit-identical.

**The whole naval arc is done** (combat-core → sea-economy → islands map-gen → naval AI → naval war): islands are a real game where the AI explores, colonizes overseas, runs coastal economies, and wages amphibious war. Across-water conquest is emergent (the behavioral test locks seed 960; same-landmass war is more common). **Lesson:** the review caught an unused-local that broke `tsc`/`npm run build` but not `npm test` — run the build, not just the tests, before declaring green.

Backlog remaining below: modern-era tech tree, merge-adjacent-improvements, civilopedia. **Naval follow-ups (revisitable, balance/playtest):** make islands the default map once playtested; raise across-water conquest/colonization reliability; carrier/air domain (never scoped).

---

## Batch 1 (2026-06-17)

### 1. Audio — sound effects + background music + settings mute toggle 🟢 NEW
- SFX for actions (move, attack, city found, tech/wonder complete, etc.) + light
  ambient background music. Settings option to mute (likely separate SFX / music toggles).
- **Layer:** UI/app only. **Hard constraint:** no audio calls in `src/engine` or `src/ai`
  — audio is driven from the UI reacting to state, so determinism/replay stays bit-identical.
- Open: does a settings panel already exist to host the toggle? (verify when scoping)
- Status: open

### 2. Keyboard shortcuts ✅ MOSTLY SHIPPED (→ Wave 1 adds Sleep key)
- Already wired in `GameScreen.tsx:23`: Enter=end turn, Space=skip, N=next idle, F=fortify,
  Esc=deselect, T/G/C/H=overlays. "skip on Space, submit on Enter" already works.
- Wave 1 only adds a `Z` = Sleep keybind (see #8 / spec item F).
- Status: Wave 1 (tiny add)

### 3. Ranged units "shoot across the tile" ✅ ALREADY WORKS
- Engine supports it: every ranged unit has `range: 2` (archer, composite/crossbow,
  catapult, trebuchet, bombard, Babylon `bowman`). `validate.ts:124` allows
  `1 ≤ dist ≤ range`; AI already fires at range 2 (`ai/decide.ts:330`).
- No engine change needed. If it *felt* broken in play, verify the **player-side targeting
  UI** lets you click a 2-tile-away enemy to fire. (verify in-app)
- Status: verify-in-app only

### 4. Naval units + embarkation for land units after a tech 🔵 OVERLAPS #13
- Roadmap #13 "Naval & rivers" (XL) — the biggest deferred bet.
- Note: map-gen currently guarantees same-continent starts, so naval needs map-gen work
  to matter.
- Status: open (large)

### 5. Extend tech tree through the modern era (~2020s) 🟠 CAUTION — OVERLAPS #17 + hole #1
- Roadmap §5 explicitly de-prioritizes more late-game eras: "a content treadmill that
  adds hours, not life. Lowest priority."
- Largest item on the list: 4 eras → ~Information era = new unit lines (firearms → tanks
  → aircraft → nukes), buildings, wonders, resources; pulls in naval + air domains.
- Doable, but opposite end of the effort/leverage curve from the rest of this batch.
  Decide deliberately.
- Status: open (XL) — needs an explicit go/no-go

### 6. Auto-cycle to next unit needing orders 🟡 PRIMITIVE EXISTS → Wave 1 makes it automatic
- `selectNextIdleUnit()` + `idleUnits()` already exist (`actions.ts:94`); today cycling only
  happens on `N` / End-Turn. Wave 1 makes it fire automatically after a unit finishes.
- Status: Wave 1 (spec item E)

---

## Batch 2 (2026-06-17)

### 1. Scouts faster than warriors ✅ ALREADY TRUE
- `scout` moves 3 vs `warrior` moves 2 (`src/data/standard/units.ts`). Ask is met.
- Optional: bump scout higher if we want it more pronounced.
- Status: no-op (optional tweak)

### 2. Worker "building" indicator on the tile 🟢 NEW (UI, small)
- Data already present: building worker has `order: { kind:'build', improvement, turnsLeft }`;
  tile `improvement` stays null until complete. Just needs a UI badge / progress pips.
- Status: open (small, UI-only)

### 3. Promotion hover explanations (Combat I, Cover…) 🔵 OVERLAPS #5 (Tooltips everywhere)
- #5 explicitly lists promotion nodes.
- Note: promotions have only structured `effect` (e.g. `{ defensePct: 33 }`), no `desc`
  text — render prose from effect, or add a description string per promotion.
- Status: open (folds into #5)

### 4. Buy tiles with gold in city view (radius-limited) 🟢 NEW (engine + UI)
- Today tiles claimed only via culture (`tilesClaimed` border expansion). New: gold action +
  validation (radius cap, ownership, cost) + city-view UI. Determinism-safe (no RNG).
- Status: open

### 5. "Barbarians don't move every turn — correct?" ✅ BY DESIGN
- `ai/barbarian.ts`: a barb only advances toward prey it can currently SEE (unit in sight, or
  known city). No visible target → `"barbarians rest"` → ends turn in place. Intentional, fair-fog.
- Optional: add idle wander/patrol to make them livelier (tuning, not a fix).
- Status: no-op (optional liveliness tweak)

### 6. "Do units heal by idling / fortifying?" ✅ YES, already works
- `engine/systems/turn.ts:62`: hp<100 heals each turn if `!acted` (or `healAlways` promo).
  Rates: city 20 / own 10 / neutral 5 / enemy 0; medic/march add more.
- Caveat: fortify gives NO extra heal over plain idle (healing = the "didn't act" gate). A
  "fortify heals faster" bonus would be a small tweak if wanted.
- Status: no-op (optional tweak)

### 7. Workers build roads → faster movement 🔵 OVERLAPS roads gap (#13 / map depth)
- Roads are a named roadmap gap (§1.2/§1.3). No `road` improvement in data today.
- New system: road improvement + movement-cost reduction in pathfinder + UI. Medium.
- Status: open (folds into roads/map-depth)

### 8. "Sleep" for non-combat units 🟢 NEW — half-exists
- `SKIP_UNIT` already exists (one-turn skip, `stance:'skipped'`, UnitPanel "Skip" button).
- New part: persistent Sleep (stays skipped across turns until healed / enemy appears / woken)
  — a new `UnitOrder` kind or persistent stance. Pairs with batch-1 #2 (keyboard) + #6 (auto-cycle).
- Status: open (small)

### 9. Merge 2–3 adjacent identical improvements into one "big" improvement 🟢 NEW — needs design
- Not in roadmap, not a standard 4X mechanic. Underspecified: what does the merged improvement
  DO (more yield? adjacency bonus?). Really an "improvement adjacency bonus" idea in disguise.
- Status: PARKED — needs a brainstorm/design pass before it's actionable.

---

## Batch 3 (2026-06-22 playtest — first islands/naval hands-on)

> **✅ BATCH 3 FULLY SHIPPED (2026-06-22, merged to `main` locally).**
> - **Wave 3 (UI/QoL)** — #3 (roads→city), #4 (specialists fix + tidy), #5 (remove-road), #6 (naval discoverability: Unavailable list + embark hint), #7 (split build menu). Spec/plan `…/2026-06-22-wave-3-ui-qol*`. 292 tests, re-tune-free.
> - **Content** — #1 **Lumber Mill** (new `requiresFeature` field on improvements; build on un-cleared forest for +2 production, gated `construction`) + #2 **Unit obsolescence** (new `obsoletedBy` tech field; superseded units leave the build menu, existing units unaffected; 14-unit catalog). Spec/plan `…/2026-06-22-batch3-content*`. 299 tests green, **NO re-tune** (seeds 314/960 held even with the lumber mill), no schema bump.

### 1. Lumber mill — harvest wood from an *un-cleared* forest 🟢 NEW
- If a worker does NOT chop a forest tile, allow building a "lumber mill"-type improvement on it (prepare wood / +production); if the forest is already cleared, it's not buildable. Maybe tech-gated.
- **Code reality:** improvements have `validTerrains`/`validElevations` + `clearsFeature` (the chop), but **no `requiresFeature`/`validFeatures`** field — so "improvement that REQUIRES the forest to remain" isn't expressible yet. Needs: new `requiresFeature` (or `validFeatures`) on `ImprovementDef` + a `lumber_mill` improvement (valid on `forest`) + render case. Determinism: AI's `bestWorkerJob` would use it → re-tune likely.
- Status: open (small-medium, needs a design pass on yields/tech gate)

### 2. Unit obsolescence — stop offering archers once cannons exist 🟢 NEW (AI already half-handles it)
- Don't build/show obsolete units once a successor exists (archer→… , catapult→…).
- **Code reality:** no `obsoletedBy` field anywhere. The AI's `bestMilitary` already picks the STRONGEST available, so the AI rarely builds archers when it has better — but it's by strength, not formal obsolescence, and the **human's production list still shows everything**. Needs: `obsoletedBy: techId` (or successor unit) on `UnitDef` → hide/disable in the picker + skip in AI. Determinism: changes production/AI → re-tune. Pairs with #7.
- Status: open (medium)

### 3. Roads should visually connect to the adjacent city 🟢 NEW (renderer-only)
- A road on a tile next to a city should render as joined to the city center (looks connected).
- **Code reality:** the renderer draws road segments only between tiles that BOTH have a road (renderer.ts ~396-407); the city tile isn't a "road", so adjacent roads stop short. Fix = draw a stub from a road tile to an adjacent owned city center. Pure UI, no determinism impact. Small.
- Side note: user found you CAN build improvements on a city tile — flag separately, is that intended? (minor; the city center already yields its own tile — probably harmless, low priority to block.)
- Status: open (small)

### 4. Specialists +/− does nothing, and the row is cramped 🔴 BUG + 🟡 UI [screenshot]
- **Root-caused.** Two problems: (a) **functional** — clicking `−` to 0 dispatches `SET_SPECIALISTS count=0`, but the reducer treats `count<=0` as "UNPIN" (deletes the forced pin), and `allocateCitizens` then GREEDILY re-assigns the specialist (the merchant slot out-yields the free tile), so it snaps back → looks inert. You **cannot force a specialist OFF**. The `+` at 1/1 is correctly disabled (at max). Fixing it needs a small model change: a pin of 0 must mean "force zero" (a real pin), AND the greedy fill must skip a slot that's pinned (not re-add it). (b) **layout** — "Merchant1/1 [−][+]" is cramped/overlapping (no spacing, unclear). Needs CSS + clearer affordance.
- Status: open (medium — the most broken thing here; HIGH priority)

### 5. Remove-road option 🟢 NEW (small)
- Let a worker remove a road from a tile. Needs a `REMOVE_ROAD` action + worker order/button (mirror `BUILD_ROAD`). AI won't use it → minimal determinism impact. Small.
- Status: open (small)

### 6. Naval discoverability — "how do I build a ship / cross the sea?" ❓ANSWERED + 🟢 NEW (UX gap)
- **Answer:** a **Galley** needs **Bronze Working** researched AND a **coastal city** (founded next to water); **embarking** land units across the sea also unlocks at **Bronze Working** — then click a land unit and move it onto an adjacent sea tile.
- **The real signal:** the player we built naval FOR couldn't find this → a discoverability gap. Needs: surface *why* a unit isn't buildable ("needs a coastal city"), an embark hint, and/or a reference (overlaps the deferred **Civilopedia**). 
- Status: open (UX — pairs with Civilopedia)

### 7. Separate Units and Buildings in the build menu 🟢 NEW (UI)
- The production picker is a **flat list** (units + buildings mixed). Group it into Units / Buildings sections for easier scanning. Pure UI, small. Pairs with #2.
- Status: open (small)

---

*Next batches appended below as testing continues.*
