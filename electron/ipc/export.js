import { dialog, ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { assertString, pngDataUrlToBuffer, windowOf } from './util.js';

export function registerExportHandlers() {
  ipcMain.handle('save-png', async (event, dataUrl, defaultName) => {
    const bytes = pngDataUrlToBuffer(dataUrl);
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(event), {
      title: 'Export Photo as PNG',
      defaultPath: defaultName,
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, bytes);
    return filePath;
  });

  // photos: [{ dataUrl, name }] — `name` may include a sub-folder (dated albums).
  ipcMain.handle('save-png-batch', async (event, photos) => {
    if (!Array.isArray(photos)) throw new TypeError('photos must be an array');
    const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(event), {
      title: 'Choose folder for batch export',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const dir = filePaths[0];
    for (const { dataUrl, name } of photos) {
      const outPath = path.join(dir, assertString(name, 'file name'));
      if (!outPath.startsWith(dir + path.sep)) throw new Error(`Refusing to write outside ${dir}`);
      await fsp.mkdir(path.dirname(outPath), { recursive: true });
      await fsp.writeFile(outPath, pngDataUrlToBuffer(dataUrl));
    }
    return { dir, count: photos.length };
  });

  // The GIF is encoded in the renderer (src/core/gif.js); main only writes bytes.
  ipcMain.handle('save-gif', async (event, { bytes, defaultName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(event), {
      title: 'Export Animated GIF',
      defaultPath: defaultName || 'gbcam-animation.gif',
      filters: [{ name: 'GIF Images', extensions: ['gif'] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, Buffer.from(bytes));
    return filePath;
  });
}
