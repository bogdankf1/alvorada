import { useEffect, useState } from 'react';
import { gameCtx } from '../../app/driver';
import { useApp } from '../../app/store';
import { currentEra } from '../../engine/selectors';

const ERA_FLAVOR: Record<string, string> = {
  ancient: 'The first cities rise from the dust.',
  classical: 'Philosophy, law, and legions shape a classical age.',
  medieval: 'Faith and steel define a new world.',
  renaissance: 'A flowering of art and reason dawns.',
};

let lastEraIdx = -1;

export function EraCeremony() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;
    const eraId = currentEra(gameCtx, game, viewer);
    const idx = gameCtx.rules.eras.findIndex((e) => e.id === eraId);
    // init on first run, and reset (no fire) when a new game drops the era back down
    if (lastEraIdx === -1 || idx < lastEraIdx) { lastEraIdx = idx; return; }
    if (idx > lastEraIdx) { lastEraIdx = idx; setShown(eraId); }
  }, [game, viewer]);

  if (!shown) return null;
  const era = gameCtx.rules.eras.find((e) => e.id === shown)!;
  return (
    <div className="modal-center" onClick={() => setShown(null)}>
      <div className="victory-card plate" onClick={(e) => e.stopPropagation()}>
        <h1>{era.name}</h1>
        <div className="by">{ERA_FLAVOR[shown] ?? ''}</div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={() => setShown(null)}>Onward</button>
        </div>
      </div>
    </div>
  );
}
