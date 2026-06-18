# Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game legible — a victory-progress overlay, a full-screen era ceremony, prominent milestone banners, and a demographics overlay + end-game recap, per `docs/superpowers/specs/2026-06-18-legibility-design.md`.

**Architecture:** UI-layer only plus two pure read-model selectors (`victoryProgress`, `demographics`) in `engine/selectors.ts`. New overlays mirror the existing `Civics`/`TechTree` overlay shell; era-advance and milestones are detected in the UI (hooks on `currentEra` and the toast stream). No engine behavior change, no schema bump, no AI/self-play impact.

**Tech Stack:** TypeScript, React, Vitest.

**Conventions:** tests `tests/*.test.ts` via `npx vitest run <file>`; typecheck `npm run build`. **Commit messages carry NO AI attribution / no Co-Authored-By.** No schema bump.

---

## File Structure

- `src/engine/selectors.ts` — add pure `victoryProgress` + `demographics` (and exported result interfaces).
- `src/app/store.ts` — extend the `overlay` union with `'victory'` and `'demographics'`.
- `src/ui/panels/VictoryProgress.tsx` *(new)* — the victory-progress overlay.
- `src/ui/panels/Demographics.tsx` *(new)* — the demographics overlay.
- `src/ui/panels/EraCeremony.tsx` *(new)* — full-screen era-advance card.
- `src/ui/panels/MilestoneBanner.tsx` *(new)* — prominent banner for wonders/religions.
- `src/ui/panels/Modals.tsx` — enrich `VictoryOverlay` with the end-game recap columns.
- `src/ui/GameScreen.tsx` — render the two overlays; mount ceremony + banner; `V`/`B` keybinds.
- `src/ui/panels/TopBar.tsx` — Victory + Demographics buttons.
- Tests: `tests/legibility.test.ts` *(new)*.

---

## Task 1: Victory-progress (selector + overlay)

**Files:** Modify `src/engine/selectors.ts`, `src/app/store.ts`, `src/ui/GameScreen.tsx`, `src/ui/panels/TopBar.tsx`; Create `src/ui/panels/VictoryProgress.tsx`; Test `tests/legibility.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/legibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ctx, flatWorld } from './helpers';
import { victoryProgress } from '../src/engine/selectors';
import { influence } from '../src/engine/selectors';

describe('victoryProgress', () => {
  it('returns the four paths with progress clamped to [0,1]', () => {
    const s = flatWorld(16, 12, 3);
    s.players[0].techs = ['agriculture', 'pottery'];
    const vp = victoryProgress(ctx, s, 0);
    expect(vp.map((p) => p.kind)).toEqual(['conquest', 'science', 'culture', 'score']);
    for (const p of vp) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(1);
    }
  });

  it('conquest rises as rivals fall', () => {
    const s = flatWorld(16, 12, 3); // you + 2 rivals
    const before = victoryProgress(ctx, s, 0).find((p) => p.kind === 'conquest')!.pct;
    s.players[1].alive = false;
    const after = victoryProgress(ctx, s, 0).find((p) => p.kind === 'conquest')!.pct;
    expect(after).toBeGreaterThan(before);
  });

  it('culture = influence / (strongest rival culture × dominanceFactor)', () => {
    const s = flatWorld(16, 12, 2);
    s.players[0].cultureTotal = 300;
    s.players[1].cultureTotal = 50;
    const inf0 = influence(ctx, s, 0);
    const expected = Math.min(1, inf0 / (50 * ctx.rules.settings.victory.culture.dominanceFactor));
    const culture = victoryProgress(ctx, s, 0).find((p) => p.kind === 'culture')!.pct;
    expect(culture).toBeCloseTo(expected, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/legibility.test.ts`
Expected: FAIL — `victoryProgress` is not exported.

- [ ] **Step 3: Add the `victoryProgress` selector**

In `src/engine/selectors.ts`, add (it uses `influence`, `computeScore`, both already defined in this file):

