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
