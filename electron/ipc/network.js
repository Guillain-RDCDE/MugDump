import { ipcMain } from 'electron';

/** Hosts the renderer may fetch JSON from through the main process. */
const ALLOWED_HOSTS = new Set(['lospec.com']);

export function registerNetworkHandlers() {
  ipcMain.handle('fetch-json', async (_event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new Error(`Refusing to fetch ${parsed.hostname}`);
    }
    const res = await fetch(parsed);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}