```ts
export interface VictoryPath {
  kind: 'conquest' | 'science' | 'culture' | 'score';
  pct: number; // 0..1
  label: string;
  detail: string;
}

/** Prerequisite closure (BFS over TechDef.prereqs) of the science-capstone tech. */
function capstoneClosure(ctx: Ctx): Set<string> {
  const seen = new Set<string>();
  const stack = [ctx.rules.settings.victory.scienceCapstone];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const pre of ctx.rules.techs[id]?.prereqs ?? []) stack.push(pre);
  }
  return seen;
}

/** Pure progress (0..1) toward each of the four victory paths, for the UI finish line. */
export function victoryProgress(ctx: Ctx, state: GameState, pid: PlayerId): VictoryPath[] {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const v = ctx.rules.settings.victory;
  const nonBarb = state.players.filter((p) => !p.barbarian);
  const rivalsAtStart = nonBarb.length - 1;
  const aliveRivals = nonBarb.filter((p) => p.alive && p.id !== pid).length;
  const conquest = rivalsAtStart > 0 ? (rivalsAtStart - aliveRivals) / rivalsAtStart : 0;

  const closure = capstoneClosure(ctx);
  const have = state.players[pid].techs.filter((t) => closure.has(t)).length;
  const science = closure.size ? have / closure.size : 0;

  const inf = influence(ctx, state, pid);
  const strongest = nonBarb
    .filter((p) => p.alive && p.id !== pid)
    .reduce((m, r) => Math.max(m, r.cultureTotal * v.culture.dominanceFactor), 0);
  const culture = strongest > 0 ? inf / strongest : 1;

  const myScore = computeScore(ctx, state, pid);
  const score = myScore / v.scoreThreshold;

  return [
    { kind: 'conquest', pct: clamp01(conquest), label: 'Conquest', detail: `${aliveRivals} rival empire(s) remain` },
    { kind: 'science', pct: clamp01(science), label: 'Science', detail: `${have}/${closure.size} techs to ${ctx.rules.techs[v.scienceCapstone].name}` },
    { kind: 'culture', pct: clamp01(culture), label: 'Culture', detail: state.turn < v.culture.minTurn ? `available after turn ${v.culture.minTurn}` : `${inf} influence vs rivals` },
    { kind: 'score', pct: clamp01(score), label: 'Score', detail: `${myScore}/${v.scoreThreshold} · turn ${state.turn}/${v.turnLimit}` },
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/legibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the `'victory'` overlay value**

In `src/app/store.ts`, extend the overlay union:

```ts
  overlay: 'tech' | 'menu' | 'diplomacy' | 'civics' | 'chronicle' | 'victory' | 'demographics' | null;
```

(Both `'victory'` and `'demographics'` are added now; the demographics overlay is wired in Task 2.)

- [ ] **Step 6: Create the overlay `src/ui/panels/VictoryProgress.tsx`**

```tsx
import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { victoryProgress } from '../../engine/selectors';

