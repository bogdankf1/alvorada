import { useState } from 'react';
import { gameCtx } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { attitude } from '../../engine/diplomacy-eval';
import { atWar, metPlayers } from '../../engine/selectors';
import type { DealItems, GameState, PlayerId } from '../../engine/types';
import { ATTITUDE_COLOR, ATTITUDE_LABEL, dealVerdict, emptyDraft, type DraftDeal } from '../diplomacy';

export function ForeignAffairs() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const target = useApp((s) => s.diploTarget);
  const draft = useApp((s) => s.draftDeal) ?? emptyDraft();
  const [showWhy, setShowWhy] = useState(false);
  if (!game) return null;

  const met = metPlayers(game, viewer);
  const close = () => appStore.set({ overlay: null });
  const pick = (id: PlayerId) => appStore.set({ diploTarget: id, draftDeal: emptyDraft() });
  const setDraft = (next: DraftDeal) => appStore.set({ draftDeal: next });
  const term = gameCtx.rules.settings.diplomacy.termLength;

  return (
    <div className="overlay-scrim" onClick={close}>
      <div className="diplo" onClick={(e) => e.stopPropagation()}>
        <div className="tech-head">
          <h2>FOREIGN AFFAIRS</h2>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Close (Esc)</button>
        </div>

        <div className="diplo-body scroll-quiet">
          <div className="powers">
            {met.length === 0 && <div className="muted">You have met no other powers yet.</div>}
            {met.map((id) => {
              const p = game.players[id];
              const att = attitude(gameCtx, game, id, viewer);
              const war = atWar(game, viewer, id);
              const friends = game.relations[viewer][id].friends;
              return (
                <div
                  key={id}
                  className={`power ${target === id ? 'is-active' : ''}`}
                  onClick={() => pick(id)}
                >
                  <span className="civ-dot" style={{ background: p.color }} />
                  <div className="grow">
                    <div className="nm">{p.name} · {gameCtx.rules.civs[p.civ].name}</div>
                    <div className="att" style={{ color: ATTITUDE_COLOR[att.band] }}>
                      {ATTITUDE_LABEL[att.band]}
                      {war && <span className="badge war"> ⚔ War</span>}
                      {friends && <span className="badge friend"> ♥ Friends</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {target !== null && (
            <DealTable
              game={game}
              viewer={viewer}
              rival={target}
              draft={draft}
              setDraft={setDraft}
              term={term}
              showWhy={showWhy}
              toggleWhy={() => setShowWhy((v) => !v)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DealTable(props: {
  game: GameState;
  viewer: PlayerId;
  rival: PlayerId;
  draft: DraftDeal;
  setDraft: (d: DraftDeal) => void;
  term: number;
  showWhy: boolean;
  toggleWhy: () => void;
}) {
  const { game, viewer, rival, draft, setDraft, term, showWhy, toggleWhy } = props;
  const war = atWar(game, viewer, rival);
  const att = attitude(gameCtx, game, rival, viewer);
  const verdict = dealVerdict(game, viewer, rival, draft);
  const myTurn = isMyTurn();

  const setGive = (patch: Partial<DealItems>) => setDraft({ ...draft, give: { ...draft.give, ...patch } });
  const setTake = (patch: Partial<DealItems>) => setDraft({ ...draft, take: { ...draft.take, ...patch } });
  const setBoth = (patch: Partial<DealItems>) =>
    setDraft({ give: { ...draft.give, ...patch }, take: { ...draft.take, ...patch } });

  const propose = () => {
    if (humanDispatch({ type: 'PROPOSE_DEAL', player: viewer, to: rival, give: draft.give, take: draft.take })) {
      setDraft(emptyDraft());
    }
  };

  const myGold = game.players[viewer].gold;
  const theirGold = game.players[rival].gold;

  return (
    <div className="deal">
      <div className="deal-why" onClick={toggleWhy}>
        Attitude: <b style={{ color: ATTITUDE_COLOR[att.band] }}>{ATTITUDE_LABEL[att.band]}</b> · ▸ why
      </div>
      {showWhy && (
        <ul className="why-list">
          {att.factors.length === 0 && <li className="muted">No strong feelings either way.</li>}
          {att.factors.map((f) => (
            <li key={f.label}>
              <span>{f.label}</span>
              <span className={f.delta >= 0 ? 'pos' : 'neg'}>{f.delta >= 0 ? `+${f.delta}` : f.delta}</span>
            </li>
          ))}
        </ul>
      )}

      {war ? (
        <label className="deal-row">
          <input
            type="checkbox"
            checked={!!draft.give.peace}
            onChange={(e) => setBoth({ peace: e.target.checked })}
          />
          Make peace
        </label>
      ) : (
        <div className="deal-cols">
          <div className="deal-col">
            <div className="deal-col-h">They give</div>
            <NumRow label="Gold" max={theirGold} value={draft.take.gold} onChange={(v) => setTake({ gold: v })} />
            <NumRow label={`Gold/turn (${term}t)`} max={Math.floor(theirGold / 4)} value={draft.take.goldPerTurn?.amount ?? 0}
              onChange={(v) => setTake({ goldPerTurn: v > 0 ? { amount: v, turns: term } : undefined })} />
            <label className="chk"><input type="checkbox" checked={!!draft.take.openBorders}
              onChange={(e) => setTake({ openBorders: e.target.checked })} /> Open borders</label>
          </div>
          <div className="deal-col">
            <div className="deal-col-h">You give</div>
            <NumRow label="Gold" max={myGold} value={draft.give.gold} onChange={(v) => setGive({ gold: v })} />
            <NumRow label={`Gold/turn (${term}t)`} max={Math.floor(myGold / 4)} value={draft.give.goldPerTurn?.amount ?? 0}
              onChange={(v) => setGive({ goldPerTurn: v > 0 ? { amount: v, turns: term } : undefined })} />
            <label className="chk"><input type="checkbox" checked={!!draft.give.openBorders}
              onChange={(e) => setGive({ openBorders: e.target.checked })} /> Open borders</label>
          </div>
        </div>
      )}

      {!war && (
        <label className="deal-row">
          <input type="checkbox" checked={!!draft.give.friendship}
            onChange={(e) => setBoth({ friendship: e.target.checked })}
            disabled={game.relations[viewer][rival].friends} />
          Declare friendship
        </label>
      )}

      <div className={`verdict ${verdict.tone}`}>{verdict.text}</div>
      <div className="deal-actions">
        <button className="btn btn--primary" disabled={!myTurn} onClick={propose}>Propose</button>
        <button className="btn" onClick={() => setDraft(emptyDraft())}>Clear</button>
      </div>
    </div>
  );
}

function NumRow(props: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const { label, value, max, onChange } = props;
  return (
    <label className="num-row">
      <span>{label}</span>
      <input
        type="number" min={0} max={Math.max(0, max)} value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(Math.max(0, max), Math.floor(Number(e.target.value) || 0))))}
      />
    </label>
  );
}
