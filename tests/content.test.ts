import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';

describe('era content', () => {
  // (ruleset cross-reference validity is covered by tests/ruleset.test.ts)

  it('has four eras in order', () => {
    expect(STANDARD_RULESET.eras.map((e) => e.id)).toEqual([
      'ancient', 'classical', 'medieval', 'renaissance',
    ]);
  });

  it('new content is gated by the new techs', () => {
    const u = STANDARD_RULESET.units;
    expect(u.pikeman.requiresTech).toBe('feudalism');
    expect(u.crossbowman.requiresTech).toBe('machinery');
    expect(u.knight.requiresTech).toBe('chivalry');
    expect(u.knight.requiresResource).toBe('horses');
    expect(u.musketman.requiresTech).toBe('gunpowder');
    expect(u.cannon.requiresResource).toBe('iron');
    expect(u.cuirassier.requiresResource).toBe('horses');
    const b = STANDARD_RULESET.buildings;
    expect(b.university.requiresTech).toBe('education');
    expect(b.bank.requiresTech).toBe('banking');
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
