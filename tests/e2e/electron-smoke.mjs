/**
 * Desktop smoke test: launch the Electron app on the built renderer, load a
 * synthetic save through the preload bridge and check the grid renders.
 * Needs a display (use `xvfb-run` on headless Linux).
 */
import { _electron as electron } from 'playwright';
import { defaultSav } from '../fixtures/synthetic-sav.mjs';

const app = await electron.launch({
  args: ['.', ...(process.env.ELECTRON_EXTRA_ARGS?.split(' ') ?? [])],
});
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await win.waitForSelector('#welcome');
const platform = await win.evaluate(() => ({
  hasApi: typeof window.api === 'object',
  isWeb: document.body.classList.contains('web'),
  version: document.getElementById('app-version')?.textContent.trim(),
}));
console.log('platform', platform);
if (!platform.hasApi || platform.isWeb) throw new Error('preload bridge not detected');

await win.evaluate((bytes) => {
  const file = new File([new Uint8Array(bytes)], 'GBCAMERA.sav');
  const dt = new DataTransfer();
  dt.items.add(file);
  document.dispatchEvent(
    new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
  );
}, Array.from(defaultSav()));
await win.waitForSelector('#main:visible .photo-slot');
const filled = await win.locator('.photo-slot:not(.empty)').count();
const status = await win.locator('#status-text').textContent();
console.log('slots filled:', filled, '| status:', status);
if (filled !== 4) throw new Error(`expected 4 photos, got ${filled}`);

const pocket = await win.evaluate(() => window.api.detectPocket());
console.log('detectPocket →', JSON.stringify(pocket));
if (process.env.SMOKE_SCREENSHOT) await win.screenshot({ path: process.env.SMOKE_SCREENSHOT });
await app.close();
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
console.log('electron smoke OK');
