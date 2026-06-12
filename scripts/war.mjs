// Duel-map probe: advance turns until a war exists, photograph the front.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const seed = process.argv[2] ?? '4242';
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
// duel map
await page.evaluate(() => [...document.querySelectorAll('.choice')].find((e) => e.textContent.includes('Duel')).click());
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await new Promise((r) => setTimeout(r, 1200));

let shot = 0;
for (let batch = 0; batch < 30; batch++) {
  await page.evaluate(() => window.__alvorada().debugAutoplay(4));
  await new Promise((r) => setTimeout(r, 2500));
  const front = await page.evaluate(() => {
    const api = window.__alvorada();
    const g = api.game;
    if (!g) return null;
    const wars = g.relations.some((row, a) => row.some((rel, b) => rel === 'war' && a !== b));
    if (!wars) return { wars: false, turn: g.turn, ended: g.phase === 'ended' };
    // frontline: enemy unit visible to viewer, else enemy city known
    const vis = g.visibility[api.viewingPlayer];
    const W = g.mapW;
    const idxOf = (q, r) => r * W + q + ((r - (r & 1)) >> 1);
    const enemies = Object.values(g.units).filter(
      (u) => u.owner !== api.viewingPlayer && vis[idxOf(u.q, u.r)] === 2,
    );
    const target = enemies[0] ?? Object.values(g.cities).find((c) => c.owner !== api.viewingPlayer && vis[idxOf(c.q, c.r)] > 0);
    return { wars: true, turn: g.turn, ended: g.phase === 'ended', at: target ? { q: target.q, r: target.r } : null };
  });
  if (!front) break;
  if (front.wars && front.at) {
    await page.evaluate(({ at }) => window.__alvorada().view(at.q, at.r, 1.35), { at: front.at });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: `shots/2${shot}-war-t${front.turn}.png` });
    shot++;
    if (shot >= 3) break;
  }
  if (front.ended) {
    await page.screenshot({ path: `shots/29-ended-t${front.turn}.png` });
    break;
  }
}
console.log('shots taken:', shot);
await browser.close();
await server.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
