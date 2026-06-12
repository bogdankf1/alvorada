/**
 * The map surface: full-bleed canvas + all pointer/keyboard interaction.
 * Pan (drag), zoom (wheel, cursor-anchored), select, move, attack, hover
 * previews. Render work lives in MapRenderer; this file is input + glue.
 */
import { useEffect, useRef } from 'react';
import { MapRenderer } from './renderer';
import { gameCtx, currentGame } from '../../app/driver';
import { appStore, useApp } from '../../app/store';
import { humanDispatch, isMyTurn } from '../actions';
import { axialOfIndex, hexDistance, hexesWithin, pixelToHex, tileIndex } from '../../engine/hex';
import { HEX } from './art';
import { VIS_VISIBLE, type Axial } from '../../engine/types';
import { atWar, cityAt, militaryAt, unitsAt } from '../../engine/selectors';
import { findPath, reachableTiles } from '../../engine/map/pathfind';

/** The live renderer, readable by HUD widgets (minimap viewport rect). */
export const activeRenderer: { current: MapRenderer | null } = { current: null };

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const selectedUnit = useApp((s) => s.selectedUnit);
  const selectedCity = useApp((s) => s.selectedCity);
  const hoveredTile = useApp((s) => s.hoveredTile);
  const cameraFocus = useApp((s) => s.cameraFocus);
  const aiThinking = useApp((s) => s.aiThinking);

  // mount renderer once
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new MapRenderer(gameCtx.rules);
    rendererRef.current = renderer;
    activeRenderer.current = renderer;
    renderer.attach(canvas);
    if (currentGame) {
      currentGame.onAction = (a, p, n) => renderer.handleAction(a, p, n);
    }
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      renderer.detach();
      if (currentGame) currentGame.onAction = null;
      rendererRef.current = null;
      activeRenderer.current = null;
    };
  }, []);

  // push state + overlays into the renderer
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !game) return;
    renderer.setState(game, viewer);

    const overlay = renderer.overlay;
    overlay.selectedUnit = selectedUnit;
    overlay.selectedCity = selectedCity;
    overlay.hoveredTile = hoveredTile;
    overlay.reachable = new Set();
    overlay.attackable = new Set();
    overlay.pathPreview = [];

    const unit = selectedUnit !== null ? game.units[selectedUnit] : null;
    if (unit && unit.owner === viewer && isMyTurn() && unit.moves > 0) {
      for (const idx of reachableTiles(gameCtx, game, unit).keys()) overlay.reachable.add(idx);

      const def = gameCtx.rules.units[unit.def];
      const candidates = def.ranged
        ? hexesWithin({ q: unit.q, r: unit.r }, def.ranged.range)
        : hexesWithin({ q: unit.q, r: unit.r }, 1);
      if (def.strength > 0) {
        for (const h of candidates) {
          const idx = tileIndex(h, game.mapW, game.mapH);
          if (idx < 0 || game.visibility[viewer][idx] !== VIS_VISIBLE) continue;
          const enemyUnit = militaryAt(gameCtx, game, h);
          const enemyCity = cityAt(game, h);
          const hostileUnit = enemyUnit && enemyUnit.owner !== viewer;
          const hostileCity = enemyCity && enemyCity.owner !== viewer;
          if (hostileUnit || hostileCity) overlay.attackable.add(idx);
        }
      }
      // hover path preview (not over attack targets)
      if (
        hoveredTile !== null &&
        !overlay.attackable.has(hoveredTile) &&
        hoveredTile !== tileIndex({ q: unit.q, r: unit.r }, game.mapW, game.mapH)
      ) {
        const path = findPath(gameCtx, game, unit, axialOfIndex(hoveredTile, game.mapW));
        if (path && path.length <= 40) overlay.pathPreview = path;
      }
    }
    renderer.invalidate();
  }, [game, viewer, selectedUnit, selectedCity, hoveredTile, aiThinking]);

  // one-shot camera focus requests
  useEffect(() => {
    if (cameraFocus && rendererRef.current) {
      rendererRef.current.centerOn(cameraFocus);
    }
  }, [cameraFocus]);

  // keyboard
  useEffect(() => {
    const renderer = () => rendererRef.current;
    const keymap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      KeyW: 'up',
      KeyS: 'down',
      KeyA: 'left',
      KeyD: 'right',
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const dir = keymap[e.code];
      if (dir) {
        renderer()?.setPanKey(dir, true);
        e.preventDefault();
        return;
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        const c = canvasRef.current!;
        renderer()?.zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1.18);
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        const c = canvasRef.current!;
        renderer()?.zoomAt(c.clientWidth / 2, c.clientHeight / 2, 1 / 1.18);
      }
    };
    const up = (e: KeyboardEvent) => {
      const dir = keymap[e.code];
      if (dir) renderer()?.setPanKey(dir, false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // pointer interaction
  useEffect(() => {
    const canvas = canvasRef.current!;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const toTile = (e: PointerEvent | MouseEvent): { idx: number; a: Axial } | null => {
      const r = rendererRef.current;
      const g = appStore.get().game;
      if (!r || !g) return null;
      const rect = canvas.getBoundingClientRect();
      const w = r.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const a = pixelToHex(w.x, w.y, HEX);
      const idx = tileIndex(a, g.mapW, g.mapH);
      return idx >= 0 ? { idx, a } : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        if (moved) {
          rendererRef.current?.pan(dx, dy);
          canvas.style.cursor = 'grabbing';
        }
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const hit = toTile(e);
      const cur = appStore.get().hoveredTile;
      const next = hit ? hit.idx : null;
      if (cur !== next) appStore.set({ hoveredTile: next });
    };
    const onPointerUp = (e: PointerEvent) => {
      const wasDrag = moved;
      dragging = false;
      moved = false;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture(e.pointerId);
      if (wasDrag || e.button !== 0) return;
      // a click on a city nameplate goes straight to the city
      const r = rendererRef.current;
      const g = appStore.get().game;
      if (r && g) {
        const rect = canvas.getBoundingClientRect();
        const w = r.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const bannerCity = r.bannerAt(w.x, w.y);
        if (bannerCity !== null && g.cities[bannerCity]?.owner === appStore.get().viewingPlayer) {
          appStore.set({ selectedCity: bannerCity, selectedUnit: null });
          return;
        }
      }
      const hit = toTile(e);
      if (hit) handleTileClick(hit.idx, hit.a, rendererRef.current!);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      rendererRef.current?.zoomAt(
        e.clientX - rect.left,
        e.clientY - rect.top,
        e.deltaY < 0 ? 1.13 : 1 / 1.13,
      );
    };
    const onLeave = () => appStore.set({ hoveredTile: null });
    const onContext = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContext);
    canvas.style.cursor = 'grab';
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

/** Selection & orders — the shape of a Civ click: select, then point at the world. */
export function handleTileClick(idx: number, a: Axial, renderer: MapRenderer): void {
  const { game, viewingPlayer, selectedUnit } = appStore.get();
  if (!game) return;
  void renderer;

  const myTurn = isMyTurn();
  const unitsHere = unitsAt(game, a);
  const ownUnits = unitsHere.filter((u) => u.owner === viewingPlayer);
  const cityHere = cityAt(game, a);
  const selected = selectedUnit !== null ? game.units[selectedUnit] : null;

  // acting with a selected unit
  if (selected && selected.owner === viewingPlayer && myTurn) {
    const def = gameCtx.rules.units[selected.def];
    const enemyMil = unitsHere.find(
      (u) => u.owner !== viewingPlayer && gameCtx.rules.units[u.def].class !== 'civilian',
    );
    const enemyCity = cityHere && cityHere.owner !== viewingPlayer ? cityHere : null;
    const hostile = enemyMil ?? enemyCity;
    const targetOwner = enemyMil?.owner ?? enemyCity?.owner;

    if (hostile && def.strength > 0 && selected.moves > 0) {
      const dist = hexDistance({ q: selected.q, r: selected.r }, a);
      const inRange = def.ranged ? dist <= def.ranged.range : dist === 1;
      if (inRange) {
        const visIdx = game.visibility[viewingPlayer][idx];
        if (def.ranged && visIdx !== VIS_VISIBLE) return;
        const attack: import('../../engine/types').Action = def.ranged
          ? { type: 'RANGED_ATTACK', player: viewingPlayer, unit: selected.id, target: a }
          : { type: 'ATTACK', player: viewingPlayer, unit: selected.id, target: a };
        if (targetOwner !== undefined && !atWar(game, viewingPlayer, targetOwner)) {
          appStore.set({ warConfirm: { target: targetOwner, followUp: attack } });
        } else {
          humanDispatch(attack);
        }
        return;
      }
    }

    // movement order (also multi-turn goto)
    if (!(selected.q === a.q && selected.r === a.r)) {
      const path = findPath(gameCtx, game, selected, a);
      if (path && path.length) {
        if (humanDispatch({ type: 'MOVE_UNIT', player: viewingPlayer, unit: selected.id, path })) {
          return;
        }
      }
    }
  }

  // (re)selection
  if (ownUnits.length) {
    const mil = ownUnits.find((u) => gameCtx.rules.units[u.def].class !== 'civilian');
    const civ = ownUnits.find((u) => gameCtx.rules.units[u.def].class === 'civilian');
    const pick =
      selected && ownUnits.some((u) => u.id === selected.id)
        ? // cycle within the stack, then to the city
          ownUnits.find((u) => u.id !== selected.id) ?? null
        : (mil ?? civ ?? null);
    if (pick) {
      appStore.set({ selectedUnit: pick.id, selectedCity: null });
      return;
    }
    if (cityHere && cityHere.owner === viewingPlayer) {
      appStore.set({ selectedCity: cityHere.id, selectedUnit: null });
      return;
    }
  }
  if (cityHere && cityHere.owner === viewingPlayer) {
    appStore.set({ selectedCity: cityHere.id, selectedUnit: null });
    return;
  }
  appStore.set({ selectedUnit: null, selectedCity: null });
}
