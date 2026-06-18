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
