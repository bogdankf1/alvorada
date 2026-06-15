/**
 * MapRenderer: layered canvas painting of the world.
 *  - terrain layer: full-world offscreen, rebuilt only when tiles/techs change
 *  - fog layer: half-res offscreen parchment with feathered (blurred) edges
 *  - dynamic pass per frame: territory, cities, units, overlays, animations
 * A dirty flag keeps the rAF loop idle when nothing moves.
 */
import type { Action, Axial, GameState, Unit } from '../../engine/types';
import { VIS_UNSEEN, VIS_VISIBLE, sortedIds } from '../../engine/types';
import { axialOfIndex, hexToPixel, tileIndex, sameHex, SQRT3 } from '../../engine/hex';
import { hash2 } from '../../engine/rng';
import type { Ruleset } from '../../data/types';
import { resourceRevealed } from '../../engine/selectors';
import {
  HEX,
  PALETTE,
  css,
  hexPath,
  makeParchment,
  paintFeature,
  paintGlyph,
  paintImprovement,
  paintResource,
  paintSketch,
  paintTile,
  rgb,
  shade,
} from './art';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface OverlayState {
  selectedUnit: number | null;
  selectedCity: number | null;
  reachable: Set<number>;
  pathPreview: Axial[];
  attackable: Set<number>;
  hoveredTile: number | null;
}

interface MoveAnim {
  unitId: number;
  steps: { x: number; y: number }[];
  start: number;
  durPerStep: number;
}

interface LungeAnim {
  unitId: number;
  from: { x: number; y: number };
  toward: { x: number; y: number };
  start: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  start: number;
}

