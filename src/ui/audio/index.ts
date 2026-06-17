import { ensureAudio } from './sfx';
import { applyMusic } from './music';

export { playSfx } from './sfx';
export { applyMusic, stopMusic } from './music';
export { getAudioSettings, setSfxEnabled, setMusicEnabled, parseSettings } from './settings';
export type { AudioSettings } from './settings';
export { actionSfx, eventSfx } from './maps';
export type { SfxName } from './maps';

let inited = false;

/** Unlock audio on the first user gesture (browser autoplay policy). Idempotent. */
export function initAudio(): void {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  let fired = false;
  const onGesture = () => {
    if (fired) return;
    fired = true;
    void ensureAudio()?.resume();
    applyMusic();
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  };
  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);
}
