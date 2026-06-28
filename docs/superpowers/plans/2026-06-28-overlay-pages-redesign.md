# Overlay Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Alvorada's full-screen overlays (Civics, Victory, Demographics, Powers/Foreign Affairs, Chronicle, Tech) a single beautiful, consistent shell that fills the screen; fix the Civics text-overlap bug; prompt the player to adopt a policy when they can; and move Chronicle's entry point to the top bar.

**Architecture:** A new presentational `OverlaySheet` component + a `.sheet*` CSS vocabulary replaces each page's hand-rolled shell. Civics gets a pure `civicsLayout` function (collision-free node placement) + SVG connectors, the only unit-tested piece. All other changes are presentational refactors that reuse existing selectors. UI-only: no engine, AI, schema, RNG, or data changes → no determinism impact, no seed re-tune.

**Tech Stack:** React + TypeScript, a small global store (`appStore`), plain CSS with design tokens in `theme.css`, Vite build (`npm run build` = tsc + bundle), Vitest (`npm test`).

**Branch:** All work happens on `overlay-pages-redesign` (already created). Commit messages follow the repo convention — conventional-commit prefixes, **no AI attribution / Co-Authored-By lines**.

---

## File Structure

- **Create** `src/ui/panels/OverlaySheet.tsx` — the shared overlay shell (scrim + art-deco header + filled body). One responsibility: chrome.
- **Create** `src/ui/panels/civics-layout.ts` — pure layout/graph function for Civics. No React, no imports beyond the `PolicyDef` type.
- **Create** `tests/civics-layout.test.ts` — unit tests for `civicsLayout`.
- **Modify** `src/ui/app.css` — append the `.sheet*` / `.sheet-card` / dashboard helper classes.
- **Modify** `src/ui/panels/VictoryProgress.tsx` — card-grid dashboard via `OverlaySheet`.
- **Modify** `src/ui/panels/Demographics.tsx` — full-width mini-bar table via `OverlaySheet`.
- **Modify** `src/ui/panels/Chronicle.tsx` — timeline list via `OverlaySheet`.
- **Modify** `src/ui/panels/Civics.tsx` — connected skill-tree via `OverlaySheet` + `civicsLayout` + adopt CTA.
- **Modify** `src/ui/panels/ForeignAffairs.tsx` — wrap in `OverlaySheet`; swap `.diplo` shell for `.diplo-grid`.
- **Modify** `src/ui/panels/TechTree.tsx` — wrap in `OverlaySheet` (keep grid content).
- **Modify** `src/ui/panels/TopBar.tsx` — add a Chronicle button.
- **Modify** `src/ui/panels/HudRight.tsx` — remove the bottom-right Chronicle button.

---

## Phase 1 — Shared shell, simple dashboards, Chronicle move

### Task 1: `OverlaySheet` component + CSS vocabulary

**Files:**
- Create: `src/ui/panels/OverlaySheet.tsx`
- Modify: `src/ui/app.css` (append a new block at end of file)

- [ ] **Step 1: Create the component**

```tsx
// src/ui/panels/OverlaySheet.tsx
import type { ReactNode } from 'react';
import { appStore } from '../../app/store';

/**
 * Shared full-screen overlay shell: blurred scrim + art-deco header (title,
 * optional subtitle, optional right-side actions, Close) + a filled, scrollable
 * body. Click-scrim-to-close; Esc is handled globally in GameScreen.
 *  - variant 'wide'  : full-bleed body (for the Tech/Civics absolute grids)
 *  - variant 'sheet' : body capped to a readable width, centered (dashboards)
 */
export function OverlaySheet(props: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  variant?: 'wide' | 'sheet';
  children: ReactNode;
}) {
  const { title, subtitle, actions, variant = 'sheet', children } = props;
  const close = () => appStore.set({ overlay: null });
  return (
    <div className="overlay-scrim" onClick={close}>
      <div className={`sheet sheet--${variant}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2>{title}</h2>
          {subtitle != null && <span className="sheet__subtitle">{subtitle}</span>}
          <div className="grow" />
          {actions}
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>
        <div className="sheet__body scroll-quiet">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append the CSS vocabulary**