export class MapRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private raf = 0;
  private dirty = true;

  private rules: Ruleset;
  private state: GameState | null = null;
  private viewer = 0;

  camera: Camera = { x: 0, y: 0, zoom: 1 };
  private panKeys = { up: false, down: false, left: false, right: false };
  private lastTick = 0;
  private viewW = 0; // viewport CSS size, cached on resize (for camera clamping)
  private viewH = 0;

  overlay: OverlayState = {
    selectedUnit: null,
    selectedCity: null,
    reachable: new Set(),
    pathPreview: [],
    attackable: new Set(),
    hoveredTile: null,
  };

  private terrainLayer: HTMLCanvasElement | null = null;
  private terrainKey = '';
  private fogLayer: HTMLCanvasElement | null = null;
  private fogKey: unknown = null;
  private parchment: HTMLCanvasElement | null = null;

  private moveAnims = new Map<number, MoveAnim>();
  private lungeAnims = new Map<number, LungeAnim>();
  private floaters: Floater[] = [];
  /** world-space nameplate rects from the last paint, for click hit-testing */
  private bannerRects: { city: number; x: number; y: number; w: number; h: number }[] = [];

  constructor(rules: Ruleset) {
    this.rules = rules;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.resize();
    this.lastTick = performance.now();
    const loop = (t: number) => {
      this.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    document.fonts?.ready.then(() => this.invalidate());
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.g = null;
  }

  invalidate(): void {
    this.dirty = true;
  }

  resize(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.clampCamera(); // viewport changed: re-fit zoom/center so no background shows
    this.invalidate();
  }

  setState(state: GameState, viewer: number): void {
    const first = this.state === null;
    this.state = state;
    this.viewer = viewer;
    if (first) this.centerOnViewerStart();
    this.invalidate();
  }

  setPanKey(key: 'up' | 'down' | 'left' | 'right', down: boolean): void {
    this.panKeys[key] = down;
  }

  private centerOnViewerStart(): void {
    const s = this.state!;
    const mine = sortedIds(s.units)
      .map((id) => s.units[id])
      .filter((u) => u.owner === this.viewer);
    const target = mine[0] ?? { q: Math.floor(s.mapW / 2), r: Math.floor(s.mapH / 2) };
    const p = hexToPixel({ q: target.q, r: target.r }, HEX);
    this.camera = { x: p.x, y: p.y, zoom: 1 };
    this.clampCamera();
  }

  centerOn(a: Axial): void {
    const p = hexToPixel(a, HEX);
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.clampCamera();
    this.invalidate();
  }

  /** screen px -> world px */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const c = this.canvas!;
    const rect = c.getBoundingClientRect();
    return {
      x: (sx - rect.width / 2) / this.camera.zoom + this.camera.x,
      y: (sy - rect.height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.min(2.2, Math.max(this.minZoom(), this.camera.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.clampCamera();
    this.invalidate();
  }

  pan(dx: number, dy: number): void {
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.clampCamera();
    this.invalidate();
  }

  /** World-pixel bounding box of the hex field (the union of all tiles). */
  private mapBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const s = this.state!;
    return {
      minX: -HEX * SQRT3 * 0.5,
      minY: -HEX,
      maxX: HEX * SQRT3 * s.mapW,
      maxY: HEX * 1.5 * (s.mapH - 1) + HEX,
    };
  }

  /** Smallest zoom at which the map still fully covers the viewport (no background shows). */
  private minZoom(): number {
    if (!this.state || this.viewW === 0 || this.viewH === 0) return 0.2;
    const b = this.mapBounds();
    return Math.max(this.viewW / (b.maxX - b.minX), this.viewH / (b.maxY - b.minY));
  }

  /** Keep the visible viewport inside the map: clamp zoom to "cover", then the center. */
  private clampCamera(): void {
    if (!this.state || this.viewW === 0 || this.viewH === 0) return;
    this.camera.zoom = Math.max(this.minZoom(), Math.min(2.2, this.camera.zoom));
    const b = this.mapBounds();
    const halfW = this.viewW / 2 / this.camera.zoom;
    const halfH = this.viewH / 2 / this.camera.zoom;
    const loX = b.minX + halfW;
    const hiX = b.maxX - halfW;
    this.camera.x = loX <= hiX ? Math.max(loX, Math.min(hiX, this.camera.x)) : (b.minX + b.maxX) / 2;
    const loY = b.minY + halfH;
    const hiY = b.maxY - halfH;
    this.camera.y = loY <= hiY ? Math.max(loY, Math.min(hiY, this.camera.y)) : (b.minY + b.maxY) / 2;
  }

  // --- animation hooks (driver.onAction) ---

  handleAction(action: Action, prev: GameState, next: GameState): void {
    const vis = next.visibility[this.viewer];
    const visibleAt = (a: Axial) => {
      const idx = tileIndex(a, next.mapW, next.mapH);
      return idx >= 0 && vis[idx] === VIS_VISIBLE;
    };

    if (action.type === 'MOVE_UNIT') {
      const u = next.units[action.unit];
      const before = prev.units[action.unit];
      if (!u || !before) return;
      if (!visibleAt(u) && !visibleAt(before)) return;
      const end = action.path.findIndex((p) => sameHex(p, u));
      if (end < 0) return;
      const steps = [before, ...action.path.slice(0, end + 1)].map((p) =>
        hexToPixel({ q: p.q, r: p.r }, HEX),
      );
      this.moveAnims.set(u.id, {
        unitId: u.id,
        steps,
        start: performance.now(),
        durPerStep: 180,
      });
    } else if (action.type === 'ATTACK' || action.type === 'RANGED_ATTACK') {
      const attacker = prev.units[action.unit];
      if (attacker && visibleAt(attacker)) {
        this.lungeAnims.set(action.unit, {
          unitId: action.unit,
          from: hexToPixel({ q: attacker.q, r: attacker.r }, HEX),
          toward: hexToPixel(action.target, HEX),
          start: performance.now(),
        });
      }
      // damage floaters from hp diffs at the target tile
      const tp = hexToPixel(action.target, HEX);
      const prevDef = unitAtIn(prev, action.target, attacker?.owner);
      const nextDef = prevDef ? next.units[prevDef.id] : undefined;
      if (prevDef && visibleAt(action.target)) {
        const dmg = prevDef.hp - (nextDef?.hp ?? 0);
        if (dmg > 0) this.addFloater(tp.x, tp.y - 14, `-${dmg}`, '#FF8E7A');
      }
      const prevCity = cityIdAt(prev, action.target);
      if (prevCity !== null && visibleAt(action.target)) {
        const dmg = prev.cities[prevCity].hp - (next.cities[prevCity]?.hp ?? 0);
        if (dmg > 0) this.addFloater(tp.x, tp.y - 26, `-${dmg}`, '#FFB47A');
      }
      if (attacker && action.type === 'ATTACK') {
        const after = next.units[action.unit];
        const dmg = attacker.hp - (after?.hp ?? 0);
        if (dmg > 0 && visibleAt(attacker)) {
          const ap = hexToPixel({ q: attacker.q, r: attacker.r }, HEX);
          this.addFloater(ap.x, ap.y - 14, `-${dmg}`, '#FF8E7A');
        }
      }
    }
    this.invalidate();
  }

  private addFloater(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, color, start: performance.now() });
  }

  // --- frame loop ---

  private tick(t: number): void {
    const dt = Math.min(50, t - this.lastTick);
    this.lastTick = t;
    // keyboard panning
    const k = this.panKeys;
    if (k.up || k.down || k.left || k.right) {
      const v = 0.62 * dt;
      this.pan((k.left ? v : 0) - (k.right ? v : 0), (k.up ? v : 0) - (k.down ? v : 0));
    }
    const animating =
      this.moveAnims.size > 0 || this.lungeAnims.size > 0 || this.floaters.length > 0;
    const pulsing = this.overlay.selectedUnit !== null || this.overlay.selectedCity !== null;
    if (this.dirty || animating || pulsing) {
      this.paint(t);
      this.dirty = false;
    }
  }

  // --- layer builders ---

  private ensureTerrainLayer(): void {
    const s = this.state!;
    const techs = s.players[this.viewer].techs.length;
    const key = `${this.viewer}:${techs}:${tilesStamp(s)}`;
    if (this.terrainLayer && key === this.terrainKey) return;
    this.terrainKey = key;

    const max = hexToPixel({ q: s.mapW + 2, r: s.mapH + 1 }, HEX);
    const w = Math.ceil(max.x + HEX * 2);
    const h = Math.ceil(max.y + HEX * 2);
    if (!this.terrainLayer) {
      this.terrainLayer = document.createElement('canvas');
      this.terrainLayer.width = w;
      this.terrainLayer.height = h;
    }
    const g = this.terrainLayer.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = this.rules.terrains.ocean.art.fill;
    g.fillRect(0, 0, w, h);

    // two passes: flat ground first, then features/mountains for painter's order
    for (let i = 0; i < s.tiles.length; i++) {
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      paintTile(g, this.rules, s.tiles[i], p.x, p.y, a.q, a.r, s.config.seed);
    }
    // surf: foam along every water edge that touches land
    g.lineCap = 'round';
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!this.rules.terrains[t.terrain].water) continue;
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      const corners = cornersOf(p.x, p.y);
      for (let d = 0; d < 6; d++) {
        const j = tileIndex(neighborAxial(a, d), s.mapW, s.mapH);
        if (j < 0 || this.rules.terrains[s.tiles[j].terrain].water) continue;
        const [c1, c2] = edgeCorners(corners, d);
        g.beginPath();
        g.moveTo(c1[0], c1[1]);
        g.lineTo(c2[0], c2[1]);
        g.strokeStyle = 'rgba(156,196,212,0.55)';
        g.lineWidth = 2.8;
        g.stroke();
        // a second, fainter swash a touch into the water
        const mx = (c1[0] + c2[0]) / 2 - p.x;
        const my = (c1[1] + c2[1]) / 2 - p.y;
        const len = Math.sqrt(mx * mx + my * my) || 1;
        const ox = (-mx / len) * 4.5;
        const oy = (-my / len) * 4.5;
        g.beginPath();
        g.moveTo(c1[0] * 0.85 + p.x * 0.15 + ox, c1[1] * 0.85 + p.y * 0.15 + oy);
        g.lineTo(c2[0] * 0.85 + p.x * 0.15 + ox, c2[1] * 0.85 + p.y * 0.15 + oy);
        g.strokeStyle = 'rgba(156,196,212,0.22)';
        g.lineWidth = 1.6;
        g.stroke();
      }
    }

    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      if (t.improvement) paintImprovement(g, t.improvement, p.x, p.y);
      if (t.feature) paintFeature(g, t, p.x, p.y, a.q, a.r, s.config.seed);
      if (t.resource && resourceRevealed({ rules: this.rules }, s, this.viewer, t.resource)) {
        paintResource(g, t.resource, p.x, p.y);
      }
    }
  }

  private ensureFogLayer(): void {
    const s = this.state!;
    const vis = s.visibility[this.viewer];
    if (this.fogLayer && this.fogKey === vis) return;
    this.fogKey = vis;
    if (!this.parchment) this.parchment = makeParchment(512, s.config.seed ^ 0xfade);

    const SCALE = 0.5;
    const max = hexToPixel({ q: s.mapW + 2, r: s.mapH + 1 }, HEX);
    const w = Math.ceil((max.x + HEX * 2) * SCALE);
    const h = Math.ceil((max.y + HEX * 2) * SCALE);
    if (!this.fogLayer) {
      this.fogLayer = document.createElement('canvas');
      this.fogLayer.width = w;
      this.fogLayer.height = h;
    }
    const g = this.fogLayer.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.save();
    g.scale(SCALE, SCALE);

    // 1. blurred mask of the unknown -> feathered torn edge
    g.filter = 'blur(9px)';
    g.fillStyle = '#000';
    for (let i = 0; i < s.tiles.length; i++) {
      if (vis[i] !== VIS_UNSEEN) continue;
      const p = hexToPixel(axialOfIndex(i, s.mapW), HEX);
      hexPath(g, p.x, p.y, HEX + 6);
      g.fill();
    }
    g.filter = 'none';
    g.restore();

    // 2. clothe the mask in parchment
    g.save();
    g.globalCompositeOperation = 'source-in';
    const pat = g.createPattern(this.parchment, 'repeat')!;
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    g.restore();

    // 3. hand-ruled sepia fragments + sparse sketches over the unknown only
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.scale(SCALE, SCALE);
    g.strokeStyle = css(rgb(PALETTE.sepia), 0.085);
    g.lineWidth = 1;
    g.lineCap = 'round';
    for (let i = 0; i < s.tiles.length; i++) {
      if (vis[i] !== VIS_UNSEEN) continue;
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      // 2-3 partial edges per hex: ruled by a tired hand, not a printer
      const corners = hexCornersAt(p.x, p.y, HEX * 0.94);
      const h0 = hash2(a.q, a.r, s.config.seed + 555);
      const startEdge = Math.floor(h0 * 6);
      const count = 2 + (hash2(a.q, a.r, s.config.seed + 556) > 0.6 ? 1 : 0);
      for (let e = 0; e < count; e++) {
        const c1 = corners[(startEdge + e * 2) % 6];
        const c2 = corners[(startEdge + e * 2 + 1) % 6];
        g.beginPath();
        g.moveTo(c1[0], c1[1]);
        g.lineTo(c2[0], c2[1]);
        g.stroke();
      }
      const h2 = hash2(a.q, a.r, s.config.seed + 777);
      if (h2 < 0.045) paintSketch(g, Math.floor(h2 * 1000) % 3, p.x, p.y);
    }
    g.restore();

    // 4. the cartographer's ink: a bled sepia line where knowledge ends
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.scale(SCALE, SCALE);
    g.strokeStyle = css(rgb(PALETTE.sepia), 0.5);
    g.lineWidth = 3.4;
    g.lineCap = 'round';
    for (let i = 0; i < s.tiles.length; i++) {
      if (vis[i] !== VIS_UNSEEN) continue;
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      const corners = cornersOf(p.x, p.y);
      for (let d = 0; d < 6; d++) {
        const j = tileIndex(neighborAxial(a, d), s.mapW, s.mapH);
        if (j < 0 || vis[j] === VIS_UNSEEN) continue;
        const [c1, c2] = edgeCorners(corners, d);
        g.beginPath();
        g.moveTo(c1[0], c1[1]);
        g.lineTo(c2[0], c2[1]);
        g.stroke();
      }
    }
    g.restore();

    // 5. the remembered world: hard-edged parchment wash over explored-dim tiles
    g.save();
    g.scale(SCALE, SCALE);
    g.fillStyle = css(rgb(PALETTE.parchment), 0.38);
    for (let i = 0; i < s.tiles.length; i++) {
      if (vis[i] !== 1) continue;
      const p = hexToPixel(axialOfIndex(i, s.mapW), HEX);
      hexPath(g, p.x, p.y, HEX + 0.6);
      g.fill();
    }
    g.restore();
  }

  // --- main paint ---

  private paint(t: number): void {
    const g = this.g;
    const s = this.state;
    if (!g || !s || !this.canvas) return;
    this.ensureTerrainLayer();
    this.ensureFogLayer();

    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#142536';
    g.fillRect(0, 0, cw, ch);

    g.save();
    g.translate(cw / 2, ch / 2);
    g.scale(this.camera.zoom, this.camera.zoom);
    g.translate(-this.camera.x, -this.camera.y);

    g.drawImage(this.terrainLayer!, 0, 0);
    this.paintTerritory(g, s);
    this.paintOverlaysUnder(g, s, t);
    this.paintCities(g, s, t);
    this.paintUnits(g, s, t);
    g.drawImage(this.fogLayer!, 0, 0, this.fogLayer!.width * 2, this.fogLayer!.height * 2);
    this.paintOverlaysOver(g, s, t);
    this.paintFloaters(g, t);
    g.restore();
  }

  private paintTerritory(g: CanvasRenderingContext2D, s: GameState): void {
    const vis = s.visibility[this.viewer];
    for (let i = 0; i < s.tiles.length; i++) {
      const cityId = s.tiles[i].ownerCity;
      if (cityId === null || vis[i] === VIS_UNSEEN) continue;
      const city = s.cities[cityId];
      if (!city) continue;
      const color = s.players[city.owner].color;
      const a = axialOfIndex(i, s.mapW);
      const p = hexToPixel(a, HEX);
      hexPath(g, p.x, p.y, HEX);
      g.fillStyle = css(rgb(color), 0.09);
      g.fill();
      // frontier edges
      const corners = cornersOf(p.x, p.y);
      for (let d = 0; d < 6; d++) {
        const nb = neighborAxial(a, d);
        const j = tileIndex(nb, s.mapW, s.mapH);
        const otherCity = j >= 0 ? s.tiles[j].ownerCity : null;
        const otherOwner = otherCity !== null ? s.cities[otherCity]?.owner : null;
        if (otherOwner === city.owner) continue;
        const [c1, c2] = edgeCorners(corners, d);
        g.beginPath();
        g.moveTo(c1[0], c1[1]);
        g.lineTo(c2[0], c2[1]);
        g.strokeStyle = css(rgb(color), 0.85);
        g.lineWidth = 2.4;
        g.lineCap = 'round';
        g.stroke();
      }
    }
  }

  private paintOverlaysUnder(g: CanvasRenderingContext2D, s: GameState, t: number): void {
    // movement range
    if (this.overlay.reachable.size) {
      for (const idx of this.overlay.reachable) {
        const p = hexToPixel(axialOfIndex(idx, s.mapW), HEX);
        hexPath(g, p.x, p.y, HEX - 2.5);
        g.fillStyle = 'rgba(240,231,210,0.13)';
        g.fill();
        g.strokeStyle = 'rgba(240,231,210,0.28)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
    // attackable
    const pulse = 0.55 + 0.35 * Math.sin(t / 280);
    for (const idx of this.overlay.attackable) {
      const p = hexToPixel(axialOfIndex(idx, s.mapW), HEX);
      hexPath(g, p.x, p.y, HEX - 3);
      g.strokeStyle = css(rgb(PALETTE.danger), pulse);
      g.lineWidth = 2.6;
      g.stroke();
    }
    // path preview
    if (this.overlay.pathPreview.length) {
      g.fillStyle = 'rgba(240,231,210,0.85)';
      for (const step of this.overlay.pathPreview) {
        const p = hexToPixel(step, HEX);
        g.beginPath();
        g.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    // trade routes
    for (const id of Object.keys(s.tradeRoutes).map(Number).sort((a, b) => a - b)) {
      const route = s.tradeRoutes[id];
      if (route.path.length < 2) continue;
      g.strokeStyle = 'rgba(190,150,70,0.55)';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      route.path.forEach((idx, i) => {
        const p = hexToPixel(axialOfIndex(idx, s.mapW), HEX);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      });
      g.stroke();
      g.setLineDash([]);
    }
    // barbarian camp markers (brass-red triangle, fog-gated)
    const vis = s.visibility[this.viewer];
    for (const camp of s.camps) {
      const idx = tileIndex({ q: camp.q, r: camp.r }, s.mapW, s.mapH);
      if (vis[idx] === VIS_UNSEEN) continue;
      const p = hexToPixel({ q: camp.q, r: camp.r }, HEX);
      g.fillStyle = 'rgba(138,74,58,0.92)';
      g.beginPath();
      g.moveTo(p.x, p.y - 7); g.lineTo(p.x + 6, p.y + 5); g.lineTo(p.x - 6, p.y + 5); g.closePath();
      g.fill();
    }
  }

  private paintOverlaysOver(g: CanvasRenderingContext2D, s: GameState, t: number): void {
    // selection ring (breathes)
    const sel = this.overlay.selectedUnit !== null ? s.units[this.overlay.selectedUnit] : null;
    const selCity = this.overlay.selectedCity !== null ? s.cities[this.overlay.selectedCity] : null;
    const target = sel ?? selCity;
    if (target) {
      const pos = sel
        ? this.unitRenderPos(s, sel, this.animatedPos(sel))
        : hexToPixel({ q: target.q, r: target.r }, HEX);
      const pulse = 0.55 + 0.3 * Math.sin(t / 510);
      hexPath(g, pos.x, pos.y, HEX - 2);
      g.strokeStyle = css(rgb(PALETTE.ivory), pulse);
      g.lineWidth = 2.4;
      g.stroke();
      hexPath(g, pos.x, pos.y, HEX - 5.5);
      g.strokeStyle = css(rgb(PALETTE.brass), pulse * 0.6);
      g.lineWidth = 1.2;
      g.stroke();
    }
    // hover
    if (this.overlay.hoveredTile !== null) {
      const p = hexToPixel(axialOfIndex(this.overlay.hoveredTile, s.mapW), HEX);
      hexPath(g, p.x, p.y, HEX - 1.5);
      g.strokeStyle = 'rgba(240,231,210,0.35)';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  /** Test probe: a unit's current on-screen position and live animation count. */
  debugUnitScreen(id: number): { x: number; y: number; anims: number } | null {
    if (!this.state) return null;
    const u = this.state.units[id];
    if (!u) return null;
    const pos = this.unitRenderPos(this.state, u, this.animatedPos(u));
    return { x: pos.x, y: pos.y, anims: this.moveAnims.size + this.lungeAnims.size };
  }

  private animatedPos(u: Unit): { x: number; y: number } | null {
    const anim = this.moveAnims.get(u.id);
    const now = performance.now();
    if (anim) {
      const total = (anim.steps.length - 1) * anim.durPerStep;
      const el = now - anim.start;
      if (el >= total) {
        this.moveAnims.delete(u.id);
        return null;
      }
      const f = el / anim.durPerStep;
      const i = Math.min(anim.steps.length - 2, Math.floor(f));
      const frac = easeOut(Math.min(1, f - i));
      const a = anim.steps[i];
      const b = anim.steps[i + 1];
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }
    const lunge = this.lungeAnims.get(u.id);
    if (lunge) {
      const el = now - lunge.start;
      if (el >= 230) {
        this.lungeAnims.delete(u.id);
        return null;
      }
      const f = Math.sin((el / 230) * Math.PI) * 0.34;
      return {
        x: lunge.from.x + (lunge.toward.x - lunge.from.x) * f,
        y: lunge.from.y + (lunge.toward.y - lunge.from.y) * f,
      };
    }
    return null;
  }

  /**
   * Where a unit is drawn, and whether it's the tile's primary (centered) unit.
   * When a military and a civilian share a tile one tucks to the corner; the
   * *selected* unit is always primary so the selection ring lands on it.
   */
  unitRenderPos(s: GameState, u: Unit, anim: { x: number; y: number } | null): {
    x: number;
    y: number;
    primary: boolean;
  } {
    const base = anim ?? hexToPixel({ q: u.q, r: u.r }, HEX);
    if (anim) return { x: base.x, y: base.y, primary: true };
    const partner = coLocatedPartner(s, this.rules, u);
    if (!partner) return { x: base.x, y: base.y, primary: true };
    const sel = this.overlay.selectedUnit;
    let tuck: boolean;
    if (sel === u.id) tuck = false;
    else if (sel === partner.id) tuck = true;
    else tuck = this.rules.units[u.def].class === 'civilian'; // default: civilian under escort
    return { x: base.x + (tuck ? 10 : 0), y: base.y + (tuck ? -9 : 0), primary: !tuck };
  }

  private paintUnits(g: CanvasRenderingContext2D, s: GameState, t: number): void {
    const vis = s.visibility[this.viewer];
    const list: { u: Unit; x: number; y: number; primary: boolean; spent: boolean }[] = [];
    for (const id of sortedIds(s.units)) {
      const u = s.units[id];
      const idx = tileIndex({ q: u.q, r: u.r }, s.mapW, s.mapH);
      const anim = this.animatedPos(u);
      if (u.owner !== this.viewer && vis[idx] !== VIS_VISIBLE && !anim) continue;
      const pos = this.unitRenderPos(s, u, anim);
      const spent = u.owner === this.viewer && u.moves <= 0 && !anim;
      list.push({ u, x: pos.x, y: pos.y, primary: pos.primary, spent });
    }
    // tucked units paint first so the primary (and any selected) unit sits on top
    list.sort((a, b) => (a.primary === b.primary ? a.u.id - b.u.id : a.primary ? 1 : -1));
    for (const e of list) this.drawUnit(g, s, e.u, e.x, e.y, e.spent);
    void t;
  }

  private drawUnit(g: CanvasRenderingContext2D, s: GameState, u: Unit, x: number, y: number, spent: boolean): void {
    const civilian = this.rules.units[u.def].class === 'civilian';
    const color = s.players[u.owner].color;

    g.save();
    g.globalAlpha = spent ? 0.62 : 1;
    // shadow
    g.beginPath();
    g.ellipse(x + 1.5, y + 12, 9.5, 3.2, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,14,10,0.3)';
    g.fill();

    if (civilian) {
      chamferRect(g, x - 10.5, y - 10.5, 21, 21, 4);
      g.fillStyle = shade(color, -0.12);
      g.fill();
      g.strokeStyle = shade(color, -0.45);
      g.lineWidth = 2;
      g.stroke();
      chamferRect(g, x - 8, y - 8, 16, 16, 3);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.stroke();
    } else {
      g.beginPath();
      g.arc(x, y, 12, 0, Math.PI * 2);
      g.fillStyle = shade(color, -0.08);
      g.fill();
      g.strokeStyle = shade(color, -0.45);
      g.lineWidth = 2.2;
      g.stroke();
      g.beginPath();
      g.arc(x, y, 9.6, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.lineWidth = 1;
      g.stroke();
    }
    g.save();
    g.translate(x, y);
    paintGlyph(g, this.rules.units[u.def].art.glyph);
    g.restore();

    // hp arc
    if (u.hp < 100) {
      const frac = u.hp / 100;
      g.beginPath();
      g.arc(x, y, 14.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      g.strokeStyle = frac > 0.6 ? '#7DA34C' : frac > 0.3 ? '#D9A441' : '#C25B4A';
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      g.stroke();
    }
    // fortify chevron
    if (u.stance === 'fortified') {
      g.beginPath();
      g.moveTo(x - 5, y + 17.5);
      g.lineTo(x, y + 14);
      g.lineTo(x + 5, y + 17.5);
      g.strokeStyle = css(rgb(PALETTE.brass), 0.95);
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.stroke();
    }
    g.restore();
  }

  /** City whose nameplate covers the world point, if any. */
  bannerAt(wx: number, wy: number): number | null {
    for (const b of this.bannerRects) {
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return b.city;
    }
    return null;
  }

  private paintCities(g: CanvasRenderingContext2D, s: GameState, t: number): void {
    const vis = s.visibility[this.viewer];
    this.bannerRects = [];
    for (const id of sortedIds(s.cities)) {
      const c = s.cities[id];
      const idx = tileIndex({ q: c.q, r: c.r }, s.mapW, s.mapH);
      if (vis[idx] === VIS_UNSEEN) continue;
      const p = hexToPixel({ q: c.q, r: c.r }, HEX);
      const color = s.players[c.owner].color;
      const tier = c.pop >= 7 ? 3 : c.pop >= 4 ? 2 : 1;

      // settlement cluster
      const houses = [
        { x: -9, y: 4, w: 11, h: 8 },
        { x: 1, y: 1, w: 13, h: 10 },
        { x: -3, y: -7, w: 10, h: 8 },
        { x: 8, y: -5, w: 9, h: 7 },
      ].slice(0, 1 + tier);
      // ground pad
      g.beginPath();
      g.ellipse(p.x, p.y + 4, 21, 12, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(58,48,36,0.4)';
      g.fill();
      for (const hse of houses) {
        const hx = p.x + hse.x;
        const hy = p.y + hse.y;
        g.fillStyle = '#E4D9BE';
        g.fillRect(hx - hse.w / 2, hy - hse.h / 2, hse.w, hse.h);
        g.strokeStyle = 'rgba(50,40,28,0.55)';
        g.lineWidth = 1;
        g.strokeRect(hx - hse.w / 2, hy - hse.h / 2, hse.w, hse.h);
        g.beginPath();
        g.moveTo(hx - hse.w / 2 - 1.5, hy - hse.h / 2);
        g.lineTo(hx, hy - hse.h / 2 - hse.h * 0.62);
        g.lineTo(hx + hse.w / 2 + 1.5, hy - hse.h / 2);
        g.closePath();
        g.fillStyle = shade(color, -0.22);
        g.fill();
      }

      // banner plate
      const name = c.name.toUpperCase();
      g.font = `600 10.5px Cinzel, serif`;
      const tw = g.measureText(name).width;
      const bw = tw + 44;
      const bh = 17;
      const bx = p.x - bw / 2;
      const by = p.y - HEX - 4;
      this.bannerRects.push({ city: id, x: bx, y: by - 3, w: bw, h: bh + 6 });
      chamferRect(g, bx, by, bw, bh, 4);
      g.fillStyle = 'rgba(23,29,40,0.92)';
      g.fill();
      g.strokeStyle = css(rgb(PALETTE.brass), 0.8);
      g.lineWidth = 1;
      g.stroke();
      // owner tag
      g.fillStyle = color;
      g.fillRect(bx + 2.5, by + 2.5, 3.5, bh - 5);
      // pop badge
      g.font = `700 10px "Alegreya Sans", sans-serif`;
      g.fillStyle = PALETTE.brassBright;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(c.pop), bx + 14.5, by + bh / 2 + 0.5);
      // name
      g.font = `600 10.5px Cinzel, serif`;
      g.fillStyle = PALETTE.ivory;
      g.textAlign = 'left';
      g.fillText(name, bx + 24, by + bh / 2 + 0.5);
      // hp sliver when wounded
      if (c.hp < this.rules.settings.cityMaxHp) {
        const frac = c.hp / this.rules.settings.cityMaxHp;
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(bx + 2, by + bh - 2.4, bw - 4, 2);
        g.fillStyle = frac > 0.5 ? '#7DA34C' : '#C25B4A';
        g.fillRect(bx + 2, by + bh - 2.4, (bw - 4) * frac, 2);
      }
      g.textAlign = 'start';
      g.textBaseline = 'alphabetic';
      void t;
    }
  }

  private paintFloaters(g: CanvasRenderingContext2D, t: number): void {
    const now = performance.now();
    this.floaters = this.floaters.filter((f) => now - f.start < 700);
    for (const f of this.floaters) {
      const el = (now - f.start) / 700;
      g.font = `700 15px "Alegreya Sans", sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = f.color;
      g.globalAlpha = 1 - el * el;
      g.fillText(f.text, f.x, f.y - el * 24);
      g.globalAlpha = 1;
      g.textAlign = 'start';
    }
    void t;
  }
}

// --- small helpers ---

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function chamferRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
): void {
  g.beginPath();
  g.moveTo(x + c, y);
  g.lineTo(x + w - c, y);
  g.lineTo(x + w, y + c);
  g.lineTo(x + w, y + h - c);
  g.lineTo(x + w - c, y + h);
  g.lineTo(x + c, y + h);
  g.lineTo(x, y + h - c);
  g.lineTo(x, y + c);
  g.closePath();
}

const DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function neighborAxial(a: Axial, d: number): Axial {
  return { q: a.q + DIRS[d].q, r: a.r + DIRS[d].r };
}

function cornersOf(cx: number, cy: number): [number, number][] {
  return hexCornersAt(cx, cy, HEX);
}

function hexCornersAt(cx: number, cy: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    out.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return out;
}

/** Corner pair for the edge shared with neighbor direction d (E,NE,NW,W,SW,SE). */
function edgeCorners(c: [number, number][], d: number): [[number, number], [number, number]] {
  // corners: 0=-30°(NE),1=30°(SE),2=90°(S),3=150°(SW),4=210°(NW),5=270°(N)
  const map: [number, number][] = [
    [0, 1], // E
    [5, 0], // NE
    [4, 5], // NW
    [3, 4], // W
    [2, 3], // SW
    [1, 2], // SE
  ];
  const [i, j] = map[d];
  return [c[i], c[j]];
}

function unitAtIn(state: GameState, a: Axial, excludeOwner?: number): Unit | undefined {
  for (const id of sortedIds(state.units)) {
    const u = state.units[id];
    if (u.q === a.q && u.r === a.r && u.owner !== excludeOwner) return u;
  }
  return undefined;
}

function cityIdAt(state: GameState, a: Axial): number | null {
  for (const id of sortedIds(state.cities)) {
    const c = state.cities[id];
    if (c.q === a.q && c.r === a.r) return id;
  }
  return null;
}

/** The opposite-category unit (military↔civilian) sharing this unit's tile, if any. */
function coLocatedPartner(state: GameState, rules: Ruleset, u: Unit): Unit | null {
  const uCivilian = rules.units[u.def].class === 'civilian';
  for (const id of sortedIds(state.units)) {
    const o = state.units[id];
    if (o.id === u.id || o.q !== u.q || o.r !== u.r) continue;
    if (rules.units[o.def].class === 'civilian' !== uCivilian) return o;
  }
  return null;
}

function tilesStamp(s: GameState): string {
  // cheap content stamp: improvements + features + owners change rarely
  let n = 0;
  let o = 0;
  for (const t of s.tiles) {
    if (t.improvement) n++;
    if (t.feature) n += 3;
    if (t.ownerCity !== null) o++;
  }
  return `${n}:${o}`;
}
