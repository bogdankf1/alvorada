import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset, techUnlocks } from '../src/data/validate';

describe('standard ruleset', () => {
  it('has no broken references', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });

  it('every non-starting tech unlocks something or leads somewhere', () => {
    const CAPSTONE = 'scientific_method'; // science-victory capstone — intentionally terminal
    for (const tech of Object.values(STANDARD_RULESET.techs)) {
      if (tech.id === CAPSTONE) continue;
      const unlocks = techUnlocks(STANDARD_RULESET, tech.id);
      const leadsTo = Object.values(STANDARD_RULESET.techs).some((t) =>
        t.prereqs.includes(tech.id),
      );
      expect(unlocks.length > 0 || leadsTo, `tech ${tech.id} is a dead end`).toBe(true);
    }
  });

  it('ids match their record keys everywhere', () => {
    const r = STANDARD_RULESET;
    const recs: Record<string, Record<string, { id: string }>> = {
      terrains: r.terrains,
      elevations: r.elevations,
      features: r.features,
      resources: r.resources,
      improvements: r.improvements,
      units: r.units,
      buildings: r.buildings,
      techs: r.techs,
      civs: r.civs,
    };
    for (const [name, rec] of Object.entries(recs))
      for (const [key, def] of Object.entries(rec))
        expect(def.id, `${name}.${key}`).toBe(key);
  });

  it('player colors are distinct', () => {
    const colors = Object.values(STANDARD_RULESET.civs).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
