import { BrowserWindow } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { coerceGbCamSave } from '../../src/core/savestate.js';

/** The window that sent an IPC message — used as the parent for native dialogs. */
export const windowOf = (event) => BrowserWindow.fromWebContents(event.sender);

/** A Uint8Array view → a standalone ArrayBuffer (structured-clone friendly). */
export const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

export function assertString(value, what) {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`${what} must be a non-empty string`);
  return value;
}

/**
 * Read a GB Camera save from disk, accepting a raw 128 KB .sav/.srm or a
 * Pocket savestate that embeds one.
 */
export async function readCameraSave(filePath) {
  assertString(filePath, 'file path');
  const raw = await fsp.readFile(filePath);
  const sav = coerceGbCamSave(raw);
  if (!sav) {
    return {
      error: `Unexpected file size: ${raw.length} bytes (expected 131072, or a savestate containing a GB Camera save).`,
    };
  }
  return { buffer: toArrayBuffer(sav), name: path.basename(filePath), path: filePath };
}

const PNG_DATA_URL = /^data:image\/png;base64,/;

/** Decode a PNG data URL produced by canvas.toDataURL() into bytes. */
export function pngDataUrlToBuffer(dataUrl) {
  assertString(dataUrl, 'data URL');
  if (!PNG_DATA_URL.test(dataUrl)) throw new TypeError('Expected a PNG data URL');
  return Buffer.from(dataUrl.replace(PNG_DATA_URL, ''), 'base64');
}
