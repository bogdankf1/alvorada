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
