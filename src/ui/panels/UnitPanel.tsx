import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { validateAction } from '../../engine/validate';
import type { Action } from '../../engine/types';
import { IconBoots, IconShield } from '../icons';

export function UnitPanel() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const selectedUnit = useApp((s) => s.selectedUnit);
  useApp((s) => s.aiThinking); // re-render when turn control changes
  if (!game || selectedUnit === null) return null;
  const unit = game.units[selectedUnit];
  if (!unit) return null;
  const def = gameCtx.rules.units[unit.def];
  const mine = unit.owner === viewer && isMyTurn();

  const tryButton = (label: string, action: Action, key?: string) => {
    const v = validateAction(gameCtx, game, action);
    if (!v.ok) return null;
    return (
      <button key={key ?? label} className="btn" onClick={() => humanDispatch(action)}>
        {label}
      </button>
    );
  };

  const orderLabel =
    unit.order?.kind === 'goto'
      ? 'Marching…'
      : unit.order?.kind === 'build'
        ? `Building ${gameCtx.rules.improvements[unit.order.improvement].name} (${unit.order.turnsLeft}t)`
        : null;

  return (
    <div className="unit-panel plate">
      <h3>{def.name}</h3>
      <div className="unit-stats">
        <span>
          <IconShield size={12} /> <b>{def.strength}</b>
          {def.ranged && (
            <>
              {' '}
              · ranged <b>{def.ranged.strength}</b> (r{def.ranged.range})
            </>
          )}
        </span>
        <span>
          <IconBoots size={12} /> <b>{unit.moves}</b>/{def.moves}
        </span>
        <span>
          HP <b>{unit.hp}</b>
        </span>
      </div>
      <div className="bar unit-hp">
        <i
          style={{
            width: `${unit.hp}%`,
            background: unit.hp > 60 ? 'var(--ok)' : unit.hp > 30 ? '#D9A441' : 'var(--danger)',
          }}
        />
      </div>
      {unit.stance === 'fortified' && <div style={{ color: 'var(--brass)', fontSize: 12 }}>Fortified</div>}
      {orderLabel && <div style={{ color: 'var(--ivory-dim)', fontSize: 12 }}>{orderLabel}</div>}

      {mine && (
        <div className="unit-actions">
          {tryButton('Found City', { type: 'FOUND_CITY', player: viewer, unit: unit.id })}
          {Object.values(gameCtx.rules.improvements).map((imp) =>
            tryButton(
              imp.clearsFeature ? 'Clear' : imp.name,
              { type: 'BUILD_IMPROVEMENT', player: viewer, unit: unit.id, improvement: imp.id },
              imp.id,
            ),
          )}
          {def.abilities?.includes('trade') && (
            <button className="btn" onClick={() => appStore.set({ tradeRouteUnit: unit.id })}>
              Establish Trade Route
            </button>
          )}
          {tryButton('Fortify', { type: 'FORTIFY', player: viewer, unit: unit.id })}
          {tryButton('Skip', { type: 'SKIP_UNIT', player: viewer, unit: unit.id })}
          <button
            className="btn btn--danger"
            onClick={() => {
              if (humanDispatch({ type: 'DISBAND', player: viewer, unit: unit.id })) {
                appStore.set({ selectedUnit: null });
              }
            }}
          >
            Disband
          </button>
        </div>
      )}
    </div>
  );
}
