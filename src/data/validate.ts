/**
 * Cross-reference validation for a ruleset. Broken content (a unit requiring a
 * tech that doesn't exist, a cyclic tech tree) fails loudly at startup and in CI.
 */
import type { Ruleset } from './types';

export function validateRuleset(rules: Ruleset): string[] {
  const errors: string[] = [];
  const has = (rec: Record<string, unknown>, id: string | undefined) =>
    id === undefined || id in rec;

  for (const t of Object.values(rules.terrains))
    if (t.id in rules.elevations) errors.push(`terrain/elevation id clash: ${t.id}`);

  for (const res of Object.values(rules.resources)) {
    if (!has(rules.techs, res.revealedBy))
      errors.push(`resource ${res.id}: unknown tech ${res.revealedBy}`);
    if (res.improvedBy && !has(rules.improvements, res.improvedBy))
      errors.push(`resource ${res.id}: unknown improvement ${res.improvedBy}`);
    for (const ter of res.spawn.terrains)
      if (!has(rules.terrains, ter)) errors.push(`resource ${res.id}: unknown terrain ${ter}`);
    for (const el of res.spawn.elevations ?? [])
      if (!has(rules.elevations, el)) errors.push(`resource ${res.id}: unknown elevation ${el}`);
  }

  for (const imp of Object.values(rules.improvements)) {
    if (!has(rules.techs, imp.requiresTech))
      errors.push(`improvement ${imp.id}: unknown tech ${imp.requiresTech}`);
    for (const ter of imp.validTerrains ?? [])
      if (!has(rules.terrains, ter)) errors.push(`improvement ${imp.id}: unknown terrain ${ter}`);
    for (const el of imp.validElevations ?? [])
      if (!has(rules.elevations, el)) errors.push(`improvement ${imp.id}: unknown elevation ${el}`);
  }

  for (const u of Object.values(rules.units)) {
    if (!has(rules.techs, u.requiresTech)) errors.push(`unit ${u.id}: unknown tech ${u.requiresTech}`);
    if (!has(rules.resources, u.requiresResource))
      errors.push(`unit ${u.id}: unknown resource ${u.requiresResource}`);
    if (u.requiresResource && rules.resources[u.requiresResource]?.kind !== 'strategic')
      errors.push(`unit ${u.id}: requiresResource must be strategic`);
  }

  for (const b of Object.values(rules.buildings))
    if (!has(rules.techs, b.requiresTech)) errors.push(`building ${b.id}: unknown tech ${b.requiresTech}`);

  for (const b of Object.values(rules.buildings))
    if (b.specialistSlots && !(b.specialistSlots.type in rules.specialists))
      errors.push(`building ${b.id}: unknown specialist type ${b.specialistSlots.type}`);

  const eraIds = new Set(rules.eras.map((e) => e.id));
  for (const t of Object.values(rules.techs)) {
    if (!eraIds.has(t.era)) errors.push(`tech ${t.id}: unknown era ${t.era}`);
    for (const p of t.prereqs)
      if (!has(rules.techs, p)) errors.push(`tech ${t.id}: unknown prereq ${p}`);
  }
  // cycle check via DFS
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const p of rules.techs[id]?.prereqs ?? []) if (!visit(p)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  for (const id of Object.keys(rules.techs))
    if (!visit(id)) errors.push(`tech tree cycle involving ${id}`);

  for (const civ of Object.values(rules.civs))
    if (civ.cityNames.length === 0) errors.push(`civ ${civ.id}: no city names`);

  for (const su of rules.settings.startingUnits)
    if (!has(rules.units, su)) errors.push(`settings: unknown starting unit ${su}`);

  if (!(rules.settings.victory.scienceCapstone in rules.techs))
    errors.push(`settings: unknown science capstone tech ${rules.settings.victory.scienceCapstone}`);

  if (!(rules.settings.tradeRoute.internationalScienceTech in rules.techs))
    errors.push(`settings: unknown trade-science tech ${rules.settings.tradeRoute.internationalScienceTech}`);

  for (const b of Object.values(rules.buildings))
    if (b.effect?.kind === 'freeUnit' && !(b.effect.unit in rules.units))
      errors.push(`building ${b.id}: unknown freeUnit ${b.effect.unit}`);

  for (const bel of Object.values(rules.beliefs)) {
    const pb = bel.effect.perBuilding;
    if (pb && !(pb.building in rules.buildings))
      errors.push(`belief ${bel.id}: unknown perBuilding ${pb.building}`);
  }
  if (!(rules.settings.religion.religionTech in rules.techs))
    errors.push(`settings: unknown religionTech ${rules.settings.religion.religionTech}`);

  return errors;
}

/** Reverse map: techId -> human-readable unlock list (units/buildings/improvements/resources). */
export function techUnlocks(rules: Ruleset, techId: string): { kind: string; id: string; name: string }[] {
  const out: { kind: string; id: string; name: string }[] = [];
  for (const u of Object.values(rules.units))
    if (u.requiresTech === techId) out.push({ kind: 'unit', id: u.id, name: u.name });
  for (const b of Object.values(rules.buildings))
    if (b.requiresTech === techId) out.push({ kind: 'building', id: b.id, name: b.name });
  for (const i of Object.values(rules.improvements))
    if (i.requiresTech === techId) out.push({ kind: 'improvement', id: i.id, name: i.name });
  for (const r of Object.values(rules.resources))
    if (r.revealedBy === techId) out.push({ kind: 'resource', id: r.id, name: r.name });
  return out;
}
