import type { EventEffect } from '../../data/types';
import { useApp } from '../../app/store';
import { humanDispatch } from '../actions';
import { gameCtx } from '../../app/driver';

function eventEffectSummary(effects: EventEffect[]): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (e.k === 'gold') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} gold`);
    else if (e.k === 'science') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} science`);
    else if (e.k === 'faith') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} faith`);
    else if (e.k === 'culture') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} culture`);
    else if (e.k === 'production') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} production`);
    else if (e.k === 'popChange') parts.push(`${e.n! >= 0 ? '+' : ''}${e.n} population`);
    else if (e.k === 'unit') parts.push(`a ${gameCtx.rules.units[e.unit!]?.name ?? e.unit}`);
    else if (e.k === 'reveal') parts.push('reveal nearby lands');
  }
  return parts.join(', ');
}

export function EventModal() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  if (!game || !game.pendingEvent || game.pendingEvent.player !== viewer) return null;
  const ev = gameCtx.rules.events[game.pendingEvent.eventId];
  if (!ev) {
    return (
      <div className="modal-center">
        <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
          <h2>An Event Has Passed</h2>
          <div className="modal-actions">
            <button className="btn btn--primary" onClick={() => humanDispatch({ type: 'EVENT_CHOICE', player: viewer, choice: 0 })}>Continue</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-center">
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>{ev.title}</h2>
        <p>{ev.body}</p>
        <div className="modal-actions" style={{ flexDirection: 'column' }}>
          {ev.choices.map((c, i) => (
            <button key={i} className="btn btn--primary" onClick={() => humanDispatch({ type: 'EVENT_CHOICE', player: viewer, choice: i })}>
              {c.text}
              <span className="sub">{eventEffectSummary(c.effects)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
