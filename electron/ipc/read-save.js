/**
 * Reading camera saves from disk for the renderer.
 *
 * The renderer may only ask for files the user handed to the app: a path
 * chosen in an open dialog, a file dropped on the window, or a save found on
 * an Analogue Pocket card by `detect-pocket`. Main records those paths here;
 * `read-file` refuses anything else. Kept free of Electron imports so it can
 * be unit-tested under plain Node.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { coerceGbCamSave } from '../../src/core/savestate.js';

/**
 * Largest file read-file will load. A save is 128 KB and a Game Boy
 * savestate a few hundred KB; anything near this is not a camera save.
 */
export const MAX_SAVE_FILE_BYTES = 8 * 1024 * 1024;

export function assertString(value, what) {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`${what} must be a non-empty string`);
  return value;
}

/** A Uint8Array view → a standalone ArrayBuffer (structured-clone friendly). */
export const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

/** Normalise a path for comparison (case-insensitive file systems on Windows and macOS). */
const keyOf = (p) => {
  const abs = path.resolve(p);
  return process.platform === 'linux' ? abs : abs.toLowerCase();
};

/** Paths the user handed to the app during this session. */
export function createPathAllowList() {
  const allowed = new Set();
  return {
    /** @param {string} filePath */
    allow(filePath) {
      if (typeof filePath === 'string' && path.isAbsolute(filePath)) allowed.add(keyOf(filePath));
    },
    /** @param {string} filePath */
    has(filePath) {
      return (
        typeof filePath === 'string' && path.isAbsolute(filePath) && allowed.has(keyOf(filePath))
      );
    },
  };
}

/**
 * Read a GB Camera save from disk, accepting a raw 128 KB .sav/.srm or a
 * Pocket savestate that embeds one. The size is checked before reading so a
 * huge or special file is never loaded into memory.
 * @param {string} filePath
 */
export async function readCameraSave(filePath) {
  assertString(filePath, 'file path');
  const st = await fsp.stat(filePath);
  if (!st.isFile()) return { error: 'Not a regular file.' };
  if (st.size > MAX_SAVE_FILE_BYTES) {
    return {
      error: `File too large: ${st.size} bytes (a GB Camera save or savestate is well under ${MAX_SAVE_FILE_BYTES}).`,
    };
  }
  const raw = await fsp.readFile(filePath);
  const sav = coerceGbCamSave(raw);
  if (!sav) {
    return {
      error: `Unexpected file size: ${raw.length} bytes (expected 131072, or a savestate containing a GB Camera save).`,
    };
  }
  return { buffer: toArrayBuffer(sav), name: path.basename(filePath), path: filePath };
}

/**
 * read-file: only a path the user handed to the app, then readCameraSave().
 * @param {ReturnType<typeof createPathAllowList>} allowList
 * @param {unknown} filePath
 */
export async function readAllowedCameraSave(allowList, filePath) {
  try {
    assertString(filePath, 'file path');
    if (!allowList.has(/** @type {string} */ (filePath))) {
      return {
        error: 'Refusing to read a file that was not opened, dropped or found on a Pocket.',
      };
    }
    return await readCameraSave(/** @type {string} */ (filePath));
  } catch (e) {
    return { error: e.message };
  }
}
