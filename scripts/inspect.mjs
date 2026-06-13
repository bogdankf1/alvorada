/**
 * Close-up panel inspection + a combat scenario, against the live dev server.
 * Captures clipped regions so panel detail is legible.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('shots/inspect', { recursive: true });
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
const api = (body) => page.evaluate(`(async () => { const w = window.__alvorada; ${body} })()`);
const clickBtn = (sel, text) =>
  page.evaluate(({ sel, text }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
    if (el) { el.click(); return true; } return false;
  }, { sel, text });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = async (selector, name, pad = 8) => {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
  if (!box) { console.log('MISSING', selector); return; }
  await page.screenshot({
    path: `shots/inspect/${name}.png`,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 },
  });
};

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate((s) => {
  const input = document.querySelector('.seed-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, s);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, '31337');
await clickBtn('.btn--primary', 'Begin');
await sleep(1500);

// settler panel close-up
const start = await api('return (() => { const g = w().game; const u = Object.values(g.units).filter(x => x.owner === w().viewingPlayer); return { q: u[0].q, r: u[0].r }; })()');
await api(`w().clickHex(${start.q}, ${start.r})`);
await sleep(200);
let sel = await page.evaluate(() => document.querySelector('.unit-panel h3')?.textContent);
if (sel !== 'Settler') { await api(`w().clickHex(${start.q}, ${start.r})`); await sleep(200); }
await clip('.unit-panel', 'settler-panel');

// found, then city panel close-up
await clickBtn('.unit-panel .btn', 'Found City');
await sleep(500);
await api('return (() => { const g = w().game; const c = Object.values(g.cities).find(x => x.owner === w().viewingPlayer); w().selectCity(c.id); })()');
await sleep(400);
await clip('.city-panel', 'city-panel');

// top bar close-up
await clip('.topbar', 'topbar', 4);

// tech tree node close-up
await page.keyboard.press('Escape');
await page.keyboard.press('KeyT');
await sleep(400);
await clip('.tech-node.is-available', 'tech-node', 6);
await page.screenshot({ path: 'shots/inspect/tech-full.png' });
await page.keyboard.press('Escape');
await sleep(200);

// --- combat scenario: spawn an enemy warrior next to ours, attack it ---
await api(`return (() => {
  const a = w(); const g = a.game; const pid = a.viewingPlayer;
  const mine = Object.values(g.units).find(u => u.owner === pid && u.def === 'warrior');
  // can't mutate engine state from here (frozen) — instead just select our warrior to show attack overlay if any enemy is near
  if (mine) a.clickHex(mine.q, mine.r);
})()`);
await sleep(300);
await clip('.unit-panel', 'warrior-panel');

console.log(JSON.stringify({ errors }));
await browser.close();
