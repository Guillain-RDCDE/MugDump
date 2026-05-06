const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File I/O
  openSavFile: () => ipcRenderer.invoke('open-sav-file'),
  detectPocket: () => ipcRenderer.invoke('detect-pocket'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // Export
  savePng: (dataUrl, defaultName) => ipcRenderer.invoke('save-png', dataUrl, defaultName),
  savePngBatch: (photos) => ipcRenderer.invoke('save-png-batch', photos),
  saveGif: (options) => ipcRenderer.invoke('save-gif', options),
  exportSav: (buffer, defaultName) => ipcRenderer.invoke('export-sav', { buffer, defaultName }),
  saveProject: (json, defaultName) => ipcRenderer.invoke('save-project', { json, defaultName }),
  openProject: () => ipcRenderer.invoke('open-project'),

  // Shell
  revealInFinder: (filePath) => ipcRenderer.invoke('reveal-in-finder', filePath),

  // Network (bypasses renderer CSP/CORS — used for Lospec palette import)
  fetchJson: (url) => ipcRenderer.invoke('fetch-json', url),

  // Menu events (main → renderer)
  onMenuOpenSav: (cb) => ipcRenderer.on('menu-open-sav', cb),
  onMenuOpenPocket: (cb) => ipcRenderer.on('menu-open-pocket', cb),
  onMenuExportAll: (cb) => ipcRenderer.on('menu-export-all', cb),
});
