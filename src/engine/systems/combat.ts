/**
 * Combat: readable, deterministic, linear.
 *   effective strength = hp-scaled base + flat situational bonuses (all from defs)
 *   damage = clamp(30 + 2 x (attacker eff - defender eff), 8, 64)
 * Melee trades blows; ranged shoots without reply; only melee takes cities.
 */
import type { City, Ctx, GameState, Unit } from '../types';
import { tileIndex } from '../hex';
import { cityAt, civilianAt, defenseBonusAt, militaryAt, promotionBonus, wonderOwnerEffects } from '../selectors';
import { recomputeVisibility } from '../map/visibility';
import { pushEvent } from '../events';
import { captureCity } from './cities';
import { captureCivilian } from './movement';
import { checkElimination } from './victory';

function hpScaled(base: number, hp: number): number {
  return Math.floor((base * (50 + Math.floor(hp / 2))) / 100);
}

function classBonus(ctx: Ctx, attacker: Unit, vs: { unit?: Unit; city?: boolean }): number {
  const def = ctx.rules.units[attacker.def];
  if (!def.bonuses) return 0;
  let pct = 0;
  for (const b of def.bonuses) {
    if (b.vsCity && vs.city) pct += b.pct;
    if (b.vsClass && vs.unit && ctx.rules.units[vs.unit.def].class === b.vsClass) pct += b.pct;
  }
  return Math.floor((def.strength * pct) / 100);
}

export function attackStrength(ctx: Ctx, unit: Unit, vs: { unit?: Unit; city?: boolean }): number {
  const def = ctx.rules.units[unit.def];
  return hpScaled(def.strength, unit.hp) + classBonus(ctx, unit, vs) + promotionBonus(ctx, unit, 'attack', vs, def.strength);
}

export function rangedStrength(ctx: Ctx, unit: Unit, vs: { unit?: Unit; city?: boolean }): number {
  const def = ctx.rules.units[unit.def];
  if (!def.ranged) return 0;
  let pct = 0;
  for (const b of def.bonuses ?? []) {
    if (b.vsCity && vs.city) pct += b.pct;
    if (b.vsClass && vs.unit && ctx.rules.units[vs.unit.def].class === b.vsClass) pct += b.pct;
  }
  return hpScaled(def.ranged.strength, unit.hp) + Math.floor((def.ranged.strength * pct) / 100) + promotionBonus(ctx, unit, 'attack', vs, def.ranged.strength);
}

export function defenseStrength(ctx: Ctx, state: GameState, unit: Unit): number {
  const def = ctx.rules.units[unit.def];
  const idx = tileIndex({ q: unit.q, r: unit.r }, state.mapW, state.mapH);
  let s = hpScaled(def.strength, unit.hp) + defenseBonusAt(ctx, state, idx);
  if (unit.stance === 'fortified') s += ctx.rules.settings.fortifyBonus;
  s += promotionBonus(ctx, unit, 'defense', {}, def.strength);
  return s;
}

export function cityStrength(ctx: Ctx, state: GameState, city: City): number {
  const s = ctx.rules.settings;
  let str = s.cityBaseStrength + s.cityStrengthPerPop * city.pop;
  for (const b of city.buildings) str += ctx.rules.buildings[b].defense?.strength ?? 0;
  if (militaryAt(ctx, state, { q: city.q, r: city.r })) str += s.garrisonBonus;
  str += wonderOwnerEffects(ctx, state, city.owner).cityDefense;
  return str;
}

export function damageFor(ctx: Ctx, attEff: number, defEff: number): number {
  const s = ctx.rules.settings;
  return Math.max(
    s.damageMin,
    Math.min(s.damageMax, s.damageBase + s.damagePerStrength * (attEff - defEff)),
  );
}

function killUnit(ctx: Ctx, state: GameState, unit: Unit, killer: Unit): void {
  pushEvent(state, {
    player: unit.owner,
    type: 'unitKilled',
    msg: `${ctx.rules.units[unit.def].name} slain by ${state.players[killer.owner].name}`,
    q: unit.q,
    r: unit.r,
  });
  pushEvent(state, {
    player: killer.owner,
    type: 'unitVictorious',
    msg: `${ctx.rules.units[killer.def].name} defeated an enemy ${ctx.rules.units[unit.def].name}`,
    q: unit.q,
    r: unit.r,
  });
  delete state.units[unit.id];
  recomputeVisibility(ctx, state, unit.owner);
}

function spendAttack(unit: Unit): void {
  unit.moves = 0;
  unit.acted = true;
  unit.stance = 'none';
}

function isCappedTarget(state: GameState, defenderOwner?: number): boolean {
  return defenderOwner !== undefined && !!state.players[defenderOwner].barbarian;
}

function awardXp(ctx: Ctx, unit: Unit, amount: number, capped: boolean): void {
  if (capped && (unit.xp ?? 0) >= ctx.rules.settings.combat.xpVsBarbCap) return;
  unit.xp = (unit.xp ?? 0) + amount;
}

