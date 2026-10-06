/**
 * Visual regression — capture.
 *
 * Drives a built MugDump web app (a docs/ folder) through a fixed scenario and
 * saves screenshots plus exported files (PNG, contact sheet, GIF), so two builds
 * can be compared pixel-for-pixel with compare.mjs:
 *
 *   git worktree add /tmp/mugdump-ref <known-good-commit>
 *   (cd /tmp/mugdump-ref && npm ci && npm run build)
 *   node tests/e2e/visual/capture.mjs /tmp/mugdump-ref/docs /tmp/visual/ref
 *   npm run build && node tests/e2e/visual/capture.mjs docs /tmp/visual/new
 *   node tests/e2e/visual/compare.mjs /tmp/visual/ref /tmp/visual/new
 *
 * Captures are deterministic on a given machine (CSS transitions are disabled,
 * the toast and version label are neutralised); compare across machines with
 * care, since fonts and Chromium versions differ.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';
import { defaultSav } from '../../fixtures/synthetic-sav.mjs';

const [root, out, portArg] = process.argv.slice(2);
const port = Number(portArg || 0);
mkdirSync(out, { recursive: true });
const server = await serve(root, port);
const baseUrl = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  window.showDirectoryPicker = () => Promise.reject(new DOMException('cancelled', 'AbortError'));
  try {
    localStorage.clear();
  } catch {}
});

const shot = async (name, opts = {}) => {
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    animations: 'disabled',
    mask: [page.locator('#toast')],
    ...opts,
  });
  console.log('shot', name);
};
const download = async (name, trigger) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), trigger()]);
  await dl.saveAs(path.join(out, name));
  console.log('download', name, dl.suggestedFilename());
};
const setRange = (sel, v) =>
  page.evaluate(
    ([s, val]) => {
      const el = document.querySelector(s);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [sel, v],
  );

await page.goto(baseUrl);
await page.waitForSelector('#welcome');
await page.addStyleTag({
  content:
    '#app-version { visibility: hidden; } *, *::before, *::after { transition: none !important; animation: none !important; }',
});
await shot('01-welcome');

const sav = Array.from(defaultSav());
await page.evaluate((bytes) => {
  const file = new File([new Uint8Array(bytes)], 'GBCAMERA.sav');
  const dt = new DataTransfer();
  dt.items.add(file);
  document.dispatchEvent(
    new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
  );
  document.dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
  );
}, sav);
await page.waitForSelector('#main:visible .photo-slot');
await page.waitForTimeout(600);
await shot('02-grid');

await page.click('.photo-slot[data-index="0"]');
await shot('03-selected');

await page.click('#palette-picker-btn');
await shot('04-picker');
await page.click('.pal-item[data-palette="pocket"]');
await shot('05-pocket-palette');

await page.click('#effects-controls .section-label');
await page.click('.fi-group-header[data-group="retro"]');
await page.click('.fi-item[data-filter="crt"] .fi-check-wrap');
await page.click('.fi-item[data-filter="vignette"] .fi-check-wrap');
await shot('06-effects');

await page.click('#border-controls .section-label');
await page.click('.border-frame-btn[data-frame-id="int-frame-3"]');
await shot('07-border');

await page.click('#exposure-controls .section-label');
await setRange('#tone-brightness', '30');
await page.click('#split-tone-controls .section-label');
await setRange('#tone-intensity', '40');
await shot('08-tone');

await download('export-single.png', () => page.click('#btn-export-single'));
await download('export-contact.png', () =>
  page.evaluate(() => document.getElementById('btn-contact-sheet').click()),
);

await page.click('#btn-view-solo');
await shot('09-solo');
await page.keyboard.press('r');
await shot('10-solo-rotated');
await page.keyboard.press('l');
await page.click('#btn-view-grid');

await page.click('.fmt-btn[data-fmt="gif"]');
await setRange('#gif-delay', '2000');
await page.click('.photo-slot[data-index="0"]');
await page.click('.photo-slot[data-index="1"]');
await page.click('.photo-slot[data-index="2"]');
await page.click('.gif-loop-btn[data-loop="bounce"]');
await shot('11-gif', { mask: [page.locator('#toast'), page.locator('#sidebar-preview-wrap')] });
await download('export-anim.gif', () => page.click('#btn-export-gif'));
await page.click('#gif-cancel');

await page.click('#btn-palette-grid');
await page.waitForFunction(
  () => document.querySelectorAll('#palette-grid-list .pgrid-cell').length > 400,
);
await page.waitForTimeout(1500);
await shot('12-palette-grid');
await page.click('#palette-grid-close');

await page.click('#palette-picker-btn');
await page.click('#btn-new-palette');
await shot('13-palette-editor');
await page.click('#palette-modal-cancel');

await page.keyboard.press('f');
await shot('14-presentation');
await page.keyboard.press('Escape');

await page.click('#theme-toggle');
await shot('15-light');
await page.click('#theme-toggle');

await page.click('#tb-open-pocket');
await page.waitForTimeout(500);
await shot('16-pocket');
await page.click('#pocket-cancel');

await page.keyboard.press('Control+z');
await shot('17-undo');

// ── Effects sweep: export every effect on its own (border on, tone as set above) ──
await page.click('.scale-btn[data-scale="8"]');
for (const g of ['crisp', 'retro', 'glitch']) {
  const header = page.locator(`.fi-group-header[data-group="${g}"]`);
  if ((await header.getAttribute('class')).includes('collapsed')) await header.click();
}
const filterIds = await page.$$eval('.fi-item', (items) => items.map((i) => i.dataset.filter));
const setOnly = async (ids) => {
  const checked = await page.$$eval('.fi-check', (cbs) =>
    /** @type {HTMLInputElement[]} */ (cbs).filter((c) => c.checked).map((c) => c.dataset.filter),
  );
  for (const id of filterIds) {
    const want = ids.includes(id);
    if (checked.includes(id) !== want)
      await page.click(`.fi-item[data-filter="${id}"] .fi-check-wrap`);
  }
};
for (const id of filterIds) {
  await setOnly([id]);
  await download(`fx-${id}.png`, () => page.click('#btn-export-single'));
}
await setOnly(['crt', 'grid', 'noise']);
await download('fx-stack.png', () => page.click('#btn-export-single'));
await page.click('#filter-scope-check'); // filters on the photo only, border untouched
await download('fx-scope-photo.png', () => page.click('#btn-export-single'));
await page.click('#filter-scope-check');
await setOnly([]);
await setRange('#tone-contrast', '60');
await setRange('#tone-balance', '-70');
await download('tone-contrast-balance.png', () => page.click('#btn-export-single'));
await page.click('.scale-btn[data-scale="20"]');

await page.setViewportSize({ width: 1000, height: 700 });
await shot('18-tablet');
await page.setViewportSize({ width: 760, height: 900 });
await shot('19-narrow');
await page.setViewportSize({ width: 1400, height: 900 });

await page.click('#btn-home');
await shot('20-home');

writeFileSync(path.join(out, 'console.log'), logs.join('\n'));
console.log('console issues:', logs.length);
await browser.close();
server.close();
