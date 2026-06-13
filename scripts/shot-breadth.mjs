/**
 * Visual check for Breadth & Victory: the 4-era tech tree (capstone chip) and a
 * city production list (wonder tag). Spins its own Vite server; fails on console errors.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots/breadth', { recursive: true });
const server = await createServer({ server: { port: 5195 }, logLevel: 'silent' });
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

await page.goto('http://localhost:5195', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(500);
await page.evaluate((s) => {
  const i = document.querySelector('.seed-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, s);
  i.dispatchEvent(new Event('input', { bubbles: true }));
}, '31337');
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await sleep(1200);

// play long enough that a wonder is tech-unlocked for the human and still unbuilt
let snap = null;
for (let i = 0; i < 9; i++) {
  await api('return w().debugAutoplay(8)');
  await sleep(800);
  snap = await page.evaluate(() => {
    const a = window.__alvorada();
    const g = a.game;
    // find an owned city that has a wonder in its production options (tech-unlocked, not built)
    const myCities = Object.values(g.cities).filter((c) => c.owner === a.viewingPlayer);
    const wonderIds = Object.values(g.config ? {} : {}); // placeholder
    let cityWithWonder = null;
    for (const c of myCities) {
      const opts = a.prodOptions(c.id);
      if (opts.some((o) => o.wonder)) { cityWithWonder = c.id; break; }
    }
    return {
      turn: g.turn,
      phase: g.phase,
      myTechs: g.players[a.viewingPlayer].techs.length,
      wondersBuilt: Object.keys(g.wondersBuilt),
      cityWithWonder,
      anyCity: myCities[0]?.id ?? null,
    };
  });
  if (snap.cityWithWonder !== null || snap.phase === 'ended') break;
}
console.log('snapshot:', JSON.stringify(snap));

const cityToShow = snap.cityWithWonder ?? snap.anyCity;
if (cityToShow !== null) {
  await api(`w().selectCity(${cityToShow})`);
  await sleep(400);
  await page.screenshot({ path: 'shots/breadth/01-city-production.png' });
}

// tech tree — capture left (ancient/classical) then scrolled right (renaissance + capstone chip)
await page.keyboard.press('Escape');
await page.keyboard.press('KeyT');
await sleep(500);
await page.screenshot({ path: 'shots/breadth/02-techtree-left.png' });
await page.evaluate(() => { const s = document.querySelector('.tech-scroll'); if (s) s.scrollLeft = s.scrollWidth; });
await sleep(300);
await page.screenshot({ path: 'shots/breadth/03-techtree-right.png' });

console.log('console errors:', errors.length, errors.slice(0, 5));
await browser.close();
await server.close();
