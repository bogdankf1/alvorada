# Wave 2 — Audio & Buy-Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a synthesized-SFX + ambient-music sound layer (with settings) and a buy-tiles-with-gold feature, per `docs/superpowers/specs/2026-06-17-wave-2-audio-buy-tiles-design.md`.

**Architecture:** Audio is a new `src/ui/audio/` module (UI layer only; pure maps + settings are unit-tested, Web-Audio/DOM playback is manual). Event sounds fire in the UI where toasts render (no app→ui import). Buy-tiles adds a deterministic `BUY_TILE` engine action with a distance-based cost (read-model in selectors, reused by validation and the UI highlight).

**Tech Stack:** TypeScript, Web Audio API, React + canvas, Immer reducer, Vitest.

**Conventions:** tests in `tests/*.test.ts` run with `npx vitest run <file>`; typecheck `npm run build`; full suite `npm test`. **Commit messages carry NO AI attribution / no Co-Authored-By trailer.** No schema bump this wave.

---

## File Structure

- `src/ui/audio/settings.ts` *(new)* — `AudioSettings` + pure `parseSettings` + localStorage persistence.
- `src/ui/audio/maps.ts` *(new)* — `SfxName` type + pure `actionSfx` / `eventSfx` maps.
- `src/ui/audio/sfx.ts` *(new)* — Web-Audio synth `playSfx`.
- `src/ui/audio/music.ts` *(new)* — looping `<audio>` element + `applyMusic`/`stopMusic`.
- `src/ui/audio/index.ts` *(new)* — `initAudio` (gesture unlock) + barrel re-exports.
- `public/audio/README.md` *(new)* — documents the expected `ambient.mp3` slot.
- `src/ui/actions.ts` — play `actionSfx` on a successful dispatch.
- `src/ui/GameScreen.tsx` — mount the toast-sound hook.
- `src/ui/panels/Modals.tsx` — two audio toggles in `GameMenu`.
- `src/ui/App.tsx` — call `initAudio()` once.
- `src/data/types.ts` + `src/data/standard/index.ts` — `tilePurchase` settings.
- `src/engine/selectors.ts` — `tilePurchaseCost` / `tilePurchaseCheck` / `buyableTiles`.
- `src/engine/types.ts` — `BUY_TILE` action.
- `src/engine/validate.ts` + `src/engine/reducer.ts` — validate + apply `BUY_TILE`.
- `src/ui/map/renderer.ts` — `OverlayState.buyable` + highlight draw.
- `src/ui/map/MapCanvas.tsx` — populate buyable overlay + buy-click branch.
- `src/ui/panels/CityPanel.tsx` — buy hint.
- Tests: `tests/audio.test.ts`, `tests/buy-tile.test.ts` *(new)*.

---

## Task 1: Audio core module

**Files:** Create `src/ui/audio/{settings,maps,sfx,music,index}.ts`, `public/audio/README.md`; Test `tests/audio.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/audio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { actionSfx, eventSfx } from '../src/ui/audio/maps';
import { parseSettings } from '../src/ui/audio/settings';

describe('actionSfx', () => {
  it('maps interaction actions and returns null for the rest', () => {
    expect(actionSfx('MOVE_UNIT')).toBe('move');
    expect(actionSfx('ATTACK')).toBe('attack');
    expect(actionSfx('RANGED_ATTACK')).toBe('attack');
    expect(actionSfx('BUY_TILE')).toBe('click');
    expect(actionSfx('SET_PRODUCTION')).toBe('click');
    expect(actionSfx('FOUND_CITY')).toBeNull(); // handled by the cityFounded event sound
    expect(actionSfx('END_TURN')).toBeNull();
  });
});

describe('eventSfx', () => {
  it('maps world-event toast types', () => {
    expect(eventSfx('cityFounded')).toBe('cityFound');
    expect(eventSfx('wonderBuilt')).toBe('complete');
    expect(eventSfx('techDone')).toBe('complete');
    expect(eventSfx('victory')).toBe('victory');
    expect(eventSfx('war')).toBe('attack');
    expect(eventSfx('cityGrew')).toBe('notify');
    expect(eventSfx('unmappedType')).toBeNull();
  });
});

describe('parseSettings', () => {
  it('defaults to enabled, respects stored flags, tolerates garbage', () => {
    expect(parseSettings(null)).toEqual({ sfx: true, music: true });
    expect(parseSettings('{"sfx":false}')).toEqual({ sfx: false, music: true });
    expect(parseSettings('{"music":false}')).toEqual({ sfx: true, music: false });
    expect(parseSettings('not json')).toEqual({ sfx: true, music: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audio.test.ts`
