import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { availableTechs } from '../../engine/selectors';
import { techUnlocks } from '../../data/validate';
import { IconScroll } from '../icons';
import { OverlaySheet } from './OverlaySheet';

const COL_W = 218;
const ROW_H = 92;
const NODE_W = 188;

export function TechTree() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];
  const available = new Set(availableTechs(gameCtx, game, viewer));
  const known = new Set(player.techs);
  const techs = Object.values(gameCtx.rules.techs);
  const maxCol = Math.max(...techs.map((t) => t.pos.col));
  const maxRow = Math.max(...techs.map((t) => t.pos.row));

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
                      <span key={`${u.kind}:${u.id}`} className="u-chip">
                        {u.name}
                      </span>
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
}
