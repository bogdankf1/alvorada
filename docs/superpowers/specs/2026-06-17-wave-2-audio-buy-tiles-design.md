# Wave 2 — Audio & Buy-Tiles — Design

*2026-06-17. Second wave from the testing-feedback backlog
(`docs/2026-06-17-testing-feedback.md`): two self-contained features — a sound layer
(synthesized SFX + one ambient music loop + settings) and purchasing tiles with gold.*

## Scope

In: **(1) Audio** — Web-Audio synth SFX, one looping music track, two settings toggles.
**(2) Buy-tiles** — a gold `BUY_TILE` action with a distance-based cost and a city-view UI.

Out (later / own specs): roads, naval, modern-era tech tree, audio-via-bundled-files,
AI buying tiles, merge-adjacent-improvements. Backlog stays in the testing-feedback doc.

## Constraints (unchanged project rules)

- **Layering:** all audio lives in `src/ui/` (a new `src/ui/audio/`) and is **never** imported
  by `src/engine` or `src/ai`. Buy-tiles adds an engine action but introduces **no randomness**.
- **Determinism:** no `Math.random`/`Date`/transcendentals in engine/ai; buy-tile cost is a
  pure function of board state; the AI is unchanged, so self-play replays identically (no
  seed re-tune).
- **Data-driven:** buy-tile cost/radius live in a `Settings.tilePurchase` block, not in logic.
- **Schema:** **no bump.** Audio settings are `localStorage` UI prefs (not game state);
  buy-tiles only writes the existing `tile.ownerCity` field. Stays at **9**.
- **2D canvas only.**

## Decisions locked

1. Audio source = **hybrid**: synthesized SFX + one royalty-free music loop the user provides.
2. Settings = **two toggles** (Sound effects, Music), persisted to `localStorage`, defaulting on.
3. Buy-tile cost = **distance-based** (`baseCost + costPerRing·(ring−1)`); no per-city counter.
4. Buy-tile eligibility = the tile must be **adjacent to the buyer's existing territory**.

---

## Feature 1 · Audio

### 1.1 Module layout (`src/ui/audio/`)

- **`sfx.ts`** — a minimal Web-Audio synth. One lazily-created shared `AudioContext`
  (created/resumed on the first user gesture, per browser autoplay policy). Exports
  `playSfx(name: SfxName)`. Each SFX is a short oscillator + gain-envelope "chime" (a few
  lines): a brass-ish triangle/sine blip tuned per event. `SfxName` =
  `'click' | 'select' | 'move' | 'attack' | 'cityFound' | 'complete' | 'era' | 'notify' | 'victory'`.
  No-ops when SFX are disabled or before the context exists.
- **`music.ts`** — creates one looping `<audio>` element pointed at `/audio/ambient.mp3`
  (low volume, ~0.35). `startMusic()` / `stopMusic()` driven by the Music toggle; starts on
  the first user gesture if enabled. **Silently no-ops if the file 404s** — the app works
  before a track is added.
- **`settings.ts`** — `audioSettings` state `{ sfx: boolean; music: boolean }`, loaded from
  and saved to `localStorage` (keys under an `alvorada.audio` namespace, mirroring
  `src/app/save.ts`). Defaults `{ sfx: true, music: true }`. Exposes getters + setters that
  also start/stop music and persist.
- **`index.ts`** — re-exports the small public API (`playSfx`, music controls, settings) and
  the pure **event→sfx** and **action→sfx** maps (below). A one-time gesture listener
  resumes the `AudioContext` and starts music.

### 1.2 Wiring (presentation-layer only)

Two pure maps drive sound from state, with no engine involvement:

- **Player interactions → SFX**, in `src/ui/actions.ts` `humanDispatch`: an
  `actionSfx(action.type)` map — `MOVE_UNIT→'move'`, `ATTACK`/`RANGED_ATTACK→'attack'`,
  `SET_PRODUCTION`/`ADOPT_POLICY`/`SET_RESEARCH`/`BUY_TILE`→`'click'`. Played on a successful
  dispatch. It **deliberately excludes** actions whose notable result already has an event
  sound (e.g. `FOUND_CITY` → the `cityFounded` event plays `'cityFound'`), so nothing
  double-fires; such types map to `null`. Unit *selection* and generic *button clicks* play
  `'select'`/`'click'` at their existing handlers.
- **World events → SFX**, in the driver (`src/app/driver.ts`) at the point where new engine
  events are surfaced as toasts (the `lastEventSeq` advance): an `eventSfx(event.type)` map —
  `cityFounded→'cityFound'`, `wonderBuilt`/`techDone`/`prodDone→'complete'`,
  `eraAdvanced→'era'`, `victory→'victory'`, and the rest of the toastable set →`'notify'`.
  This covers both human and AI-caused world beats without touching the engine.

