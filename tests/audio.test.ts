import { describe, it, expect } from 'vitest';
import { actionSfx, eventSfx } from '../src/ui/audio/maps';
import { parseSettings } from '../src/ui/audio/settings';

describe('actionSfx', () => {
  it('maps interaction actions and returns null for the rest', () => {
    expect(actionSfx('MOVE_UNIT')).toBe('move');
    expect(actionSfx('ATTACK')).toBe('attack');
    expect(actionSfx('RANGED_ATTACK')).toBe('attack');
    expect(actionSfx('BUY_TILE')).toBe('click');
    expect(actionSfx('SET_PRODUCTION')).toBe('click');
    expect(actionSfx('FOUND_CITY')).toBeNull();
    expect(actionSfx('END_TURN')).toBeNull();
  });
});

describe('eventSfx', () => {
  it('maps world-event toast types', () => {
    expect(eventSfx('cityFounded')).toBe('cityFound');
    expect(eventSfx('wonderBuilt')).toBe('complete');
    expect(eventSfx('techDone')).toBe('complete');
    expect(eventSfx('victory')).toBe('victory');
    expect(eventSfx('war')).toBe('attack');
    expect(eventSfx('cityGrew')).toBe('notify');
    expect(eventSfx('unmappedType')).toBeNull();
  });
});

describe('parseSettings', () => {
  it('defaults to enabled, respects stored flags, tolerates garbage', () => {
    expect(parseSettings(null)).toEqual({ sfx: true, music: true });
    expect(parseSettings('{"sfx":false}')).toEqual({ sfx: false, music: true });
    expect(parseSettings('{"music":false}')).toEqual({ sfx: true, music: false });
    expect(parseSettings('not json')).toEqual({ sfx: true, music: true });
  });
});
