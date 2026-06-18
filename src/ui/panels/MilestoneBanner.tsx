import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';

const BANNER_TYPES = new Set(['wonderBuilt', 'religionFounded']);
let lastBannerId = -1;

export function MilestoneBanner() {
  const toasts = useApp((s) => s.toasts);
  const [banner, setBanner] = useState<string | null>(null);

  // detect a new milestone toast → show its banner
  useEffect(() => {
    if (!toasts.length) return;
    const maxId = Math.max(...toasts.map((t) => t.id));
    const hit = [...toasts].reverse().find((t) => t.id > lastBannerId && BANNER_TYPES.has(t.type));
    lastBannerId = Math.max(lastBannerId, maxId);
    if (hit) setBanner(hit.msg);
  }, [toasts]);

  // auto-clear a few seconds after it appears — keyed on `banner`, so unrelated
  // toast updates can't cancel this timer and leave the banner stuck on screen
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  return (
    <div
      className="plate"
      style={{ position: 'fixed', top: '16%', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '14px 30px', textAlign: 'center', pointerEvents: 'none' }}
    >
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: 20, color: 'var(--brass)' }}>{banner}</div>
    </div>
  );
}