Append to the **end** of `src/ui/app.css`:

```css
/* --- shared overlay sheet (OverlaySheet.tsx) --- */
.sheet {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}
.sheet__head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 30px 12px;
  border-bottom: 1px solid rgba(200, 165, 91, 0.28);
  background: linear-gradient(180deg, rgba(200, 165, 91, 0.07), transparent);
}
.sheet__head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 22px;
  color: var(--brass);
}
.sheet__subtitle {
  color: var(--ivory-dim);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.sheet__body {
  flex: 1;
  overflow: auto;
  padding: 24px 30px 32px;
}
.sheet--sheet .sheet__body {
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}
.sheet__cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
}
.sheet-card {
  background: linear-gradient(180deg, var(--lacquer-hi), var(--lacquer-lo));
  border: 1px solid #3a4456;
  padding: 16px 18px;
  clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px);
}
.sheet-card.is-accent {
  border-color: var(--brass-bright);
  box-shadow: 0 0 18px rgba(200, 165, 91, 0.22);
}
.sheet__cta {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1c1606;
  background: linear-gradient(180deg, var(--brass-bright), var(--brass));
  padding: 5px 11px;
  clip-path: polygon(5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 5px);
  animation: cta-pulse 1.8s ease-in-out infinite;
}
@keyframes cta-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}
/* victory dashboard */
.vp-label { font-family: var(--font-display); letter-spacing: 0.1em; color: var(--ivory); font-size: 14px; }
.vp-pct { font-family: var(--font-display); font-size: 40px; line-height: 1; color: var(--brass-bright); margin: 10px 0 8px; }
.vp-pct span { font-size: 18px; color: var(--ivory-dim); margin-left: 2px; }
.vp-detail { font-size: 12px; color: var(--ivory-dim); margin-top: 10px; }
.sheet-card.is-accent .vp-label { color: var(--brass); }
/* demographics dashboard */
.demo-cell { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
.demo-cell .num { font-variant-numeric: tabular-nums; }
.demo-cell .bar { width: 78px; height: 5px; }
.score-table th { font-family: var(--font-display); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brass-dim); padding: 6px 8px; }
.score-table tr.is-you { background: linear-gradient(90deg, rgba(200, 165, 91, 0.12), transparent); }
/* foreign affairs grid (replaces .diplo-body scroll wrapper) */
.diplo-grid { display: grid; grid-template-columns: 340px 1fr; gap: 22px; }
@media (max-width: 720px) {
  .diplo-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: `✓ built in …` with no TypeScript errors. (`OverlaySheet` is unused so far — that's fine; it's an exported module, not an unused local, so `--noUnusedLocals` won't flag it.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/OverlaySheet.tsx src/ui/app.css
git commit -m "feat(ui): shared OverlaySheet shell + sheet CSS vocabulary"
```

---

### Task 2: Victory dashboard

**Files:**
- Modify: `src/ui/panels/VictoryProgress.tsx` (full rewrite of the returned JSX)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/ui/panels/VictoryProgress.tsx` with:

```tsx
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { victoryProgress } from '../../engine/selectors';
import { OverlaySheet } from './OverlaySheet';