Expected: FAIL — the `src/ui/audio/*` modules do not exist.

- [ ] **Step 3: Create `src/ui/audio/maps.ts`**

```ts
export type SfxName =
  | 'click' | 'select' | 'move' | 'attack'
  | 'cityFound' | 'complete' | 'notify' | 'victory';

/** A player action → its interaction sound. Null = silent here (e.g. world-event
 *  actions that already have an event sound, to avoid double-firing). */
export function actionSfx(type: string): SfxName | null {
  switch (type) {
    case 'MOVE_UNIT': return 'move';
    case 'ATTACK':
    case 'RANGED_ATTACK': return 'attack';
    case 'SET_PRODUCTION':
    case 'BUY_ITEM':
    case 'ADOPT_POLICY':
    case 'SET_SPECIALISTS':
    case 'BUY_TILE': return 'click';
    default: return null;
  }
}

/** A surfaced world-event/toast type → its sound. */
export function eventSfx(type: string): SfxName | null {
  switch (type) {
    case 'cityFounded': return 'cityFound';
    case 'wonderBuilt':
    case 'techDone':
    case 'prodDone':
    case 'pantheonFounded':
    case 'religionFounded': return 'complete';
    case 'victory': return 'victory';
    case 'war':
    case 'cityCaptured':
    case 'unitKilled': return 'attack';
    case 'cityGrew':
    case 'denounce':
    case 'attitudeShift':
    case 'eventChronicle':
    case 'policyAdopted':
    case 'tradeEstablished': return 'notify';
    default: return null;
  }
}
```

- [ ] **Step 4: Create `src/ui/audio/settings.ts`**

```ts
const KEY = 'alvorada.audio';

export interface AudioSettings { sfx: boolean; music: boolean; }

/** Pure parse: defaults to enabled; tolerates null/garbage. */
export function parseSettings(raw: string | null): AudioSettings {
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      return { sfx: p.sfx !== false, music: p.music !== false };
    } catch { /* fall through to defaults */ }
  }
  return { sfx: true, music: true };
}

let settings: AudioSettings = parseSettings(
  typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null,
);

export function getAudioSettings(): AudioSettings { return settings; }

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
export function setSfxEnabled(on: boolean): void { settings = { ...settings, sfx: on }; save(); }
export function setMusicEnabled(on: boolean): void { settings = { ...settings, music: on }; save(); }
```

- [ ] **Step 5: Create `src/ui/audio/sfx.ts`**

```ts
import { getAudioSettings } from './settings';
import type { SfxName } from './maps';

let ctx: AudioContext | null = null;

/** Lazily create the shared AudioContext (returns null in non-DOM/unsupported envs). */
export function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

interface Tone { freq: number; dur: number; type: OscillatorType; gain: number; }
const TONES: Record<SfxName, Tone> = {
  click:     { freq: 420, dur: 0.05, type: 'triangle', gain: 0.05 },
  select:    { freq: 560, dur: 0.06, type: 'triangle', gain: 0.06 },
  move:      { freq: 320, dur: 0.07, type: 'sine',     gain: 0.05 },
  attack:    { freq: 170, dur: 0.13, type: 'sawtooth', gain: 0.07 },
  cityFound: { freq: 523, dur: 0.24, type: 'triangle', gain: 0.08 },
  complete:  { freq: 660, dur: 0.20, type: 'triangle', gain: 0.08 },
  notify:    { freq: 480, dur: 0.08, type: 'sine',     gain: 0.045 },
  victory:   { freq: 784, dur: 0.55, type: 'triangle', gain: 0.10 },
};

export function playSfx(name: SfxName): void {
  if (!getAudioSettings().sfx) return;
  const ac = ensureAudio();
  if (!ac || ac.state === 'closed') return;
  const t = TONES[name];
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = t.type;
  osc.frequency.value = t.freq;
  const now = ac.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(t.gain, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + t.dur + 0.02);
}
```

