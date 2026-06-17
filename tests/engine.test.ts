import { describe, it, expect } from 'vitest';
import { applyAction, ActionError } from '../src/engine/reducer';
import { validateAction } from '../src/engine/validate';
import { ctx, customCtx, flatWorld, idxOf, spawn, refreshVis, thaw, declareWarBetween } from './helpers';
import type { GameState } from '../src/engine/types';
import { cityYields, growthThreshold, strategicAvailability } from '../src/engine/selectors';

const endTurn = (s: GameState, c = ctx) => applyAction(c, s, { type: 'END_TURN', player: s.currentPlayer });
/** End the round: every player passes once, play returns to player 0. */
const fullRound = (s: GameState, c = ctx) => {
  const n = s.players.filter((p) => p.alive).length;
  for (let i = 0; i < n; i++) s = endTurn(s, c);
  return s;
};

describe('founding cities', () => {
  it('consumes the settler, claims territory, grants the palace once', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 4, 4);
    const settler2 = spawn(s, 0, 'settler', 9, 4);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    expect(Object.keys(s.cities)).toHaveLength(1);
    expect(s.units[settler.id]).toBeUndefined();
    const city = s.cities[1];
    expect(city.buildings).toContain('palace');
    expect(city.name).toBe('Roma');
    // center + 6 neighbors owned
    expect(s.tiles.filter((t) => t.ownerCity === city.id)).toHaveLength(7);

    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler2.id });
    expect(s.cities[2].buildings).not.toContain('palace');
    expect(s.cities[2].name).toBe('Antium');
  });

  it('rejects founding too close to another city', () => {
    let s = flatWorld();
    const a = spawn(s, 0, 'settler', 4, 4);
    const b = spawn(s, 0, 'settler', 6, 4); // distance 2 < min 4
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: a.id });
    const v = validateAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: b.id });
    expect(v.ok).toBe(false);
  });
});

describe('movement', () => {
  it('spends move points by terrain and stores multi-turn goto orders', () => {
    let s = flatWorld();
    s.tiles[idxOf(s, 6, 4)].feature = 'forest'; // forest costs 4 to enter (2 base * scale 2)
    const u = spawn(s, 0, 'warrior', 4, 4, { moves: ctx.rules.units.warrior.moves * ctx.rules.settings.moveScale });
    spawn(s, 0, 'settler', 2, 8); // keep player 0 alive
    spawn(s, 1, 'settler', 1, 8); // keep player 1 alive
    refreshVis(s);
    // warrior: 4 MP (2 base * scale 2); grassland costs 2; walks 2 tiles, banks 1 as goto
    s = applyAction(ctx, s, {
      type: 'MOVE_UNIT',
      player: 0,
      unit: u.id,
      path: [
        { q: 5, r: 4 },
        { q: 6, r: 4 },
        { q: 7, r: 4 },
      ],
    });
    let unit = s.units[u.id];
    expect({ q: unit.q, r: unit.r }).toEqual({ q: 6, r: 4 });
    expect(unit.moves).toBe(0);
    expect(unit.order?.kind).toBe('goto');

    // next turn the march continues automatically
    s = fullRound(s);
    unit = s.units[u.id];
    expect({ q: unit.q, r: unit.r }).toEqual({ q: 7, r: 4 });
    expect(unit.order).toBeNull();
  });

  it('blocks stacking two military units and entering peacetime borders', () => {
    let s = flatWorld();
    const a = spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 0, 'scout', 5, 4);
    const settler = spawn(s, 1, 'settler', 8, 4);
    refreshVis(s);
    const stackMove = validateAction(ctx, s, {
      type: 'MOVE_UNIT',
      player: 0,
      unit: a.id,
      path: [{ q: 5, r: 4 }],
    });
    expect(stackMove.ok).toBe(false);

    // found an enemy city; its territory is closed in peacetime
    s = thaw(s);
    s.currentPlayer = 1;
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: settler.id });
    s = thaw(s);
    s.currentPlayer = 0;
    const probe = spawn(s, 0, 'warrior', 6, 4); // adjacent to the city's ring tile (7,4)
    refreshVis(s);
    const intoBorders = validateAction(ctx, s, {
      type: 'MOVE_UNIT',
      player: 0,
      unit: probe.id,
      path: [{ q: 7, r: 4 }],
    });
    expect(intoBorders.ok).toBe(false);
  });

  it('captures an enemy civilian by moving onto it; settlers become workers', () => {
    let s = flatWorld();
    const w = spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 0, 'settler', 2, 8); // keep player 0 alive
    spawn(s, 1, 'settler', 5, 4);
    spawn(s, 1, 'warrior', 1, 8); // keep alive
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'MOVE_UNIT', player: 0, unit: w.id, path: [{ q: 5, r: 4 }] });
    const captured = Object.values(s.units).find((u) => u.def === 'worker');
    expect(captured).toBeDefined();
    expect(captured!.owner).toBe(0);
  });
});

