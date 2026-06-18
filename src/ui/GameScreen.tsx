import { useEffect } from 'react';
import { eventSfx, playSfx } from './audio';
import { MapCanvas } from './map/MapCanvas';
import { TopBar } from './panels/TopBar';
import { UnitPanel } from './panels/UnitPanel';
import { CityPanel } from './panels/CityPanel';
import { TechTree } from './panels/TechTree';
import { Civics } from './panels/Civics';
import { ForeignAffairs } from './panels/ForeignAffairs';
import { Notifications } from './panels/Notifications';
import { HudRight } from './panels/HudRight';
import { TileInfo } from './panels/TileInfo';
import { AiLog } from './panels/AiLog';
import { AiThinkingBanner, EventModal, GameMenu, ProposalModal, ReligionModal, TradeRouteModal, VictoryOverlay, WarConfirm } from './panels/Modals';
import { Chronicle } from './panels/Chronicle';
import { Demographics } from './panels/Demographics';
import { VictoryProgress } from './panels/VictoryProgress';
import { appStore, useApp } from '../app/store';
import { endTurnRequest, humanDispatch, isMyTurn, selectNextIdleUnit } from './actions';

let lastToastId = -1;

export function GameScreen() {
  const overlay = useApp((s) => s.overlay);

  // play a sound for each newly-arrived toast (world events)
  const toasts = useApp((s) => s.toasts);
  useEffect(() => {
    const newest = toasts[toasts.length - 1];
    if (newest && newest.id > lastToastId) {
      lastToastId = newest.id;
      const sfx = eventSfx(newest.type);
      if (sfx) playSfx(sfx);
    }
  }, [toasts]);

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
        case 'KeyC':
          appStore.set({ overlay: ov === 'civics' ? null : 'civics' });
          break;
        case 'KeyH':
          appStore.set({ overlay: ov === 'chronicle' ? null : 'chronicle' });
          break;
        case 'KeyV':
          appStore.set({ overlay: ov === 'victory' ? null : 'victory' });
          break;
        case 'KeyB':
          appStore.set({ overlay: ov === 'demographics' ? null : 'demographics' });
          break;
        case 'KeyN':
          selectNextIdleUnit();
          break;
        case 'KeyF':
          if (selectedUnit !== null && isMyTurn())
            humanDispatch({ type: 'FORTIFY', player: viewingPlayer, unit: selectedUnit });
          break;
        case 'KeyZ':
          if (selectedUnit !== null && isMyTurn())
            humanDispatch({ type: 'SLEEP_UNIT', player: viewingPlayer, unit: selectedUnit });
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
      {overlay === 'civics' && <Civics />}
      {overlay === 'diplomacy' && <ForeignAffairs />}
      {overlay === 'chronicle' && <Chronicle />}
      {overlay === 'victory' && <VictoryProgress />}
      {overlay === 'demographics' && <Demographics />}
      <GameMenu />
      <WarConfirm />
      <ProposalModal />
      <TradeRouteModal />
      <ReligionModal />
      <EventModal />
      <VictoryOverlay />
    </div>
  );
}
