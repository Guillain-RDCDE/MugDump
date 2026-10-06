/**
 * Preload: the only bridge between the sandboxed renderer and the main
 * process. Exposes `window.api` with the surface documented in
 * src/platform/index.js. Nothing here touches Node APIs directly.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);

/** Menu events: the callback never receives the raw IPC event object. */
const onMenu = (channel) => (callback) => {
  ipcRenderer.on(channel, () => callback());
};

contextBridge.exposeInMainWorld('api', {
  // Files
  openSavFile: invoke('open-sav-file'),
  readFile: (saveOrPath) =>
    ipcRenderer.invoke('read-file', typeof saveOrPath === 'string' ? saveOrPath : saveOrPath?.path),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null;
    } catch {
      return null;
    }
  },

  // Analogue Pocket SD card
  detectPocket: invoke('detect-pocket'),
  deletePocketSave: (save) => ipcRenderer.invoke('delete-pocket-save', save?.path),

  // Export
  savePng: invoke('save-png'),
  savePngBatch: invoke('save-png-batch'),
  saveGif: invoke('save-gif'),
  exportSav: (buffer, defaultName) => ipcRenderer.invoke('export-sav', { buffer, defaultName }),
  saveProject: (json, defaultName) => ipcRenderer.invoke('save-project', { json, defaultName }),
  openProject: invoke('open-project'),

  // Network (main process: no renderer CSP/CORS) — Lospec palette import
  fetchJson: invoke('fetch-json'),

  // Menu events (main → renderer)
  onMenuOpenSav: onMenu('menu-open-sav'),
  onMenuOpenPocket: onMenu('menu-open-pocket'),
  onMenuExportAll: onMenu('menu-export-all'),
});
