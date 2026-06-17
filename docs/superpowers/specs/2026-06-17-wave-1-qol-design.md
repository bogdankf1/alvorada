# Wave 1 — QoL & Feel — Design

*2026-06-17. First wave of fixes from the hands-on testing rounds
(`docs/2026-06-17-testing-feedback.md`). Five small, low-risk items chosen for momentum:
a happiness rebalance, two UI legibility touches, automatic unit cycling, and a Sleep order.*

## Scope

In: **A** happiness (drop settler block + free-pop buffer) · **B** worker build indicator ·
**C** promotion tooltips · **E** auto-advance to next idle unit · **F** Sleep order.

Out (later waves / own specs): buy-tiles-with-gold, audio, roads, naval, modern-era tech
tree, merge-adjacent-improvements. Keyboard shortcuts (batch-1 #2) are **already shipped**
(`GameScreen.tsx:23`) — the only addition here is a Sleep keybind under **F**.

## Constraints (unchanged project rules)

- **Determinism:** no `Math.random`/`Date`/transcendentals in engine/ai; all sorted
  iteration. None of these items introduce randomness. Sleep's enemy-wake is a deterministic
  sight check at turn start.
- **Layering:** A & F touch `data`/`engine`; B, C, E are `ui`/`app` only. UI never imports `src/ai`.
- **Data-driven:** the happiness buffer is a `Settings` value, not a literal in logic.
- **Schema:** bump `SCHEMA_VERSION` 8 → 9 (`serialize.ts:7`). Old autosaves drop — A changes
  balance (replay diverges) and F adds a new `Stance` value old code can't read.
- **2D canvas only.**

---

## A · Happiness: remove settler block, add free-pop buffer

**Today.** Happiness is empire-wide: `net = happy − unhappy` (`selectors.ts:365`).
`unhappy = cities·perCity + Σ pop·perPop + occupied`. Tiers: `net≥0` content · `net<0` unhappy
· `net≤−10` very-unhappy (−33% prod, growth ÷3). Two pain points reported:

1. `selectors.ts:510` hard-blocks building any `foundCity` unit when `net < 0`.
2. Every citizen costs 1 unhappiness (`perPop:1`), so growth feels punished 1:1 from pop 1.

**Change.**
- **Remove the settler block:** delete the `empireHappiness(...).net < 0` guard at
  `selectors.ts:510-511`. Keep the `city.pop < 2` requirement. Soft brakes (prod penalty,
  slowed growth at the unhappy tiers) remain as the only expansion friction.
- **Free-pop buffer:** add `freePopPerCity: number` to `HappinessSettings`
  (`data/types.ts:230`), value **3** in `data/standard/index.ts`. In `empireHappiness`
  change `unhappy += c.pop * h.perPop` →
  `unhappy += Math.max(0, c.pop - h.freePopPerCity) * h.perPop`. Mirror the same `max(0, …)`
  in `happinessBreakdown()` (`selectors.ts:395`) so the itemized UI stays exact.

**Why keep per-pop at all:** it's the load-bearing brake that gives luxuries, colosseums,
and happiness civics/beliefs their purpose. The buffer softens early growth without gutting
those systems; removing per-pop entirely was rejected.

**Tests.** Unit test: a size-3 city contributes 0 pop-unhappiness, a size-5 city contributes
2. Test that a settler is buildable while `net < 0` (was previously blocked). Re-tune the
self-play seeds so replay stays bit-identical (as in the event-deck commit).

---

## B · Worker "building…" indicator

**Today.** A worker mid-build carries `order:{ kind:'build', improvement, turnsLeft }`
(`types.ts:28`); the tile's `improvement` stays null until `turnsLeft` hits 0
(`turn.ts:68`). Nothing is drawn, so an in-progress tile looks idle.

**Change (UI only).** In the map renderer (`ui/map/renderer.ts`), for any friendly unit whose
`order.kind === 'build'`, draw a small badge on its tile: the target improvement's glyph plus
`turnsLeft` (e.g. ⛏2), styled to match the existing brass/parchment iconography. No engine
or data change — read straight from unit state already in `gameCtx`.

**Tests.** Lightweight: a render-layer helper that, given units, returns the set of
{tile, improvement, turnsLeft} badges to draw; unit-test that selection logic.

---

## C · Promotion tooltips

**Today.** Promotions (`data/standard/promotions.ts`) carry only a structured `effect`
(e.g. `{ defensePct: 33 }`, `{ vsClassPct:{class:'mounted',pct:33} }`) and a `classes`
list — **no description text**. `UnitPanel.tsx` lists earned promotions as bare chips.

**Change (UI only).** Add one pure formatter `effectText(effect): string[]` (e.g. in
`ui/icons.tsx` or a small `ui/promotions.ts`) mapping each effect key to prose
("+33% defense", "+33% vs mounted", "Heals 10 HP/turn", "+1 movement", "Ignores zone of
control"). Render a hover card on each promotion chip in `UnitPanel` showing the name, the
formatted effect lines, and the applicable unit classes. Single source of truth = the
`effect` object, so no description-string drift. This is the promotions slice of roadmap #5
(tooltips); other node types are out of scope for Wave 1.

**Tests.** Unit-test `effectText()` for each effect shape used in the catalog.

---

## E · Auto-advance to the next idle unit

**Today.** `selectNextIdleUnit()` + `idleUnits()` exist (`actions.ts:94-112`).
`idleUnits = playerUnits.filter(moves>0 && !acted && !order && stance!=='fortified')`.
Cycling only happens when the player presses `N` or hits End-Turn — never automatically after
finishing a unit.

**Change (UI/app only).** After a successful unit-affecting dispatch, if the acting unit is no
longer in `idleUnits()`, call `selectNextIdleUnit()`. Implement once: in `humanDispatch`
(`actions.ts:10`), gate on `'unit' in action && res.ok`, then check whether
`game.units[action.unit]` is still idle; if not, auto-advance. This covers map-clicks, panel
buttons, and keys uniformly. Default ON (explicitly requested). A future opt-out setting is
noted but not built.

This fires for **Skip, Fortify, and Sleep too** (each carries `unit` and leaves the unit
non-idle), giving the satisfying "park this one → jump straight to the next" loop.

**Edge cases.** A unit that moved but still has moves becomes `acted:true` → no longer idle →
auto-advances (matches the existing `idleUnits` definition and standard 4X "next unit"
behavior). When no idle units remain, selection simply clears (no advance).

**Tests.** Unit-test the "still idle?" predicate against: moved unit, skipped unit, fortified
unit, sleeping unit, unit with moves remaining but acted.

---

## F · Sleep order (the one new mechanic)

**Today.** `Stance = 'none' | 'fortified' | 'skipped'` (`types.ts:30`); `'skipped'` is
**dead** (never set — `SKIP_UNIT` only zeroes `moves`, `reducer.ts:77`). Skip is therefore
one-turn (moves reset next `beginTurn`, `turn.ts:66`). Fortify is persistent but is a combat
stance — semantically wrong for a worker/settler/caravan, which is the unit class the player
wants to park.

**Change.**
- Add stance value `'sleep'` to `Stance` (leave the unused `'skipped'` in place — pre-existing
  dead code, not ours to remove).
- New action `{ type:'SLEEP_UNIT'; player; unit }` (`types.ts`), validated like `SKIP_UNIT`
  (own unit, my turn). Reducer: `stance='sleep'`, `moves=0`, `order=null`.
- **Persistence:** `beginTurn` already preserves `stance` (it never resets it). So `'sleep'`
  survives across turns. Exclude it from idle cycling: `idleUnits()` adds
  `&& u.stance !== 'sleep'`.
- **Wake conditions:**
  1. Issuing any order to the unit clears `stance` back to `'none'` (the existing
     MOVE/FORTIFY/SKIP/BUILD reducers should set `stance='none'` if it was `'sleep'`; a unit
     can also be explicitly woken via the panel/keybind, which clears the stance).
  2. **Enemy in sight:** at the start of the owner's turn (`beginTurn`), if any enemy military
     unit sits within the sleeping unit's sight, clear its sleep so it re-enters the idle
     cycle. Deterministic (reuses the same sight/visibility data), so replay stays identical.
- **UI:** a Sleep / Wake toggle button in `UnitPanel.tsx` (next to Skip/Fortify) and a
  keybind `Z` in `GameScreen.tsx`.

**Scope note.** Available to all units; aimed at civilians. No heal-based auto-wake in Wave 1
(irrelevant for civilians; military can fortify).

**Tests.** Reducer: SLEEP sets stance/moves; stance persists across `beginTurn`; a sleeping
unit is excluded from `idleUnits`; an order wakes it; an enemy entering sight wakes it at turn
start. Determinism: a self-play run with some units slept replays bit-identically.

---

## Decisions locked

1. `freePopPerCity = 3`.
2. Sleep auto-wakes on an enemy military unit entering sight (checked at `beginTurn`).
3. Auto-advance is on by default; no toggle in Wave 1.
4. Sleep keybind = `Z`.

## Out of scope (explicit)

Buy-tiles-with-gold · audio (SFX/music/mute) · roads · naval/embarkation · modern-era tech
tree · merge-adjacent-improvements. Tracked in `docs/2026-06-17-testing-feedback.md`.
