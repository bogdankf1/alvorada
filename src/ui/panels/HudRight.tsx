import { useEffect, useRef } from 'react';
import { gameCtx } from '../../app/driver';
import { appStore, focusCamera, useApp } from '../../app/store';
import { endTurnRequest, turnGate } from '../actions';
import { axialOfIndex, hexToPixel } from '../../engine/hex';
import { sortedIds, VIS_UNSEEN } from '../../engine/types';
import { HEX, PALETTE } from '../map/art';
import { activeRenderer } from '../map/MapCanvas';

export function HudRight() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const aiThinking = useApp((s) => s.aiThinking);
  if (!game) return null;

  const myTurn = !aiThinking && game.currentPlayer === viewer && game.phase === 'playing';
  const gate = myTurn ? turnGate() : null;

  let label = 'End Turn';
  let sub: string | null = null;
  if (!myTurn) {
    label = game.phase === 'ended' ? 'Game Over' : 'Rivals Move…';
  } else if (gate?.kind === 'event') {
    label = 'An Event Awaits';
    sub = 'a decision is needed';
  } else if (gate?.kind === 'research') {
    label = 'Research';
    sub = 'choose what to study';
  } else if (gate?.kind === 'production') {
    label = 'Production';
    sub = `${game.cities[gate.city]?.name ?? 'a city'} needs orders`;
  } else if (gate?.kind === 'idle') {
    label = 'Next Unit';
    sub = `${gate.count} unit${gate.count > 1 ? 's' : ''} need${gate.count > 1 ? '' : 's'} orders`;
  }
  const ready = myTurn && gate?.kind === 'ready';

  return (
    <div className="hud-right">
      <div
        className={`end-turn ${ready ? 'is-ready' : ''} ${!myTurn ? 'is-waiting' : ''}`}
        onClick={() => myTurn && endTurnRequest()}
        title={ready ? 'End turn (Enter)' : 'Enter'}
      >
        {label}
        {sub && <span className="sub">{sub}</span>}
      </div>
      <div className="end-turn" style={{ fontSize: 13 }} onClick={() => appStore.set({ overlay: 'chronicle' })} title="Chronicle (H)">Chronicle</div>
      <Minimap />
    </div>
  );
}

function Minimap() {
  const game = useApp((s) => s.game);
  const viewer = useApp((s) => s.viewingPlayer);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !game) return;
    const world = hexToPixel({ q: game.mapW, r: game.mapH }, HEX);
    const scale = 190 / world.x;
    canvas.width = 190;
    canvas.height = Math.ceil(world.y * scale) + 8;
    const g = canvas.getContext('2d')!;
    const vis = game.visibility[viewer];

    g.fillStyle = '#10151d';
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < game.tiles.length; i++) {
      if (vis[i] === VIS_UNSEEN) {
        g.fillStyle = PALETTE.parchment;
      } else {
        const t = game.tiles[i];
        let fill = gameCtx.rules.terrains[t.terrain].art.fill;
        if (t.elevation === 'mountain') fill = '#8B8E96';
        else if (t.feature === 'forest' || t.feature === 'jungle') fill = '#3F6B34';
        g.fillStyle = fill;
      }
      const p = hexToPixel(axialOfIndex(i, game.mapW), HEX);
      g.globalAlpha = vis[i] === 1 ? 0.55 : 1;
      g.fillRect(p.x * scale - 1.6, p.y * scale + 2 - 1.6, 3.4, 3.4);
      g.globalAlpha = 1;
    }
    for (const id of sortedIds(game.cities)) {
      const c = game.cities[id];
      const p = hexToPixel({ q: c.q, r: c.r }, HEX);
      g.fillStyle = game.players[c.owner].color;
      g.beginPath();
      g.arc(p.x * scale, p.y * scale + 2, 2.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#0d1118';
      g.lineWidth = 1;
      g.stroke();
    }
    // viewport rectangle
    const r = activeRenderer.current;
    if (r) {
      const cam = r.camera;
      const vieww = (window.innerWidth / cam.zoom) * scale;
      const viewh = (window.innerHeight / cam.zoom) * scale;
      g.strokeStyle = 'rgba(240,231,210,0.8)';
      g.lineWidth = 1;
      g.strokeRect(cam.x * scale - vieww / 2, cam.y * scale + 2 - viewh / 2, vieww, viewh);
    }
  }, [game, viewer]);

  if (!game) return null;
  return (
    <div className="minimap plate plate--sm">
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const world = hexToPixel({ q: game.mapW, r: game.mapH }, HEX);
          const scale = 190 / world.x;
          const wx = ((e.clientX - rect.left) / rect.width) * canvas.width;
          const wy = ((e.clientY - rect.top) / rect.height) * canvas.height;
          // invert: world px -> rough axial
          const y = (wy - 2) / scale;
          const x = wx / scale;
          const rr = Math.round(y / (HEX * 1.5));
          const qq = Math.round(x / (HEX * Math.sqrt(3)) - rr / 2);
          focusCamera(qq, rr);
        }}
      />
    </div>
  );
}
