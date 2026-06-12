// One-off: long game, then photograph biome variety and any war zones.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const seed = process.argv[2] ?? '777';
const turns = Number(process.argv[3] ?? 55);
mkdirSync('shots', { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'shell',
  args: ['--window-size=1600,1000', '--force-device-scale-factor=2'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate((s) => {
  const input = document.querySelector('.seed-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, s);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, seed);
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate((t) => window.__alvorada().debugAutoplay(t), turns);
await new Promise((r) => setTimeout(r, 1200));

const spots = await page.evaluate(() => {
  const api = window.__alvorada();
  const g = api.game;
  const vis = g.visibility[api.viewingPlayer];
  const W = g.mapW;
  const out = {};
  const axial = (i) => {
    const row = Math.floor(i / W);
    return { q: (i % W) - ((row - (row & 1)) >> 1), r: row };
  };
  // first explored tile per interesting terrain
  for (let i = 0; i < g.tiles.length; i++) {
    if (vis[i] === 0) continue;
    const t = g.tiles[i].terrain;
    if (!out[t]) out[t] = axial(i);
  }
  const enemyCity = Object.values(g.cities).find((c) => {
    if (c.owner === api.viewingPlayer) return false;
    const row = c.r;
    const col = c.q + ((row - (row & 1)) >> 1);
    return vis[row * W + col] > 0;
  });
  const wars = g.relations.flatMap((row, a) => row.map((rel, b) => (rel === 'war' && a < b ? [a, b] : null))).filter(Boolean);
  return { coast: out.coast, desert: out.desert, tundra: out.tundra, snow: out.snow, enemyCity: enemyCity ? { q: enemyCity.q, r: enemyCity.r } : null, wars, turn: g.turn };
});
console.log('spots:', JSON.stringify(spots));

let n = 10;
for (const key of ['coast', 'desert', 'tundra', 'enemyCity']) {
  const s = spots[key];
  if (!s) continue;
  await page.evaluate(({ s, z }) => window.__alvorada().view(s.q, s.r, z), { s, z: 1.3 });
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `shots/${n}-${key}.png` });
  n++;
}
await browser.close();
await server.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
