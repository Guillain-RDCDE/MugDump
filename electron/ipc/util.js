import { BrowserWindow } from 'electron';
import { assertString } from './read-save.js';

export { assertString, readCameraSave, toArrayBuffer } from './read-save.js';

/** The window that sent an IPC message — used as the parent for native dialogs. */
export const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

const PNG_DATA_URL = /^data:image\/png;base64,/;

/** Decode a PNG data URL produced by canvas.toDataURL() into bytes. */
export function pngDataUrlToBuffer(dataUrl) {
  assertString(dataUrl, 'data URL');
  if (!PNG_DATA_URL.test(dataUrl)) throw new TypeError('Expected a PNG data URL');
  return Buffer.from(dataUrl.replace(PNG_DATA_URL, ''), 'base64');
}
