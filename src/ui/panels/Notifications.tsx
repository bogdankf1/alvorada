import { appStore, focusCamera, useApp } from '../../app/store';
import { IconLaurel, IconScroll, IconSwords, IconWheat } from '../icons';

function iconFor(type: string) {
  if (type === 'techDone' || type === 'resourceRevealed') return <IconScroll />;
  if (
    type === 'war' ||
    type === 'unitKilled' ||
    type === 'cityCaptured' ||
    type === 'cityBombarded' ||
    type === 'denounce' ||
    type === 'dealBroken'
  )
    return <IconSwords />;
  if (type === 'cityGrew' || type === 'cityFounded' || type === 'cityStarved') return <IconWheat />;
  return <IconLaurel />; // includes diplomacy outcomes: dealOffer/dealAccepted/dealRejected/dealCounter
}

export function Notifications() {
  const toasts = useApp((s) => s.toasts);
  const aiLogOpen = useApp((s) => s.aiLogOpen);
  if (aiLogOpen) return null; // the counsel drawer owns that corner
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast plate plate--sm t-${t.type}`}
          onClick={() => {
            if (t.q !== undefined && t.r !== undefined) focusCamera(t.q, t.r);
            appStore.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
          }}
        >
          <span className="ic">{iconFor(t.type)}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