Both maps are **pure functions** (type → `SfxName | null`) so they are unit-testable; only the
final `playSfx` call touches Web Audio.

### 1.3 Settings UI

Two toggle buttons — **"Sound effects"** and **"Music"** — added to `GameMenu`
(`src/ui/panels/Modals.tsx`). Each flips its `audioSettings` flag, persists, and (for music)
starts/stops playback. (Optionally also surfaced in `MainMenu`; GameMenu is the required home.)

### 1.4 Music file (user-provided)

The build ships the playback hook + an empty `public/audio/` directory; the expected file is
`public/audio/ambient.mp3` (a seamless ambient loop, CC0 preferred, or CC-BY → add to the
visible-credit screen that is already a project TODO). SFX work with or without it.

### 1.5 Testing

Web Audio / DOM `<audio>` are not available in the vitest/node env, so playback is verified
by ear (like the canvas renderer — the codebase has no audio/render test harness). The
**pure** pieces are unit-tested: `actionSfx`/`eventSfx` mapping (each known type maps as
specified; unknown → null) and the settings load/save round-trip (with a `localStorage` stub).

---

## Feature 2 · Buy tiles with gold

### 2.1 Data

Add a `tilePurchase` block to `Settings` (`src/data/types.ts` + `src/data/standard/index.ts`):
```ts
tilePurchase: { baseCost: number; costPerRing: number; radius: number };
```
Standard values: `{ baseCost: 50, costPerRing: 30, radius: 3 }` — ring-1 tile = 50g,
ring-2 = 80g, ring-3 = 110g; `radius` caps how far from the city centre a tile may be bought
(the workable radius). All tunable.

### 2.2 Cost selector (`src/engine/selectors.ts`)

```ts
/** Gold cost to buy `tile` for `city` (distance-based; pure). */
export function tilePurchaseCost(ctx, state, city, tile): number
```
= `baseCost + costPerRing * (hexDistance(city, tile) - 1)`.

A companion `buyableTiles(ctx, state, city): { tile: Axial; cost: number }[]` returns every
tile that passes validation (below) for the UI/renderer to highlight.

### 2.3 Action + validation + reducer

- **Action:** `{ type: 'BUY_TILE'; player: PlayerId; city: CityId; tile: Axial }`
  (`src/engine/types.ts`).
- **Validation** (`src/engine/validate.ts`): the city is the player's; `hexDistance(city,tile)`
  is `≥1` and `≤ radius`; the tile is **unowned** (`tile.ownerCity === null`); the tile is
  **adjacent to the buyer's territory** (≥1 neighbour whose `ownerCity` is owned by `player`);
  the player's `gold ≥ tilePurchaseCost(...)`. (Turn ownership is enforced upstream as for
  other human actions.)
- **Reducer** (`src/engine/reducer.ts`): deduct the cost from `player.gold`, set
  `tile.ownerCity = city.id`, and `recomputeVisibility(ctx, state, player)`. It does **not**
  touch the city's culture-expansion `tilesClaimed`/`culture` (purchased tiles are independent
  of the culture border-growth threshold).

### 2.4 UI

When a city is selected (`selectedCity`), the renderer (`src/ui/map/renderer.ts`) highlights
each `buyableTiles(...)` entry with a gold ring + its cost; clicking a highlighted tile (via
the existing map click handler, which already knows `selectedCity`) dispatches `BUY_TILE`
through `humanDispatch`. `CityPanel` shows the player's gold and a one-line hint
("Click a highlighted tile to buy it"). Affordability: tiles the player can't afford render
dimmed/disabled.

### 2.5 Determinism & AI

No RNG; cost is pure. The **AI does not buy tiles** in this wave (human-only feature), so
`decide`/self-play are unchanged and no seeds need re-tuning. (AI tile-buying is a noted
follow-up.)

### 2.6 Testing (TDD)

Engine unit tests (`tests/buy-tile.test.ts`): cost formula by ring; validation rejects
out-of-radius / owned / non-adjacent / unaffordable, accepts a valid adjacent unowned tile;
reducer deducts gold and sets `ownerCity`; `buyableTiles` returns exactly the eligible set.
UI highlight/click is verified manually.

---

## Out of scope (explicit)

Bundled-audio-file path · per-purchase escalating tile cost · AI tile-buying · roads · naval ·
modern-era tech tree · merge-adjacent-improvements. Tracked in the testing-feedback doc.
