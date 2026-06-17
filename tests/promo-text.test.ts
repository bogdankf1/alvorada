import { describe, it, expect } from 'vitest';
import { effectText } from '../src/ui/promotions';
import { STANDARD_RULESET } from '../src/data/standard';

describe('effectText', () => {
  it('formats each effect kind', () => {
    expect(effectText({ defensePct: 33 })).toEqual(['+33% defense']);
    expect(effectText({ attackPct: 15, defensePct: 15 })).toEqual(['+15% attack', '+15% defense']);
    expect(effectText({ vsClassPct: { class: 'mounted', pct: 33 } })).toEqual(['+33% vs mounted']);
    expect(effectText({ vsCityPct: 50 })).toEqual(['+50% vs cities']);
    expect(effectText({ movement: 1 })).toEqual(['+1 movement']);
    expect(effectText({ healPerTurn: 10 })).toEqual(['Heals +10 HP/turn']);
    expect(effectText({ healAlways: true })).toEqual(['Heals even after acting']);
    expect(effectText({ ignoreZoc: true })).toEqual(['Ignores zone of control']);
  });

  it('every promotion in the catalog produces at least one line', () => {
    for (const p of Object.values(STANDARD_RULESET.promotions))
      expect(effectText(p.effect).length, p.id).toBeGreaterThan(0);
  });
});
