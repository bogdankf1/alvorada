import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { validateRuleset } from '../src/data/validate';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { initialState } from '../src/engine/state';
import { ctx } from './helpers';

describe('events: foundation', () => {
  it('schema is 8 and the ruleset validates', () => {
    expect(SCHEMA_VERSION).toBe(8);
    expect(validateRuleset(STANDARD_RULESET)).toEqual([]);
  });
  it('initial state has empty pendingEvent/chronicle/firedEvents', () => {
    const s = initialState({ seed: 3, mapW: 20, mapH: 16, players: [{ civ: 'rome', controller: 'ai' }, { civ: 'egypt', controller: 'ai' }] }, ctx);
    expect(s.pendingEvent).toBeNull();
    expect(s.chronicle).toEqual([]);
    expect(s.firedEvents).toEqual([]);
  });
});
