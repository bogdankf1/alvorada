const KEY = 'alvorada.audio';

export interface AudioSettings { sfx: boolean; music: boolean; }

/** Pure parse: defaults to enabled; tolerates null/garbage. */
export function parseSettings(raw: string | null): AudioSettings {
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      return { sfx: p.sfx !== false, music: p.music !== false };
    } catch { /* fall through to defaults */ }
  }
  return { sfx: true, music: true };
}

let settings: AudioSettings = parseSettings(
  typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null,
);

export function getAudioSettings(): AudioSettings { return settings; }

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
export function setSfxEnabled(on: boolean): void { settings = { ...settings, sfx: on }; save(); }
export function setMusicEnabled(on: boolean): void { settings = { ...settings, music: on }; save(); }
