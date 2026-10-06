/**
 * Analogue Pocket SD-card detection and save deletion.
 *
 * Every mounted volume is probed in parallel (a slow or phantom Windows drive
 * must never block the others) and only the few folders where the Pocket
 * stores camera saves are scanned — never the huge Assets/ tree.
 */
import { dialog, ipcMain } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { decodeFirstPhoto, SRAM_SIZE } from '../../src/core/gbcam.js';
import { assertString, windowOf } from './util.js';

const OPENFPGA_CORE_DIRS = ['gb', 'gbc', 'Game Boy', 'GameBoy', 'Analogue.gb', 'Analogue.gbc'];

const exists = (p) =>
  fsp.access(p).then(
    () => true,
    () => false,
  );

function candidateVolumeRoots() {
  if (process.platform === 'darwin') {
    return fsp
      .readdir('/Volumes')
      .then((names) => names.filter((v) => !v.startsWith('.')).map((v) => path.join('/Volumes', v)))
      .catch(() => []);
  }
  if (process.platform === 'win32') {
    return Promise.resolve([...'DEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `${letter}:\\`));
  }
  // Linux: removable media mount points
  const user = process.env.USER || process.env.LOGNAME || '';
  return Promise.all(
    [`/media/${user}`, '/run/media/' + user, '/mnt'].map((base) =>
      fsp
        .readdir(base)
        .then((names) => names.map((n) => path.join(base, n)))
        .catch(() => []),
    ),
  ).then((lists) => lists.flat());
}

/** Collect 128 KB .sav/.srm files under `dir`, recursing at most `maxDepth` levels. */
async function collectSavFiles(dir, volume, out, depth, maxDepth) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < maxDepth) await collectSavFiles(fullPath, volume, out, depth + 1, maxDepth);
    } else if (/\.(sav|srm)$/i.test(entry.name)) {
      try {
        const st = await fsp.stat(fullPath);
        if (st.size === SRAM_SIZE) out.push({ path: fullPath, name: entry.name, volume });
      } catch {}
    }
  }
}

/** Scan one volume root; resolves with the camera saves found on it. */
async function scanRoot(root) {
  const volume = process.platform === 'win32' ? root.replace(/\\+$/, '') : path.basename(root);
  const out = [];
  const [hasAssets, hasMemories, hasSaves] = await Promise.all([
    exists(path.join(root, 'Assets')),
    exists(path.join(root, 'Memories')),
    exists(path.join(root, 'Saves')),
  ]);
  // An Analogue Pocket card always has Assets/ (and Memories/ once used).
  if (!hasAssets && !hasMemories) return out;

  const jobs = [];
  if (hasMemories) {
    jobs.push(collectSavFiles(path.join(root, 'Memories', 'Save States'), volume, out, 0, 1));
    jobs.push(collectSavFiles(path.join(root, 'Memories'), volume, out, 0, 0));
  }
  if (hasSaves) {
    for (const core of OPENFPGA_CORE_DIRS) {
      jobs.push(collectSavFiles(path.join(root, 'Saves', core), volume, out, 0, 1));
    }
  }
  await Promise.all(jobs);
  return out;
}

async function previewPixels(filePath) {
  try {
    const buf = await fsp.readFile(filePath);
    return buf.length === SRAM_SIZE ? decodeFirstPhoto(buf) : null;
  } catch {
    return null;
  }
}

export function registerPocketHandlers() {
  ipcMain.handle('detect-pocket', async () => {
    const roots = await candidateVolumeRoots();
    const found = (await Promise.all(roots.map(scanRoot))).flat();
    // Memories/ and Memories/Save States/ scans may overlap — dedupe by path.
    const seen = new Set();
    const saves = found.filter((s) => !seen.has(s.path) && seen.add(s.path));
    await Promise.all(
      saves.map(async (save) => {
        save.previewPixels = await previewPixels(save.path);
      }),
    );
    return { saves };
  });

  ipcMain.handle('delete-pocket-save', async (event, filePath) => {
    try {
      assertString(filePath, 'file path');
      // Safety net: only ever delete a genuine 128 KB GB Camera save.
      const st = await fsp.stat(filePath);
      if (!st.isFile() || st.size !== SRAM_SIZE) {
        return { error: 'Refusing to delete: not a 128KB Game Boy Camera save.' };
      }
    } catch (e) {
      return { error: e.message };
    }

    const { response } = await dialog.showMessageBox(windowOf(event), {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete save',
      message: 'Delete this save from your Analogue Pocket?',
      detail: `${path.basename(filePath)}\n\nThis permanently removes the file from the SD card. This cannot be undone.`,
    });
    if (response !== 1) return { canceled: true };

    try {
      await fsp.unlink(filePath);
      return { deleted: true };
    } catch (e) {
      return { error: e.message };
    }
  });
}