- [ ] **Step 6: Create `src/ui/audio/music.ts`**

```ts
import { getAudioSettings } from './settings';

let el: HTMLAudioElement | null = null;

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio('/audio/ambient.mp3');
    el.loop = true;
    el.volume = 0.35;
    el.addEventListener('error', () => { /* no file present yet — silently ignore */ });
  }
  return el;
}

/** Start or stop playback to match the current Music setting. Safe to call repeatedly. */
export function applyMusic(): void {
  const e = element();
  if (!e) return;
  if (getAudioSettings().music) void e.play().catch(() => { /* autoplay blocked or file absent */ });
  else e.pause();
}

export function stopMusic(): void { el?.pause(); }
```

- [ ] **Step 7: Create `src/ui/audio/index.ts`**

```ts
import { ensureAudio } from './sfx';
import { applyMusic } from './music';

export { playSfx } from './sfx';
export { applyMusic, stopMusic } from './music';
export { getAudioSettings, setSfxEnabled, setMusicEnabled, parseSettings } from './settings';
export type { AudioSettings } from './settings';
export { actionSfx, eventSfx } from './maps';
export type { SfxName } from './maps';

let inited = false;

/** Unlock audio on the first user gesture (browser autoplay policy). Idempotent. */
export function initAudio(): void {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  let fired = false;
  const onGesture = () => {
    if (fired) return;
    fired = true;
    void ensureAudio()?.resume();
    applyMusic();
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  };
  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);
}
```

- [ ] **Step 8: Create `public/audio/README.md`**

```md
# Ambient music

Drop a seamless looping ambient track here named **`ambient.mp3`**. The app plays it
(low volume, looped) once the Music setting is on and the player has interacted with the
page. If the file is absent, music silently no-ops — sound effects still work.

License: prefer **CC0**. If you use a **CC-BY** track, add its credit to the in-game
attribution screen (the visible-credit screen is an existing project TODO).
```

- [ ] **Step 9: Run the test + typecheck**

Run: `npx vitest run tests/audio.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean (no TypeScript errors).

- [ ] **Step 10: Commit**

```bash
git add src/ui/audio tests/audio.test.ts public/audio/README.md
git commit -m "feat(ui): audio module — synth SFX, ambient music hook, settings"
```

---

## Task 2: Wire audio into the app + settings toggles

**Files:** Modify `src/ui/actions.ts`, `src/ui/map/MapCanvas.tsx`, `src/ui/GameScreen.tsx`, `src/ui/App.tsx`, `src/ui/panels/Modals.tsx`.

Presentation-only; verified by ear + typecheck (no unit test — Web Audio/DOM has no test harness here).

- [ ] **Step 1: Play interaction SFX in `humanDispatch`**

In `src/ui/actions.ts`, add the import near the top (path from `src/ui/actions.ts` is `./audio`):

```ts
import { actionSfx, playSfx } from './audio';
```

In `humanDispatch`, after the existing auto-advance block and before `return res.ok;`, add:

```ts
  if (res.ok) {
    const sfx = actionSfx(action.type);
    if (sfx) playSfx(sfx);
  }
  return res.ok;
```

- [ ] **Step 2: Play a `select` sound on selection**

In `src/ui/map/MapCanvas.tsx`, add to the imports:

```ts
import { playSfx } from '../audio';
```

In `handleTileClick`, in the `// (re)selection` section, play `'select'` when a unit or city is newly selected. Change the two `appStore.set({ selectedUnit: pick.id, ... })` / `selectedCity` selection calls to also play the sound — e.g. immediately before `appStore.set({ selectedUnit: pick.id, selectedCity: null });` add `playSfx('select');`, and before each `appStore.set({ selectedCity: cityHere.id, selectedUnit: null });` add `playSfx('select');`.

- [ ] **Step 3: Add the toast-sound hook and mount it**

In `src/ui/GameScreen.tsx`, add imports:

```ts
import { eventSfx, playSfx } from './audio';
```

Add this module-level variable and a `useEffect` inside `GameScreen` (alongside the existing keyboard `useEffect`):

```ts
// outside the component, module scope:
let lastToastId = -1;
```

