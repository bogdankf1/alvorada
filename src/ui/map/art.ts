/**
 * Procedural map art. Everything is painted — no image assets — following
 * DESIGN.md: NW light, seeded jitter, clustered miniatures for features,
 * parchment tokens for resources. All variation hashes from tile coords,
 * so the world is painterly but perfectly stable frame to frame.
 */
import type { Tile } from '../../engine/types';
import type { Ruleset } from '../../data/types';
import { hash2 } from '../../engine/rng';
import { hexCorners } from '../../engine/hex';
import { RESOURCE_ICON_PATHS, UNIT_ICON_PATHS, RESOURCE_ICON_VIEWBOX } from './resource-icons';

export const HEX = 38; // hex radius in world px

// --- color utilities ---

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function css(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/** pct in [-1,1]: negative darkens toward black, positive lightens toward white. */
export function shade(hex: string, pct: number, alpha = 1): string {
  const c = rgb(hex);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  return css([c[0] + (t - c[0]) * p, c[1] + (t - c[1]) * p, c[2] + (t - c[2]) * p], alpha);
}

export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return css([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

export const PALETTE = {
  lacquer: '#1B2330',
  brass: '#C8A55B',
  brassBright: '#E3C47D',
  ivory: '#F0E7D2',
  parchment: '#D9C49A',
  parchmentDark: '#C9B385',
  parchmentLight: '#E2D2AC',
  sepia: '#6A5436',
  danger: '#C25B4A',
};

// --- hex path ---

export function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const corners = hexCorners(cx, cy, size);
  g.beginPath();
  g.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < 6; i++) g.lineTo(corners[i][0], corners[i][1]);
  g.closePath();
}

// --- terrain tile ---

export function paintTile(
  g: CanvasRenderingContext2D,
  rules: Ruleset,
  tile: Tile,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
): void {
  const terr = rules.terrains[tile.terrain];
  const water = !!terr.water;
  const jitter = (hash2(q, r, seed) - 0.5) * 0.07;
  let fill = shade(terr.art.fill, jitter);
  if (tile.elevation === 'hill') fill = shade(terr.art.fill, jitter - 0.08);

  hexPath(g, cx, cy, HEX + 0.6); // slight overdraw kills seams
  g.fillStyle = fill;
  g.fill();

  // NW light / SE shade bevel (the tactile, pressed-leather read)
  const corners = hexCorners(cx, cy, HEX);
  const bevel = (idxs: number[], color: string, w: number) => {
    g.beginPath();
    g.moveTo(corners[idxs[0]][0], corners[idxs[0]][1]);
    for (let i = 1; i < idxs.length; i++) g.lineTo(corners[idxs[i]][0], corners[idxs[i]][1]);
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.stroke();
  };
  if (!water) {
    bevel([3, 4, 5, 0], shade(terr.art.fill, 0.13, 0.5), 1.6); // upper-left rim
    bevel([0, 1, 2, 3], shade(terr.art.fill, -0.18, 0.45), 1.6); // lower-right rim
  } else {
    // water: depth mottling instead of bevel
    for (let i = 0; i < 4; i++) {
      const hx = hash2(q * 7 + i, r * 5 + i, seed + 40 + i);
      const hy = hash2(q * 3 + i, r * 11 + i, seed + 90 + i);
      const px = cx + (hx - 0.5) * HEX * 1.2;
      const py = cy + (hy - 0.5) * HEX * 1.2;
      g.beginPath();
      g.ellipse(px, py, 7 + hx * 8, 3 + hy * 3, 0, 0, Math.PI * 2);
      g.fillStyle = shade(terr.art.accent, (hx - 0.5) * 0.1, 0.18);
      g.fill();
    }
  }

  // speckle
  if (!water && tile.elevation !== 'mountain') {
    const n = 5 + Math.floor(hash2(q, r, seed + 7) * 5);
    g.fillStyle = shade(terr.art.accent, jitter, 0.5);
    for (let i = 0; i < n; i++) {
      const hx = hash2(q * 13 + i, r * 17 + i, seed + 11);
      const hy = hash2(q * 19 + i, r * 23 + i, seed + 13);
      const px = cx + (hx - 0.5) * HEX * 1.35;
      const py = cy + (hy - 0.5) * HEX * 1.25;
      const rad = 0.7 + hash2(i, q + r, seed + 17) * 0.9;
      g.beginPath();
      g.arc(px, py, rad, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (tile.elevation === 'hill' && tile.feature === null) paintHillRidges(g, terr.art.accent, cx, cy, q, r, seed);
  if (tile.elevation === 'mountain') paintMountain(g, cx, cy, q, r, seed);
}

function paintHillRidges(
  g: CanvasRenderingContext2D,
  accent: string,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
): void {
  const n = 2 + (hash2(q, r, seed + 21) > 0.5 ? 1 : 0);
  g.strokeStyle = shade(accent, -0.34, 0.8);
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 11 + (hash2(q + i, r, seed + 23) - 0.5) * 6;
    const w = 10 + hash2(q, r + i, seed + 29) * 8;
    const y = cy + 3 + (hash2(q * 3, r + i, seed + 31) - 0.5) * 10;
    g.beginPath();
    g.moveTo(cx + off - w / 2, y + 4);
    g.quadraticCurveTo(cx + off, y - 7, cx + off + w / 2, y + 4);
    g.stroke();
    // sun-side highlight
    g.strokeStyle = shade(accent, 0.25, 0.5);
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(cx + off - w / 2 + 1.5, y + 3);
    g.quadraticCurveTo(cx + off - 2, y - 5.5, cx + off + 2, y - 3.4);
    g.stroke();
    g.strokeStyle = shade(accent, -0.34, 0.8);
    g.lineWidth = 1.8;
  }
}

function paintMountain(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
): void {
  const h1 = hash2(q, r, seed + 41);
  const peaks = h1 > 0.55 ? 2 : 1;
  for (let i = 0; i < peaks; i++) {
    const off = peaks === 1 ? 0 : (i === 0 ? -9 : 10);
    const w = (peaks === 1 ? 26 : 19) + h1 * 6;
    const hgt = (peaks === 1 ? 30 : 23) + hash2(q + i, r, seed + 43) * 7;
    const baseY = cy + 13;
    const apexX = cx + off + (hash2(q, r + i, seed + 47) - 0.5) * 5;
    const apexY = baseY - hgt;
    // shadow face (SE)
    g.beginPath();
    g.moveTo(apexX, apexY);
    g.lineTo(cx + off + w / 2, baseY);
    g.lineTo(cx + off + w * 0.08, baseY);
    g.closePath();
    g.fillStyle = '#5E6168';
    g.fill();
    // lit face (NW)
    g.beginPath();
    g.moveTo(apexX, apexY);
    g.lineTo(cx + off + w * 0.08, baseY);
    g.lineTo(cx + off - w / 2, baseY);
    g.closePath();
    g.fillStyle = '#9DA1A9';
    g.fill();
    // snowcap
    const capY = apexY + hgt * 0.32;
    g.beginPath();
    g.moveTo(apexX, apexY);
    g.lineTo(apexX + w * 0.16, capY);
    g.lineTo(apexX + w * 0.05, capY - 2);
    g.lineTo(apexX - w * 0.07, capY + 1.5);
    g.lineTo(apexX - w * 0.15, capY - 1);
    g.closePath();
    g.fillStyle = '#EFF3F6';
    g.fill();
  }
}

// --- features ---

export function paintFeature(
  g: CanvasRenderingContext2D,
  tile: Tile,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
): void {
  if (tile.feature === 'forest') paintForest(g, cx, cy, q, r, seed, false);
  else if (tile.feature === 'jungle') paintForest(g, cx, cy, q, r, seed, true);
  else if (tile.feature === 'oasis') paintOasis(g, cx, cy);
}

function paintForest(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
  jungle: boolean,
): void {
  const n = jungle ? 6 : 5;
  const trees: { x: number; y: number; s: number; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    const hx = hash2(q * 31 + i, r * 7, seed + 51 + i);
    const hy = hash2(q * 5, r * 37 + i, seed + 53 + i);
    trees.push({
      x: cx + (hx - 0.5) * HEX * 1.15,
      y: cy + (hy - 0.5) * HEX * 0.95 + 3,
      s: 0.8 + hash2(i, q * r + i, seed + 57) * 0.5,
      i,
    });
  }
  trees.sort((a, b) => a.y - b.y || a.i - b.i);
  for (const t of trees) {
    if (jungle) {
      const crown = t.i % 2 ? '#2E5E40' : '#24492F';
      g.beginPath();
      g.arc(t.x - 3 * t.s, t.y, 4.4 * t.s, 0, Math.PI * 2);
      g.arc(t.x + 2 * t.s, t.y - 2.4 * t.s, 5 * t.s, 0, Math.PI * 2);
      g.arc(t.x + 4 * t.s, t.y + 1.6 * t.s, 3.8 * t.s, 0, Math.PI * 2);
      g.fillStyle = crown;
      g.fill();
      g.beginPath();
      g.arc(t.x - 1 * t.s, t.y - 3.4 * t.s, 3 * t.s, 0, Math.PI * 2);
      g.fillStyle = shade(crown, 0.12);
      g.fill();
    } else {
      // conifer: shadow, trunk, two stacked crowns
      g.beginPath();
      g.ellipse(t.x + 2, t.y + 5.4 * t.s, 4.6 * t.s, 1.6 * t.s, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(20,28,18,0.25)';
      g.fill();
      g.fillStyle = '#5C4632';
      g.fillRect(t.x - 0.9 * t.s, t.y + 2.6 * t.s, 1.8 * t.s, 3 * t.s);
      const c1 = t.i % 2 ? '#3F6B34' : '#37602D';
      g.beginPath();
      g.moveTo(t.x, t.y - 8.6 * t.s);
      g.lineTo(t.x + 4.8 * t.s, t.y + 3 * t.s);
      g.lineTo(t.x - 4.8 * t.s, t.y + 3 * t.s);
      g.closePath();
      g.fillStyle = c1;
      g.fill();
      g.beginPath();
      g.moveTo(t.x, t.y - 9.8 * t.s);
      g.lineTo(t.x + 3.3 * t.s, t.y - 1.8 * t.s);
      g.lineTo(t.x - 3.3 * t.s, t.y - 1.8 * t.s);
      g.closePath();
      g.fillStyle = shade(c1, 0.14);
      g.fill();
    }
  }
}

function paintOasis(g: CanvasRenderingContext2D, cx: number, cy: number): void {
  g.beginPath();
  g.ellipse(cx, cy + 4, 10, 5.5, 0, 0, Math.PI * 2);
  g.fillStyle = '#2E6E94';
  g.fill();
  g.strokeStyle = '#7DA34C';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    const bx = cx + side * 8;
    const by = cy - 2;
    for (let f = 0; f < 3; f++) {
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + side * (2 + f * 3), by - 7 + f * 2, bx + side * (7 + f * 2), by - 3 + f * 2.6);
      g.stroke();
    }
  }
}

// --- improvements: painted into the land, like terrain features (trees/mountains) ---

/** Plowed field: an oval of tilled-earth furrows, gently rotated per tile. */
function paintFarm(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  g.save();
  g.translate(cx, cy);
  g.rotate((hash2(q, r, seed + 61) - 0.5) * 0.5);
  const wHalf = HEX * 0.6;
  const hHalf = HEX * 0.4;
  g.beginPath();
  g.ellipse(0, 0, wHalf, hHalf, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(122,90,51,0.34)';
  g.fill();
  const rows = 6;
  const gap = (hHalf * 2 - 4) / (rows - 1);
  g.lineCap = 'round';
  for (let i = 0; i < rows; i++) {
    const yy = -hHalf + 2 + i * gap;
    const half = wHalf * Math.sqrt(Math.max(0, 1 - (yy / hHalf) ** 2));
    if (half < 3) continue;
    g.beginPath();
    g.moveTo(-half, yy);
    g.quadraticCurveTo(0, yy - 1.4, half, yy);
    g.strokeStyle = 'rgba(106,76,42,0.85)';
    g.lineWidth = 2.4;
    g.stroke();
    g.beginPath();
    g.moveTo(-half, yy - 1);
    g.quadraticCurveTo(0, yy - 2.4, half, yy - 1);
    g.strokeStyle = 'rgba(212,178,118,0.5)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.restore();
}

/** Mine: a dark timber-framed entrance set into the ground with a tailings mound. */
function paintMine(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx;
  const y = cy + 2;
  g.beginPath();
  g.ellipse(x, y + 7, 13, 5, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(92,74,52,0.55)';
  g.fill();
  g.beginPath();
  g.moveTo(x - 7, y + 6);
  g.lineTo(x - 5, y - 4);
  g.quadraticCurveTo(x, y - 9, x + 5, y - 4);
  g.lineTo(x + 7, y + 6);
  g.closePath();
  g.fillStyle = '#241a13';
  g.fill();
  g.strokeStyle = '#6a5436';
  g.lineWidth = 2.2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - 7.5, y + 6);
  g.lineTo(x - 5.5, y - 4.5);
  g.moveTo(x + 7.5, y + 6);
  g.lineTo(x + 5.5, y - 4.5);
  g.moveTo(x - 6.2, y - 4.6);
  g.lineTo(x + 6.2, y - 4.6);
  g.stroke();
  g.fillStyle = 'rgba(58,50,42,0.75)';
  for (let i = 0; i < 3; i++) {
    const h = hash2(q + i, r, seed + 71);
    g.beginPath();
    g.arc(x - 4 + i * 4 + (h - 0.5) * 2, y + 7 + (h - 0.5) * 2, 1.8, 0, Math.PI * 2);
    g.fill();
  }
}

/** Pasture: a fenced paddock (posts + rail) on lightly-grazed grass with a couple of animals. */
function paintPasture(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx;
  const y = cy + 1;
  const w = HEX * 0.5;
  const h = HEX * 0.34;
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(184,196,124,0.18)';
  g.fill();
  g.strokeStyle = 'rgba(122,90,51,0.75)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineCap = 'round';
  g.lineWidth = 1.6;
  const posts = 11;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const px = x + Math.cos(a) * w;
    const py = y + Math.sin(a) * h;
    g.beginPath();
    g.moveTo(px, py - 2.6);
    g.lineTo(px, py + 2.6);
    g.stroke();
  }
  g.fillStyle = 'rgba(74,58,40,0.8)';
  for (let i = 0; i < 2; i++) {
    const hx = hash2(q + i * 3, r, seed + 81);
    const hy = hash2(q, r + i * 3, seed + 83);
    g.beginPath();
    g.ellipse(x + (hx - 0.5) * w, y + (hy - 0.5) * h, 2.6, 1.7, 0, 0, Math.PI * 2);
    g.fill();
  }
}

/** Quarry: a dug pit with stepped cut-stone terraces and a couple of loose blocks. */
function paintQuarry(g: CanvasRenderingContext2D, cx: number, cy: number, _q: number, _r: number, _seed: number): void {
  const x = cx;
  const y = cy + 2;
  g.beginPath();
  g.ellipse(x, y + 2, 13, 7, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(60,56,50,0.35)';
  g.fill();
  const steps = [
    { w: 17, h: 4, dy: 4, c: '#9a958c' },
    { w: 12, h: 4, dy: 0.5, c: '#b4afa4' },
    { w: 8, h: 3.5, dy: -3, c: '#cfcabf' },
  ];
  for (const s of steps) {
    g.fillStyle = s.c;
    g.fillRect(x - s.w / 2, y + s.dy - s.h / 2, s.w, s.h);
    g.strokeStyle = 'rgba(70,66,60,0.6)';
    g.lineWidth = 0.8;
    g.strokeRect(x - s.w / 2, y + s.dy - s.h / 2, s.w, s.h);
  }
  g.fillStyle = '#c4bfb4';
  g.strokeStyle = 'rgba(70,66,60,0.6)';
  g.fillRect(x + 6, y + 5, 4.5, 3.2);
  g.strokeRect(x + 6, y + 5, 4.5, 3.2);
}

/** Fishing Boats: a small hull float and net stakes bobbing in the water. */
function paintFishingBoats(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx;
  const y = cy + 1;
  const w = HEX * 0.42;
  // a small buoy float
  g.fillStyle = 'rgba(212,196,140,0.95)';
  g.strokeStyle = 'rgba(60,48,34,0.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.ellipse(x, y - 2, w * 0.34, HEX * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // net stakes poking out of the water
  g.lineCap = 'round';
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(60,48,34,0.8)';
  const stakes = 4;
  for (let i = 0; i < stakes; i++) {
    const t = (i / (stakes - 1) - 0.5) * 2; // -1..1
    const sx = x + t * w;
    const jitter = (hash2(q + i, r, seed + 91) - 0.5) * 2.5;
    g.beginPath();
    g.moveTo(sx, y + 4 + jitter);
    g.lineTo(sx, y - 1 + jitter);
    g.stroke();
  }
}

/** Plantation: regular rows of small orchard trees (cultivated, unlike wild forest). */
function paintPlantation(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  g.save();
  g.translate(cx, cy + 1);
  const cols = 3;
  const rows = 3;
  const dx = 11;
  const dy = 8;
  for (let c = 0; c < cols; c++) {
    for (let rr = 0; rr < rows; rr++) {
      const ox = (c - (cols - 1) / 2) * dx + (rr % 2) * dx * 0.4;
      const oy = (rr - (rows - 1) / 2) * dy;
      const jx = (hash2(q + c, r + rr, seed + 91) - 0.5) * 2;
      g.beginPath();
      g.ellipse(ox + 1 + jx, oy + 3, 3.4, 1.3, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(20,28,18,0.2)';
      g.fill();
      g.beginPath();
      g.arc(ox + jx, oy, 3.2, 0, Math.PI * 2);
      g.fillStyle = '#4a7a3e';
      g.fill();
      g.beginPath();
      g.arc(ox + jx - 0.9, oy - 0.9, 1.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(150,190,110,0.5)';
      g.fill();
    }
  }
  g.restore();
}

/** Lumber Mill: three stacked log ends with a saw-stroke above. */
function paintLumberMill(g: CanvasRenderingContext2D, cx: number, cy: number, q: number, r: number, seed: number): void {
  const x = cx, y = cy + 2;
  g.strokeStyle = 'rgba(74,52,32,0.9)';
  g.fillStyle = 'rgba(150,110,70,0.9)';
  g.lineWidth = 1.4;
  // three stacked log ends
  for (let i = 0; i < 3; i++) {
    const lx = x + (i - 1) * 5;
    g.beginPath();
    g.ellipse(lx, y, 2.4, 2.4, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // a saw stroke above
  g.strokeStyle = 'rgba(60,48,34,0.7)';
  const jitter = (hash2(q, r, seed + 41) - 0.5) * 2;
  g.beginPath();
  g.moveTo(x - 7, y - 5 + jitter);
  g.lineTo(x + 7, y - 5 - jitter);
  g.stroke();
}

export function paintImprovement(
  g: CanvasRenderingContext2D,
  impId: string,
  cx: number,
  cy: number,
  q: number,
  r: number,
  seed: number,
): void {
  switch (impId) {
    case 'farm':
      paintFarm(g, cx, cy, q, r, seed);
      break;
    case 'mine':
      paintMine(g, cx, cy, q, r, seed);
      break;
    case 'pasture':
      paintPasture(g, cx, cy, q, r, seed);
      break;
    case 'quarry':
      paintQuarry(g, cx, cy, q, r, seed);
      break;
    case 'plantation':
      paintPlantation(g, cx, cy, q, r, seed);
      break;
    case 'fishing_boats':
      paintFishingBoats(g, cx, cy, q, r, seed);
      break;
    case 'lumber_mill':
      paintLumberMill(g, cx, cy, q, r, seed);
      break;
  }
}

// --- resource tokens (game-icons.net silhouettes recolored to the palette) ---

const iconPathCache = new Map<string, Path2D | null>();
/** Cache a Path2D per icon path string (shared by resources + improvements). */
function iconPath(d: string | undefined): Path2D | null {
  if (!d) return null;
  let p = iconPathCache.get(d);
  if (p === undefined) {
    p = new Path2D(d);
    iconPathCache.set(d, p);
  }
  return p;
}

export function paintResource(
  g: CanvasRenderingContext2D,
  resId: string,
  cx: number,
  cy: number,
  dim = false, // once the tile is improved, the painted land leads; shrink + fade the badge
): void {
  const x = cx - HEX * 0.3;
  const y = cy + HEX * 0.26;
  const r = dim ? 11 : 14;
  const iconPx = dim ? 15 : 20;
  g.save();
  if (dim) g.globalAlpha = 0.82;
  // parchment token
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = PALETTE.parchment;
  g.fill();
  g.strokeStyle = PALETTE.sepia;
  g.lineWidth = 1.5;
  g.stroke();

  const path = iconPath(RESOURCE_ICON_PATHS[resId]);
  if (path) {
    // engraved silhouette: scale the 512-viewBox icon down, centered, tinted sepia
    const s = iconPx / RESOURCE_ICON_VIEWBOX;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.translate(-RESOURCE_ICON_VIEWBOX / 2, -RESOURCE_ICON_VIEWBOX / 2);
    g.fillStyle = PALETTE.sepia;
    g.fill(path);
    g.restore();
  } else {
    g.beginPath();
    g.arc(x, y, 2.4, 0, Math.PI * 2);
    g.fillStyle = PALETTE.sepia;
    g.fill();
  }
  g.restore();
}

// --- unit glyphs (white strokes in a ~16px box centered at 0,0) ---

export function paintGlyph(g: CanvasRenderingContext2D, glyph: string): void {
  g.strokeStyle = '#FFFFFF';
  g.fillStyle = '#FFFFFF';
  g.lineWidth = 1.9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (glyph) {
    case 'sword':
      g.beginPath();
      g.moveTo(-4.5, 5.5);
      g.lineTo(4.5, -4.5);
      g.moveTo(4.5, -4.5);
      g.lineTo(5.5, -5.5);
      g.moveTo(-2.2, 1.2);
      g.lineTo(1.6, 5);
      g.moveTo(-5.5, 6.5);
      g.lineTo(-3.4, 4.4);
      g.stroke();
      break;
    case 'club':
      g.beginPath();
      g.moveTo(-4.5, 5.5);
      g.lineTo(2.5, -1.5);
      g.stroke();
      g.beginPath();
      g.arc(3.6, -2.8, 3.1, 0, Math.PI * 2);
      g.fill();
      break;
    case 'spear':
      g.beginPath();
      g.moveTo(-5, 6);
      g.lineTo(3.4, -2.4);
      g.stroke();
      g.beginPath();
      g.moveTo(2.2, -5.6);
      g.lineTo(5.6, -2.2);
      g.lineTo(5.8, -5.8);
      g.closePath();
      g.fill();
      break;
    case 'bow':
      g.beginPath();
      g.arc(-1, 0, 6, -Math.PI / 2.6, Math.PI / 2.6);
      g.stroke();
      g.beginPath();
      g.moveTo(-1 + 6 * Math.cos(-Math.PI / 2.6), 6 * Math.sin(-Math.PI / 2.6));
      g.lineTo(-1 + 6 * Math.cos(Math.PI / 2.6), 6 * Math.sin(Math.PI / 2.6));
      g.moveTo(-4.5, 0);
      g.lineTo(5.5, 0);
      g.stroke();
      g.beginPath();
      g.moveTo(5.8, 0);
      g.lineTo(3, -1.6);
      g.lineTo(3, 1.6);
      g.closePath();
      g.fill();
      break;
    case 'horse':
      g.beginPath();
      g.moveTo(-5, 5.5);
      g.quadraticCurveTo(-4, -1, 0, -2.5);
      g.quadraticCurveTo(3.4, -4.4, 3.2, -0.6);
      g.quadraticCurveTo(5.8, -1.4, 5.2, 1.4);
      g.moveTo(0.5, 5.5);
      g.lineTo(0.2, -0.5);
      g.stroke();
      break;
    case 'gear':
      g.beginPath();
      g.arc(0, 0, 3.4, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.beginPath();
        g.moveTo(4.2 * Math.cos(a), 4.2 * Math.sin(a));
        g.lineTo(6.2 * Math.cos(a), 6.2 * Math.sin(a));
        g.stroke();
      }
      break;
    case 'flag':
      g.beginPath();
      g.moveTo(-3.4, 6);
      g.lineTo(-3.4, -6);
      g.stroke();
      g.beginPath();
      g.moveTo(-3.4, -6);
      g.lineTo(5, -3.8);
      g.lineTo(-3.4, -1.4);
      g.closePath();
      g.fill();
      break;
    case 'eye':
      g.beginPath();
      g.moveTo(-6, 0);
      g.quadraticCurveTo(0, -5.6, 6, 0);
      g.quadraticCurveTo(0, 5.6, -6, 0);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 2, 0, Math.PI * 2);
      g.fill();
      break;
    case 'catapult':
      g.beginPath();
      g.moveTo(-5.5, 5);
      g.lineTo(5.5, 5);
      g.moveTo(-3, 5);
      g.lineTo(4, -4.6);
      g.stroke();
      g.beginPath();
      g.arc(4.6, -5.2, 2, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(-2.6, 5, 1.7, 0, Math.PI * 2);
      g.arc(2.8, 5, 1.7, 0, Math.PI * 2);
      g.fill();
      break;
    default:
      g.beginPath();
      g.arc(0, 0, 4, 0, Math.PI * 2);
      g.stroke();
  }
}

/** A proper unit figure (game-icons silhouette), white, centered at the origin.
 *  Returns false if the unit has no figure so the caller can fall back to a glyph. */
export function paintUnitFigure(g: CanvasRenderingContext2D, unitId: string): boolean {
  const path = iconPath(UNIT_ICON_PATHS[unitId]);
  if (!path) return false;
  const s = 17 / RESOURCE_ICON_VIEWBOX;
  g.save();
  g.scale(s, s);
  g.translate(-RESOURCE_ICON_VIEWBOX / 2, -RESOURCE_ICON_VIEWBOX / 2);
  g.fillStyle = '#FFFFFF';
  g.fill(path);
  g.restore();
  return true;
}

// --- parchment (the terra incognita) ---

export function makeParchment(size: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.parchment;
  g.fillRect(0, 0, size, size);
  // mottled blotches — broad tonal drift first, then small stains
  for (let i = 0; i < 90; i++) {
    const x = hash2(i, 1, seed) * size;
    const y = hash2(i, 2, seed) * size;
    const broad = i < 18;
    const rad = broad ? 60 + hash2(i, 3, seed) * 90 : 10 + hash2(i, 3, seed) * 40;
    const dark = hash2(i, 4, seed) > 0.48;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(
      0,
      shade(dark ? PALETTE.parchmentDark : PALETTE.parchmentLight, 0, broad ? 0.16 : 0.09),
    );
    grad.addColorStop(1, shade(PALETTE.parchment, 0, 0));
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibers
  g.lineWidth = 1;
  for (let i = 0; i < 220; i++) {
    const x = hash2(i, 5, seed) * size;
    const y = hash2(i, 6, seed) * size;
    const len = 3 + hash2(i, 7, seed) * 9;
    const a = hash2(i, 8, seed) * Math.PI;
    g.strokeStyle = shade(hash2(i, 9, seed) > 0.5 ? PALETTE.parchmentDark : PALETTE.parchmentLight, 0, 0.16);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  return c;
}

/** Sparse hand-sketched marks for unexplored tiles (compass curls, ridges, waves). */
export function paintSketch(
  g: CanvasRenderingContext2D,
  kind: number,
  cx: number,
  cy: number,
): void {
  g.strokeStyle = css(rgb(PALETTE.sepia), 0.22);
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  if (kind === 0) {
    // wave curls
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(cx - 10, cy + i * 6 - 3);
      g.quadraticCurveTo(cx - 4, cy + i * 6 - 9, cx + 1, cy + i * 6 - 3);
      g.quadraticCurveTo(cx + 5, cy + i * 6 + 1.5, cx + 9, cy + i * 6 - 2);
      g.stroke();
    }
  } else if (kind === 1) {
    // sketched ridge
    g.beginPath();
    g.moveTo(cx - 11, cy + 5);
    g.lineTo(cx - 3, cy - 6);
    g.lineTo(cx + 2, cy - 0.5);
    g.lineTo(cx + 6, cy - 4.5);
    g.lineTo(cx + 11, cy + 5);
    g.stroke();
  } else {
    // compass rose
    g.beginPath();
    g.arc(cx, cy, 6.5, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy - 10);
    g.lineTo(cx, cy + 10);
    g.moveTo(cx - 10, cy);
    g.lineTo(cx + 10, cy);
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy - 10);
    g.lineTo(cx + 2.4, cy - 4);
    g.lineTo(cx - 2.4, cy - 4);
    g.closePath();
    g.fillStyle = css(rgb(PALETTE.sepia), 0.22);
    g.fill();
  }
}