describe('combat', () => {
  it('equal warriors trade 30 damage', () => {
    let s = flatWorld();
    const a = spawn(s, 0, 'warrior', 4, 4);
    const d = spawn(s, 1, 'warrior', 5, 4);
    spawn(s, 1, 'settler', 1, 8);
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: a.id, target: { q: 5, r: 4 } });
    expect(s.units[a.id].hp).toBe(70);
    expect(s.units[d.id].hp).toBe(70);
    expect(s.units[a.id].moves).toBe(0);
  });

  it('terrain and fortification protect the defender', () => {
    let s = flatWorld();
    s.tiles[idxOf(s, 5, 4)].elevation = 'hill';
    s.tiles[idxOf(s, 5, 4)].feature = 'forest';
    const a = spawn(s, 0, 'warrior', 4, 4);
    const d = spawn(s, 1, 'warrior', 5, 4, { stance: 'fortified' });
    spawn(s, 1, 'settler', 1, 8);
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: a.id, target: { q: 5, r: 4 } });
    // defEff = 8 +3 hill +3 forest +4 fortify = 18 vs attEff 8 -> def takes 10, att takes 50
    expect(s.units[d.id].hp).toBe(90);
    expect(s.units[a.id].hp).toBe(50);
  });

  it('spearmen punish horsemen; the winner takes the field', () => {
    let s = flatWorld();
    const spear = spawn(s, 0, 'spearman', 4, 4);
    spawn(s, 0, 'settler', 2, 8); // keep player 0 alive
    const horse = spawn(s, 1, 'horseman', 5, 4, { hp: 40 });
    spawn(s, 1, 'settler', 1, 8);
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: spear.id, target: { q: 5, r: 4 } });
    // attEff = 11 + 50%*11=5 -> 16; horse at 40hp: floor(14*(50+20)/100)=9 -> dmg 30+14=44 kills
    expect(s.units[horse.id]).toBeUndefined();
    expect(s.units[spear.id].q).toBe(5); // advanced into the tile
  });

  it('ranged attacks draw no retaliation and cannot raze below 1 hp', () => {
    let s = flatWorld();
    const archer = spawn(s, 0, 'archer', 4, 4);
    const target = spawn(s, 1, 'warrior', 5, 4);
    spawn(s, 1, 'settler', 1, 8);
    declareWarBetween(s, 0, 1);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'RANGED_ATTACK', player: 0, unit: archer.id, target: { q: 5, r: 4 } });
    // archer 7 vs warrior def 8 -> dmg 28; archer untouched
    expect(s.units[target.id].hp).toBe(72);
    expect(s.units[archer.id].hp).toBe(100);
  });

  it('attacking at peace is rejected', () => {
    const s = flatWorld();
    const a = spawn(s, 0, 'warrior', 4, 4);
    spawn(s, 1, 'warrior', 5, 4);
    refreshVis(s);
    const v = validateAction(ctx, s, { type: 'ATTACK', player: 0, unit: a.id, target: { q: 5, r: 4 } });
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toMatch(/war/);
  });
});

