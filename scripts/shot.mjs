/**
 * Visual verification: drives the built game in headless Chrome, walks the
 * core flow, plays real turns (the AI brain plays the human side), captures
 * screenshots to shots/, and fails on any console error.
 *
 *   node scripts/shot.mjs [seed] [turns]
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const seed = process.argv[2] ?? '20260612';
const turns = Number(process.argv[3] ?? 24);

mkdirSync('shots', { recursive: true });

const server = await createServer({ server: { port: 5199 }, logLevel: 'silent' });
await server.listen();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--window-size=1600,1000', '--force-device-scale-factor=2'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
await page.screenshot({ path: 'shots/01-menu.png' });

// configure seed and begin
await page.evaluate((s) => {
  const input = document.querySelector('.seed-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, s);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, seed);
await clickText(page, '.btn--primary', 'Begin');
await sleep(1500);
await page.screenshot({ path: 'shots/02-game-start.png' });

// select the settler (second click cycles the stack past the warrior)
const start = await api(page, 'return (() => { const s = w(); const u = Object.values(s.game.units).filter(x => x.owner === s.viewingPlayer); return u.length ? { q: u[0].q, r: u[0].r } : null; })()');
if (start) {
  await api(page, `w().clickHex(${start.q}, ${start.r})`);
  await sleep(150);
  const first = await page.evaluate(() => document.querySelector('.unit-panel h3')?.textContent);
  if (first !== 'Settler') {
    await api(page, `w().clickHex(${start.q}, ${start.r})`);
    await sleep(150);
  }
  await page.screenshot({ path: 'shots/03-unit-selected.png' });
}

// play real turns (AI brain on the human side)
await api(page, `return w().debugAutoplay(${turns})`);
await sleep(800);

// find the capital and look at it up close
const capital = await api(
  page,
  'return (() => { const s = w(); const c = Object.values(s.game.cities).filter(x => x.owner === s.viewingPlayer)[0]; return c ? { q: c.q, r: c.r, id: c.id } : null; })()',
);
if (capital) {
  await api(page, `w().view(${capital.q}, ${capital.r}, 1.5)`);
  await sleep(500);
  await page.screenshot({ path: 'shots/04-capital-close.png' });
  await api(page, `w().selectCity(${capital.id})`);
  await sleep(450);
  await page.screenshot({ path: 'shots/05-city-panel.png' });
  await page.keyboard.press('Escape');
}

await page.keyboard.press('KeyT');
await sleep(400);
await page.screenshot({ path: 'shots/06-tech-tree.png' });
await page.keyboard.press('Escape');

// wide view of the known world
if (capital) {
  await api(page, `w().view(${capital.q}, ${capital.r}, 0.75)`);
  await sleep(500);
}
await page.screenshot({ path: 'shots/07-world.png' });

await browser.close();
await server.close();

if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK — screenshots in shots/');

async function api(page, body) {
  return page.evaluate(`(async () => { const w = window.__alvorada; ${body.startsWith('return') ? body : body + ';'} })()`);
}

async function clickText(page, selector, text) {
  return page.evaluate(
    ({ selector, text }) => {
      const els = [...document.querySelectorAll(selector)];
      const el = els.find((e) => e.textContent.includes(text));
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    { selector, text },
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
