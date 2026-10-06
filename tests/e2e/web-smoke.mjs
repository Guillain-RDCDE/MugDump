/**
 * Web end-to-end scenarios against the built docs/ folder: file loading,
 * palettes, effects, exports, GIF builder, projects, dated albums, presets,
 * custom palettes, persistence and keyboard shortcuts.
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a specific Chromium binary.
 */
import JSZip from 'jszip';
import { buildSta, defaultSav } from '../fixtures/synthetic-sav.mjs';
import {
  downloadBytes,
  dropFile,
  expect,
  launchBrowser,
  serveDocs,
  setInput,
  trackErrors,
} from './helpers.mjs';

const server = await serveDocs();
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = trackErrors(page);
const isGif = (b) => b.subarray(0, 6).toString('latin1') === 'GIF89a';
const isPng = (b) => b.subarray(1, 4).toString('latin1') === 'PNG';

await page.goto(server.url);
await page.waitForSelector('#welcome');
expect(await page.evaluate(() => document.body.classList.contains('web')), 'web build detected');
expect(
  /^\d+\.\d+\.\d+$/.test((await page.textContent('#app-version')).trim()),
  'version label comes from package.json',
);

// ── Loading ───────────────────────────────────────────────────────────────
await dropFile(page, defaultSav(), 'GBCAMERA.sav');
await page.waitForSelector('#main:visible .photo-slot');
expect(
  (await page.locator('.photo-slot:not(.empty)').count()) === 4,
  '4 photos decoded from a dropped .sav',
);
expect(
  /4 photos found/.test(await page.textContent('#status-text')),
  'status bar reports the count',
);

// ── Palette + effects + tone + border ─────────────────────────────────────
await page.click('.photo-slot[data-index="0"]');
await page.click('#palette-picker-btn');
await page.fill('#palette-picker-search', 'pocket');
expect(
  (await page.locator('#palette-picker-list .pal-item:visible').count()) > 0,
  'palette search filters the list',
);
await page.click('.pal-item[data-palette="pocket"]');
expect(
  (await page.textContent('#palette-picker-name')) === 'GB Pocket',
  'palette switched to GB Pocket',
);

await page.click('#effects-controls .section-label');
await page.click('.fi-group-header[data-group="retro"]');
await page.click('.fi-item[data-filter="crt"] .fi-check-wrap');
expect(
  await page.isChecked('.section-check[data-section="effects"]'),
  'ticking an effect enables the Effects section',
);
await page.click('#border-controls .section-label');
await page.click('.border-frame-btn[data-frame-id="int-frame-3"]');
expect(await page.isChecked('#border-enabled-check'), 'picking a frame enables the border');
await page.click('#exposure-controls .section-label');
await setInput(page, '#tone-brightness', 25);
expect(
  await page.isChecked('.section-check[data-section="exposure"]'),
  'moving a tone slider enables its section',
);

// ── Exports ───────────────────────────────────────────────────────────────
const single = await downloadBytes(page, () => page.click('#btn-export-single'));
expect(
  isPng(single.bytes) && single.name === 'gbcam_01_pocket_20x_crt.png',
  `single PNG export named ${single.name}`,
);
await page.click('.scale-btn[data-scale="custom"]');
await setInput(page, '#custom-width', 640);
const custom = await downloadBytes(page, () => page.click('#btn-export-single'));
expect(
  custom.name === 'gbcam_01_pocket_640px_crt.png',
  'custom-size export no longer crashes and is named by width',
);
await page.click('.scale-btn[data-scale="8"]');
const sheet = await downloadBytes(page, () =>
  page.evaluate(() => document.getElementById('btn-contact-sheet').click()),
);
expect(
  isPng(sheet.bytes) && sheet.name === 'gbcam_contact_dmg.png',
  'contact sheet exported (named after the global palette)',
);
const all = await downloadBytes(page, () => page.click('#btn-export-all'));
const allZip = await JSZip.loadAsync(all.bytes);
expect(
  Object.keys(allZip.files).length === 4 && all.name === 'mugdump-photos.zip',
  'export-all zips the 4 photos',
);

// ── Undo / copy / paste ───────────────────────────────────────────────────
await page.keyboard.press('Control+c');
await page.click('.photo-slot[data-index="1"]');
await page.keyboard.press('Control+v');
expect(
  (await page.locator('.photo-slot[data-index="1"].has-photo-settings').count()) === 1,
  'paste gives photo 2 its own settings',
);
await page.keyboard.press('Control+z');
expect(
  (await page.locator('.photo-slot[data-index="1"].has-photo-settings').count()) === 0,
  'undo removes them again',
);

// ── Solo view + keyboard ──────────────────────────────────────────────────
await page.click('#btn-view-solo');
expect((await page.locator('#grid-panel.solo-mode').count()) === 1, 'solo view opens');
await page.keyboard.press('ArrowRight');
expect(/Photo 3/.test(await page.textContent('#solo-label')), 'arrow keys step to the next photo');
await page.keyboard.press('r');
expect(/90°/.test(await page.textContent('#solo-meta')), 'R rotates the photo');
await page.keyboard.press('l');
await page.keyboard.press('Escape');
expect((await page.locator('#grid-panel.solo-mode').count()) === 0, 'Escape returns to the grid');

