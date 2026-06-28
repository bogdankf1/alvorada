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
