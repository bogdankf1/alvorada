# Overlay Pages Redesign — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorm). Next: implementation plan.
**Source:** Flow-testing feedback, Batch 4 (`docs/2026-06-17-testing-feedback.md` items #8–#11).

## Goal

Make the full-screen overlay pages — Civics, Victory, Demographics, Powers (Foreign
Affairs), and Chronicle — visually beautiful, consistent in style, and space-filling.
Fix the Civics text-overlap bug, prompt the player to adopt a policy when they can, and
move Chronicle's entry point from the bottom-right HUD to the top bar.

This is a **UI-only** change. No engine, AI, schema, RNG, or data changes → no
determinism risk and no self-play seed re-tune. Existing 308 tests must stay green; one
new pure-function test is added.

## Background — current state

Every overlay renders `overlay-scrim` (blurred full-screen backdrop) → a header (the
Tech tree's `tech-head` classes, borrowed) → a content area. The shell is *loosely*
shared (each page hand-rolls its content with inline styles), which causes the problems:

- **Civics overlap (bug, #8):** `Civics.tsx` positions each policy at
  `(branchColumn, prereqDepth)`. Each branch has a root (cost 50, depth 0) and **two**
  children at depth 1 (Tradition → `monarchy` + `landed_elite`; Liberty → `republic` +
  `meritocracy`; Piety → `theocracy` + `free_thought`). The two depth-1 siblings get the
  identical `left/top` and render on top of each other — the ghosted text in the
  screenshot. The Tech tree avoids this by authoring explicit `pos.col/row` per tech and
  drawing SVG connectors; Civics does neither.
- **Wasted space (#10):** Demographics is a `maxWidth:720` table pinned to the top;
  Victory a `maxWidth:560` centered column. Both leave most of the screen empty.
- **Inconsistency (#10):** content layouts are ad-hoc inline styles; no shared card or
  section vocabulary.
- **Chronicle entry point (#11):** opened from `HudRight.tsx:48` (bottom-right), not the
  top bar where the other overlays live.

Confirmed: all policy `prereqs` are within the same branch (see
`src/data/standard/policies.ts`), so a per-branch tree layout is self-contained.

"Powers" in the top bar opens the `diplomacy` overlay = `ForeignAffairs.tsx`.

## Design

### 1. Shared shell — `OverlaySheet` (new) + CSS vocabulary

New component `src/ui/panels/OverlaySheet.tsx`:

```tsx
OverlaySheet(props: {
  title: string;
  subtitle?: React.ReactNode;   // muted line under/beside the title
  actions?: React.ReactNode;    // right-aligned header content, before Close
  variant?: 'wide' | 'sheet';   // 'wide' = full-bleed grids; 'sheet' = dashboard width
  children: React.ReactNode;
})
```

Renders: `overlay-scrim` (click → `overlay: null`) → `.sheet` (with `stopPropagation`)
→ `.sheet__head` (Cinzel title + a **brass rule** underline + subtitle + `actions` +
`Close (Esc)` button) → `.sheet__body` (scrollable, padded, fills height). Esc-to-close
already exists globally in `GameScreen.tsx`; the shell does not re-bind it.

New classes in `src/ui/app.css`, built on existing `--brass / --ivory / --lacquer /
--ivory-dim` tokens (no new color tokens):

- `.sheet` — panel container; `wide` fills, `sheet` caps at a comfortable width; vertical
  flex, fills viewport height.
- `.sheet__head` — art-deco header; refines the existing `tech-head` look and adds a
  brass rule. (`tech-head` stays as-is for any header not yet migrated during phasing.)
- `.sheet__body` — scroll region (reuses `scroll-quiet`), generous padding.
- `.sheet__cols` — responsive multi-column grid for dashboards (auto-fit, min column
  width, wraps on narrow/iPad).
- `.sheet-card` — consistent card: lacquer surface, brass border, radius, padding.

### 2. Civics — connected skill-tree, fixed (#8) + adopt prompt (#9)

- **Pure layout function** — new file `src/ui/panels/civics-layout.ts` exporting
  `civicsLayout`: input the policy list; output `{ nodes: {id, col, row}[], edges:
  {from, to}[] }`. Each branch is a column; within a branch every policy gets a **unique
  row** (root row 0, children stacked below in stable order) so two nodes can never share
  a cell. `edges` connect each policy to each of its prereqs.
- **Render:** mirror the Tech tree — an absolutely-positioned grid of `tech-node`
  elements (reuse the class for sibling styling) plus an SVG layer drawing bezier
  conduits for `edges`, lit when the prereq is adopted (same stroke treatment as
  `TechTree.tsx`). Branch labels reuse `tech-era-label`.
- **Adopt prompt (#9):** compute `affordableAvailable` = count of policies that are
  un-adopted, prereqs met, and `policyProgress >= cost`. When `> 0`, the sheet header
  shows a brass CTA chip ("▸ You can adopt a policy now") and available nodes get a
  gentle emphasis (existing `is-available` state, optionally a soft pulse). When `0`, no
  CTA. This is page-local only — Civics is **not** added to the turn-gate (policies stay
  optional).

### 3. Space-filling dashboards (#10)

- **Victory** (`VictoryProgress.tsx`): `variant='sheet'`; render the four paths as
  `.sheet-card`s in a `.sheet__cols` grid — each card: path label, big hero `%`, a
  progress bar, and the detail line. The closest path accented in brass.
- **Demographics** (`Demographics.tsx`): `variant='sheet'`; full-width comparison table
  where each numeric cell shows the value plus a **mini-bar** scaled to the max across
  nations (so it reads as standings). You bolded; leader’s cells subtly highlighted.
- **Chronicle** (`Chronicle.tsx`): `variant='sheet'`; a consistent timeline list inside
  the sheet body (readable column width within the filled sheet).
- **Powers / Foreign Affairs** (`ForeignAffairs.tsx`): wrap in `OverlaySheet`; align the
  existing `.powers` / `.power` / `.deal` markup to the shared `.sheet-card` vocabulary.
  **Diplomacy logic is untouched** — visual restyle only.
- **Tech tree** (`TechTree.tsx`): migrate to `OverlaySheet variant='wide'`; keep its
  existing `tech-scroll`/`tech-grid`/`tech-node` content layout unchanged.

### 4. Chronicle entry point (#11)

Add a "Chronicle" button to `TopBar.tsx` alongside Civics / Victory / Demographics /
Powers (sets `overlay: 'chronicle'`; keep the existing `H` shortcut). Remove the
bottom-right Chronicle button at `HudRight.tsx:48`.

## Components & boundaries

- `OverlaySheet.tsx` — presentational shell; depends only on `appStore` (to close) and
  CSS. Every overlay composes it.
- `civics-layout.ts` — pure, dependency-free layout/graph function; the only unit-tested
  piece.
- Each overlay page — composes `OverlaySheet` + shared classes; owns its own data
  wiring via existing selectors (`victoryProgress`, `demographics`, etc.).

## Testing

- **New:** `tests/civics-layout.test.ts` — assert `civicsLayout` (a) gives no two nodes
  the same `(col,row)`, (b) places every prereq in a strictly-lower row than its child,
  (c) produces one edge per prereq relationship.
- **Regression:** full suite stays at 308 green (no engine/selector/AI/data change).
- **Manual:** visual verification in the running app per page (the user is in a live
  testing loop) — reload and confirm each overlay.
- **Build:** `npm run build` (tsc) must pass — not just `npm test`.

## Phasing (each phase leaves the game playable + tests green)

1. **Shell + simple pages:** `OverlaySheet` + CSS vocab; migrate Victory, Demographics,
   Chronicle; add Chronicle to the top bar and remove the HudRight button.
2. **Civics:** pure `civicsLayout` + its test; connectors; adopt prompt.
3. **Powers + Tech shell:** wrap Foreign Affairs and the Tech tree in `OverlaySheet`.

## Out of scope / non-goals

- No engine/data/AI/schema changes; no new game mechanics.
- Civilopedia (still deferred).
- No changes to diplomacy deal logic, victory/demographics selector math, or the Tech
  tree's internal grid layout.
- Not adding Civics to the turn-gate.

## Open follow-ups (revisitable, non-blocking)

- A shared progress-ring component if more pages want rings later (Victory uses bars for
  now).
- Per-page accent colors / decorative flourishes (the "go ornate" option was declined in
  favor of the polished cohesive shell).