export function VictoryProgress() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const paths = victoryProgress(gameCtx, game, viewer);
  const close = () => appStore.set({ overlay: null });
  const closest = paths.reduce((a, b) => (b.pct > a.pct ? b : a));

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="tech-head" onClick={(e) => e.stopPropagation()}>
        <h2>THE ROADS TO VICTORY</h2>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={close}>Close (Esc)</button>
      </div>
      <div className="scroll-quiet" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        {paths.map((p) => (
          <div key={p.kind} style={{ marginBottom: 18, opacity: p === closest ? 1 : 0.85 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <b style={{ color: p === closest ? 'var(--brass)' : 'var(--ivory)' }}>{p.label}{p === closest ? ' · closest' : ''}</b>
              <span style={{ color: 'var(--ivory-dim)' }}>{Math.round(p.pct * 100)}%</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.round(p.pct * 100)}%`, background: 'var(--brass)' }} /></div>
            <div style={{ fontSize: 12, color: 'var(--ivory-dim)', marginTop: 2 }}>{p.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Render the overlay + add the keybind + TopBar button**

In `src/ui/GameScreen.tsx`: add the import `import { VictoryProgress } from './panels/VictoryProgress';`, render it next to the others:

```tsx
      {overlay === 'victory' && <VictoryProgress />}
```

In the keydown `switch`, after the `KeyH` case, add:

```ts
        case 'KeyV':
          appStore.set({ overlay: ov === 'victory' ? null : 'victory' });
          break;
```

In `src/ui/panels/TopBar.tsx`, near the Civics button, add:

```tsx
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'victory' })} title="Victory progress (V)">Victory</button>
```

- [ ] **Step 8: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/engine/selectors.ts src/app/store.ts src/ui/panels/VictoryProgress.tsx src/ui/GameScreen.tsx src/ui/panels/TopBar.tsx tests/legibility.test.ts
git commit -m "feat(ui): victory-progress selector + overlay (the finish line)"
```

---

## Task 2: Demographics (selector + overlay + end-game recap)

**Files:** Modify `src/engine/selectors.ts`, `src/ui/GameScreen.tsx`, `src/ui/panels/TopBar.tsx`, `src/ui/panels/Modals.tsx`; Create `src/ui/panels/Demographics.tsx`; Test `tests/legibility.test.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/legibility.test.ts`:

```ts
import { demographics } from '../src/engine/selectors';

describe('demographics', () => {
  it('includes you and met rivals, excludes unmet rivals', () => {
    const s = flatWorld(16, 12, 3); // players 0,1,2, all alive, non-barbarian
    s.relations[0][1].met = true; // rival 1 met; rival 2 unmet
    const rows = demographics(ctx, s, 0);
    expect(rows.map((r) => r.player).sort()).toEqual([0, 1]);
    expect(rows.find((r) => r.player === 0)!.isYou).toBe(true);
    expect(rows.find((r) => r.player === 0)!.techs).toBe(s.players[0].techs.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/legibility.test.ts`
Expected: FAIL — `demographics` is not exported.

- [ ] **Step 3: Add the `demographics` selector**

In `src/engine/selectors.ts`, add (uses `computeScore`, `influence`, `militaryPower`, `playerCities`, all in this file):

```ts
export interface DemoRow {
  player: PlayerId;
  civ: string;
  name: string;
  isYou: boolean;
  score: number;
  techs: number;
  gold: number;
  pop: number;
  military: number;
  influence: number;
}

/** You + every met, alive, non-barbarian rival, with comparison metrics (fog-honest). */
export function demographics(ctx: Ctx, state: GameState, pid: PlayerId): DemoRow[] {
  const rows: DemoRow[] = [];
  for (const p of state.players) {
    if (p.barbarian || !p.alive) continue;
    const isYou = p.id === pid;
    if (!isYou && !state.relations[pid][p.id].met) continue;
    rows.push({
      player: p.id,
      civ: p.civ,
      name: p.name,
      isYou,
      score: computeScore(ctx, state, p.id),
      techs: p.techs.length,
      gold: p.gold,
      pop: playerCities(state, p.id).reduce((s, c) => s + c.pop, 0),
      military: militaryPower(ctx, state, p.id),
      influence: influence(ctx, state, p.id),
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/legibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the overlay `src/ui/panels/Demographics.tsx`**

```tsx
import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { demographics } from '../../engine/selectors';

const COLS: { key: 'score' | 'techs' | 'gold' | 'pop' | 'military' | 'influence'; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'techs', label: 'Techs' },
  { key: 'gold', label: 'Gold' },
  { key: 'pop', label: 'Pop' },
  { key: 'military', label: 'Military' },
  { key: 'influence', label: 'Culture' },
];

