import { parseSav } from '../core/gbcam.js';
import { api } from '../platform/index.js';
import { state } from './state.js';
import { coerceGbCamSave } from '../core/savestate.js';
import { dom } from '../ui/dom.js';
import { setStatus, showToast } from '../ui/feedback.js';
import { renderGrid, updateExportSelectedBtn } from '../ui/grid.js';
import { showMainView } from '../ui/views.js';

/**
 * Load a save (or Pocket savestate) returned by the platform API into the app.
 * @param {{buffer: ArrayBuffer, name: string, path?: string|null, error?: string}|null} result
 */
export async function loadSavFile(result) {
  if (!result || result.error) {
    if (result?.error) showToast(`⚠ ${result.error}`);
    return;
  }

  const { buffer, name, path: filePath } = result;
  const camBuf = coerceGbCamSave(buffer);
  if (!camBuf) {
    showToast(
      `⚠ Unexpected file (${buffer.byteLength} bytes): expected a 131072-byte GB Camera save, or a savestate (.sta) containing one.`,
    );
    return;
  }
  const { photos, activeCount, sav } = parseSav(camBuf);

  state.sav = sav;
  state.photos = photos;
  state.activeCount = activeCount;
  state.filename = name;
  state.filePath = filePath || null;
  state.selectedIndex = null;
  state.gifMode = false;
  state.gifSelection.clear();
  state.photoTransforms = {}; // reset transforms on new file load
  state.photoSettings = {}; // reset per-photo overrides on new file load
  if (filePath) saveLastSavPath(filePath);

  renderGrid();
  showMainView();
  updateExportSelectedBtn();
  setStatus(`${name} — ${activeCount} photo${activeCount !== 1 ? 's' : ''} found`, true);
}

// ── Drag & drop ─────────────────────────────────────────────────────────────

export function setupDragDrop() {
  const overlay = dom.dropOverlay;

  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    overlay?.classList.remove('hidden');
  });

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) overlay?.classList.add('hidden');
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay?.classList.add('hidden');
    const file = e.dataTransfer.files[0];
    if (!file) return;

    // The desktop build can recover the on-disk path (used by "Reload");
    // loadSavFile() handles .sta coercion and size validation on both platforms.
    const buffer = await file.arrayBuffer();
    await loadSavFile({ buffer, name: file.name, path: api.getPathForFile(file) });
  });
}

// ── Reload last .sav ─────────────────────────────────────────────────────────

const LAST_SAV_PATH_KEY = 'gbcam_last_sav_path';

function saveLastSavPath(filePath) {
  if (filePath) localStorage.setItem(LAST_SAV_PATH_KEY, filePath);
}

export async function reloadSav() {
  const p = state.filePath || localStorage.getItem(LAST_SAV_PATH_KEY);
  if (!p) {
    showToast('No file to reload');
    return;
  }
  await loadSavFile(await api.readFile(p));
}
