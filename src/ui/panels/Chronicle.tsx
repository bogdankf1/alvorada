import { appStore, focusCamera, useApp } from '../../app/store';

export function Chronicle() {
  const game = useApp((s) => s.game);
  if (!game) return null;
  const close = () => appStore.set({ overlay: null });
  const entries = [...game.chronicle].reverse();
  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="diplo" onClick={(e) => e.stopPropagation()}>
        <div className="tech-head">
          <h2>CHRONICLE</h2>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>
        <div className="diplo-body scroll-quiet">
          {entries.length === 0 && <div className="muted">The age is young; no deeds yet recorded.</div>}
          {entries.map((e, i) => (
            <div
              key={i}
              className="chron-row"
              style={{ padding: '4px 2px', borderBottom: '1px solid rgba(200,165,91,0.12)', cursor: e.q !== undefined ? 'pointer' : 'default' }}
              onClick={() => { if (e.q !== undefined && e.r !== undefined) { focusCamera(e.q, e.r); close(); } }}
            >
              <span className="muted" style={{ fontSize: 11 }}>Turn {e.turn}</span> · {e.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