export function Demographics() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const rows = demographics(gameCtx, game, viewer).sort((a, b) => b.score - a.score);
  const close = () => appStore.set({ overlay: null });

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="tech-head" onClick={(e) => e.stopPropagation()}>
        <h2>THE STANDING OF NATIONS</h2>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={close}>Close (Esc)</button>
      </div>
      <div className="scroll-quiet" onClick={(e) => e.stopPropagation()} style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <table className="score-table" style={{ width: '100%' }}>
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Nation</th>{COLS.map((c) => <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player} style={{ fontWeight: r.isYou ? 700 : 400 }}>
                <td><span className="civ-dot" style={{ background: game.players[r.player].color, display: 'inline-block', marginRight: 8 }} />{r.name} · {gameCtx.rules.civs[r.civ].name}{r.isYou ? ' (you)' : ''}</td>
                {COLS.map((c) => <td key={c.key} style={{ textAlign: 'right' }}>{r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Render the overlay + keybind + TopBar button**

In `src/ui/GameScreen.tsx`: import `import { Demographics } from './panels/Demographics';`, render:

```tsx
      {overlay === 'demographics' && <Demographics />}
```

In the keydown `switch`, after the `KeyV` case, add:

```ts
        case 'KeyB':
          appStore.set({ overlay: ov === 'demographics' ? null : 'demographics' });
          break;
```

In `src/ui/panels/TopBar.tsx`, next to the Victory button, add:

```tsx
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'demographics' })} title="Demographics (B)">Demographics</button>
```

- [ ] **Step 7: Enrich the end-game recap in `VictoryOverlay`**

In `src/ui/panels/Modals.tsx`, `VictoryOverlay` currently maps `scores` to `<tr>` with name + score. Add metric columns (post-game full reveal — all players). Add the imports it needs at the top of the file if missing: `import { computeScore, influence, militaryPower, playerCities } from '../../engine/selectors';` (keep any already imported). Replace the `<table className="score-table">…</table>` block with:

```tsx
        <table className="score-table">
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Nation</th><th>Score</th><th>Techs</th><th>Pop</th><th>Military</th><th>Culture</th></tr>
          </thead>
          <tbody>
            {scores.map(({ p, score }) => (
              <tr key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
                <td>
                  <span className="civ-dot" style={{ background: p.color, display: 'inline-block', marginRight: 8 }} />
                  {p.name} · {gameCtx.rules.civs[p.civ].name}{!p.alive && ' †'}
                </td>
                <td>{score}</td>
                <td>{p.techs.length}</td>
                <td>{playerCities(game, p.id).reduce((s, c) => s + c.pop, 0)}</td>
                <td>{militaryPower(gameCtx, game, p.id)}</td>
                <td>{influence(gameCtx, game, p.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
```

Also filter barbarians out of the `scores` array (the appended barbarian player would otherwise render as a stray row): change its construction to

```tsx
  const scores = game.players
    .filter((p) => !p.barbarian)
    .map((p) => ({ p, score: computeScore(gameCtx, game, p.id) }))
    .sort((a, b) => b.score - a.score);
```

- [ ] **Step 8: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/engine/selectors.ts src/ui/panels/Demographics.tsx src/ui/GameScreen.tsx src/ui/panels/TopBar.tsx src/ui/panels/Modals.tsx tests/legibility.test.ts
git commit -m "feat(ui): demographics selector + overlay + end-game recap"
```

---

## Task 3: Era ceremony

**Files:** Create `src/ui/panels/EraCeremony.tsx`; Modify `src/ui/GameScreen.tsx`.

UI-only; verified by `npm run build` + manual.

- [ ] **Step 1: Create `src/ui/panels/EraCeremony.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { currentEra } from '../../engine/selectors';

const ERA_FLAVOR: Record<string, string> = {
  ancient: 'The first cities rise from the dust.',
  classical: 'Philosophy, law, and legions shape a classical age.',
  medieval: 'Faith and steel define a new world.',
  renaissance: 'A flowering of art and reason dawns.',
};

let lastEraIdx = -1;

export function EraCeremony() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;
    const eraId = currentEra(gameCtx, game, viewer);
    const idx = gameCtx.rules.eras.findIndex((e) => e.id === eraId);
    // init on first run, and reset (no fire) when a new game drops the era back down
    if (lastEraIdx === -1 || idx < lastEraIdx) { lastEraIdx = idx; return; }
    if (idx > lastEraIdx) { lastEraIdx = idx; setShown(eraId); }
  }, [game, viewer]);

  if (!shown) return null;
  const era = gameCtx.rules.eras.find((e) => e.id === shown)!;
  return (
    <div className="modal-center" onClick={() => setShown(null)}>
      <div className="victory-card plate" onClick={(e) => e.stopPropagation()}>
        <h1>{era.name}</h1>
        <div className="by">{ERA_FLAVOR[shown] ?? ''}</div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={() => setShown(null)}>Onward</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `GameScreen`**

In `src/ui/GameScreen.tsx`: import `import { EraCeremony } from './panels/EraCeremony';` and render it among the always-mounted components (e.g. after `<Notifications />`):

```tsx
      <EraCeremony />
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, research into a new era (or use the debug bridge to grant era techs) — a full-screen card announces the era; dismiss it with the button / click. Starting a fresh game does not re-fire stale ceremonies.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/EraCeremony.tsx src/ui/GameScreen.tsx
git commit -m "feat(ui): full-screen era-advance ceremony"
```

---

## Task 4: Milestone banners

**Files:** Create `src/ui/panels/MilestoneBanner.tsx`; Modify `src/ui/GameScreen.tsx`.

UI-only; verified by `npm run build` + manual.

- [ ] **Step 1: Create `src/ui/panels/MilestoneBanner.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';

const BANNER_TYPES = new Set(['wonderBuilt', 'religionFounded']);
let lastBannerId = -1;

export function MilestoneBanner() {
  const toasts = useApp((s) => s.toasts);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!toasts.length) return;
    const maxId = Math.max(...toasts.map((t) => t.id));
    const hit = [...toasts].reverse().find((t) => t.id > lastBannerId && BANNER_TYPES.has(t.type));
    lastBannerId = Math.max(lastBannerId, maxId);
    if (!hit) return;
    setBanner(hit.msg);
    const timer = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (!banner) return null;
  return (
    <div
      className="plate"
      style={{ position: 'fixed', top: '16%', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '14px 30px', textAlign: 'center', pointerEvents: 'none' }}
    >
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: 20, color: 'var(--brass)' }}>{banner}</div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `GameScreen`**

In `src/ui/GameScreen.tsx`: import `import { MilestoneBanner } from './panels/MilestoneBanner';` and render it among the always-mounted components (e.g. after `<EraCeremony />`):

```tsx
      <MilestoneBanner />
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, finish a wonder or found a religion — a prominent centered banner announces it and fades after a few seconds. Other events still use the small corner toasts.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/MilestoneBanner.tsx src/ui/GameScreen.tsx
git commit -m "feat(ui): prominent milestone banners for wonders and religions"
```

---

## Closing: docs

- [ ] Mark the Legibility track shipped in `docs/2026-06-17-testing-feedback.md` (note civilopedia still deferred).
- [ ] Commit spec + plan + doc:

```bash
git add docs/superpowers/specs/2026-06-18-legibility-design.md docs/superpowers/plans/2026-06-18-legibility.md docs/2026-06-17-testing-feedback.md
git commit -m "docs(legibility): spec, implementation plan, and shipped note"
```

---

## Self-review

- **Spec coverage:** victory-progress selector + overlay (Task 1); demographics selector + overlay + end-game recap (Task 2); era ceremony (Task 3); milestone banners (Task 4). All four spec features mapped.
- **Type consistency:** `VictoryPath`/`victoryProgress` (Task 1) and `DemoRow`/`demographics` (Task 2) defined in selectors and consumed by their overlays; overlay union extended once (Task 1) for both values; keybinds `V`/`B` and the two overlay renders are consistent.
- **Layering / determinism:** pure selectors; UI never imports `src/ai`; no engine logic, no schema bump, no RNG, AI/self-play untouched (no full-suite re-tune needed — the selectors are read-only).
- **No placeholders:** every code step shows full code; every run step states expected output. (One conditional note in Task 2 Step 7: add a `!p.barbarian` filter to `scores` only if barbarians would render — the implementer checks the existing `scores` construction.)