```ts
  // play a sound for each newly-arrived toast (world events)
  const toasts = useApp((s) => s.toasts);
  useEffect(() => {
    const newest = toasts[toasts.length - 1];
    if (newest && newest.id > lastToastId) {
      lastToastId = newest.id;
      const sfx = eventSfx(newest.type);
      if (sfx) playSfx(sfx);
    }
  }, [toasts]);
```

(`useApp` is already imported in `GameScreen.tsx`; `useEffect` too.)

- [ ] **Step 4: Initialise audio once**

In `src/ui/App.tsx`, add the import and an init effect:

```ts
import { initAudio } from './audio';
```

Inside the `App` component, add (with `useEffect` imported):

```ts
  useEffect(() => { initAudio(); }, []);
```

- [ ] **Step 5: Add the two toggles to `GameMenu`**

In `src/ui/panels/Modals.tsx`, add imports:

```ts
import { getAudioSettings, setSfxEnabled, setMusicEnabled, applyMusic } from '../audio';
import { useState } from 'react';
```

Inside `GameMenu`, after `const close = ...`, add local state seeded from settings:

```ts
  const [audio, setAudio] = useState(getAudioSettings());
  const toggleSfx = () => { const v = !audio.sfx; setSfxEnabled(v); setAudio({ ...audio, sfx: v }); };
  const toggleMusic = () => { const v = !audio.music; setMusicEnabled(v); applyMusic(); setAudio({ ...audio, music: v }); };
```

In the `modal-actions` column (after the "Return to the Map" button), add two toggle buttons:

```tsx
          <button className="btn" onClick={toggleSfx}>
            Sound effects: {audio.sfx ? 'On' : 'Off'}
          </button>
          <button className="btn" onClick={toggleMusic}>
            Music: {audio.music ? 'On' : 'Off'}
          </button>
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Manual verification**

Run `npm run dev`. Click a unit (hear `select`), move it (`move`), attack (`attack`); found a city / finish a tech (event sounds). Open the menu → toggle "Sound effects" off (silence) and on. (Music stays silent until you drop `public/audio/ambient.mp3`; with a file present, toggling Music starts/stops it.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/actions.ts src/ui/map/MapCanvas.tsx src/ui/GameScreen.tsx src/ui/App.tsx src/ui/panels/Modals.tsx
git commit -m "feat(ui): wire SFX to actions/events and add audio settings toggles"
```

---

## Task 3: Buy-tile engine (data + selectors + action)

**Files:** Modify `src/data/types.ts`, `src/data/standard/index.ts`, `src/engine/selectors.ts`, `src/engine/types.ts`, `src/engine/validate.ts`, `src/engine/reducer.ts`; Test `tests/buy-tile.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/buy-tile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld, spawn, refreshVis, thaw, idxOf } from './helpers';
import { applyAction } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { tilePurchaseCost, tilePurchaseCheck, buyableTiles } from '../src/engine/selectors';

/** A founded city for player 0 that owns ONLY its centre tile (6,6), with 500 gold. */
function cityWorld(): { s: ReturnType<typeof flatWorld>; id: number } {
  let s = flatWorld(16, 12, 2);
  const settler = spawn(s, 0, 'settler', 6, 6);
  refreshVis(s);
  s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
  s = thaw(s);
  const id = Object.keys(s.cities).map(Number)[0];
  s.players[0].gold = 500;
  for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].ownerCity === id) s.tiles[i].ownerCity = null;
  s.tiles[idxOf(s, 6, 6)].ownerCity = id; // own only the centre
  return { s, id };
}

describe('tilePurchaseCost', () => {
  it('rises by ring distance from the city', () => {
    const { s, id } = cityWorld();
    const c = s.cities[id];
    expect(tilePurchaseCost(ctx, c, { q: c.q + 1, r: c.r })).toBe(50); // ring 1
    expect(tilePurchaseCost(ctx, c, { q: c.q + 2, r: c.r })).toBe(80); // ring 2
  });
});

describe('tilePurchaseCheck / buyableTiles', () => {
  it('accepts an in-range, unowned, territory-adjacent tile', () => {
    const { s, id } = cityWorld();
    expect(tilePurchaseCheck(ctx, s, 0, s.cities[id], { q: 7, r: 6 }).ok).toBe(true);
    expect(buyableTiles(ctx, s, s.cities[id]).some((b) => b.idx === idxOf(s, 7, 6))).toBe(true);
  });
  it('rejects owned, out-of-range, and non-adjacent tiles', () => {
    const { s, id } = cityWorld();
    const c = s.cities[id];
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 8, r: 6 }).ok).toBe(false);  // dist 2, not adjacent to owned
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 11, r: 6 }).ok).toBe(false); // dist 5, out of range
    s.tiles[idxOf(s, 7, 6)].ownerCity = id;
    expect(tilePurchaseCheck(ctx, s, 0, c, { q: 7, r: 6 }).ok).toBe(false);  // already owned
  });
});

describe('BUY_TILE', () => {
  it('deducts gold and claims the tile', () => {
    const { s, id } = cityWorld();
    const cost = tilePurchaseCost(ctx, s.cities[id], { q: 7, r: 6 });
    const before = s.players[0].gold;
    const s2 = applyAction(ctx, s, { type: 'BUY_TILE', player: 0, city: id, tile: { q: 7, r: 6 } });
    expect(s2.tiles[idxOf(s2, 7, 6)].ownerCity).toBe(id);
    expect(s2.players[0].gold).toBe(before - cost);
  });
  it('is rejected when unaffordable', () => {
    const { s, id } = cityWorld();
    s.players[0].gold = 0;
    expect(validateAction(ctx, s, { type: 'BUY_TILE', player: 0, city: id, tile: { q: 7, r: 6 } }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/buy-tile.test.ts`
