import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { IconAmphora } from '../icons';
import { OverlaySheet } from './OverlaySheet';
import { civicsLayout } from './civics-layout';

const COL_W = 260;
const ROW_H = 104;
const NODE_W = 210;
const NODE_H = 58;
const PAD_X = 20;
const PAD_TOP = 26;

export function Civics() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game) return null;
  const player = game.players[viewer];
  const policies = Object.values(gameCtx.rules.policies);
  const adopted = new Set(player.policies);
  const canAdopt = (id: string) => {
    const p = gameCtx.rules.policies[id];
    return !adopted.has(id) && p.prereqs.every((pre) => adopted.has(pre)) && player.policyProgress >= p.cost;
  };
  const layout = civicsLayout(policies);
  const posOf = new Map(layout.nodes.map((n) => [n.id, n]));
  const affordable = policies.filter((p) => canAdopt(p.id)).length;

  const cx = (col: number) => col * COL_W + PAD_X + NODE_W / 2;
  const nodeTop = (row: number) => row * ROW_H + PAD_TOP;

  return (
    <OverlaySheet
      title="THE SOCIAL ORDER"
      variant="wide"
      subtitle={<><IconAmphora size={12} /> {player.policyProgress} culture banked toward the next policy</>}
      actions={affordable > 0 ? <span className="sheet__cta">▸ You can adopt a policy now</span> : undefined}
    >
      <div
        className="tech-grid"
        style={{ width: layout.cols.length * COL_W + 40, height: layout.rows * ROW_H + 40 }}
      >
        {layout.cols.map((br, ci) => (
          <div key={br} className="tech-era-label" style={{ left: ci * COL_W + PAD_X }}>{br}</div>
        ))}
        {/* prerequisite conduits — bezier from parent bottom to child top, bowed
            left so connectors to non-adjacent children arc around nodes between */}
        <svg
          width={layout.cols.length * COL_W + 40}
          height={layout.rows * ROW_H + 40}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {layout.edges.map((e) => {
            const from = posOf.get(e.from)!;
            const to = posOf.get(e.to)!;
            const x = cx(to.col);
            const py = nodeTop(from.row) + NODE_H;
            const cyTop = nodeTop(to.row);
            const bow = 24 + (to.row - from.row - 1) * 16;
            const lit = adopted.has(e.from);
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M${x},${py} C${x - bow},${py + 14} ${x - bow},${cyTop - 14} ${x},${cyTop}`}
                stroke={lit ? 'rgba(200,165,91,0.75)' : 'rgba(120,130,150,0.3)'}
                strokeWidth={lit ? 1.8 : 1.2}
                fill="none"
              />
            );
          })}
        </svg>
        {/* nodes */}
        {layout.nodes.map((n) => {
          const p = gameCtx.rules.policies[n.id];
          const state = adopted.has(n.id) ? 'is-known' : canAdopt(n.id) ? 'is-available' : 'is-locked';
          return (
            <div
              key={n.id}
              className={`tech-node ${state}`}
              style={{ left: n.col * COL_W + PAD_X, top: n.row * ROW_H + PAD_TOP, width: NODE_W }}
              onClick={() => {
                if (state === 'is-available' && isMyTurn())
                  humanDispatch({ type: 'ADOPT_POLICY', player: viewer, policy: n.id });
              }}
            >
              <h4>{p.name}</h4>
              <div className="cost">
                <IconAmphora size={11} /> {p.cost}{adopted.has(n.id) ? ' · adopted' : ''}
              </div>
            </div>
          );
        })}
      </div>
    </OverlaySheet>
  );
}
