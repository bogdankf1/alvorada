import type { Yields } from '../data/types';
import { YIELD_KEYS } from '../data/types';
import { YIELD_COLORS, YIELD_ICONS } from './icons';

interface YieldChipsProps {
  values: Yields;
  /** hide zero yields (TileInfo) */
  positiveOnly?: boolean;
  /** icon + font size in px; omit for the default icon size (CityPanel) */
  size?: number;
  /** wrap the value in <span className="num"> (CityPanel) */
  wrapNum?: boolean;
  /** set title={k} on each chip (CityPanel) */
  titled?: boolean;
}

/** The shared "yields-row" chip strip used by TileInfo and CityPanel. */
export function YieldChips({ values, positiveOnly, size, wrapNum, titled }: YieldChipsProps) {
  const keys = positiveOnly ? YIELD_KEYS.filter((k) => values[k] > 0) : YIELD_KEYS;
  return (
    <div className="yields-row">
      {keys.map((k) => {
        const Icon = YIELD_ICONS[k];
        return (
          <span
            key={k}
            className="yield-chip"
            style={{ color: YIELD_COLORS[k], ...(size ? { fontSize: size } : {}) }}
            title={titled ? k : undefined}
          >
            <Icon size={size} />
            {wrapNum ? <span className="num">{values[k]}</span> : values[k]}
          </span>
        );
      })}
    </div>
  );
}
