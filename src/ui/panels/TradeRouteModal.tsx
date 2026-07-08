import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { gameCtx } from '../../app/driver';
import { validateAction } from '../../engine/validate';

export function TradeRouteModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const unitId = useApp((s) => s.tradeRouteUnit);
  const clear = () => appStore.set({ tradeRouteUnit: null });
  if (!game || unitId === null) return null;
  if (!game.units[unitId]) { clear(); return null; }
  const targets = Object.values(game.cities).filter(
    (c) => validateAction(gameCtx, game, { type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id }).ok,
  );
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h3>Establish Trade Route</h3>
        {targets.length === 0 && <p>No reachable city to trade with from here.</p>}
        {targets.map((c) => (
          <button
            key={c.id}
            className="btn"
            onClick={() => {
              humanDispatch({ type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id });
              clear();
            }}
          >
            {c.name} — {c.owner !== viewer ? 'international (gold)' : 'domestic (food + production)'}
          </button>
        ))}
        <button className="btn" onClick={clear}>Cancel</button>
      </div>
    </div>
  );
}
