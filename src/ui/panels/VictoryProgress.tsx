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
