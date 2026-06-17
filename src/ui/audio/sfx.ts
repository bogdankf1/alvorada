import { getAudioSettings } from './settings';
import type { SfxName } from './maps';

let ctx: AudioContext | null = null;

/** Lazily create the shared AudioContext (returns null in non-DOM/unsupported envs). */
export function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

interface Tone { freq: number; dur: number; type: OscillatorType; gain: number; }
const TONES: Record<SfxName, Tone> = {
  click:     { freq: 420, dur: 0.05, type: 'triangle', gain: 0.05 },
  select:    { freq: 560, dur: 0.06, type: 'triangle', gain: 0.06 },
  move:      { freq: 320, dur: 0.07, type: 'sine',     gain: 0.05 },
  attack:    { freq: 170, dur: 0.13, type: 'sawtooth', gain: 0.07 },
  cityFound: { freq: 523, dur: 0.24, type: 'triangle', gain: 0.08 },
  complete:  { freq: 660, dur: 0.20, type: 'triangle', gain: 0.08 },
  notify:    { freq: 480, dur: 0.08, type: 'sine',     gain: 0.045 },
  victory:   { freq: 784, dur: 0.55, type: 'triangle', gain: 0.10 },
};

export function playSfx(name: SfxName): void {
  if (!getAudioSettings().sfx) return;
  const ac = ensureAudio();
  if (!ac || ac.state === 'closed') return;
  const t = TONES[name];
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = t.type;
  osc.frequency.value = t.freq;
  const now = ac.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(t.gain, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + t.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + t.dur + 0.02);
}
