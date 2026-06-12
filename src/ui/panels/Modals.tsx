import { useRef } from 'react';
import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { LocalGame, currentGame, gameCtx, quitToMenu, startGame } from '../../app/driver';
import { exportSave, importSave } from '../../app/save';
import { computeScore } from '../../engine/selectors';

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
