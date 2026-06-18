# Legibility — Design (victory-progress · era ceremony · milestone banners · demographics)

*2026-06-18. The roadmap's "contained" track, trimmed: make the existing depth legible and
give the game a finish line and ceremony. Civilopedia is deliberately deferred.*

## Scope

In: **(1)** a victory-progress overlay, **(2)** a full-screen era ceremony, **(3)** prominent
milestone banners for wonders & religions, **(4)** a demographics overlay + an end-game recap.

Out (deferred): civilopedia/in-game reference; tooltips (already shipped in Wave 1).

## Constraints — the cleanest possible track

- **UI-layer only + two pure read-model selectors.** Everything lives in `src/ui/`, plus
  `victoryProgress` and `demographics` added to `src/engine/selectors.ts` (pure functions of
  `(ctx, state, pid)`). **No engine behavior change, no `Action`, no schema bump, no RNG, no
  AI/self-play impact** (so no seed re-tune; existing suite stays green).
- Era-advance is detected in the UI (a hook on the existing `currentEra` selector) — no engine
  event needed.
- Layering: UI never imports `src/ai`. Selectors are pure.

## Decisions locked

1. Era advance → a dismissable **full-screen ceremony card**.
2. Prominent **banners for wonders + religions**; all other events stay as today's toasts.
3. Demographics covers **met** rivals only; metrics = score / science / gold / population /
   military power / influence.
4. No civilopedia.

---

## 1 · Victory-progress overlay

**Selector** `victoryProgress(ctx, state, pid): VictoryPath[]` (pure) where
`VictoryPath = { kind: 'conquest'|'science'|'culture'|'score'; pct: number /*0..1*/; label: string; detail: string }`:

- **Conquest** — `pct = (rivalsAtStart − aliveRivals) / rivalsAtStart`, where `rivalsAtStart =
  (non-barbarian players − 1)` and `aliveRivals = alive non-barbarian players excluding pid`.
  detail: "`aliveRivals` empires remain".
- **Science** — compute the prerequisite closure of `settings.victory.scienceCapstone` (BFS over
  `TechDef.prereqs`); `pct = |closure ∩ player.techs| / |closure|`. detail: "`have`/`need` techs
  to `<Capstone>`".
- **Culture** — `pct = min(1, influence(pid) / max(0.0001, maxRival(cultureTotal) × dominanceFactor))`.
  detail: gated note when `turn < minTurn` ("available after turn `minTurn`").
- **Score** — `pct = min(1, computeScore(pid) / scoreThreshold)`; detail also shows
  `turn`/`turnLimit` and whether pid is the current score leader.

**Overlay** — a new `'victory'` overlay (`src/ui/panels/VictoryProgress.tsx`): four labeled
progress bars with %, the detail line each, and a highlight on the player's closest path. Opened
via a TopBar button + a keybind (`V`). Mirrors the existing `TechTree`/`Civics` overlay shell.

## 2 · Era ceremony

A UI component (`src/ui/panels/EraCeremony.tsx`, mounted in `GameScreen`) holds a module-level
`lastEra` and a `useEffect` on `currentEra(gameCtx, game, viewer)`. Initialized to the starting
era so it never fires on load. When the viewer's era advances, it shows a **full-screen
ceremony card** ("The Classical Era dawns") with the era name + a short flavor line (a small
per-era flavor map in the UI), dismissed by a click/Esc/Enter. It does not pause AI. No engine
change (reads the existing selector).

## 3 · Milestone banners

A hook (`src/ui/panels/MilestoneBanner.tsx`, mounted in `GameScreen`) watches the toast stream
(same pattern as the Wave-2 toast-sound hook: a module-level `lastBannerId`, a `useEffect` on
`toasts`). For a newly-arrived toast of type `wonderBuilt` or `religionFounded`, it shows a
**prominent centered banner** (larger than a toast, brief auto-linger then fade) with the
event's message. All other toast types keep their existing small-toast presentation. UI-only;
reuses the events already surfaced as toasts.

## 4 · Demographics + end-game recap

**Selector** `demographics(ctx, state, pid): DemoRow[]` (pure) — one `DemoRow` per the viewer
plus each **met**, alive, non-barbarian rival (`state.relations[pid][rid].met`):
`{ player, civ, name, isYou, score, techs, gold, pop, military, influence }` where `military =
Σ over the player's units of max(def.strength, def.ranged?.strength)` (the existing power
formula), `pop = Σ city.pop`, `techs = player.techs.length`, `score = computeScore`,
`influence = influence(...)`. Unmet rivals are omitted (fog-honest).

**Overlay** — a new `'demographics'` overlay (`src/ui/panels/Demographics.tsx`): a ranked table
/ bars across the metrics, you highlighted. Opened via a TopBar button + a keybind (`B`).

**End-game recap** — extend the existing `VictoryOverlay` (`src/ui/panels/Modals.tsx`) to append
the final demographics standings (final ranking + each met civ's key stats) below the
victory/defeat headline, using the same `demographics` selector.

## Testing

- `victoryProgress`: per-path math — conquest fraction as rivals fall; science fraction over the
  capstone closure; culture ratio vs the strongest rival; score vs threshold; all clamp to [0,1].
- `demographics`: includes you + met rivals only (a war/contact fixture), excludes unmet &
  barbarians; metric values correct on a small hand-built state.
- Overlays, ceremony, banners, recap: verified manually (DOM/canvas; no UI test harness).

## Out of scope (explicit)

Civilopedia · golden/dark ages & great-people ceremonies (those systems don't exist yet) ·
banners for events beyond wonders/religions. Tracked in `docs/2026-06-17-testing-feedback.md`.
