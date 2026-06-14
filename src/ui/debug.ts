/**
 * window.__alvorada(): a tiny scripting bridge for verification tooling
 * (scripts/shot.mjs) and console debugging. Uses only the public action
 * path — everything it does, a player could do.
 */
import { appStore } from '../app/store';
import { gameCtx } from '../app/driver';
import { tileIndex } from '../engine/hex';
import { empireHappiness, productionOptions } from '../engine/selectors';
import type { GameState } from '../engine/types';
import { decide } from '../ai/decide';
import { humanDispatch } from './actions';
import { activeRenderer, handleTileClick } from './map/MapCanvas';

interface DebugApi {
  game: GameState | null;
  viewingPlayer: number;
  clickHex(q: number, r: number): void;
  selectCity(id: number): void;
  view(q: number, r: number, zoom?: number): void;
  animProbe(id: number): { x: number; y: number; anims: number } | null;
  prodOptions(cityId: number): { kind: string; id: string; wonder: boolean }[];
  happiness(): { happy: number; unhappy: number; net: number; tier: string; connectedLuxuries: string[] } | null;
  setSpecialists(cityId: number, specialist: string, count: number): void;
  establishRoute(unitId: number, targetCity: number): void;
  listRoutes(): { id: number; owner: number; fromCity: number; toCity: number; kind: string; expires: number }[];
  adoptPolicy(policy: string): void;
  debugAutoplay(turns: number): Promise<void>;
}

declare global {
  interface Window {
    __alvorada?: () => DebugApi;
  }
}

export function installDebugBridge(): void {
  window.__alvorada = () => ({
    game: appStore.get().game,
    viewingPlayer: appStore.get().viewingPlayer,

    clickHex(q: number, r: number) {
      const g = appStore.get().game;
      const renderer = activeRenderer.current;
      if (!g || !renderer) return;
      const idx = tileIndex({ q, r }, g.mapW, g.mapH);
      if (idx < 0) return;
      handleTileClick(idx, { q, r }, renderer);
    },

    selectCity(id: number) {
      appStore.set({ selectedCity: id, selectedUnit: null });
    },

    view(q: number, r: number, zoom = 1) {
      const renderer = activeRenderer.current;
      if (!renderer) return;
      renderer.camera.zoom = zoom;
      renderer.centerOn({ q, r });
    },

    animProbe(id: number) {
      return activeRenderer.current?.debugUnitScreen(id) ?? null;
    },

    prodOptions(cityId: number) {
      const g = appStore.get().game;
      const c = g?.cities[cityId];
      if (!g || !c) return [];
      return productionOptions(gameCtx, g, c).map((it) => ({
        kind: it.kind,
        id: it.id,
        wonder: it.kind === 'building' && !!gameCtx.rules.buildings[it.id].wonder,
      }));
    },

    happiness() {
      const g = appStore.get().game;
      return g ? empireHappiness(gameCtx, g, appStore.get().viewingPlayer) : null;
    },

    setSpecialists(cityId: number, specialist: string, count: number) {
      humanDispatch({ type: 'SET_SPECIALISTS', player: appStore.get().viewingPlayer, city: cityId, specialist: specialist as never, count });
    },

    establishRoute(unitId: number, targetCity: number) {
      humanDispatch({ type: 'ESTABLISH_TRADE_ROUTE', player: appStore.get().viewingPlayer, unit: unitId, targetCity });
    },

    listRoutes() {
      const g = appStore.get().game;
      return g ? Object.values(g.tradeRoutes) : [];
    },

    adoptPolicy(policy: string) {
      humanDispatch({ type: 'ADOPT_POLICY', player: appStore.get().viewingPlayer, policy });
    },

    /** Plays the viewer's turns with the AI brain — fills the world for visual checks. */
    async debugAutoplay(turns: number) {
      const aiDone = () =>
        new Promise<void>((resolve) => {
          const t = setInterval(() => {
            if (!appStore.get().aiThinking) {
              clearInterval(t);
              resolve();
            }
          }, 120);
        });
      for (let i = 0; i < turns; i++) {
        const s = appStore.get();
        const g = s.game;
        if (!g || g.phase !== 'playing') return;
        const pid = s.viewingPlayer;
        for (let guard = 0; guard < 300; guard++) {
          const { action } = decide(gameCtx, appStore.get().game!, pid);
          const ok = humanDispatch(action);
          if (!ok || action.type === 'END_TURN') break;
        }
        await aiDone();
      }
    },
  });
}
