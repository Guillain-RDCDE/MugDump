import { PALETTES } from '../data/palettes/index.js';
import { PHOTO_HEIGHT, PHOTO_WIDTH, decodeFirstPhoto, renderToCanvas } from '../core/gbcam.js';
import { api } from '../platform/index.js';
import { loadSavFile } from '../app/open-file.js';
import { dom } from './dom.js';

// ── Analogue Pocket modal ────────────────────────────────────────────────────

let selectedPocketSave = null;

export async function openPocketModal() {
  dom.pocketModal.classList.remove('hidden');
  dom.pocketSaveList.innerHTML =
    '<div class="loading-state">' +
    '<div class="spinner"></div>' +
    '<div class="loading-text">Scanning for your Analogue Pocket SD card…</div>' +
    '<div class="loading-sub">This can take up to a minute on large cards.</div>' +
    '</div>';
  dom.pocketConfirm.disabled = true;
  selectedPocketSave = null;

  const { saves, unsupported } = await api.detectPocket();
  dom.pocketSaveList.innerHTML = '';

  if (unsupported) {
    dom.pocketSaveList.innerHTML =
      '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">' +
      "Your browser can't read the SD card directly. Reading and deleting Analogue " +
      'Pocket saves needs <strong>Chrome</strong> or <strong>Edge</strong> on desktop ' +
      '(the File System Access API). On Firefox or Safari, drag a <code>.sav</code> / ' +
      '<code>.srm</code> file onto the window instead, or use the desktop app.</p>';
    return;
  }

  if (saves.length === 0) {
    dom.pocketSaveList.innerHTML =
      '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">' +
      'No camera saves found. Make sure your Analogue Pocket SD card is inserted, ' +
      'and that you have run the camera app at least once.</p>';
    return;
  }

  // Web version: file handles but no previewPixels — decode client-side via GBCam
  for (const save of saves) {
    if (!save.previewPixels && save.handle) {
      try {
        const file = await save.handle.getFile();
        const buf = new Uint8Array(await file.arrayBuffer());
        save.previewPixels = decodeFirstPhoto(buf);
      } catch (_) {}
    }
  }

  const previewPalette = PALETTES.dmg;

  for (const save of saves) {
    const item = document.createElement('div');
    item.className = 'save-item';

    // Left: preview thumbnail
    const previewWrap = document.createElement('div');
    previewWrap.className = 'save-preview-wrap';

    if (save.previewPixels) {
      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_WIDTH;
      canvas.height = PHOTO_HEIGHT;
      canvas.className = 'save-preview';
      const ctx = canvas.getContext('2d');
      const pixels =
        save.previewPixels instanceof Uint8Array
          ? save.previewPixels
          : new Uint8Array(save.previewPixels);
      renderToCanvas(ctx, pixels, previewPalette, 1);
      previewWrap.appendChild(canvas);
    } else {
      const ph = document.createElement('div');
      ph.className = 'save-preview-empty';
      ph.textContent = '?';
      previewWrap.appendChild(ph);
    }

    // Right: filename + path
    const info = document.createElement('div');
    info.className = 'save-info';
    info.innerHTML =
      `<span class="save-name">${save.name}</span>` +
      `<span class="save-path">📼 ${save.volume} › ${save.path.split('/').slice(-2).join('/')}</span>`;

    item.appendChild(previewWrap);
    item.appendChild(info);

    // Delete button — only in the desktop app (web build can't unlink SD files)
    if (api.deletePocketSave) {
      const del = document.createElement('button');
      del.className = 'save-delete';
      del.title = 'Delete this save from the SD card';
      del.textContent = '✕';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const result = await api.deletePocketSave(save);
        if (!result || result.canceled) return;
        if (result.error) {
          alert('Could not delete save:\n' + result.error);
          return;
        }

        item.remove();
        const idx = saves.indexOf(save);
        if (idx !== -1) saves.splice(idx, 1);
        if (selectedPocketSave === save) {
          selectedPocketSave = null;
          dom.pocketConfirm.disabled = true;
        }
        if (saves.length === 0) {
          dom.pocketSaveList.innerHTML =
            '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">' +
            'All camera saves deleted.</p>';
        }
      });
      item.appendChild(del);
    }

    item.addEventListener('click', () => {
      dom.pocketSaveList
        .querySelectorAll('.save-item')
        .forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedPocketSave = save;
      dom.pocketConfirm.disabled = false;
    });
    dom.pocketSaveList.appendChild(item);
  }
}

export function closePocketModal() {
  dom.pocketModal.classList.add('hidden');
}

export async function confirmPocketOpen() {
  if (!selectedPocketSave) return;
  closePocketModal();
  // Pass the whole save object — Electron uses .path, web uses .handle
  const result = await api.readFile(selectedPocketSave);
  await loadSavFile(result);
}
