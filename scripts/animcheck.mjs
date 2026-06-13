/**
 * Does a human move actually animate? Issue a multi-tile move and grab frames
 * at staggered delays; if the unit sits between hex centers in a mid-frame,
 * the glide is firing.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
mkdirSync('shots/anim', { recursive: true });
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
const api = (b) => page.evaluate(`(async () => { const w = window.__alvorada; ${b} })()`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await sleep(1500);

// select warrior, zoom in
const warrior = await api('return (() => { const g=w().game; const u=Object.values(g.units).find(x=>x.owner===w().viewingPlayer && x.def==="warrior"); return u?{id:u.id,q:u.q,r:u.r}:null; })()');
await api(`w().view(${warrior.q}, ${warrior.r}, 1.7)`);
await api(`w().clickHex(${warrior.q}, ${warrior.r})`);
await sleep(200);

// sample the warrior's on-screen glide via the renderer's animated position
const samples = await page.evaluate(({ q, r, id }) => {
  return new Promise((resolve) => {
    const w = window.__alvorada;
    // dispatch a 2-tile move east
    w().clickHex(q + 2, r);
    const out = [];
    const t0 = performance.now();
    const step = () => {
      const pos = w().animProbe(id);
      out.push({ t: Math.round(performance.now() - t0), pos });
      if (performance.now() - t0 < 420) requestAnimationFrame(step);
      else resolve(out);
    };
    requestAnimationFrame(step);
  });
}, warrior);

console.log('errors:', errors.length);
console.log('glide samples (t ms → screen x,y):');
for (const s of samples) {
  if (s.pos) console.log(`  ${String(s.t).padStart(3)}ms  x=${s.pos.x.toFixed(1)} y=${s.pos.y.toFixed(1)} anims=${s.pos.anims}`);
  else console.log(`  ${String(s.t).padStart(3)}ms  (no renderer hook)`);
}
await browser.close();
