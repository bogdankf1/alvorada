// Autosave round-trip: play, reload, Continue, verify the turn survived.
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5198 }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'shell',
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5198', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('.choice')].find((e) => e.textContent.includes('Duel')).click());
await page.evaluate(() => [...document.querySelectorAll('.btn--primary')].find((e) => e.textContent.includes('Begin')).click());
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => window.__alvorada().debugAutoplay(3));
await new Promise((r) => setTimeout(r, 5000));
const before = await page.evaluate(() => window.__alvorada().game.turn);
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const hasContinue = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.btn')].find((e) => e.textContent.includes('Continue'));
  if (btn) btn.click();
  return !!btn;
});
await new Promise((r) => setTimeout(r, 1200));
const after = await page.evaluate(() => window.__alvorada()?.game?.turn ?? null);
console.log(JSON.stringify({ before, hasContinue, after, errors: errors.length }));
await browser.close();
await server.close();
process.exit(hasContinue && after === before && errors.length === 0 ? 0 : 1);