Expected: FAIL — `tilePurchaseCost`/`tilePurchaseCheck`/`buyableTiles` and `BUY_TILE` do not exist.

- [ ] **Step 3: Add the `tilePurchase` setting**

In `src/data/types.ts`, in the `Settings` interface (near `barbarians: {...}`), add:

```ts
  tilePurchase: { baseCost: number; costPerRing: number; radius: number };
```

In `src/data/standard/index.ts`, in the settings object (next to `barbarians: {...}`), add:

```ts
  tilePurchase: { baseCost: 50, costPerRing: 30, radius: 3 },
```

- [ ] **Step 4: Add the cost + eligibility selectors**

In `src/engine/selectors.ts`, ensure `neighbors` is imported from `./hex` (add it to the existing `./hex` import if absent), then add:

```ts
/** Gold cost to buy `tile` for `city` — distance-based; pure. */
export function tilePurchaseCost(ctx: Ctx, city: City, tile: Axial): number {
  const tp = ctx.rules.settings.tilePurchase;
  return tp.baseCost + tp.costPerRing * (hexDistance({ q: city.q, r: city.r }, tile) - 1);
}

/** Eligibility (in-range, unowned, adjacent to the buyer's land) — NOT affordability. */
export function tilePurchaseCheck(
  ctx: Ctx, state: GameState, player: PlayerId, city: City, tile: Axial,
): { ok: true; cost: number } | { ok: false; reason: string } {
  const tp = ctx.rules.settings.tilePurchase;
  const dist = hexDistance({ q: city.q, r: city.r }, tile);
  if (dist < 1 || dist > tp.radius) return { ok: false, reason: 'tile is out of range' };
  const idx = tileIndex(tile, state.mapW, state.mapH);
  if (idx < 0) return { ok: false, reason: 'off the map' };
  if (state.tiles[idx].ownerCity !== null) return { ok: false, reason: 'tile is already owned' };
  const adjacent = neighbors(tile).some((nb) => {
    const ni = tileIndex(nb, state.mapW, state.mapH);
    return ni >= 0 && tileOwner(state, ni) === player;
  });
  if (!adjacent) return { ok: false, reason: 'tile must touch your territory' };
  return { ok: true, cost: tilePurchaseCost(ctx, city, tile) };
}

/** Every tile a city may currently buy, with its cost (UI/renderer highlight source). */
export function buyableTiles(ctx: Ctx, state: GameState, city: City): { idx: number; cost: number }[] {
  const out: { idx: number; cost: number }[] = [];
  for (const h of hexesWithin({ q: city.q, r: city.r }, ctx.rules.settings.tilePurchase.radius)) {
    const idx = tileIndex(h, state.mapW, state.mapH);
    if (idx < 0) continue;
    const chk = tilePurchaseCheck(ctx, state, city.owner, city, h);
    if (chk.ok) out.push({ idx, cost: chk.cost });
  }
  return out;
}
```

