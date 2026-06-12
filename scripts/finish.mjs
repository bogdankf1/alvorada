// Run a duel to its verdict; photograph the victory screen.
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
await page.evaluate(() => [...document.querySelectorAll('.choice')].find((e) => e.textContent.includes('Duel')).click());
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await new Promise((r) => setTimeout(r, 1200));

let info = null;
for (let batch = 0; batch < 60; batch++) {
  await page.evaluate(() => window.__alvorada().debugAutoplay(5));
  await new Promise((r) => setTimeout(r, 2800));
  info = await page.evaluate(() => {
    const g = window.__alvorada().game;
    return { turn: g.turn, phase: g.phase, winner: g.winner };
  });
  if (info.phase === 'ended') break;
}
console.log('result:', JSON.stringify(info));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: 'shots/30-verdict.png' });
await browser.close();
await server.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
