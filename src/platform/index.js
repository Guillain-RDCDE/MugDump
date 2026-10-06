/**
 * Platform abstraction.
 *
 * The desktop build injects `window.api` from electron/preload.cjs before any
 * module runs; the web build falls back to the browser implementation. Both
 * expose the same surface so the rest of the app never branches on platform:
 *
 *   openSavFile()                 → { buffer, name, path } | { error } | null
 *   getPathForFile(file)          → string | null (desktop only)
 *   detectPocket()                → { saves: Save[], unsupported? }
 *   readFile(saveOrPath)          → { buffer, name, path } | { error }
 *   deletePocketSave(save)        → { deleted } | { canceled } | { error }
 *   savePng(dataUrl, name)        → saved path/name | null
 *   savePngBatch(photos, zipName) → { count, dir } | null
 *   saveGif({ bytes, defaultName })
 *   exportSav(buffer, name) · saveProject(json, name) · openProject()
 *   fetchJson(url)                → parsed JSON (Lospec import)
 *   onMenuOpenSav(cb) · onMenuOpenPocket(cb) · onMenuExportAll(cb)
 *
 * Full signatures: types/platform-api.d.ts.
 */
import { createWebApi } from './web-api.js';

export const isElectron = typeof window !== 'undefined' && Boolean(window.api);

export const api = isElectron ? window.api : createWebApi();
