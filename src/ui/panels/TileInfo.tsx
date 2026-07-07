import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { axialOfIndex } from '../../engine/hex';
import { resourceRevealed, tileYields, unitsAt } from '../../engine/selectors';
import { VIS_UNSEEN } from '../../engine/types';
import { YieldChips } from '../YieldChips';

/** Hover plate (bottom-left). Yields are shown from the viewer's knowledge. */
export function TileInfo() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const hovered = useApp((s) => s.hoveredTile);
  const selectedUnit = useApp((s) => s.selectedUnit);
  if (!game || hovered === null || selectedUnit !== null) return null;
  const vis = game.visibility[viewer][hovered];
  if (vis === VIS_UNSEEN) {
    return (
      <div className="tile-info plate plate--sm">
        <div className="tname">Terra Incognita</div>
        <div className="sub">No traveler has seen this land</div>
      </div>
    );
  }
  const tile = game.tiles[hovered];
  const a = axialOfIndex(hovered, game.mapW);
  const terr = gameCtx.rules.terrains[tile.terrain];
  const parts: string[] = [];
  if (tile.elevation !== 'flat') parts.push(gameCtx.rules.elevations[tile.elevation].name);
  if (tile.feature) parts.push(gameCtx.rules.features[tile.feature].name);
  if (tile.resource && resourceRevealed(gameCtx, game, viewer, tile.resource))
    parts.push(gameCtx.rules.resources[tile.resource].name);
  if (tile.improvement) parts.push(gameCtx.rules.improvements[tile.improvement].name);
  const owner = tile.ownerCity !== null ? game.cities[tile.ownerCity] : null;
  const y = tileYields(gameCtx, game, hovered, viewer);
  const units = vis === 2 ? unitsAt(game, a) : [];

  return (
    <div className="tile-info plate plate--sm">
      <div className="tname">{terr.name}</div>
      {parts.length > 0 && <div className="sub">{parts.join(' · ')}</div>}
      {owner && <div className="sub">Lands of {owner.name}</div>}
      <YieldChips values={y} positiveOnly size={12} />
      {units.map((u) => (
        <div key={u.id} className="sub" style={{ marginTop: 3 }}>
          {gameCtx.rules.units[u.def].name} — {game.players[u.owner].name} ({u.hp} hp)
        </div>
      ))}
    </div>
  );
}
