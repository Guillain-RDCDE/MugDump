/**
 * web-api.js — Browser replacement for Electron's window.api (preload bridge)
 *
 * Loaded before app.js. Sets window.api so app.js works identically in both
 * the Electron desktop app and as a GitHub Pages web app.
 *
 * Browser feature notes:
 *  - File System Access API (showOpenFilePicker, showDirectoryPicker):
 *    Chrome 86+, Edge 86+. Falls back to <input type=file> on Firefox/Safari.
 *  - GIF export: loads gifenc from jsDelivr CDN on demand. Requires internet.
 *  - Batch PNG export: zips via JSZip from CDN, or downloads sequentially.
 *  - Analogue Pocket detection: user picks the SD card folder via directory picker.
 */

// ── Scale helper (shared with GIF encoding) ─────────────────────────────────

function scaleIndicesWeb(indices, w, h, scale) {
  if (scale === 1) return indices;
  const sw = w * scale, sh = h * scale;
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = indices[y * w + x];
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++)
          out[(y * scale + dy) * sw + (x * scale + dx)] = v;
    }
  return out;
}

// ── Directory scanner for Analogue Pocket detection ─────────────────────────

async function scanDirForSavFiles(dirHandle, volumeName, saves, depth = 0) {
  if (depth > 5) return; // don't recurse forever
  try {
    for await (const [name, handle] of dirHandle) {
      if (handle.kind === 'directory') {
        const lower = name.toLowerCase();
        // Recurse into known Analogue Pocket save directories:
        //  - memories/ + save states/ — AP built-in cores (Memories > Save States UI)
        //  - saves/, gb/, gbc/ etc.   — openFPGA cores
        const scanDirs = [
          'memories', 'save states', 'saves',
          'gb', 'gbc', 'game boy', 'gamegear',
          'analogue.gb', 'analogue.gbc',
        ];
        if (scanDirs.includes(lower)) {
          await scanDirForSavFiles(handle, volumeName, saves, depth + 1);
        }
      } else if (handle.kind === 'file' && ['sav','srm'].includes(name.toLowerCase().split('.').pop())) {
        try {
          const file = await handle.getFile();
          if (file.size === 131072) {
            saves.push({ name, handle, volume: volumeName, path: `${volumeName}/${name}` });
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// ── Download helper ─────────────────────────────────────────────────────────

function triggerDownload(url, filename) {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── window.api ───────────────────────────────────────────────────────────────

window.api = {

  // ── Open .sav file ─────────────────────────────────────────────────────────
  openSavFile: async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await showOpenFilePicker({
          types: [{ description: 'Game Boy Camera Save', accept: { 'application/octet-stream': ['.sav', '.SAV', '.srm', '.SRM'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        return {
          buffer,
          name: file.name,
          path: null,
          error: buffer.byteLength !== 131072 ? `Unexpected size: ${buffer.byteLength} bytes (expected 131072)` : null,
        };
      } catch (e) {
        return e.name === 'AbortError' ? null : { error: e.message };
      }
    }

    // Fallback: plain file input (Firefox, Safari)
    return new Promise(resolve => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file', accept: '.sav,.SAV,.srm,.SRM',
      });
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return resolve(null);
        const buffer = await file.arrayBuffer();
        resolve({
          buffer,
          name: file.name,
          path: null,
          error: buffer.byteLength !== 131072 ? `Unexpected size: ${buffer.byteLength} bytes` : null,
        });
      };
      input.click();
    });
  },

  // ── Analogue Pocket SD card detection ──────────────────────────────────────
  // On web: user picks the SD card root via showDirectoryPicker
  detectPocket: async () => {
    if (!('showDirectoryPicker' in window)) {
      return { saves: [], unsupported: true };
    }
    try {
      const root = await showDirectoryPicker({ mode: 'read', startIn: 'desktop' });
      const saves = [];
      await scanDirForSavFiles(root, root.name, saves);
      return { saves };
    } catch (e) {
      return { saves: [] };
    }
  },

  // ── Read a specific file ────────────────────────────────────────────────────
  // saveObj may have a .handle (FileSystemFileHandle) on web, or .path on Electron
  readFile: async (saveObj) => {
    try {
      const file = await saveObj.handle.getFile();
      const buffer = await file.arrayBuffer();
      return { buffer, name: file.name, path: null };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ── Save PNG (single) ───────────────────────────────────────────────────────
  savePng: async (dataUrl, filename) => {
    triggerDownload(dataUrl, filename);
    return filename;
  },

  // ── Save PNG batch (zip) ───────────────────────────────────────────────────
  savePngBatch: async (photos) => {
    try {
      const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
      const zip = new JSZip();
      for (const { dataUrl, name } of photos) {
        zip.file(name, dataUrl.split(',')[1], { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, 'gbcam-photos.zip');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { dir: '.', count: photos.length };
    } catch (_) {
      // Fallback: one-by-one (browsers may block multiple downloads)
      for (const { dataUrl, name } of photos) {
        triggerDownload(dataUrl, name);
        await new Promise(r => setTimeout(r, 150));
      }
      return { dir: '.', count: photos.length };
    }
  },

  // ── Save animated GIF ──────────────────────────────────────────────────────
  saveGif: async (options) => {
    const { frames, delay, scale, loop, defaultName } = options;
    const w = frames[0].width * scale;
    const h = frames[0].height * scale;
    // gifenc expects delay in milliseconds (unlike omggif which uses centiseconds).
    // For looping GIFs, pass repeat:0 (infinite) on the FIRST frame only — this writes
    // the Netscape Application Block. For "once", omit repeat entirely (no NAB = play once).

    let bytes;
    try {
      // gifenc bundled locally — no network dependency
      const { GIFEncoder } = await import('./gifenc.esm.js');
      const gif = GIFEncoder();

      for (let fi = 0; fi < frames.length; fi++) {
        const frame = frames[fi];
        const scaled = scaleIndicesWeb(new Uint8Array(frame.indices), frame.width, frame.height, scale);
        const opts = {
          palette: frame.palette, // [[r,g,b], ...]
          delay,   // ms — gifenc expects milliseconds directly
        };
        // Only write the Netscape loop block on the first frame, and only when looping
        if (fi === 0 && loop !== 'once') opts.repeat = 0;
        gif.writeFrame(scaled, w, h, opts);
      }
      gif.finish();
      bytes = gif.bytes();
    } catch (e) {
      throw new Error(`GIF export requires an internet connection to load the encoder. (${e.message})`);
    }

    const blob = new Blob([bytes], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, defaultName || 'gbcam-animation.gif');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return defaultName;
  },

  // ── Fetch JSON (for Lospec palette import) ─────────────────────────────────
  fetchJson: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // ── Export raw .sav ────────────────────────────────────────────────────────
  exportSav: async (buffer, defaultName) => {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    triggerDownload(url, defaultName);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return defaultName;
  },

  // ── Save project (.gbcp) ───────────────────────────────────────────────────
  saveProject: async (json, defaultName) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    triggerDownload(url, defaultName);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return defaultName;
  },

  // ── Open project (.gbcp) ───────────────────────────────────────────────────
  openProject: async () => new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.gbcp',
    });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      try {
        const json = await file.text();
        resolve({ json, name: file.name });
      } catch (e) {
        resolve({ error: e.message });
      }
    };
    input.click();
  }),

  // ── Stubs for Electron-only features ───────────────────────────────────────
  revealInFinder: () => {},
  onMenuOpenSav:    (cb) => {}, // no native menu bar on web
  onMenuOpenPocket: (cb) => {},
  onMenuExportAll:  (cb) => {},
};
