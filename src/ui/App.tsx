import { useEffect } from 'react';
import { useApp } from '../app/store';
import { MainMenu } from './MainMenu';
import { GameScreen } from './GameScreen';
import { initAudio } from './audio';

export function App() {
  const screen = useApp((s) => s.screen);
  useEffect(() => { initAudio(); }, []);
  return screen === 'menu' ? <MainMenu /> : <GameScreen />;
}
