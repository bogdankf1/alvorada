import { useRef, useState } from 'react';
import { getAudioSettings, setSfxEnabled, setMusicEnabled, applyMusic } from '../audio';
import { appStore, useApp } from '../../app/store';
import { LocalGame, quitToMenu, startGame } from '../../app/driver';
import { exportSave, importSave } from '../../app/save';

export function GameMenu() {
  const overlay = useApp((s) => s.overlay);
  const game = useApp((s) => s.game);
  const fileRef = useRef<HTMLInputElement>(null);
  const [audio, setAudio] = useState(getAudioSettings());
  if (overlay !== 'menu' || !game) return null;
  const close = () => appStore.set({ overlay: null });
  const toggleSfx = () => { const v = !audio.sfx; setSfxEnabled(v); setAudio({ ...audio, sfx: v }); };
  const toggleMusic = () => { const v = !audio.music; setMusicEnabled(v); applyMusic(); setAudio({ ...audio, music: v }); };
  return (
    <div className="modal-center" onClick={close}>
      <div className="modal-card plate" onClick={(e) => e.stopPropagation()}>
        <h2>ALVORADA</h2>
        <p>Turn {game.turn}</p>
        <div className="modal-actions" style={{ flexDirection: 'column' }}>
          <button className="btn btn--primary" onClick={close}>
            Return to the Map
          </button>
          <button className="btn" onClick={toggleSfx}>
            Sound effects: {audio.sfx ? 'On' : 'Off'}
          </button>
          <button className="btn" onClick={toggleMusic}>
            Music: {audio.music ? 'On' : 'Off'}
          </button>
          <button className="btn" onClick={() => exportSave(game)}>
            Export Save
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import Save
          </button>
          <button className="btn btn--danger" onClick={quitToMenu}>
            Abandon to Menu
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                const state = await importSave(file);
                startGame(new LocalGame(state));
              } catch {
                appStore.set({ overlay: null });
              }
            }
          }}
        />
      </div>
    </div>
  );
}
