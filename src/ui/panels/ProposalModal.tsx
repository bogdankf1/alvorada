import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';

export function ProposalModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const id = useApp((s) => s.proposalModal);
  if (!game || id === null) return null;
  const p = game.proposals.find((x) => x.id === id && x.to === viewer);
  if (!p) return null;
  const from = game.players[p.from];
  const summary = (d: typeof p.give) => {
    const parts: string[] = [];
    if (d.peace) parts.push('peace');
    if (d.friendship) parts.push('friendship');
    if (d.gold) parts.push(`${d.gold} gold`);
    if (d.goldPerTurn) parts.push(`${d.goldPerTurn.amount} gold/turn (${d.goldPerTurn.turns}t)`);
    if (d.openBorders) parts.push('open borders');
    return parts.length ? parts.join(', ') : 'nothing';
  };
  const clear = () => appStore.set({ proposalModal: null });
  const respond = (accept: boolean) => {
    humanDispatch({ type: 'RESPOND_DEAL', player: viewer, proposal: p.id, accept });
    clear();
  };
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>{from.name.toUpperCase()} PROPOSES</h2>
        <p>
          They give: <b>{summary(p.give)}</b>
          <br />
          They ask: <b>{summary(p.take)}</b>
        </p>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={() => respond(true)}>Accept</button>
          <button className="btn btn--danger" onClick={() => respond(false)}>Reject</button>
          <button className="btn" onClick={clear}>Later</button>
        </div>
      </div>
    </div>
  );
}
