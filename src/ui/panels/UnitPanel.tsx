import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { validateAction } from '../../engine/validate';
import { promotionSlots, pendingPromotions, availablePromotions } from '../../engine/selectors';
import type { Action } from '../../engine/types';
import { IconBoots, IconShield } from '../icons';
import { effectText } from '../promotions';

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
        : unit.order?.kind === 'road'
          ? `Building ${gameCtx.rules.roads[unit.order.road].name} (${unit.order.turnsLeft}t)`
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
          <IconBoots size={12} /> <b>{unit.moves / gameCtx.rules.settings.moveScale}</b>/{def.moves}
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
      {unit.stance === 'sleep' && <div style={{ color: 'var(--ivory-dim)', fontSize: 12 }}>Asleep</div>}
      {orderLabel && <div style={{ color: 'var(--ivory-dim)', fontSize: 12 }}>{orderLabel}</div>}

      {def.class !== 'civilian' && (() => {
        const xp = unit.xp ?? 0;
        const slots = promotionSlots(gameCtx, unit);
        const nextT = gameCtx.rules.settings.combat.promotionThresholds[slots] ?? null;
        const pending = pendingPromotions(gameCtx, unit);
        return (
          <div className="unit-xp">
            <div className="label" style={{ fontSize: 12, color: 'var(--ivory-dim)' }}>XP {xp}{nextT !== null ? ` / ${nextT}` : ' · veteran'}</div>
            {nextT !== null && <div className="bar"><i style={{ width: `${Math.min(100, (xp / nextT) * 100)}%`, background: 'var(--brass)' }} /></div>}
            {(unit.promotions ?? []).length > 0 && (
              <div className="bld-list">{(unit.promotions ?? []).map((id) => {
                const p = gameCtx.rules.promotions[id];
                return <span key={id} className="bld-chip" title={effectText(p.effect).join('\n')}>{p.name}</span>;
              })}</div>
            )}
            {pending > 0 && isMyTurn() && (
              <div className="promo-pick">
                <div className="label" style={{ fontSize: 12, marginTop: 4 }}>Choose a promotion:</div>
                {availablePromotions(gameCtx, unit).map((p) => (
                  <button key={p.id} className="btn btn--xs" title={effectText(p.effect).join('\n')} onClick={() => humanDispatch({ type: 'CHOOSE_PROMOTION', player: viewer, unit: unit.id, promotion: p.id })}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
          {Object.values(gameCtx.rules.roads).map((road) =>
            tryButton(`Build ${road.name}`, { type: 'BUILD_ROAD', player: viewer, unit: unit.id, road: road.id }, `road-${road.id}`),
          )}
          {def.abilities?.includes('trade') && (
            <button className="btn" onClick={() => appStore.set({ tradeRouteUnit: unit.id })}>
              Establish Trade Route
            </button>
          )}
          {tryButton('Fortify', { type: 'FORTIFY', player: viewer, unit: unit.id })}
          {tryButton('Skip', { type: 'SKIP_UNIT', player: viewer, unit: unit.id })}
          {unit.stance === 'sleep'
            ? <button key="wake" className="btn" onClick={() => humanDispatch({ type: 'SLEEP_UNIT', player: viewer, unit: unit.id })}>Wake</button>
            : tryButton('Sleep', { type: 'SLEEP_UNIT', player: viewer, unit: unit.id })}
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
