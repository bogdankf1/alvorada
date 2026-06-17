import { getAudioSettings } from './settings';

let el: HTMLAudioElement | null = null;

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio('/audio/ambient.mp3');
    el.loop = true;
    el.volume = 0.35;
    el.addEventListener('error', () => { /* no file present yet — silently ignore */ });
  }
  return el;
}

/** Start or stop playback to match the current Music setting. Safe to call repeatedly. */
export function applyMusic(): void {
  const e = element();
  if (!e) return;
  if (getAudioSettings().music) void e.play().catch(() => { /* autoplay blocked or file absent */ });
  else e.pause();
}

export function stopMusic(): void { el?.pause(); }