describe('cities at war', () => {
  function besiegedCity(): { s: GameState; cityId: number } {
    const s = flatWorld(14, 12);
    const settler = spawn(s, 1, 'settler', 8, 5);
    spawn(s, 1, 'warrior', 2, 9);
    refreshVis(s);
    s.currentPlayer = 1;
    const s2 = applyAction(ctx, s, { type: 'FOUND_CITY', player: 1, unit: settler.id });
    const s3 = thaw(s2);
    s3.currentPlayer = 0;
    declareWarBetween(s3, 0, 1);
    return { s: s3, cityId: 1 };
  }

  it('melee siege captures the city at 0 hp with pop loss and razed walls', () => {
    let { s, cityId } = besiegedCity();
    s.cities[cityId].hp = 20;
    s.cities[cityId].pop = 4;
    s.cities[cityId].buildings.push('walls');
    const sword = spawn(s, 0, 'swordsman', 7, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: sword.id, target: { q: 8, r: 5 } });
    const city = s.cities[cityId];
    expect(city.owner).toBe(0);
    expect(city.pop).toBe(3); // lost a quarter
    expect(city.buildings).not.toContain('walls');
    expect(city.hp).toBe(ctx.rules.settings.cityCaptureHp);
    expect(s.units[sword.id].q).toBe(8); // marched in
  });

  it('ranged bombardment leaves the city at 1 hp minimum', () => {
    let { s, cityId } = besiegedCity();
    s.cities[cityId].hp = 10;
    const cat = spawn(s, 0, 'catapult', 7, 5);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'RANGED_ATTACK', player: 0, unit: cat.id, target: { q: 8, r: 5 } });
    expect(s.cities[cityId].hp).toBe(1);
    expect(s.cities[cityId].owner).toBe(1);
  });

  it('conquering the last city wins by conquest', () => {
    let { s, cityId } = besiegedCity();
    s.cities[cityId].hp = 8;
    // remove player 1's spare warrior so the city is everything they have
    const spare = Object.values(s.units).find((u) => u.owner === 1 && u.def === 'warrior');
    delete s.units[spare!.id];
    const sword = spawn(s, 0, 'swordsman', 7, 5);
    spawn(s, 0, 'settler', 2, 2);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'ATTACK', player: 0, unit: sword.id, target: { q: 8, r: 5 } });
    expect(s.players[1].alive).toBe(false);
    expect(s.winner).toEqual({ player: 0, victory: 'conquest' });
    expect(s.phase).toBe('ended');
  });
});

describe('economy', () => {
  it('cities grow when the food bucket fills', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    const before = s.cities[1].pop;
    const need = growthThreshold(before);
    // grassland city: center >=2 food + worked grass 2 food = 4, minus consumption 2 = +2/turn
    let rounds = 0;
    while (s.cities[1].pop === before && rounds < need) {
      s = fullRound(s);
      rounds++;
    }
    expect(s.cities[1].pop).toBe(before + 1);
    expect(rounds).toBe(Math.ceil(need / 2));
  });

  it('production completes units and banks overflow', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = applyAction(ctx, s, {
      type: 'SET_PRODUCTION',
      player: 0,
      city: 1,
      item: { kind: 'unit', id: 'warrior' },
    });
    let guard = 0;
    while (!Object.values(s.units).some((u) => u.owner === 0 && u.def === 'warrior') && guard < 30) {
      s = fullRound(s);
      guard++;
    }
    expect(guard).toBeLessThan(30);
    expect(s.cities[1].production.item).toBeNull();
  });

  it('gold can rush-buy; settlers need population to spare', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].gold = 1000;
    const price = ctx.rules.units.warrior.cost * ctx.rules.settings.purchaseMultiplier;
    s = applyAction(ctx, s, { type: 'BUY_ITEM', player: 0, city: 1, item: { kind: 'unit', id: 'warrior' } });
    expect(s.players[0].gold).toBe(1000 - price);
    expect(Object.values(s.units).some((u) => u.def === 'warrior' && u.owner === 0)).toBe(true);

    const v = validateAction(ctx, s, {
      type: 'BUY_ITEM',
      player: 0,
      city: 1,
      item: { kind: 'unit', id: 'settler' },
    });
    expect(v.ok).toBe(false); // pop 1 cannot spare a settler
  });

  it('culture expands borders to the best nearby tile', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    const owned = () => s.tiles.filter((t) => t.ownerCity === 1).length;
    expect(owned()).toBe(7);
    // palace gives +1 culture; threshold 10 -> expands on round 10
    for (let i = 0; i < 11 && owned() === 7; i++) s = fullRound(s);
    expect(owned()).toBe(8);
  });
});

