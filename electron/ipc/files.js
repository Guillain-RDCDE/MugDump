import { dialog, ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { assertString, readCameraSave, windowOf } from './util.js';

const SAVE_FILTERS = [
  { name: 'Game Boy Camera Save / Savestate', extensions: ['sav', 'srm', 'sta'] },
  { name: 'All files', extensions: ['*'] },
];

export function registerFileHandlers() {
  ipcMain.handle('open-sav-file', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(event), {
      title: 'Open Game Boy Camera save',
      filters: SAVE_FILTERS,
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    try {
      return await readCameraSave(filePaths[0]);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('read-file', async (_event, filePath) => {
    try {
      return await readCameraSave(filePath);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('export-sav', async (event, { buffer, defaultName }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(event), {
      title: 'Export .sav file',
      defaultPath: defaultName,
      filters: [{ name: 'GB Camera Save', extensions: ['sav'] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, Buffer.from(buffer));
    return path.basename(filePath);
  });

  ipcMain.handle('save-project', async (event, { json, defaultName }) => {
    assertString(json, 'project JSON');
    const { canceled, filePath } = await dialog.showSaveDialog(windowOf(event), {
      title: 'Save MugDump Project',
      defaultPath: defaultName,
      filters: [{ name: 'GB Camera Project', extensions: ['gbcp'] }],
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, json, 'utf8');
    return path.basename(filePath);
  });

  ipcMain.handle('open-project', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(event), {
      title: 'Open MugDump Project',
      filters: [{ name: 'GB Camera Project', extensions: ['gbcp'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    try {
      const json = await fsp.readFile(filePaths[0], 'utf8');
      return { json, name: path.basename(filePaths[0]) };
    } catch (e) {
      return { error: e.message };
    }
  });
}
