# ALVORADA

*A 4X strategy of the first dawn* — a browser-based, Civilization-inspired turn-based
strategy game. Settle cities, work the land, chart a parchment world, research your way
out of the Ancient Era, and win by conquest or by the weight of your civilization's score.

Built in TypeScript with a pure deterministic game engine (canvas map, React panels).
No backend, no assets — every tile, unit, and banner is painted procedurally.

## Play

```sh
npm install
npm run dev        # http://localhost:5173
```

- **Select** a unit by clicking it; click the map to move (multi-turn marches are
  remembered), click an enemy to attack. Click a city's nameplate for the city screen.
- **Pan** by dragging or WASD/arrows; **zoom** with the wheel.
- **Keys:** `Enter` end turn · `T` tech tree · `N` next idle unit · `F` fortify ·
  `Space` skip · `Esc` close/deselect.
- The **Counsel** button shows every rival decision with its stated reason — the AI is
  deliberately explainable.
- Autosave every round; export/import saves from the menu.

## The shape of the code

| Layer | Where | Rule |
|---|---|---|
| Ruleset (all content) | `src/data/` | Terrain, units, techs, buildings, resources, civs — pure data. Add a def, the game grows. |
| Engine | `src/engine/` | Pure, deterministic, serializable. `state' = reduce(state, action)`, nothing else. No DOM, no `Math.random`, no transcendental math. |
| AI | `src/ai/` | A pure function of (state, player) returning one explainable action. Plays by the same rules and the same fog as you. |
| Driver | `src/app/` | Owns the action log, paces AI turns, autosaves. The engine never knows it exists. |
| UI | `src/ui/` | Canvas renderer (terrain, parchment fog, animations) + React panels. Disposable by design. |

A game is fully determined by `(config, action log)` — replays are bit-identical, which
is enforced by tests and is the load-bearing wall for a future server-authoritative
multiplayer (see `PLAN.md` §9). The visual language is specified in `DESIGN.md`.

## Verification

```sh
npm test           # 49 tests: engine rules, map gen, replay determinism, AI self-play
npm run sim        # AI-vs-AI balance telemetry
node scripts/shot.mjs   # drives the real game in headless Chrome, screenshots to shots/
npm run build      # type-check + production bundle
```

The self-play suite plays whole 4-player games and re-applies every recorded action to
prove the world reproduces exactly — the engine's core promise, exercised end to end.