(`hexDistance`, `hexesWithin`, `tileIndex` are already imported in `selectors.ts`; `tileOwner` is defined there; `Axial`, `City`, `Ctx`, `GameState`, `PlayerId` types are imported.)

- [ ] **Step 5: Add the `BUY_TILE` action type**

In `src/engine/types.ts`, in the `Action` union (near `SET_PRODUCTION`), add:

```ts
  | { type: 'BUY_TILE'; player: PlayerId; city: CityId; tile: Axial }
```

- [ ] **Step 6: Validate `BUY_TILE`**

In `src/engine/validate.ts`, add `tilePurchaseCheck` to the `./selectors` import, then add a case (next to `SET_PRODUCTION`):

```ts
    case 'BUY_TILE': {
      const city = state.cities[action.city];
      if (!city || city.owner !== action.player) return fail('not your city');
      const chk = tilePurchaseCheck(ctx, state, action.player, city, action.tile);
      if (!chk.ok) return fail(chk.reason);
      if (state.players[action.player].gold < chk.cost) return fail(`not enough gold (${chk.cost} needed)`);
      return ok;
    }
```

- [ ] **Step 7: Apply `BUY_TILE`**

In `src/engine/reducer.ts`, add `tilePurchaseCost` to the `./selectors` import (the line that imports `purchaseCost`), then add a case (next to `BUY_ITEM`):

```ts
    case 'BUY_TILE': {
      const city = state.cities[action.city];
      const player = state.players[action.player];
      player.gold -= tilePurchaseCost(ctx, city, action.tile);
      const idx = tileIndex(action.tile, state.mapW, state.mapH);
      state.tiles[idx].ownerCity = city.id;
      recomputeVisibility(ctx, state, action.player);
      break;
    }
```

Ensure `tileIndex` is imported in `reducer.ts` (add `import { tileIndex } from './hex';` if not present). `recomputeVisibility` is already imported.

- [ ] **Step 8: Run the test + typecheck**

Run: `npx vitest run tests/buy-tile.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: clean (the `Action` union exhaustiveness now covers `BUY_TILE`).

- [ ] **Step 9: Full suite (determinism guard)**

Run: `npm test`
Expected: PASS — the AI never buys tiles, so self-play is unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/data/types.ts src/data/standard/index.ts src/engine/selectors.ts src/engine/types.ts src/engine/validate.ts src/engine/reducer.ts tests/buy-tile.test.ts
git commit -m "feat(engine): buy tiles with gold (distance cost, adjacency-gated)"
```

---

## Task 4: Buy-tile UI (highlight + click)

**Files:** Modify `src/ui/map/renderer.ts`, `src/ui/map/MapCanvas.tsx`, `src/ui/panels/CityPanel.tsx`.

Presentation-only; verified visually + typecheck.

- [ ] **Step 1: Add `buyable` to the overlay**

In `src/ui/map/renderer.ts`, add to `interface OverlayState`:

```ts
  buyable: Map<number, number>; // tile idx → gold cost
```

And to the `overlay` default initializer (the `overlay: OverlayState = { ... }` block):

```ts
    buyable: new Map(),
```

- [ ] **Step 2: Draw the buyable highlight**

In `renderer.ts`, in `paintOverlaysUnder`, after the `// path preview` block, add:

```ts
    // buyable tiles (a city is selected) — gold ring + cost; dim if unaffordable
    if (this.overlay.buyable.size) {
      const selCity = this.overlay.selectedCity !== null ? s.cities[this.overlay.selectedCity] : null;
      const gold = selCity ? s.players[selCity.owner].gold : 0;
      for (const [idx, cost] of this.overlay.buyable) {
        const p = hexToPixel(axialOfIndex(idx, s.mapW), HEX);
        const afford = gold >= cost;
        hexPath(g, p.x, p.y, HEX - 3);
        g.strokeStyle = css(rgb(PALETTE.brass), afford ? 0.85 : 0.4);
        g.lineWidth = 2.2;
        g.stroke();
        g.fillStyle = css(rgb(PALETTE.brass), afford ? 0.95 : 0.5);
        g.font = '700 11px ui-sans-serif, system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(cost), p.x, p.y);
      }
    }
```

(`hexToPixel`, `axialOfIndex`, `hexPath`, `css`, `rgb`, `PALETTE`, `HEX` are all already used in this method.)

