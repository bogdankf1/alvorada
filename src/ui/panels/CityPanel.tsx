import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import {
  allocateCitizens,
  cityYields,
  growthThreshold,
  itemCost,
  productionOptions,
  purchaseCost,
} from '../../engine/selectors';
import type { ProductionItem } from '../../engine/types';
import type { SpecialistType } from '../../data/types';
import { YIELD_COLORS, YIELD_ICONS, IconCog, IconPeople } from '../icons';
import { YIELD_KEYS } from '../../data/types';

function wonderBlurb(b: import('../../data/types').BuildingDef): string {
  const e = b.effect;
  if (!e) return 'World Wonder';
  switch (e.kind) {
    case 'empireYields': return 'World Wonder — bonus yields in every city';
    case 'cityDefense': return `World Wonder — +${e.strength} defense in all your cities`;
    case 'freeTech': return 'World Wonder — grants a free technology';
    case 'freeUnit': return `World Wonder — grants ${e.count} ${e.unit}(s)`;
    case 'cultureBurst': return `World Wonder — +${e.amount} culture`;
    case 'happiness': return `World Wonder — +${e.amount} empire happiness`;
  }
}

export function CityPanel() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const selectedCity = useApp((s) => s.selectedCity);
  useApp((s) => s.aiThinking);
  if (!game || selectedCity === null) return null;
  const city = game.cities[selectedCity];
  if (!city) return null;
  const mine = city.owner === viewer;
  const { total } = cityYields(gameCtx, game, city);
  const alloc = allocateCitizens(gameCtx, game, city);
  const slotTotals: Partial<Record<SpecialistType, number>> = {};
  for (const b of city.buildings) {
    const d = gameCtx.rules.buildings[b];
    if (d.specialistSlots) slotTotals[d.specialistSlots.type] = (slotTotals[d.specialistSlots.type] ?? 0) + d.specialistSlots.count;
  }
  const specialistTypes = (Object.keys(slotTotals) as SpecialistType[]).sort();
  const need = growthThreshold(city.pop);
  const net = total.food - city.pop * gameCtx.rules.settings.foodConsumptionPerPop;
  const growTurns = net > 0 ? Math.ceil((need - city.food) / net) : null;
  const player = game.players[viewer];

  const current = city.production.item;
  const currentCost = current ? itemCost(gameCtx, current) : 0;
  const prodTurns =
    current && total.production > 0
      ? Math.ceil((currentCost - city.production.progress) / total.production)
      : null;

  const options = mine && isMyTurn() ? productionOptions(gameCtx, game, city) : [];

  const itemName = (item: ProductionItem) =>
    item.kind === 'unit' ? gameCtx.rules.units[item.id].name : gameCtx.rules.buildings[item.id].name;

  return (
    <div className="city-panel plate">
      <header>
        <h2>{city.name}</h2>
        <span className="pop">
          <IconPeople size={13} /> {city.pop}
        </span>
        <button className="btn btn--ghost city-close" onClick={() => appStore.set({ selectedCity: null })}>
          ✕
        </button>
      </header>

      {city.religion && <div className="city-religion">Follows {game.religions[city.religion]?.name}</div>}

      <div style={{ fontSize: 12, color: 'var(--ivory-dim)', margin: '4px 0' }}>
        Gold {game.players[city.owner].gold} — click a highlighted tile to buy it
      </div>

      <div className="yields-row">
        {YIELD_KEYS.map((k) => {
          const Icon = YIELD_ICONS[k];
          return (
            <span key={k} className="yield-chip" style={{ color: YIELD_COLORS[k] }} title={k}>
              <Icon />
              <span className="num">{total[k]}</span>
            </span>
          );
        })}
      </div>

      <div className="city-scroll scroll-quiet">
        <div className="city-section-title">Growth</div>
        <div className="bar">
          <i style={{ width: `${Math.min(100, (city.food / need) * 100)}%`, background: YIELD_COLORS.food }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ivory-dim)', marginTop: 4 }}>
          {city.food}/{need} food · {net >= 0 ? `+${net}` : net}/turn
          {growTurns !== null && ` · grows in ${growTurns}t`}
          {net < 0 && ' · starving!'}
        </div>

        <div className="city-section-title">Production</div>
        <div className="prod-current">
          <IconCog size={16} style={{ color: YIELD_COLORS.production }} />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{current ? itemName(current) : 'Nothing queued'}</div>
            {current && (
              <>
                <div className="bar" style={{ marginTop: 4 }}>
                  <i
                    style={{
                      width: `${Math.min(100, (city.production.progress / currentCost) * 100)}%`,
                      background: YIELD_COLORS.production,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ivory-dim)', marginTop: 3 }}>
                  {city.production.progress}/{currentCost}
                  {prodTurns !== null && ` · ${prodTurns}t`}
                </div>
              </>
            )}
          </div>
        </div>

        {options.length > 0 && (
          <>
            <div className="city-section-title">Order Production</div>
            <div className="prod-list">
              {options.map((item) => {
                const cost = itemCost(gameCtx, item);
                const turns = total.production > 0 ? Math.ceil(cost / total.production) : null;
                const price = purchaseCost(gameCtx, item);
                const isCurrent = current?.kind === item.kind && current?.id === item.id;
                return (
                  <div
                    key={`${item.kind}:${item.id}`}
                    className={`prod-item ${isCurrent ? 'is-current' : ''}`}
                    onClick={() =>
                      humanDispatch({ type: 'SET_PRODUCTION', player: viewer, city: city.id, item })
                    }
                  >
                    <span className="nm">{itemName(item)}</span>
                    {item.kind === 'building' && gameCtx.rules.buildings[item.id].wonder && (
                      <span className="wonder-tag" title={wonderBlurb(gameCtx.rules.buildings[item.id])}>Wonder</span>
                    )}
                    {isCurrent && <span className="cur-tag">Building</span>}
                    <span className="turns">{turns !== null ? `${turns}t` : '—'}</span>
                    {player.gold >= price && (
                      <button
                        className="btn buy"
                        onClick={(e) => {
                          e.stopPropagation();
                          humanDispatch({ type: 'BUY_ITEM', player: viewer, city: city.id, item });
                        }}
                        title="Purchase outright with gold"
                      >
                        {price}g
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="city-section-title">Buildings</div>
        <div className="bld-list">
          {city.buildings.length === 0 && (
            <span style={{ color: 'var(--ivory-dim)', fontSize: 12.5 }}>None yet</span>
          )}
          {city.buildings.map((b) => (
            <span key={b} className="bld-chip">
              {gameCtx.rules.buildings[b].name}
            </span>
          ))}
        </div>

        {specialistTypes.length > 0 && (
          <div className="city-specialists">
            <h4>Specialists</h4>
            {specialistTypes.map((t) => {
              const assigned = alloc.specialists[t] ?? 0;
              const total = slotTotals[t] ?? 0;
              const set = (count: number) =>
                humanDispatch({ type: 'SET_SPECIALISTS', player: viewer, city: city.id, specialist: t, count });
              return (
                <div key={t} className="specialist-row">
                  <span className="spec-name">{gameCtx.rules.specialists[t].name}</span>
                  <span className="spec-count">{assigned}/{total}</span>
                  <button className="btn btn--xs" disabled={assigned <= 0} onClick={() => set(assigned - 1)}>−</button>
                  <button className="btn btn--xs" disabled={assigned >= total} onClick={() => set(assigned + 1)}>+</button>
                </div>
              );
            })}
          </div>
        )}

        {(() => {
          const routes = Object.values(game.tradeRoutes).filter((r) => r.fromCity === city.id || r.toCity === city.id);
          return routes.length > 0 ? (
            <div className="city-routes">
              <h4>Trade Routes</h4>
              {routes.map((r) => (
                <div key={r.id} className="route-row">
                  {(game.cities[r.fromCity]?.name ?? '—')} → {(game.cities[r.toCity]?.name ?? '—')} · {r.kind} · {Math.max(0, r.expires - game.turn)}t
                </div>
              ))}
            </div>
          ) : null;
        })()}

        {city.hp < gameCtx.rules.settings.cityMaxHp && (
          <>
            <div className="city-section-title">City Defense</div>
            <div className="bar">
              <i
                style={{
                  width: `${(city.hp / gameCtx.rules.settings.cityMaxHp) * 100}%`,
                  background: city.hp > 100 ? 'var(--ok)' : 'var(--danger)',
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ivory-dim)', marginTop: 4 }}>
              {city.hp}/{gameCtx.rules.settings.cityMaxHp} walls
            </div>
          </>
        )}
      </div>
    </div>
  );
}
