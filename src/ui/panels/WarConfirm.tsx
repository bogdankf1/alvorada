import { appStore, useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { gameCtx } from '../../app/driver';

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