- [ ] **Step 3: Populate `overlay.buyable` when a city is selected**

In `src/ui/map/MapCanvas.tsx`, add `buyableTiles` to the `../../engine/selectors` import. In the "push state + overlays" `useEffect`, after `overlay.pathPreview = [];`, add:

```ts
    overlay.buyable = new Map();
    if (selectedCity !== null && isMyTurn()) {
      const city = game.cities[selectedCity];
      if (city && city.owner === viewer) {
        for (const b of buyableTiles(gameCtx, game, city)) overlay.buyable.set(b.idx, b.cost);
      }
    }
```

- [ ] **Step 4: Buy on click**

In `src/ui/map/MapCanvas.tsx`, add `tilePurchaseCheck` to the `../../engine/selectors` import. In `handleTileClick`, change the destructure to include `selectedCity`:

```ts
  const { game, viewingPlayer, selectedUnit, selectedCity } = appStore.get();
```

Then, immediately before the `// (re)selection` comment, add the buy branch:

```ts
  // buying a tile for the selected city
  if (selectedCity !== null && isMyTurn()) {
    const city = game.cities[selectedCity];
    if (city && city.owner === viewingPlayer) {
      const chk = tilePurchaseCheck(gameCtx, game, viewingPlayer, city, a);
      if (chk.ok && game.players[viewingPlayer].gold >= chk.cost) {
        if (humanDispatch({ type: 'BUY_TILE', player: viewingPlayer, city: selectedCity, tile: a })) return;
      }
    }
  }
```

- [ ] **Step 5: City-panel hint**

In `src/ui/panels/CityPanel.tsx`, near the top of the panel body (after the city header), add a hint showing the player's gold and how to buy. Add (using the already-available `game`, `city`):

```tsx
      <div style={{ fontSize: 12, color: 'var(--ivory-dim)', margin: '4px 0' }}>
        Gold {game.players[city.owner].gold} — click a highlighted tile to buy it
      </div>
```

(Place it inside the panel's returned JSX where other small status lines live; it needs `game` and `city`, both already in scope.)

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Manual verification**

Run `npm run dev`. Select one of your cities → unowned tiles in range that touch your border show a gold ring + cost (unaffordable ones dimmed). Click an affordable one → gold drops, the tile joins your territory, the highlight updates. Far/owned/non-adjacent tiles show no highlight and can't be bought.

- [ ] **Step 8: Commit**

```bash
git add src/ui/map/renderer.ts src/ui/map/MapCanvas.tsx src/ui/panels/CityPanel.tsx
git commit -m "feat(ui): buy-tile highlight + click in the city view"
```

---

## Closing: docs

- [ ] Mark Wave 2 shipped in `docs/2026-06-17-testing-feedback.md` (audio + buy-tiles).
- [ ] Commit spec + plan + doc update:

```bash
git add docs/superpowers/specs/2026-06-17-wave-2-audio-buy-tiles-design.md docs/superpowers/plans/2026-06-17-wave-2-audio-buy-tiles.md docs/2026-06-17-testing-feedback.md
git commit -m "docs(wave-2): audio + buy-tiles spec, plan, and shipped note"
```

---

## Self-review

- **Spec coverage:** Audio module (Task 1) · wiring + settings UI (Task 2) · buy-tile data/cost/action (Task 3) · buy-tile UI (Task 4). Music-file slot (Task 1 Step 8). Two toggles (Task 2 Step 5). Distance cost + adjacency (Task 3). Highlight + click (Task 4). All spec sections mapped.
- **Layering:** audio is `src/ui/` only; event sounds fire in the UI (toast hook), never in the app-layer driver. Buy-tile cost is pure data; no RNG. No schema bump.
- **Type consistency:** `SfxName` defined in `maps.ts`, used by `sfx.ts`/maps/wiring. `tilePurchaseCost`/`tilePurchaseCheck`/`buyableTiles` defined in Task 3, consumed in Task 4. `BUY_TILE` shape consistent across types/validate/reducer/UI. `overlay.buyable` defined Task 4 Step 1, used Steps 2–3.
- **Determinism:** AI unchanged → self-play identical (Task 3 Step 9); no seed re-tune.
- **No placeholders:** every code step shows full code; every run step states expected output.
