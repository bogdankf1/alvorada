import { useEffect } from 'react';
import { MapCanvas } from './map/MapCanvas';
import { TopBar } from './panels/TopBar';
import { UnitPanel } from './panels/UnitPanel';
import { CityPanel } from './panels/CityPanel';
import { TechTree } from './panels/TechTree';
import { ForeignAffairs } from './panels/ForeignAffairs';
import { Notifications } from './panels/Notifications';
import { HudRight } from './panels/HudRight';
import { TileInfo } from './panels/TileInfo';
import { AiLog } from './panels/AiLog';
import { AiThinkingBanner, GameMenu, VictoryOverlay, WarConfirm } from './panels/Modals';
import { appStore, useApp } from '../app/store';
import { endTurnRequest, humanDispatch, isMyTurn, selectNextIdleUnit } from './actions';

export function GameScreen() {
  const overlay = useApp((s) => s.overlay);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const { selectedUnit, viewingPlayer, overlay: ov } = appStore.get();
      switch (e.code) {
        case 'Enter':
        case 'NumpadEnter':
          if (ov) appStore.set({ overlay: null });
          else endTurnRequest();
          break;
        case 'Escape':
          if (ov) appStore.set({ overlay: null });
          else if (appStore.get().warConfirm) appStore.set({ warConfirm: null });
          else appStore.set({ selectedUnit: null, selectedCity: null });
          break;
        case 'KeyT':
          appStore.set({ overlay: ov === 'tech' ? null : 'tech' });
          break;
        case 'KeyG':
          appStore.set({ overlay: ov === 'diplomacy' ? null : 'diplomacy' });
          break;
        case 'KeyN':
          selectNextIdleUnit();
          break;
        case 'KeyF':
          if (selectedUnit !== null && isMyTurn())
            humanDispatch({ type: 'FORTIFY', player: viewingPlayer, unit: selectedUnit });
          break;
        case 'Space':
          if (selectedUnit !== null && isMyTurn()) {
            humanDispatch({ type: 'SKIP_UNIT', player: viewingPlayer, unit: selectedUnit });
            e.preventDefault();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="game-root">
      <div className="game-map">
        <MapCanvas />
      </div>
      <TopBar />
      <AiThinkingBanner />
      <Notifications />
      <CityPanel />
      <UnitPanel />
      <TileInfo />
      <HudRight />
      <AiLog />
      {overlay === 'tech' && <TechTree />}
      {overlay === 'diplomacy' && <ForeignAffairs />}
      <GameMenu />
      <WarConfirm />
      <VictoryOverlay />
    </div>
  );
}
