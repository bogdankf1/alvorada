import { describe, it, expect } from 'vitest';
import { STANDARD_RULESET } from '../src/data/standard';
import { SCHEMA_VERSION } from '../src/engine/serialize';
import { flatWorld } from './helpers';

describe('roads data', () => {
  it('ships a basic road, a move scale, and bumps the schema', () => {
    expect(STANDARD_RULESET.roads.road).toMatchObject({ id: 'road', moveCost: 1, turns: 2 });
    expect(STANDARD_RULESET.settings.moveScale).toBe(2);
    expect(SCHEMA_VERSION).toBe(10);
  });
  it('tiles default to no road', () => {
    const s = flatWorld(8, 8, 1);
    expect(s.tiles[0].road).toBeNull();
  });
});
