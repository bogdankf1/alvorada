import type { PromotionEffect } from '../data/types';

/** Human-readable lines for a promotion's effect. Single source of truth = the effect object. */
export function effectText(effect: PromotionEffect): string[] {
  const out: string[] = [];
  if (effect.attackPct) out.push(`+${effect.attackPct}% attack`);
  if (effect.defensePct) out.push(`+${effect.defensePct}% defense`);
  if (effect.vsClassPct) out.push(`+${effect.vsClassPct.pct}% vs ${effect.vsClassPct.class}`);
  if (effect.vsCityPct) out.push(`+${effect.vsCityPct}% vs cities`);
  if (effect.movement) out.push(`+${effect.movement} movement`);
  if (effect.healPerTurn) out.push(`Heals +${effect.healPerTurn} HP/turn`);
  if (effect.healAlways) out.push('Heals even after acting');
  if (effect.ignoreZoc) out.push('Ignores zone of control');
  return out;
}
