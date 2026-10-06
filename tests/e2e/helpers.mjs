/** Shared helpers for the Playwright end-to-end scripts. */
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Serve the built docs/ folder on a random port; resolves with { url, close }. */
export async function serveDocs() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(DOCS, p);
    try {
      if (!statSync(file).isFile()) throw new Error();
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { url: `http://localhost:${port}/`, close: () => server.close() };
}

export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
}

/** Collect page errors and console errors; call `.check()` at the end. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return {
    check() {
      if (errors.length) throw new Error('Page reported errors:\n' + errors.join('\n'));
    },
  };
}

/** Drop a file (bytes + name) onto the document, as a user would. */
export async function dropFile(page, bytes, name) {
  await page.evaluate(
    ({ bytes, name }) => {
      const file = new File([new Uint8Array(bytes)], name);
      const dt = new DataTransfer();
      dt.items.add(file);
      document.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    },
    { bytes: Array.from(bytes), name },
  );
}

/** Set a range/number input's value and fire the events the app listens to. */
export function setInput(page, selector, value) {
  return page.evaluate(
    ([sel, val]) => {
      const el = /** @type {HTMLInputElement} */ (document.querySelector(sel));
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [selector, String(value)],
  );
}

/** Trigger a download and return its bytes. */
export async function downloadBytes(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

/** A tiny assertion helper that prints a checklist as it goes. */
export function expect(condition, message) {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}
