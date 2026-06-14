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

  it('rejects a building slot of an unknown specialist type', () => {
    const r = structuredClone(STANDARD_RULESET);
    // @ts-expect-error intentionally invalid for the test
    r.buildings.library.specialistSlots = { type: 'wizard', count: 1 };
    expect(validateRuleset(r)).toContain('building library: unknown specialist type wizard');
  });
  it('rejects an unknown trade-science tech', () => {
    const r = structuredClone(STANDARD_RULESET);
    r.settings.tradeRoute.internationalScienceTech = 'nonesuch';
    expect(validateRuleset(r)).toContain('settings: unknown trade-science tech nonesuch');
  });

  it('beliefs and religion settings are valid', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
    const kinds = new Set(Object.values(STANDARD_RULESET.beliefs).map((b) => b.kind));
    expect(kinds).toEqual(new Set(['pantheon', 'founder', 'follower']));
  });

  it('policy tree is valid and rooted', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
    const roots = Object.values(STANDARD_RULESET.policies).filter((p) => p.prereqs.length === 0);
    expect(roots.length).toBeGreaterThanOrEqual(3); // one opener per branch
  });

  it('promotions are valid and the prereq chains resolve', () => {
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
    expect(STANDARD_RULESET.promotions.combat_ii.requires).toEqual(['combat_i']);
    expect(STANDARD_RULESET.promotions.march.requires).toEqual(['medic']);
  });
});
