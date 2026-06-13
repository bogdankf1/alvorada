/**
 * Play the live game like a human: discrete moves, a screenshot after each,
 * and a structured state dump so anomalies are visible. Connects to the dev
 * server already running on :5173.
 *
 *   node scripts/play.mjs [seed]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const seed = process.argv[2] ?? '31337';
mkdirSync('shots/play', { recursive: true });

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

const log = [];
let step = 0;
const shoot = async (label) => {
  step++;
  const name = `${String(step).padStart(2, '0')}-${label}`;
  await page.screenshot({ path: `shots/play/${name}.png` });
  return name;
};
const state = () =>
  page.evaluate(() => {
    const a = window.__alvorada?.();
    if (!a?.game) return null;
    const g = a.game;
    const mine = (rec) => Object.values(rec).filter((x) => x.owner === a.viewingPlayer);
    return {
      turn: g.turn,
      phase: g.phase,
      cur: g.currentPlayer,
      aiThinking: a.game && document.querySelector('.ai-banner') ? true : undefined,
      myUnits: mine(g.units).map((u) => ({ id: u.id, def: u.def, q: u.q, r: u.r, moves: u.moves, order: u.order?.kind ?? null })),
      myCities: mine(g.cities).map((c) => ({ id: c.id, name: c.name, pop: c.pop, prod: c.production.item?.id ?? null })),
      researching: g.players[a.viewingPlayer].researching,
      selUnit: document.querySelector('.unit-panel h3')?.textContent ?? null,
      cityOpen: !!document.querySelector('.city-panel'),
      toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()),
    };
  });
const api = (body) => page.evaluate(`(async () => { const w = window.__alvorada; ${body} })()`);
const clickBtn = (sel, text) =>
  page.evaluate(
    ({ sel, text }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
      if (el) { el.click(); return true; }
      return false;
    },
    { sel, text },
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = async (label, extra = {}) => {
  const s = await state();
  log.push({ step: step + 1, label, ...extra, state: s });
};

// --- 1. fresh game ---
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await sleep(500);
await page.evaluate((s) => {
  const input = document.querySelector('.seed-input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, s);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, seed);
await clickBtn('.btn--primary', 'Begin');
await sleep(1500);
await note('game-start');
await shoot('game-start');

// --- 2. select starting units, inspect ---
const start = await api('return (() => { const g = w().game; const u = Object.values(g.units).filter(x => x.owner === w().viewingPlayer); return u.length ? { q: u[0].q, r: u[0].r } : null; })()');
await api(`w().clickHex(${start.q}, ${start.r})`);
await sleep(300);
await note('first-click');
await shoot('first-click');

// cycle to the settler
let sel = await page.evaluate(() => document.querySelector('.unit-panel h3')?.textContent);
if (sel !== 'Settler') {
  await api(`w().clickHex(${start.q}, ${start.r})`);
  await sleep(300);
}
await note('settler-selected');
await shoot('settler-selected');

// --- 3. found the capital ---
await clickBtn('.unit-panel .btn', 'Found City');
await sleep(600);
await note('city-founded');
await shoot('city-founded');

// --- 4. open the city, set production to a worker ---
await api('return (() => { const g = w().game; const c = Object.values(g.cities).find(x => x.owner === w().viewingPlayer); if (c) w().selectCity(c.id); return c?.id; })()');
await sleep(400);
await note('city-open');
await shoot('city-open');
const setProd = await clickBtn('.prod-item .nm', 'Worker');
await sleep(400);
await note('prod-set', { setProd });
await shoot('prod-set');
await page.keyboard.press('Escape');

// --- 5. research via tech tree ---
await page.keyboard.press('KeyT');
await sleep(400);
await shoot('tech-open');
const setTech = await clickBtn('.tech-node.is-available h4', 'Pottery');
await sleep(400);
await note('tech-set', { setTech });
await page.keyboard.press('Escape');
await sleep(300);

// --- 6. move the warrior to explore (a few tiles east) ---
const warrior = await api('return (() => { const g = w().game; const u = Object.values(g.units).find(x => x.owner === w().viewingPlayer && x.def === "warrior"); return u ? { id: u.id, q: u.q, r: u.r } : null; })()');
if (warrior) {
  await api(`w().clickHex(${warrior.q}, ${warrior.r})`);
  await sleep(300);
  await note('warrior-selected', { warrior });
  await shoot('warrior-selected');
  // move 3 east
  await api(`w().clickHex(${warrior.q + 3}, ${warrior.r})`);
  await sleep(500);
  await note('warrior-moved');
  await shoot('warrior-moved');
}

// --- 7. end a few turns, observe AI ---
for (let t = 0; t < 4; t++) {
  // skip any idle units so end-turn isn't blocked, then end
  await page.evaluate(() => {
    const a = window.__alvorada();
    const g = a.game;
    const pid = a.viewingPlayer;
    for (const u of Object.values(g.units)) {
      if (u.owner === pid && u.moves > 0 && !u.order) {
        // skip via the public action path
      }
    }
  });
  await page.keyboard.press('Space'); // skip selected
  await sleep(150);
  await page.keyboard.press('Enter'); // end turn (may open a blocker)
  await sleep(2500);
  await note(`after-end-${t}`);
}
await shoot('after-turns');

// --- 8. look at the capital up close now ---
const cap = await api('return (() => { const g = w().game; const c = Object.values(g.cities).find(x => x.owner === w().viewingPlayer); return c ? { q: c.q, r: c.r, id: c.id } : null; })()');
if (cap) {
  await api(`w().view(${cap.q}, ${cap.r}, 1.4)`);
  await sleep(400);
  await shoot('capital-now');
}

console.log(JSON.stringify({ errors, log }, null, 2));
await browser.close();