// ── GIF builder ───────────────────────────────────────────────────────────
await page.click('.fmt-btn[data-fmt="gif"]');
for (const i of [0, 1, 2]) await page.click(`.photo-slot[data-index="${i}"]`);
expect((await page.textContent('#gif-count')) === '3 frames', 'three frames added to the GIF');
expect((await page.locator('.gif-chip').count()) === 3, 'frame strip shows the chips');
await page.click('.gif-chip:nth-child(2) .gif-chip-dup');
expect((await page.textContent('#gif-count')) === '4 frames', 'a frame can be duplicated');
await page.click('.gif-chip:nth-child(2) .gif-chip-remove');
await page.click('.gif-loop-btn[data-loop="once"]');
const once = await downloadBytes(page, () => page.click('#btn-export-gif'));
expect(isGif(once.bytes) && !once.bytes.includes('NETSCAPE2.0'), '"Once" GIF has no loop block');
await page.click('.gif-loop-btn[data-loop="bounce"]');
const bounce = await downloadBytes(page, () => page.click('#btn-export-gif'));
expect(
  isGif(bounce.bytes) &&
    bounce.bytes.includes('NETSCAPE2.0') &&
    bounce.name.endsWith('_bounce.gif'),
  'bounce GIF loops',
);
await page.click('#gif-cancel');
expect((await page.locator('#gif-toolbar.visible').count()) === 0, 'cancel leaves GIF mode');

// ── Presets ───────────────────────────────────────────────────────────────
await page.click('.photo-slot[data-index="0"]');
page.once('dialog', (d) => d.accept('Warm CRT'));
await page.click('#btn-save-preset');
expect(
  (await page.locator('#preset-select option[value="Warm CRT"]').count()) === 1,
  'preset saved to the list',
);
await page.click('.photo-slot[data-index="2"]');
await page.selectOption('#preset-select', 'Warm CRT');
await page.click('#btn-load-preset');
expect(
  (await page.locator('.photo-slot[data-index="2"].has-photo-settings').count()) === 1,
  'preset applied to photo 3',
);

// ── Custom palette ────────────────────────────────────────────────────────
await page.click('#palette-picker-btn');
await page.click('#btn-new-palette');
await page.fill('#palette-name-input', 'E2E Teal');
await page.fill('#palette-lospec-url', '#e0fff4 #70d6b0 #237a5a #0b2a1e');
await page.click('#btn-lospec-import');
expect(
  /4 colors imported/.test(await page.textContent('#lospec-status')),
  'hex list imported into the editor',
);
await page.click('#palette-modal-save');
expect(
  (await page.textContent('#palette-picker-name')) === 'E2E Teal',
  'custom palette saved and selected',
);

// ── Project round trip ────────────────────────────────────────────────────
const project = await downloadBytes(page, () => page.click('#tb-save-project'));
expect(project.name === 'GBCAMERA.gbcp', 'project saved as .gbcp');
await page.click('#btn-home');
await page.waitForSelector('#welcome:not(.hidden)');
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('#tb-open-project'),
]);
await chooser.setFiles({ name: project.name, mimeType: 'application/json', buffer: project.bytes });
await page.waitForSelector('#main:visible .photo-slot');
// The custom palette was applied while photo 3 was selected, so it is a per-photo
// setting; the global palette stayed DMG.
expect(
  (await page.textContent('#palette-picker-name')) === 'DMG Green',
  'project restores the global palette',
);
await page.click('.photo-slot[data-index="2"]');
expect(
  (await page.textContent('#palette-picker-name')) === 'E2E Teal',
  'project restores the per-photo custom palette',
);
expect(
  (await page.locator('.photo-slot[data-index="2"].has-photo-settings').count()) === 1,
  'project restores per-photo settings and repaints',
);
await page.click('.photo-slot[data-index="0"]');
expect((await page.inputValue('#tone-brightness')) === '25', 'project restores tone values');

// ── Dated albums from savestates ──────────────────────────────────────────
await page.click('#btn-home');
await page.waitForSelector('#welcome:not(.hidden)');
await page.fill('#album-date-filter', '2026-07');
const sta = Buffer.from(buildSta(defaultSav()));
const [albumChooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('#btn-develop-albums'),
]);
await albumChooser.setFiles([
  { name: '20260704_120000_Play Cartridge.sta', mimeType: 'application/octet-stream', buffer: sta },
  { name: '20260705_090000_Play Cartridge.sta', mimeType: 'application/octet-stream', buffer: sta },
  { name: '20260812_090000_Play Cartridge.sta', mimeType: 'application/octet-stream', buffer: sta },
  { name: 'junk.sta', mimeType: 'application/octet-stream', buffer: Buffer.alloc(300) },
]);
const albums = await downloadBytes(page, () => Promise.resolve());
const albumZip = await JSZip.loadAsync(albums.bytes);
const albumFiles = Object.keys(albumZip.files)
  .filter((f) => f.endsWith('.png'))
  .sort();
expect(
  albums.name === 'mugdump-albums.zip' && albumFiles.length === 8,
  'two July savestates → 2 dated albums of 4 photos',
);
expect(
  albumFiles[0] === '2026-07-04_12-00-00/2026-07-04_12-00-00_01.png',
  `album folders are dated (${albumFiles[0]})`,
);
expect(!albumFiles.some((f) => f.startsWith('2026-08')), 'the August savestate was filtered out');

// ── Persistence across reload ─────────────────────────────────────────────
await page.click('#theme-toggle');
await page.reload();
await page.waitForSelector('#welcome');
expect(
  await page.evaluate(() => document.documentElement.classList.contains('theme-light')),
  'light theme remembered',
);
await page.click('#palette-picker-btn');
expect(
  (await page.locator('.pal-item[data-palette^="custom_"]').count()) === 1,
  'custom palette remembered',
);
expect(
  (await page.locator('#preset-select option[value="Warm CRT"]').count()) === 1,
  'preset remembered',
);

await browser.close();
server.close();
errors.check();
console.log('web e2e OK');