export function VictoryProgress() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const paths = victoryProgress(gameCtx, game, viewer);
  const closest = paths.reduce((a, b) => (b.pct > a.pct ? b : a));

  return (
    <OverlaySheet
      title="THE ROADS TO VICTORY"
      subtitle="Every path to lasting renown, and how far you have walked it"
    >
      <div className="sheet__cols">
        {paths.map((p) => {
          const pct = Math.round(p.pct * 100);
          return (
            <div key={p.kind} className={`sheet-card ${p === closest ? 'is-accent' : ''}`}>
              <div className="vp-label">{p.label}{p === closest ? ' · closest' : ''}</div>
              <div className="vp-pct">{pct}<span>%</span></div>
              <div className="bar"><i style={{ width: `${pct}%`, background: 'var(--brass)' }} /></div>
              <div className="vp-detail">{p.detail}</div>
            </div>
          );
        })}
      </div>
    </OverlaySheet>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors. (`appStore` import dropped — no longer referenced.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/panels/VictoryProgress.tsx
git commit -m "feat(ui): victory overlay as card-grid dashboard"
```

---

### Task 3: Demographics dashboard

**Files:**
- Modify: `src/ui/panels/Demographics.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/ui/panels/Demographics.tsx` with:

```tsx
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { demographics } from '../../engine/selectors';
import { OverlaySheet } from './OverlaySheet';

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
  const max: Record<string, number> = {};
  for (const c of COLS) max[c.key] = Math.max(1, ...rows.map((r) => r[c.key]));

  return (
    <OverlaySheet
      title="THE STANDING OF NATIONS"
      subtitle="How your realm measures against the powers you have met"
    >
      <table className="score-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Nation</th>
            {COLS.map((c) => <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player} className={r.isYou ? 'is-you' : ''} style={{ fontWeight: r.isYou ? 700 : 400 }}>
              <td>
                <span className="civ-dot" style={{ background: game.players[r.player].color, display: 'inline-block', marginRight: 8 }} />
                {r.name} · {gameCtx.rules.civs[r.civ].name}{r.isYou ? ' (you)' : ''}
              </td>
              {COLS.map((c) => (
                <td key={c.key}>
                  <div className="demo-cell">
                    <span className="num">{r[c.key]}</span>
                    <span className="bar"><i style={{ width: `${(r[c.key] / max[c.key]) * 100}%`, background: 'var(--brass)' }} /></span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </OverlaySheet>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/panels/Demographics.tsx
git commit -m "feat(ui): demographics overlay as mini-bar standings dashboard"
```

---

### Task 4: Chronicle via OverlaySheet + move entry to the top bar

**Files:**
- Modify: `src/ui/panels/Chronicle.tsx` (full rewrite)
- Modify: `src/ui/panels/TopBar.tsx` (add a button)
- Modify: `src/ui/panels/HudRight.tsx` (remove a line)

- [ ] **Step 1: Rewrite Chronicle**

Replace the entire contents of `src/ui/panels/Chronicle.tsx` with:

```tsx
import { useMemo } from 'react';
import { appStore, focusCamera, useApp } from '../../app/store';
import { OverlaySheet } from './OverlaySheet';

export function Chronicle() {
  const game = useApp((s) => s.game);
  const entries = useMemo(() => [...(game?.chronicle ?? [])].reverse(), [game?.chronicle]);
  if (!game) return null;
  const close = () => appStore.set({ overlay: null });
  return (
    <OverlaySheet title="CHRONICLE" subtitle="The deeds and disasters of the age, newest first">
      {entries.length === 0 && <div className="muted">The age is young; no deeds yet recorded.</div>}
      {entries.map((e, i) => (
        <div
          key={i}
          className="chron-row"
          style={{ padding: '6px 2px', borderBottom: '1px solid rgba(200,165,91,0.12)', cursor: e.q !== undefined ? 'pointer' : 'default' }}
          onClick={() => { if (e.q !== undefined && e.r !== undefined) { focusCamera(e.q, e.r); close(); } }}
        >
          <span className="muted" style={{ fontSize: 11 }}>Turn {e.turn}</span> · {e.msg}
        </div>
      ))}
    </OverlaySheet>
  );
}
```

- [ ] **Step 2: Add the Chronicle button to the top bar**

In `src/ui/panels/TopBar.tsx`, find the Powers button block (the `<button …>Powers{pending > 0 ? ` ●` : ''}</button>`). Immediately **after** that button's closing tag, add:

```tsx
      <button className="btn btn--ghost" onClick={() => appStore.set({ overlay: 'chronicle' })} title="Chronicle (H)">Chronicle</button>
```

- [ ] **Step 3: Remove the bottom-right Chronicle button**

In `src/ui/panels/HudRight.tsx`, delete this line (currently line 48):

```tsx
      <div className="end-turn" style={{ fontSize: 13 }} onClick={() => appStore.set({ overlay: 'chronicle' })} title="Chronicle (H)">Chronicle</div>
```

After deletion, check whether `appStore` is still used elsewhere in `HudRight.tsx`. It IS still used by `Minimap` indirectly? No — grep: `appStore` appears only on that line in the outer component, but `focusCamera` and `useApp` come from the same import. Verify the import line `import { appStore, focusCamera, useApp } from '../../app/store';` — if `appStore` is now unused, remove just `appStore` from that import to satisfy `--noUnusedLocals`.

- [ ] **Step 4: Verify appStore usage in HudRight**

Run: `grep -n "appStore" src/ui/panels/HudRight.tsx`
Expected: no matches. If there are no matches, edit the import to `import { focusCamera, useApp } from '../../app/store';`. If there are still matches, leave the import as-is.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors (especially no "appStore is declared but never read").

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/Chronicle.tsx src/ui/panels/TopBar.tsx src/ui/panels/HudRight.tsx
git commit -m "feat(ui): chronicle via OverlaySheet; move entry to top bar"
```

---

## Phase 2 — Civics (bug fix + connected tree + adopt prompt)

### Task 5: Pure `civicsLayout` + tests (TDD)

**Files:**
- Create: `tests/civics-layout.test.ts`
- Create: `src/ui/panels/civics-layout.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/civics-layout.test.ts
import { describe, it, expect } from 'vitest';
import { civicsLayout } from '../src/ui/panels/civics-layout';
import { POLICIES } from '../src/data/standard/policies';

describe('civicsLayout', () => {
  const policies = Object.values(POLICIES);
  const layout = civicsLayout(policies);

  it('places exactly one node per policy and never collides', () => {
    expect(layout.nodes.length).toBe(policies.length);
    const seen = new Set<string>();
    for (const n of layout.nodes) {
      const key = `${n.col},${n.row}`;
      expect(seen.has(key)).toBe(false); // no two nodes share a cell
      seen.add(key);
    }
  });

  it('places every prereq in a strictly-lower row, same branch column', () => {
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const p of policies) {
      for (const pre of p.prereqs) {
        const child = byId.get(p.id)!;
        const parent = byId.get(pre)!;
        expect(parent.row).toBeLessThan(child.row);
        expect(parent.col).toBe(child.col);
      }
    }
  });

  it('emits exactly one edge per prereq relationship', () => {
    const total = policies.reduce((n, p) => n + p.prereqs.length, 0);
    expect(layout.edges.length).toBe(total);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- civics-layout`
Expected: FAIL — cannot find module `../src/ui/panels/civics-layout`.

- [ ] **Step 3: Implement the layout function**

```ts
// src/ui/panels/civics-layout.ts
import type { PolicyDef } from '../../data/types';

export interface CivicNode { id: string; col: number; row: number; }
export interface CivicEdge { from: string; to: string; }
export interface CivicLayout { nodes: CivicNode[]; edges: CivicEdge[]; cols: string[]; rows: number; }

/**
 * Lay policies out as one column per branch, each policy on its own row within
 * the branch (sorted by prereq depth, then id). Unique row per node makes cell
 * collisions impossible; sorting by depth guarantees every prereq sits in a
 * strictly-lower row than its child. Edges connect each policy to its prereqs.
 */
export function civicsLayout(policies: PolicyDef[]): CivicLayout {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const depthCache = new Map<string, number>();
  const depth = (id: string): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const p = byId.get(id)!;
    const d = p.prereqs.length ? 1 + Math.max(...p.prereqs.map(depth)) : 0;
    depthCache.set(id, d);
    return d;
  };

  const cols = [...new Set(policies.map((p) => p.branch))].sort();
  const nodes: CivicNode[] = [];
  let rows = 0;
  cols.forEach((branch, col) => {
    const inBranch = policies
      .filter((p) => p.branch === branch)
      .sort((a, b) => depth(a.id) - depth(b.id) || a.id.localeCompare(b.id));
    inBranch.forEach((p, row) => {
      nodes.push({ id: p.id, col, row });
      rows = Math.max(rows, row + 1);
    });
  });

  const edges: CivicEdge[] = [];
  for (const p of policies) for (const pre of p.prereqs) edges.push({ from: pre, to: p.id });

  return { nodes, edges, cols, rows };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- civics-layout`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/civics-layout.test.ts src/ui/panels/civics-layout.ts
git commit -m "feat(ui): pure civicsLayout (collision-free policy placement) + tests"
```

---

### Task 6: Civics page — connected tree + adopt CTA

**Files:**
- Modify: `src/ui/panels/Civics.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/ui/panels/Civics.tsx` with:

```tsx
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { IconAmphora } from '../icons';
import { civicsLayout } from './civics-layout';

const COL_W = 260;
const ROW_H = 104;
const NODE_W = 210;
const NODE_H = 58;
const PAD_X = 20;
const PAD_TOP = 26;

export function Civics() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];
  const policies = Object.values(gameCtx.rules.policies);
  const adopted = new Set(player.policies);
  const canAdopt = (id: string) => {
    const p = gameCtx.rules.policies[id];
    return !adopted.has(id) && p.prereqs.every((pre) => adopted.has(pre)) && player.policyProgress >= p.cost;
  };
  const layout = civicsLayout(policies);
  const posOf = new Map(layout.nodes.map((n) => [n.id, n]));
  const affordable = policies.filter((p) => canAdopt(p.id)).length;

  const cx = (col: number) => col * COL_W + PAD_X + NODE_W / 2;
  const nodeTop = (row: number) => row * ROW_H + PAD_TOP;

  return (
    <OverlaySheetCivics affordable={affordable} banked={player.policyProgress}>
      <div
        className="tech-grid"
        style={{ width: layout.cols.length * COL_W + 40, height: layout.rows * ROW_H + 40 }}
      >
        {layout.cols.map((br, ci) => (
          <div key={br} className="tech-era-label" style={{ left: ci * COL_W + PAD_X }}>{br}</div>
        ))}
        {/* prerequisite conduits — bezier from parent bottom to child top, bowed
            left so connectors to non-adjacent children arc around nodes between */}
        <svg
          width={layout.cols.length * COL_W + 40}
          height={layout.rows * ROW_H + 40}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {layout.edges.map((e) => {
            const from = posOf.get(e.from)!;
            const to = posOf.get(e.to)!;
            const x = cx(to.col);
            const py = nodeTop(from.row) + NODE_H;
            const cyTop = nodeTop(to.row);
            const bow = 24 + (to.row - from.row - 1) * 16;
            const lit = adopted.has(e.from);
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M${x},${py} C${x - bow},${py + 14} ${x - bow},${cyTop - 14} ${x},${cyTop}`}
                stroke={lit ? 'rgba(200,165,91,0.75)' : 'rgba(120,130,150,0.3)'}
                strokeWidth={lit ? 1.8 : 1.2}
                fill="none"
              />
            );
          })}
        </svg>
        {/* nodes */}
        {layout.nodes.map((n) => {
          const p = gameCtx.rules.policies[n.id];
          const state = adopted.has(n.id) ? 'is-known' : canAdopt(n.id) ? 'is-available' : 'is-locked';
          return (
            <div
              key={n.id}
              className={`tech-node ${state}`}
              style={{ left: n.col * COL_W + PAD_X, top: n.row * ROW_H + PAD_TOP, width: NODE_W }}
              onClick={() => {
                if (state === 'is-available' && isMyTurn())
                  humanDispatch({ type: 'ADOPT_POLICY', player: viewer, policy: n.id });
              }}
            >
              <h4>{p.name}</h4>
              <div className="cost">
                <IconAmphora size={11} /> {p.cost}{adopted.has(n.id) ? ' · adopted' : ''}
              </div>
            </div>
          );
        })}
      </div>
    </OverlaySheetCivics>
  );
}

function OverlaySheetCivics(props: { affordable: number; banked: number; children: React.ReactNode }) {
  const { affordable, banked, children } = props;
  return (
    <OverlaySheet
      title="THE SOCIAL ORDER"
      variant="wide"
      subtitle={<><IconAmphora size={12} /> {banked} culture banked toward the next policy</>}
      actions={affordable > 0 ? <span className="sheet__cta">▸ You can adopt a policy now</span> : undefined}
    >
      {children}
    </OverlaySheet>
  );
}
```

- [ ] **Step 2: Add the missing imports**

The rewrite above uses `OverlaySheet` and React's `ReactNode`/JSX. Ensure the top of `src/ui/panels/Civics.tsx` imports them. The final import block must be exactly:

```tsx
import type { ReactNode } from 'react';
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { IconAmphora } from '../icons';
import { OverlaySheet } from './OverlaySheet';
import { civicsLayout } from './civics-layout';
```

Then change the helper signature from `children: React.ReactNode` to `children: ReactNode` (the `React.` namespace is not imported; only the `ReactNode` type is). Final helper line:

```tsx
function OverlaySheetCivics(props: { affordable: number; banked: number; children: ReactNode }) {
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors. (`appStore` is no longer imported — close is handled by `OverlaySheet`.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (308 prior + 3 new civics-layout = 311). Note: a Vitest worker "Timeout calling onTaskUpdate" line may appear on long runs — that's a reporter hiccup, not a failure; confirm the final line reads `Tests  N passed (N)` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/Civics.tsx
git commit -m "fix(ui): civics overlay overlap; connected tree + adopt prompt"
```

---

## Phase 3 — Powers + Tech share the shell

### Task 7: Foreign Affairs (Powers) via OverlaySheet

**Files:**
- Modify: `src/ui/panels/ForeignAffairs.tsx` (only the outer shell of the `ForeignAffairs` function; `DealTable` and `NumRow` are unchanged)

- [ ] **Step 1: Replace the outer shell**

In `src/ui/panels/ForeignAffairs.tsx`, replace the `return ( … )` of the `ForeignAffairs` function (the block starting `<div className="overlay-scrim" onClick={close}>` and ending with its matching `</div>`) with:

```tsx
  return (
    <OverlaySheet title="FOREIGN AFFAIRS" variant="wide">
      <div className="diplo-grid">
        <div className="powers">
          {met.length === 0 && <div className="muted">You have met no other powers yet.</div>}
          {met.map((id) => {
            const p = game.players[id];
            const att = attitude(gameCtx, game, id, viewer);
            const war = atWar(game, viewer, id);
            const friends = game.relations[viewer][id].friends;
            const denounced = game.relations[viewer][id].denounced;
            const civ = gameCtx.rules.civs[p.civ];
            const know = agendaKnown(gameCtx, game, viewer, id);
            const knownAgenda = know.hidden && p.hiddenAgenda && p.hiddenAgenda !== civ.agenda
              ? gameCtx.rules.agendas[p.hiddenAgenda] : null;
            const histAgenda = civ.agenda ? gameCtx.rules.agendas[civ.agenda] : null;
            return (
              <div
                key={id}
                className={`power ${target === id ? 'is-active' : ''}`}
                onClick={() => pick(id)}
              >
                <span className="civ-dot" style={{ background: p.color }} />
                <div className="grow">
                  <div className="nm">{p.name} · {gameCtx.rules.civs[p.civ].name}</div>
                  <div className="att" style={{ color: ATTITUDE_COLOR[att.band] }}>
                    {ATTITUDE_LABEL[att.band]}
                    {war && <span className="badge war"> ⚔ War</span>}
                    {friends && <span className="badge friend"> ♥ Friends</span>}
                    {denounced && <span className="badge war"> ⚑ Denounced</span>}
                  </div>
                  <div className="leader-traits muted" style={{ fontSize: 11 }}>
                    {(civ.traits ?? []).map((t) => gameCtx.rules.traits[t]?.name).filter(Boolean).join(' · ')}
                    {histAgenda && <> · <span title={histAgenda.blurb}>{histAgenda.name}</span></>}
                    {knownAgenda && <> · <span title={knownAgenda.blurb}>{knownAgenda.name}</span></>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {target !== null && (
          <DealTable
            game={game}
            viewer={viewer}
            rival={target}
            draft={draft}
            setDraft={setDraft}
            term={term}
            showWhy={showWhy}
            toggleWhy={() => setShowWhy((v) => !v)}
          />
        )}
      </div>
    </OverlaySheet>
  );
```

- [ ] **Step 2: Fix imports**

At the top of `src/ui/panels/ForeignAffairs.tsx`, add the `OverlaySheet` import:

```tsx
import { OverlaySheet } from './OverlaySheet';
```

Then verify `close` is still referenced. After the rewrite, `close` is only used inside `OverlaySheet`, so the local `const close = …` and the `appStore` import may now be unused. Run: `grep -n "close\|appStore" src/ui/panels/ForeignAffairs.tsx`. If `close` is no longer used, delete its `const close = () => appStore.set({ overlay: null });` line; if `appStore` is then unused, drop it from the `import { appStore, useApp } from '../../app/store';` line (keep `useApp`). `pick`/`setDraft` still use `appStore` — verify before removing. (They do: `pick` and `setDraft` both call `appStore.set`, so `appStore` stays; only remove the unused `close`.)

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors (no unused `close`/`appStore`).

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/ForeignAffairs.tsx
git commit -m "feat(ui): foreign affairs (Powers) via OverlaySheet shell"
```

---

### Task 8: Tech tree via OverlaySheet (keep grid)

**Files:**
- Modify: `src/ui/panels/TechTree.tsx` (only the outer shell; the grid/SVG/nodes are unchanged)

- [ ] **Step 1: Replace the outer shell**

In `src/ui/panels/TechTree.tsx`, replace from `return (` through the end of the function. The new wrapper is `OverlaySheet variant="wide"`; the **inner content is the existing `<div className="tech-grid" …>…</div>` verbatim** (drop only the `overlay-scrim`, `tech-head`, and `tech-scroll` wrappers). Replace the return block with:

```tsx
  return (
    <OverlaySheet
      title="THE PATH OF KNOWLEDGE"
      variant="wide"
      subtitle={player.researching
        ? `Researching ${gameCtx.rules.techs[player.researching].name}`
        : 'Choose what your sages study next'}
    >
      <div
        className="tech-grid"
        style={{ width: (maxCol + 1) * COL_W + 40, height: (maxRow + 1) * ROW_H + 60 }}
      >
        {/* era labels */}
        {gameCtx.rules.eras.map((era) => {
          const cols = techs.filter((t) => t.era === era.id).map((t) => t.pos.col);
          if (!cols.length) return null;
          return (
            <div key={era.id} className="tech-era-label" style={{ left: Math.min(...cols) * COL_W + 6 }}>
              {era.name}
            </div>
          );
        })}
        {/* prerequisite conduits */}
        <svg
          width={(maxCol + 1) * COL_W + 40}
          height={(maxRow + 1) * ROW_H + 60}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {techs.flatMap((t) =>
            t.prereqs.map((p) => {
              const from = gameCtx.rules.techs[p].pos;
              const x1 = from.col * COL_W + NODE_W + 6;
              const y1 = from.row * ROW_H + 52;
              const x2 = t.pos.col * COL_W + 6;
              const y2 = t.pos.row * ROW_H + 52;
              const lit = known.has(p) && (known.has(t.id) || available.has(t.id) || player.researching === t.id);
              return (
                <path
                  key={`${p}->${t.id}`}
                  d={`M${x1},${y1} C${x1 + 46},${y1} ${x2 - 46},${y2} ${x2},${y2}`}
                  stroke={lit ? 'rgba(200,165,91,0.75)' : 'rgba(120,130,150,0.3)'}
                  strokeWidth={lit ? 1.8 : 1.2}
                  fill="none"
                />
              );
            }),
          )}
        </svg>
        {/* nodes */}
        {techs.map((t) => {
          const state = known.has(t.id)
            ? 'is-known'
            : player.researching === t.id
              ? 'is-current'
              : available.has(t.id)
                ? 'is-available'
                : 'is-locked';
          const unlocks = techUnlocks(gameCtx.rules, t.id);
          const progress =
            player.researching === t.id ? Math.min(1, player.science / t.cost) : known.has(t.id) ? 1 : 0;
          return (
            <div
              key={t.id}
              className={`tech-node ${state}`}
              style={{ left: t.pos.col * COL_W + 6, top: t.pos.row * ROW_H + 24 }}
              onClick={() => {
                if (state === 'is-available' && isMyTurn()) {
                  if (humanDispatch({ type: 'SET_RESEARCH', player: viewer, tech: t.id })) {
                    appStore.set({ overlay: null });
                  }
                }
              }}
            >
              <h4>{t.name}</h4>
              {t.id === gameCtx.rules.settings.victory.scienceCapstone && (
                <div className="capstone-chip">★ Science Victory</div>
              )}
              <div className="cost">
                <IconScroll size={11} /> {t.cost}
                {state === 'is-current' && ` · ${Math.round(progress * 100)}%`}
                {state === 'is-known' && ' · discovered'}
              </div>
              {unlocks.length > 0 && (
                <div className="unlocks">
                  {unlocks.map((u) => (
                    <span key={`${u.kind}:${u.id}`} className="u-chip">{u.name}</span>
                  ))}
                </div>
              )}
              {state === 'is-current' && (
                <div className="bar" style={{ marginTop: 5 }}>
                  <i style={{ width: `${progress * 100}%`, background: '#7FB6D9' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </OverlaySheet>
  );
```

- [ ] **Step 2: Fix imports**

Add to the top of `src/ui/panels/TechTree.tsx`:

```tsx
import { OverlaySheet } from './OverlaySheet';
```

`appStore` is still used (the node onClick sets `overlay: null` on research pick) and `close` is removed — verify with `grep -n "const close" src/ui/panels/TechTree.tsx` (expect none after the rewrite; the old `const close = …` line at the top of the function must be deleted). Confirm `appStore` import stays.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/TechTree.tsx
git commit -m "feat(ui): tech tree shares the OverlaySheet shell"
```

---

## Final verification

- [ ] **Step 1: Full build + test**

Run: `npm run build && npm test`
Expected: build `✓`, tests `311 passed` (308 prior + 3 new), exit 0.

- [ ] **Step 2: Manual visual checklist** (reload the running app; open each overlay)

- Civics (`C`): three branch columns, **no overlapping text**, bezier connectors light up as policies are adopted; when culture ≥ a policy cost, the brass "▸ You can adopt a policy now" CTA shows in the header and available nodes are highlighted.
- Victory (`V`): four path cards filling the width; the closest accented in brass.
- Demographics (`B`): full-width standings table with a mini-bar in each numeric cell; "you" row highlighted.
- Powers (`G`): leader list + deal table inside the unified shell; diplomacy still works (pick a rival, propose, denounce).
- Chronicle: opens from the **top bar** Chronicle button (and `H`); the bottom-right button is gone.
- Tech (`T`): same shell/header as the others; tree layout and research selection unchanged.
- Every overlay: Close (Esc) button, Esc key, and click-outside all close it.

- [ ] **Step 3: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "chore(ui): overlay redesign polish"
```

---

## Self-review notes (author)

- **Spec coverage:** #8 overlap → Task 5 (`civicsLayout`, collision-free) + Task 6 (render). #9 adopt prompt → Task 6 (`sheet__cta`). #10 beautify+unify+fill → Tasks 1–3, 6, 7, 8. #11 Chronicle to top bar → Task 4. Tech "shared shell, keep layout" → Task 8. All covered.
- **Type consistency:** `civicsLayout` returns `{ nodes, edges, cols, rows }`; Task 6 consumes exactly those names. `OverlaySheet` props (`title`, `subtitle`, `actions`, `variant`, `children`) match every call site.
- **Determinism:** no engine/AI/data/schema/RNG file is touched → no seed re-tune; existing 308 tests untouched.
