/**
 * Web smoke test: serve the built docs/ folder, load a synthetic save by
 * drag-and-drop, exercise the main views and export a PNG.
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a specific Chromium binary.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSav } from '../fixtures/synthetic-sav.mjs';

const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(DOCS, p);
  try {
    if (!statSync(file).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const expect = (cond, msg) => {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
};

await page.goto(url);
await page.waitForSelector('#welcome');
expect(await page.evaluate(() => document.body.classList.contains('web')), 'web build detected');

await page.evaluate((bytes) => {
  const file = new File([new Uint8Array(bytes)], 'GBCAMERA.sav');
  const dt = new DataTransfer();
  dt.items.add(file);
  document.dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
  );
}, Array.from(defaultSav()));
await page.waitForSelector('#main:visible .photo-slot');
expect(
  (await page.locator('.photo-slot:not(.empty)').count()) === 4,
  '4 photos decoded from the dropped save',
);

await page.click('.photo-slot[data-index="0"]');
await page.click('#palette-picker-btn');
await page.click('.pal-item[data-palette="pocket"]');
expect((await page.textContent('#palette-picker-name')) === 'GB Pocket', 'palette switched');

await page.click('#effects-controls .section-label');
await page.click('.fi-group-header[data-group="retro"]');
await page.click('.fi-item[data-filter="crt"] .fi-check-wrap');
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#btn-export-single'),
]);
expect(
  /gbcam_01_pocket_20x_crt\.png/.test(download.suggestedFilename()),
  `PNG exported as ${download.suggestedFilename()}`,
);

await page.click('#btn-view-solo');
expect((await page.locator('#grid-panel.solo-mode').count()) === 1, 'solo view opens');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');

await browser.close();
server.close();
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
console.log('web smoke OK');
