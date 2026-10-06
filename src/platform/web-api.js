import { SAVE_FILE_ACCEPT as SAVE_ACCEPT } from './pick-files.js';

/**
 * Browser implementation of the platform API (the desktop build gets the same
 * surface from electron/preload.cjs). See platform/index.js for the contract.
 *
 * Browser notes:
 *  - File System Access API (showOpenFilePicker / showDirectoryPicker): Chrome
 *    and Edge only. Falls back to <input type=file> elsewhere.
 *  - Batch PNG export is zipped client-side (JSZip, loaded on demand).
 */

const SRAM_SIZE = 131072;

/** Walk an Analogue Pocket SD card (picked by the user) for 128 KB camera saves. */
async function scanDirForSavFiles(dirHandle, volumeName, saves, depth = 0) {
  if (depth > 5) return;
  // Only descend into the folders where the Pocket keeps saves.
  const scanDirs = new Set([
    'memories',
    'save states',
    'saves',
    'gb',
    'gbc',
    'game boy',
    'gamegear',
    'analogue.gb',
    'analogue.gbc',
  ]);
  try {
    for await (const [name, handle] of dirHandle) {
      if (handle.kind === 'directory') {
        if (scanDirs.has(name.toLowerCase())) {
          await scanDirForSavFiles(handle, volumeName, saves, depth + 1);
        }
      } else if (handle.kind === 'file' && /\.(sav|srm)$/i.test(name)) {
        try {
          const file = await handle.getFile();
          if (file.size === SRAM_SIZE) {
            // Keep the containing directory handle so we can removeEntry() later.
            saves.push({
              name,
              handle,
              parent: dirHandle,
              volume: volumeName,
              path: `${volumeName}/${name}`,
            });
          }
        } catch {}
      }
    }
  } catch {}
}

function triggerDownload(url, filename) {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return filename;
}

/** Open a native file picker and resolve with the chosen File (or null). */
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export function createWebApi() {
  return {
    async openSavFile() {
      if ('showOpenFilePicker' in window) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [
              {
                description: 'Game Boy Camera Save / Savestate',
                accept: { 'application/octet-stream': SAVE_ACCEPT.split(',') },
              },
            ],
            multiple: false,
          });
          const file = await handle.getFile();
          return { buffer: await file.arrayBuffer(), name: file.name, path: null };
        } catch (e) {
          return e.name === 'AbortError' ? null : { error: e.message };
        }
      }
      const file = await pickFile(SAVE_ACCEPT);
      if (!file) return null;
      return { buffer: await file.arrayBuffer(), name: file.name, path: null };
    },

    getPathForFile() {
      return null; // browsers never expose real paths
    },

    async detectPocket() {
      if (!('showDirectoryPicker' in window)) return { saves: [], unsupported: true };
      try {
        const root = await window.showDirectoryPicker({ mode: 'read', startIn: 'desktop' });
        const saves = [];
        await scanDirForSavFiles(root, root.name, saves);
        return { saves };
      } catch {
        return { saves: [] };
      }
    },

    async readFile(save) {
      try {
        const file = await save.handle.getFile();
        return { buffer: await file.arrayBuffer(), name: file.name, path: null };
      } catch (e) {
        return { error: e.message };
      }
    },

    // Write permission is requested lazily here (on the user's click) so the
    // initial directory pick can stay read-only.
    async deletePocketSave(save) {
      if (!save?.parent || typeof save.parent.removeEntry !== 'function') {
        return { error: "This browser can't delete files. Try the desktop app." };
      }
      const ok = window.confirm(
        `Delete "${save.name}" from your SD card?\n\nThis permanently removes the file. This cannot be undone.`,
      );
      if (!ok) return { canceled: true };
      try {
        if (save.parent.requestPermission) {
          const perm = await save.parent.requestPermission({ mode: 'readwrite' });
          if (perm !== 'granted') return { error: 'Write permission was denied.' };
        }
        await save.parent.removeEntry(save.name);
        return { deleted: true };
      } catch (e) {
        return { error: e.message };
      }
    },

    async savePng(dataUrl, filename) {
      triggerDownload(dataUrl, filename);
      return filename;
    },

    // `name` may include a "folder/" prefix — JSZip creates the sub-folders.
    async savePngBatch(photos, zipName = 'mugdump-photos.zip') {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const { dataUrl, name } of photos)
        zip.file(name, dataUrl.split(',')[1], { base64: true });
      downloadBlob(await zip.generateAsync({ type: 'blob' }), zipName);
      return { dir: '.', count: photos.length, zipped: true };
    },

    async saveGif({ bytes, defaultName }) {
      return downloadBlob(
        new Blob([bytes], { type: 'image/gif' }),
        defaultName || 'gbcam-animation.gif',
      );
    },

    async exportSav(buffer, defaultName) {
      return downloadBlob(new Blob([buffer], { type: 'application/octet-stream' }), defaultName);
    },

    async saveProject(json, defaultName) {
      return downloadBlob(new Blob([json], { type: 'application/json' }), defaultName);
    },

    async openProject() {
      const file = await pickFile('.gbcp');
      if (!file) return null;
      try {
        return { json: await file.text(), name: file.name };
      } catch (e) {
        return { error: e.message };
      }
    },

    async fetchJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    // No native menu bar on the web — these never fire.
    onMenuOpenSav() {},
    onMenuOpenPocket() {},
    onMenuExportAll() {},
  };
}
