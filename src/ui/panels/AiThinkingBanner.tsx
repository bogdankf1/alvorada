import { useApp } from '../../app/store';
import { currentGame, gameCtx } from '../../app/driver';

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
