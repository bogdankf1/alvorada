import { useState } from 'react';
import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { gameCtx } from '../../app/driver';
import { playerCities } from '../../engine/selectors';
import { validateAction } from '../../engine/validate';

export function ReligionModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const mode = useApp((s) => s.religionModal);
  const [name, setName] = useState('');
  const [founderBelief, setFounderBelief] = useState('');
  const [followerBelief, setFollowerBelief] = useState('');
  const clear = () => appStore.set({ religionModal: null });

  if (!game || mode === null) return null;

  const player = game.players[viewer];

  if (mode === 'pantheon') {
    const beliefs = Object.values(gameCtx.rules.beliefs).filter((b) => b.kind === 'pantheon');
    return (
      <div className="modal-center" onClick={clear}>
        <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
          <h3>Found Pantheon</h3>
          {beliefs.map((b) => {
            const eligible = validateAction(gameCtx, game, { type: 'FOUND_PANTHEON', player: viewer, belief: b.id }).ok;
            return (
              <button
                key={b.id}
                className="btn"
                disabled={!eligible}
                onClick={() => {
                  humanDispatch({ type: 'FOUND_PANTHEON', player: viewer, belief: b.id });
                  clear();
                }}
              >
                {b.name}
              </button>
            );
          })}
          <button className="btn" onClick={clear}>Cancel</button>
        </div>
      </div>
    );
  }

  // mode === 'religion'
  const defaultName = gameCtx.rules.civs[player.civ].name;
  const relName = name || defaultName;
  const holyCity = playerCities(game, viewer)[0];
  const founderBeliefs = Object.values(gameCtx.rules.beliefs).filter((b) => b.kind === 'founder');
  const followerBeliefs = Object.values(gameCtx.rules.beliefs).filter((b) => b.kind === 'follower');
  const canFound =
    holyCity !== undefined &&
    founderBelief !== '' &&
    followerBelief !== '' &&
    validateAction(gameCtx, game, {
      type: 'FOUND_RELIGION',
      player: viewer,
      name: relName,
      holyCity: holyCity?.id ?? 0,
      founderBelief,
      followerBelief,
    }).ok;

  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h3>Found Religion</h3>
        <label>
          Name:{' '}
          <input
            className="btn"
            value={name}
            placeholder={defaultName}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <h4>Founder Belief</h4>
        {founderBeliefs.map((b) => (
          <button
            key={b.id}
            className={`btn${founderBelief === b.id ? ' btn--primary' : ''}`}
            onClick={() => setFounderBelief(b.id)}
          >
            {b.name}
          </button>
        ))}
        <h4>Follower Belief</h4>
        {followerBeliefs.map((b) => (
          <button
            key={b.id}
            className={`btn${followerBelief === b.id ? ' btn--primary' : ''}`}
            onClick={() => setFollowerBelief(b.id)}
          >
            {b.name}
          </button>
        ))}
        <div className="modal-actions">
          <button
            className="btn btn--primary"
            disabled={!canFound}
            onClick={() => {
              if (!holyCity) return;
              humanDispatch({
                type: 'FOUND_RELIGION',
                player: viewer,
                name: relName,
                holyCity: holyCity.id,
                founderBelief,
                followerBelief,
              });
              clear();
            }}
          >
            Found Religion
          </button>
          <button className="btn" onClick={clear}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
