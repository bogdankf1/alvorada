/**
 * Visual check for the Foreign Affairs diplomacy UI. Spins its own Vite server,
 * starts a Duel game (two close civs meet fast), autoplays until a rival is met,
 * opens the council (G), screenshots it and the deal table, and fails on console errors.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots/diplo', { recursive: true });
const server = await createServer({ server: { port: 5196 }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--window-size=1600,1000', '--force-device-scale-factor=2'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const api = (b) => page.evaluate(`(async () => { const w = window.__alvorada; ${b} })()`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5196', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(500);
// Duel map (two close civs), fixed seed
await page.evaluate(() => [...document.querySelectorAll('.choice')].find((e) => e.textContent.includes('Duel')).click());
await page.evaluate((s) => {
  const i = document.querySelector('.seed-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, s);
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, '13131');
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await sleep(1200);

// autoplay in chunks until the human (viewer) has met someone, or 60 turns
let met = false;
for (let i = 0; i < 6 && !met; i++) {
  await api('return w().debugAutoplay(10)');
  await sleep(1500);
  met = await page.evaluate(() => {
    const a = window.__alvorada();
    const v = a.viewingPlayer;
    return a.game.players.some((_p, j) => j !== v && a.game.relations[v][j].met);
  });
}
const info = await page.evaluate(() => {
  const a = window.__alvorada();
  const v = a.viewingPlayer;
  const rel = a.game.relations[v];
  return {
    turn: a.game.turn,
    met: a.game.players.map((p, j) => (j !== v ? { id: j, met: rel[j].met, war: rel[j].status === 'war' } : null)).filter(Boolean),
    pendingToMe: a.game.proposals.filter((p) => p.to === v).length,
  };
});
console.log('state:', JSON.stringify(info));

// open Foreign Affairs
await page.keyboard.press('KeyG');
await sleep(500);
await page.screenshot({ path: 'shots/diplo/01-council.png' });

// select the first known power → deal table
const clicked = await page.evaluate(() => {
  const el = document.querySelector('.power');
  if (el) { el.click(); return true; }
  return false;
});
await sleep(300);
// open the attitude "why"
await page.evaluate(() => document.querySelector('.deal-why')?.click());
await sleep(250);
await page.screenshot({ path: 'shots/diplo/02-deal-table.png' });
console.log('selected a power:', clicked);

console.log('console errors:', errors.length, errors.slice(0, 5));
await browser.close();
await server.close();