/** Melee attack on a tile holding an enemy unit or city. */
export function resolveMeleeAttack(
  ctx: Ctx,
  state: GameState,
  attacker: Unit,
  target: { q: number; r: number },
): void {
  const city = cityAt(state, target);
  if (city && city.owner !== attacker.owner) {
    resolveCityMelee(ctx, state, attacker, city);
    return;
  }
  const defender = militaryAt(ctx, state, target);
  if (!defender) return;

  const attEff = attackStrength(ctx, attacker, { unit: defender });
  const defEff = defenseStrength(ctx, state, defender);
  const dmgToDefender = damageFor(ctx, attEff, defEff);
  const dmgToAttacker = damageFor(ctx, defEff, attEff);

  attacker.hp -= dmgToAttacker;
  defender.hp -= dmgToDefender;
  spendAttack(attacker);

  const c = ctx.rules.settings.combat;
  const capped = isCappedTarget(state, defender.owner);
  awardXp(ctx, attacker, c.xpPerAttack + (defender.hp <= 0 ? c.xpPerKill : 0), capped);
  if (defender.hp > 0 && attacker.hp > 0) awardXp(ctx, defender, c.xpPerDefend, !!state.players[attacker.owner].barbarian);

  if (defender.hp <= 0) {
    // if both fall, the field belongs to the attacker (survives at 1 hp)
    if (attacker.hp <= 0) attacker.hp = 1;
    const dest = { q: defender.q, r: defender.r };
    killUnit(ctx, state, defender, attacker);
    attacker.q = dest.q;
    attacker.r = dest.r;
    const civ = civilianAt(ctx, state, dest);
    if (civ && civ.owner !== attacker.owner) captureCivilian(ctx, state, civ, attacker.owner);
    recomputeVisibility(ctx, state, attacker.owner);
    checkElimination(ctx, state);
  } else if (attacker.hp <= 0) {
    killUnit(ctx, state, attacker, defender);
    checkElimination(ctx, state);
  }
}

function resolveCityMelee(ctx: Ctx, state: GameState, attacker: Unit, city: City): void {
  const attEff = attackStrength(ctx, attacker, { city: true });
  const defEff = cityStrength(ctx, state, city);
  const dmgToCity = damageFor(ctx, attEff, defEff);
  const dmgToAttacker = damageFor(ctx, defEff, attEff);

  attacker.hp -= dmgToAttacker;
  spendAttack(attacker);
  awardXp(ctx, attacker, ctx.rules.settings.combat.xpPerAttack, true);
  if (attacker.hp <= 0) {
    pushEvent(state, {
      player: attacker.owner,
      type: 'unitKilled',
      msg: `${ctx.rules.units[attacker.def].name} fell before the walls of ${city.name}`,
      q: city.q,
      r: city.r,
    });
    delete state.units[attacker.id];
    recomputeVisibility(ctx, state, attacker.owner);
    checkElimination(ctx, state);
    return;
  }

  city.hp -= dmgToCity;
  if (city.hp <= 0) {
    // the garrison dies with the walls; the attacker marches in
    const garrison = militaryAt(ctx, state, { q: city.q, r: city.r });
    if (garrison) {
      delete state.units[garrison.id];
      recomputeVisibility(ctx, state, garrison.owner);
    }
    captureCity(ctx, state, city, attacker.owner);
    attacker.q = city.q;
    attacker.r = city.r;
    recomputeVisibility(ctx, state, attacker.owner);
    checkElimination(ctx, state);
  }
}

/** Ranged attack: no retaliation; cities can be reduced only to 1 hp. */
export function resolveRangedAttack(
  ctx: Ctx,
  state: GameState,
  attacker: Unit,
  target: { q: number; r: number },
): void {
  const city = cityAt(state, target);
  if (city && city.owner !== attacker.owner) {
    const attEff = rangedStrength(ctx, attacker, { city: true });
    const defEff = cityStrength(ctx, state, city);
    const dmg = damageFor(ctx, attEff, defEff);
    city.hp = Math.max(1, city.hp - dmg);
    spendAttack(attacker);
    awardXp(ctx, attacker, ctx.rules.settings.combat.xpPerAttack, true);
    pushEvent(state, {
      player: city.owner,
      type: 'cityBombarded',
      msg: `${city.name} is under bombardment!`,
      q: city.q,
      r: city.r,
    });
    return;
  }
  const defender = militaryAt(ctx, state, target);
  if (!defender) return;
  const attEff = rangedStrength(ctx, attacker, { unit: defender });
  const defEff = defenseStrength(ctx, state, defender);
  defender.hp -= damageFor(ctx, attEff, defEff);
  spendAttack(attacker);
  awardXp(ctx, attacker, ctx.rules.settings.combat.xpPerAttack + (defender.hp <= 0 ? ctx.rules.settings.combat.xpPerKill : 0), isCappedTarget(state, defender.owner));
  if (defender.hp <= 0) {
    killUnit(ctx, state, defender, attacker);
    checkElimination(ctx, state);
  }
}
