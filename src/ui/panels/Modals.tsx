import { useRef, useState } from 'react';
import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { LocalGame, currentGame, gameCtx, quitToMenu, startGame } from '../../app/driver';
import { exportSave, importSave } from '../../app/save';
import { computeScore, playerCities } from '../../engine/selectors';
import { validateAction } from '../../engine/validate';

export function WarConfirm() {
  const confirm = useApp((s) => s.warConfirm);
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!confirm || !game) return null;
  const target = game.players[confirm.target];
  return (
    <div className="modal-center" onClick={() => appStore.set({ warConfirm: null })}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>DECLARE WAR?</h2>
        <p>
          Attacking will declare war on {target.name} of {gameCtx.rules.civs[target.civ].name}. There
          is no taking it back.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn--primary"
            onClick={() => {
              const { followUp } = confirm;
              appStore.set({ warConfirm: null });
              if (humanDispatch({ type: 'DECLARE_WAR', player: viewer, target: target.id })) {
                humanDispatch(followUp);
              }
            }}
          >
            To War!
          </button>
          <button className="btn" onClick={() => appStore.set({ warConfirm: null })}>
            Stay the Blade
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameMenu() {
  const overlay = useApp((s) => s.overlay);
  const game = useApp((s) => s.game);
  const fileRef = useRef<HTMLInputElement>(null);
  if (overlay !== 'menu' || !game) return null;
  const close = () => appStore.set({ overlay: null });
  return (
    <div className="modal-center" onClick={close}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>ALVORADA</h2>
        <p>Turn {game.turn}</p>
        <div className="modal-actions" style={{ flexDirection: 'column' }}>
          <button className="btn btn--primary" onClick={close}>
            Return to the Map
          </button>
          <button className="btn" onClick={() => exportSave(game)}>
            Export Save
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import Save
          </button>
          <button className="btn btn--danger" onClick={quitToMenu}>
            Abandon to Menu
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                const state = await importSave(file);
                startGame(new LocalGame(state));
              } catch {
                appStore.set({ overlay: null });
              }
            }
          }}
        />
      </div>
    </div>
  );
}

export function VictoryOverlay() {
  const game = useApp((s) => s.game);
  const seen = useApp((s) => s.winnerSeen);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game || seen) return null;

  const viewerDead = !game.players[viewer].alive;
  if (!game.winner && !viewerDead) return null;

  const winner = game.winner ? game.players[game.winner.player] : null;
  const won = game.winner?.player === viewer;
  const scores = game.players
    .map((p) => ({ p, score: computeScore(gameCtx, game, p.id) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="modal-center">
      <div className="victory-card plate">
        <h1>{won ? 'VICTORY' : winner ? 'DEFEAT' : 'YOUR EMPIRE HAS FALLEN'}</h1>
        <div className="by">
          {winner
            ? `${winner.name} of ${gameCtx.rules.civs[winner.civ].name} ${
                game.winner!.victory === 'conquest'
                  ? 'has conquered the known world'
                  : game.winner!.victory === 'science'
                    ? 'ushers in a new age of reason'
                    : game.winner!.victory === 'culture'
                      ? 'echoes across the ages in a Cultural Triumph'
                      : 'leads civilization into a new age'
              } — turn ${game.turn}`
            : 'Your last city is lost, your people scattered.'}
        </div>
        <table className="score-table">
          <tbody>
            {scores.map(({ p, score }) => (
              <tr key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
                <td>
                  <span
                    className="civ-dot"
                    style={{ background: p.color, display: 'inline-block', marginRight: 8 }}
                  />
                  {p.name} · {gameCtx.rules.civs[p.civ].name}
                  {!p.alive && ' †'}
                </td>
                <td>{score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={quitToMenu}>
            New Journey
          </button>
          {(game.phase === 'playing' || game.winner) && (
            <button className="btn" onClick={() => appStore.set({ winnerSeen: true })}>
              {game.phase === 'playing' ? 'Observe the World' : 'Linger Awhile'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProposalModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const id = useApp((s) => s.proposalModal);
  if (!game || id === null) return null;
  const p = game.proposals.find((x) => x.id === id && x.to === viewer);
  if (!p) return null;
  const from = game.players[p.from];
  const summary = (d: typeof p.give) => {
    const parts: string[] = [];
    if (d.peace) parts.push('peace');
    if (d.friendship) parts.push('friendship');
    if (d.gold) parts.push(`${d.gold} gold`);
    if (d.goldPerTurn) parts.push(`${d.goldPerTurn.amount} gold/turn (${d.goldPerTurn.turns}t)`);
    if (d.openBorders) parts.push('open borders');
    return parts.length ? parts.join(', ') : 'nothing';
  };
  const clear = () => appStore.set({ proposalModal: null });
  const respond = (accept: boolean) => {
    humanDispatch({ type: 'RESPOND_DEAL', player: viewer, proposal: p.id, accept });
    clear();
  };
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>{from.name.toUpperCase()} PROPOSES</h2>
        <p>
          They give: <b>{summary(p.give)}</b>
          <br />
          They ask: <b>{summary(p.take)}</b>
        </p>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={() => respond(true)}>Accept</button>
          <button className="btn btn--danger" onClick={() => respond(false)}>Reject</button>
          <button className="btn" onClick={clear}>Later</button>
        </div>
      </div>
    </div>
  );
}

export function AiThinkingBanner() {
  const aiThinking = useApp((s) => s.aiThinking);
  const game = useApp((s) => s.game);
  if (!aiThinking || !game || game.phase === 'ended') return null;
  const current = game.players[game.currentPlayer];
  if (!currentGame) return null;
  return (
    <div className="ai-banner plate plate--sm">
      {current.name} of {gameCtx.rules.civs[current.civ].name} moves…
    </div>
  );
}

export function TradeRouteModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const unitId = useApp((s) => s.tradeRouteUnit);
  const clear = () => appStore.set({ tradeRouteUnit: null });
  if (!game || unitId === null) return null;
  if (!game.units[unitId]) { clear(); return null; }
  const targets = Object.values(game.cities).filter(
    (c) => validateAction(gameCtx, game, { type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id }).ok,
  );
  return (
    <div className="modal-center" onClick={clear}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h3>Establish Trade Route</h3>
        {targets.length === 0 && <p>No reachable city to trade with from here.</p>}
        {targets.map((c) => (
          <button
            key={c.id}
            className="btn"
            onClick={() => {
              humanDispatch({ type: 'ESTABLISH_TRADE_ROUTE', player: viewer, unit: unitId, targetCity: c.id });
              clear();
            }}
          >
            {c.name} — {c.owner !== viewer ? 'international (gold)' : 'domestic (food + production)'}
          </button>
        ))}
        <button className="btn" onClick={clear}>Cancel</button>
      </div>
    </div>
  );
}

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
