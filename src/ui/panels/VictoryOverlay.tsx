import { appStore, useApp } from '../../app/store';
import { gameCtx, quitToMenu } from '../../app/driver';
import { computeScore, influence, militaryPower, playerCities } from '../../engine/selectors';

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
    .filter((p) => !p.barbarian)
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
          <thead>
            <tr><th style={{ textAlign: 'left' }}>Nation</th><th>Score</th><th>Techs</th><th>Pop</th><th>Military</th><th>Culture</th></tr>
          </thead>
          <tbody>
            {scores.map(({ p, score }) => (
              <tr key={p.id} style={{ opacity: p.alive ? 1 : 0.45 }}>
                <td>
                  <span className="civ-dot" style={{ background: p.color, display: 'inline-block', marginRight: 8 }} />
                  {p.name} · {gameCtx.rules.civs[p.civ].name}{!p.alive && ' †'}
                </td>
                <td>{score}</td>
                <td>{p.techs.length}</td>
                <td>{playerCities(game, p.id).reduce((s, c) => s + c.pop, 0)}</td>
                <td>{militaryPower(gameCtx, game, p.id)}</td>
                <td>{influence(gameCtx, game, p.id)}</td>
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
