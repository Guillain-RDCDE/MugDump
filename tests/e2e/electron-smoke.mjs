/**
 * Desktop end-to-end: launch the Electron app on the built renderer, exercise
 * the preload bridge (file reading, savestate coercion, Pocket detection,
 * network allow-list) and check the UI renders a dropped save.
 * Needs a display (use `xvfb-run -a` on headless Linux).
 */
import { _electron as electron } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSta, defaultSav } from '../fixtures/synthetic-sav.mjs';
import { dropFile, expect, trackErrors } from './helpers.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mugdump-'));
const staPath = path.join(dir, '20260704_120000_Play Cartridge.sta');
writeFileSync(staPath, buildSta(defaultSav()));
const junkPath = path.join(dir, 'junk.sav');
writeFileSync(junkPath, Buffer.alloc(100));

const app = await electron.launch({ args: ['.'] });
const win = await app.firstWindow();
const errors = trackErrors(win);

await win.waitForSelector('#welcome');
const platform = await win.evaluate(() => ({
  hasApi: typeof window.api === 'object',
  isWeb: document.body.classList.contains('web'),
}));
expect(platform.hasApi && !platform.isWeb, 'preload bridge detected, desktop mode');
expect(
  await win.evaluate(() => typeof process === 'undefined' && typeof require === 'undefined'),
  'renderer has no Node globals (sandboxed)',
);

await dropFile(win, defaultSav(), 'GBCAMERA.sav');
await win.waitForSelector('#main:visible .photo-slot');
expect(
  (await win.locator('.photo-slot:not(.empty)').count()) === 4,
  '4 photos decoded from a dropped save',
);

// Results are summarised inside the page: an ArrayBuffer does not survive
// Playwright's evaluate() serialisation.
const summarise = (x) => ({
  bytes: 'buffer' in x ? x.buffer.byteLength : null,
  path: 'path' in x ? x.path : null,
  error: 'error' in x ? x.error : null,
});
const viaSta = await win.evaluate(async (p) => {
  const x = await window.api.readFile(p);
  return { bytes: 'buffer' in x ? x.buffer.byteLength : null, path: 'path' in x ? x.path : null };
}, staPath);
expect(
  viaSta.bytes === 131072 && viaSta.path === staPath,
  'read-file extracts the cart RAM from a .sta on disk',
);
const junk = summarise(await win.evaluate((p) => window.api.readFile(p), junkPath));
expect(
  /Unexpected file size/.test(junk.error),
  'read-file rejects a file that holds no camera save',
);
const badArg = summarise(
  await win.evaluate(() => window.api.readFile(/** @type {any} */ ({ path: 42 }))),
);
expect(/non-empty string/.test(badArg.error), 'read-file validates its argument');

const pocket = await win.evaluate(() => window.api.detectPocket());
expect(Array.isArray(pocket.saves), 'detect-pocket answers with a save list');
const del = await win.evaluate(
  (p) => window.api.deletePocketSave(/** @type {any} */ ({ path: p })),
  junkPath,
);
expect(
  'error' in del && /Refusing to delete/.test(del.error),
  'delete-pocket-save refuses anything but a 128 KB save',
);

const refused = await win.evaluate(() =>
  window.api.fetchJson('https://example.com/x.json').catch((e) => e.message),
);
expect(/Refusing to fetch/.test(String(refused)), 'fetch-json only allows lospec.com');

const opened = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
await win.evaluate(() => window.open('https://example.com/'));
await win.waitForTimeout(500);
const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
expect(opened === 1 && after === 1, 'window.open never spawns a second window');

if (process.env.SMOKE_SCREENSHOT) await win.screenshot({ path: process.env.SMOKE_SCREENSHOT });
await app.close();
errors.check();
console.log('electron e2e OK');
