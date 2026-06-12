import { useApp } from '../../app/store';

/** The rivals' counsel: every AI decision with its stated reason (explainability). */
export function AiLog() {
  const open = useApp((s) => s.aiLogOpen);
  const log = useApp((s) => s.aiLog);
  const game = useApp((s) => s.game);
  if (!open || !game) return null;
  return (
    <div className="ai-log plate">
      <h3 className="plate-title">Counsel of Rivals</h3>
      <div className="ai-log-scroll scroll-quiet">
        {log.length === 0 && (
          <div className="ai-log-row">The rivals have made no moves yet.</div>
        )}
        {[...log].reverse().map((e, i) => (
          <div key={`${e.turn}:${i}`} className="ai-log-row">
            <span className="dot" style={{ background: game.players[e.player]?.color ?? '#888' }} />
            <span className="turn">T{e.turn}</span>
            <span>{e.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
