/**
 * Development: start the Vite dev server (hot reload for the renderer) and
 * launch Electron pointed at it.
 */
import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.js' });
await server.listen();
const url = server.resolvedUrls.local[0];
server.printUrls();

// The electron package's default export is the path to the binary.
const electronPath = /** @type {string} */ (/** @type {unknown} */ (electron));
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
