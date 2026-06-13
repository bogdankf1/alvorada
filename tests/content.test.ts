import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';

describe('era content', () => {
  it('ruleset still validates with the new content', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });

  it('has four eras in order', () => {
    expect(STANDARD_RULESET.eras.map((e) => e.id)).toEqual([
      'ancient', 'classical', 'medieval', 'renaissance',
    ]);
  });

  it('new units are gated by the new techs', () => {
    expect(STANDARD_RULESET.units.knight.requiresTech).toBe('chivalry');
    expect(STANDARD_RULESET.units.musketman.requiresTech).toBe('gunpowder');
    expect(STANDARD_RULESET.units.cuirassier.requiresResource).toBe('horses');
  });

  it('no two techs occupy the same tree position', () => {
    const seen = new Set<string>();
    for (const t of Object.values(STANDARD_RULESET.techs)) {
      const key = `${t.pos.col},${t.pos.row}`;
      expect(seen.has(key), `position clash at ${key} (${t.id})`).toBe(false);
      seen.add(key);
    }
  });
});