describe('research and gating', () => {
  it('techs gate units; science carries over', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });

    const cantYet = validateAction(ctx, s, {
      type: 'SET_PRODUCTION',
      player: 0,
      city: 1,
      item: { kind: 'unit', id: 'archer' },
    });
    expect(cantYet.ok).toBe(false);

    s = applyAction(ctx, s, { type: 'SET_RESEARCH', player: 0, tech: 'archery' });
    let guard = 0;
    while (!s.players[0].techs.includes('archery') && guard < 25) {
      s = fullRound(s);
      guard++;
    }
    expect(s.players[0].techs).toContain('archery');
    const nowOk = validateAction(ctx, s, {
      type: 'SET_PRODUCTION',
      player: 0,
      city: 1,
      item: { kind: 'unit', id: 'archer' },
    });
    expect(nowOk.ok).toBe(true);

    const lockedTech = validateAction(ctx, s, { type: 'SET_RESEARCH', player: 0, tech: 'currency' });
    expect(lockedTech.ok).toBe(false); // writing not yet known
  });

  it('strategic resources gate units until improved, then units consume the pool', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    s.tiles[idxOf(s, 6, 5)].resource = 'horses'; // inside the city's first ring
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    s.players[0].techs.push('animal_husbandry', 'horseback_riding');

    expect(strategicAvailability(ctx, s, 0, 'horses')).toBe(0);
    const blocked = validateAction(ctx, s, {
      type: 'SET_PRODUCTION',
      player: 0,
      city: 1,
      item: { kind: 'unit', id: 'horseman' },
    });
    expect(blocked.ok).toBe(false);

    // improve the pasture by hand (worker flow tested separately)
    const horseTile = s.tiles[idxOf(s, 6, 5)];
    horseTile.improvement = 'pasture';
    expect(strategicAvailability(ctx, s, 0, 'horses')).toBe(1);
    expect(
      validateAction(ctx, s, {
        type: 'SET_PRODUCTION',
        player: 0,
        city: 1,
        item: { kind: 'unit', id: 'horseman' },
      }).ok,
    ).toBe(true);

    spawn(s, 0, 'horseman', 3, 3);
    expect(strategicAvailability(ctx, s, 0, 'horses')).toBe(0);
  });

  it('workers build improvements over several turns and yields rise', () => {
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(ctx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = thaw(s);
    const worker = spawn(s, 0, 'worker', 6, 5);
    refreshVis(s);
    const foodBefore = cityYields(ctx, s, s.cities[1]).total.food;
    s = applyAction(ctx, s, { type: 'BUILD_IMPROVEMENT', player: 0, unit: worker.id, improvement: 'farm' });
    for (let i = 0; i < ctx.rules.improvements.farm.turns; i++) s = fullRound(s);
    expect(s.tiles[idxOf(s, 6, 5)].improvement).toBe('farm');
    expect(s.units[worker.id].order).toBeNull();
    // farm tile only counts if worked; pop 1 works the best tile which now includes the farm
    const foodAfter = cityYields(ctx, s, s.cities[1]).total.food;
    expect(foodAfter).toBeGreaterThanOrEqual(foodBefore);
  });
});

describe('turn limit and score victory', () => {
  it('ends at the turn limit with the top score winning', () => {
    const shortCtx = customCtx((r) => {
      r.settings.victory.turnLimit = 3;
    });
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(shortCtx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    let guard = 0;
    while (s.phase === 'playing' && guard < 10) {
      s = fullRound(s, shortCtx);
      guard++;
    }
    expect(s.phase).toBe('ended');
    expect(s.winner?.player).toBe(0); // the one with a city outscores the warrior
    expect(s.winner?.victory).toBe('score');
  });

  it('rejects actions after the game ends', () => {
    const shortCtx = customCtx((r) => {
      r.settings.victory.turnLimit = 1;
    });
    let s = flatWorld();
    const settler = spawn(s, 0, 'settler', 5, 5);
    spawn(s, 1, 'warrior', 1, 8);
    refreshVis(s);
    s = applyAction(shortCtx, s, { type: 'FOUND_CITY', player: 0, unit: settler.id });
    s = fullRound(s, shortCtx); // wrap past the 1-turn limit ends the game
    expect(s.phase).toBe('ended');
    expect(() => endTurn(s, shortCtx)).toThrow(ActionError);
  });
});
