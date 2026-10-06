import { registerFileHandlers } from './files.js';
import { registerPocketHandlers } from './pocket.js';
import { registerExportHandlers } from './export.js';
import { registerNetworkHandlers } from './network.js';

/** Register every ipcMain.handle() channel used by electron/preload.cjs. */
export function registerIpcHandlers() {
  registerFileHandlers();
  registerPocketHandlers();
  registerExportHandlers();
  registerNetworkHandlers();
}
