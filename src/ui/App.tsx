import { useApp } from '../app/store';
import { MainMenu } from './MainMenu';
import { GameScreen } from './GameScreen';

export function App() {
  const screen = useApp((s) => s.screen);
  return screen === 'menu' ? <MainMenu /> : <GameScreen />;
}
