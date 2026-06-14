import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { IconAmphora } from '../icons';

const COL_W = 240;
const ROW_H = 110;

export function Civics() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];
  const policies = Object.values(gameCtx.rules.policies);
  const branches = [...new Set(policies.map((p) => p.branch))].sort();
  const adopted = new Set(player.policies);
  const depth = (id: string): number => {
    const p = gameCtx.rules.policies[id];
    return p.prereqs.length ? 1 + Math.max(...p.prereqs.map(depth)) : 0;
  };
  const canAdopt = (p: (typeof policies)[number]) =>
    !adopted.has(p.id) && p.prereqs.every((pre) => adopted.has(pre)) && player.policyProgress >= p.cost;
  const close = () => appStore.set({ overlay: null });

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="tech-head" onClick={(e) => e.stopPropagation()}>
        <h2>THE SOCIAL ORDER</h2>
        <span style={{ color: 'var(--ivory-dim)', fontSize: 13 }}>
          <IconAmphora size={12} /> {player.policyProgress} culture banked toward the next policy
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={close}>Close (Esc)</button>
      </div>
      <div className="tech-scroll scroll-quiet" onClick={(e) => e.stopPropagation()}>
        <div className="tech-grid" style={{ width: branches.length * COL_W + 40, height: 5 * ROW_H }}>
          {branches.map((br, ci) => (
            <div key={br} className="tech-era-label" style={{ left: ci * COL_W + 6 }}>{br}</div>
          ))}
          {policies.map((p) => {
            const ci = branches.indexOf(p.branch);
            const ri = depth(p.id);
            const state = adopted.has(p.id) ? 'is-known' : canAdopt(p) ? 'is-available' : 'is-locked';
            return (
              <div
                key={p.id}
                className={`tech-node ${state}`}
                style={{ left: ci * COL_W + 6, top: ri * ROW_H + 24 }}
                onClick={() => {
                  if (state === 'is-available' && isMyTurn())
                    humanDispatch({ type: 'ADOPT_POLICY', player: viewer, policy: p.id });
                }}
              >
                <h4>{p.name}</h4>
                <div className="cost"><IconAmphora size={11} /> {p.cost}{adopted.has(p.id) ? ' · adopted' : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
