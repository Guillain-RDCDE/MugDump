import { PALETTES } from '../data/palettes/index.js';
import { api } from '../platform/index.js';
import { loadSavFile, reloadSav } from '../app/open-file.js';
import { setScopedSetting } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import {
  exportBatchPng,
  exportContactSheet,
  exportGif,
  exportSav,
  exportSavestateAlbums,
  exportSinglePng,
} from '../features/export.js';
import { openProject, saveProject } from '../features/project.js';
import { applyTransformAction } from '../render/transform.js';
import { dom } from './dom.js';
import { copyEffects, pasteEffects } from './effects-clipboard.js';
import { resetEffects, setSectionEnabled } from './effects-panel.js';
import { setExportFormat, setExportScale, updateCustomSizeDisplay } from './export-panel.js';
import { showToast } from './feedback.js';
import { clearGifFrames, setGifLoop, updateGifPreview } from './gif-builder.js';
import {
  _repaintAfterTransform,
  clearEdits,
  deselectAll,
  repaintGrid,
  setThumbnailSize,
  toggleHideEmpty,
} from './grid.js';
import { closePaletteGrid, openPaletteGrid } from './palette-grid.js';
import { setPalette } from './palette-picker.js';
import { closePocketModal, confirmPocketOpen, openPocketModal } from './pocket-modal.js';
import { closePresentation, openPresentation, presentationStep } from './presentation.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { enterGridMode, enterSoloMode, renderSoloView, soloStep } from './solo-view.js';
import { setupToneControls, syncControlsToEffectiveSettings } from './tone-controls.js';
import { resetToWelcome } from './views.js';

// ── Wire up buttons ──────────────────────────────────────────────────────────

/** Wire every static button/control in index.html to its action. */
export function wireButtons() {
  // Welcome screen
  document.getElementById('btn-open-sav').addEventListener('click', async () => {
    const result = await api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById('btn-open-pocket').addEventListener('click', openPocketModal);
  document.getElementById('btn-develop-albums')?.addEventListener('click', exportSavestateAlbums);

  // Home button (title)
  document.getElementById('btn-home')?.addEventListener('click', () => {
    if (state.photos.length > 0) resetToWelcome();
  });

  // Titlebar buttons
  document.getElementById('tb-open-sav').addEventListener('click', async () => {
    const result = await api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById('tb-open-pocket').addEventListener('click', openPocketModal);

  // Palette bar (handled in buildPaletteBar)

  // Scale controls (numeric or 'custom')
  document.querySelectorAll('.scale-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.scale === 'custom' ? 'custom' : parseInt(btn.dataset.scale);
      setExportScale(val);
    });
  });

  // Custom width input
  const customWidthInput = document.getElementById('custom-width');
  if (customWidthInput) {
    customWidthInput.addEventListener('input', updateCustomSizeDisplay);
  }

  // Thumbnail size slider
  const thumbSlider = document.getElementById('thumb-size-slider');
  if (thumbSlider) {
    thumbSlider.addEventListener('input', () => setThumbnailSize(parseInt(thumbSlider.value)));
  }

  // Format controls
  document.querySelectorAll('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => setExportFormat(btn.dataset.fmt));
  });

  // Note: filter toggle wiring is handled by the accordion's fi-check elements (injected in buildFilterAccordion).

  // Copy / Paste — wire up all instances (grid header + any others)
  document
    .querySelectorAll('.btn-copy-effects')
    .forEach((b) => b.addEventListener('click', copyEffects));
  document
    .querySelectorAll('.btn-paste-effects')
    .forEach((b) => b.addEventListener('click', pasteEffects));

  // Effects reset button
  document.getElementById('btn-reset-effects')?.addEventListener('click', resetEffects);

  // Effects preview checkbox — controls ALL effects (filters + tone/exposure/splitTone)
  // Checked = effects visible (default); unchecked = original/before view
  const _previewCb = document.getElementById('effects-preview-check');
  if (_previewCb) {
    _previewCb.checked = !state.effectsPreviewMode; // checked = showing effects
    _previewCb.addEventListener('change', () => {
      state.effectsPreviewMode = !_previewCb.checked;
      repaintGrid();
      if (state.viewMode === 'solo' && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }

  // Deselect button
  document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
    deselectAll();
  });

  // Section enable/disable checkboxes (global sections only)
  document.querySelectorAll('.section-check').forEach((cb) => {
    const section = cb.dataset.section;
    cb.checked = state.sectionEnabled[section] ?? false;
    cb.addEventListener('change', () => setSectionEnabled(section, cb.checked));
  });

  // Touching any control inside a tone/effects section auto-enables that section,
  // so you never have to also tick its "apply" box (the reset button un-ticks it).
  const SECTION_CONTAINERS = {
    exposure: 'exposure-controls',
    splitTone: 'split-tone-controls',
    effects: 'effects-controls',
  };
  for (const [section, contId] of Object.entries(SECTION_CONTAINERS)) {
    const cont = document.getElementById(contId);
    if (!cont) continue;
    const autoEnable = (e) => {
      if (e.target.classList.contains('section-check')) return; // ignore the enable box itself
      if (!state.sectionEnabled[section]) setSectionEnabled(section, true);
    };
    cont.addEventListener('input', autoEnable);
    cont.addEventListener('change', autoEnable);
  }

  // Border enable/disable — scoped like borderId (per-photo or global)
  const borderEnabledCb = document.getElementById('border-enabled-check');
  if (borderEnabledCb) {
    borderEnabledCb.checked = state.borderEnabled ?? false;
    borderEnabledCb.addEventListener('change', () => {
      pushUndo();
      setScopedSetting('borderEnabled', borderEnabledCb.checked);
      repaintGrid();
      if (state.viewMode === 'solo' && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }

  // Filter scope toggle — "Filters affect border" checkbox (global setting)
  const filterScopeCb = document.getElementById('filter-scope-check');
  if (filterScopeCb) {
    filterScopeCb.checked = state.filterScope === 'full';
    filterScopeCb.addEventListener('change', () => {
      state.filterScope = filterScopeCb.checked ? 'full' : 'photo';
      repaintGrid();
      if (state.viewMode === 'solo' && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }

  // View mode toggle (Grid / Solo)
  document.getElementById('btn-view-grid')?.addEventListener('click', enterGridMode);
  document.getElementById('btn-view-solo')?.addEventListener('click', enterSoloMode);

  // Solo navigation + transforms
  document.getElementById('solo-prev')?.addEventListener('click', () => soloStep(-1));
  document.getElementById('solo-next')?.addEventListener('click', () => soloStep(1));
  document.getElementById('solo-transforms')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.transform-btn');
    if (!btn || state.selectedIndex === null) return;
    const action = btn.dataset.action;
    if (action === 'fullscreen') {
      openPresentation(state.selectedIndex);
      return;
    }
    if (action === 'reset-transform') {
      // Reset ALL edits for this photo — transform + per-photo settings
      const idx = state.selectedIndex;
      delete state.photoTransforms[idx];
      delete state.photoSettings[idx];
      _repaintAfterTransform(idx);
      syncControlsToEffectiveSettings(idx);
      updateSidebarPreview();
      showToast('Photo reset');
      return;
    }
    applyTransformAction(state.selectedIndex, action);
    _repaintAfterTransform(state.selectedIndex);
  });

  // Export buttons
  document.getElementById('btn-export-single').addEventListener('click', exportSinglePng);
  document.getElementById('btn-export-all').addEventListener('click', exportBatchPng);
  document.getElementById('btn-export-all-grid')?.addEventListener('click', exportBatchPng);
  document.getElementById('btn-export-gif').addEventListener('click', exportGif);
  document.getElementById('btn-contact-sheet')?.addEventListener('click', exportContactSheet);

  // Clear Edits button
  document.getElementById('btn-reset-all')?.addEventListener('click', clearEdits);

  // Select All button
  document.getElementById('btn-select-all')?.addEventListener('click', () => {
    state.selectedPhotos.clear();
    state.photos.forEach((p) => {
      if (!p.isEmpty) state.selectedPhotos.add(p.index);
    });
    state.selectedIndex = [...state.selectedPhotos][0] ?? null;
    state.lastSelectedIndex = state.selectedIndex;
    dom.photoGrid
      .querySelectorAll('.photo-slot:not(.empty)')
      .forEach((el) => el.classList.add('multi-selected'));
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    updateSidebarPreview();
  });

  // Tone controls
  setupToneControls();

  // Titlebar: export .sav + project + reload
  document.getElementById('tb-export-sav')?.addEventListener('click', exportSav);
  document.getElementById('tb-save-project')?.addEventListener('click', saveProject);
  document.getElementById('tb-open-project')?.addEventListener('click', openProject);
  document.getElementById('tb-reload-sav')?.addEventListener('click', reloadSav);

  // Grid header: hide empty
  document.getElementById('btn-hide-empty')?.addEventListener('click', toggleHideEmpty);

  // Presentation overlay
  dom.presClose?.addEventListener('click', closePresentation);
  dom.presPrev?.addEventListener('click', () => presentationStep(-1));
  dom.presNext?.addEventListener('click', () => presentationStep(1));
  dom.presentationOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.presentationOverlay) closePresentation();
  });

  // Palette grid
  document.getElementById('btn-palette-grid').addEventListener('click', openPaletteGrid);
  document.getElementById('palette-grid-close').addEventListener('click', closePaletteGrid);

  // Random palette dice button
  document.getElementById('btn-random-palette').addEventListener('click', () => {
    const ids = Object.keys(PALETTES);
    const id = ids[Math.floor(Math.random() * ids.length)];
    setPalette(id);
    showToast(`🎲 ${PALETTES[id].name}`);
  });

  // GIF toolbar
  document.getElementById('btn-gif-clear')?.addEventListener('click', clearGifFrames);

  document.getElementById('gif-cancel').addEventListener('click', () => {
    setExportFormat('png');
    // Reset format buttons
    document.querySelectorAll('.fmt-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.fmt === 'png');
    });
  });

  // GIF loop mode
  document.querySelectorAll('.gif-loop-btn').forEach((btn) => {
    btn.addEventListener('click', () => setGifLoop(btn.dataset.loop));
  });

  // GIF delay slider
  dom.gifDelay.addEventListener('input', () => {
    state.gifDelay = parseInt(dom.gifDelay.value);
    dom.gifDelayVal.textContent = `${state.gifDelay}ms`;
    if (state.gifMode && state.gifSelection.size > 1) updateGifPreview();
  });

  // Pocket modal
  document.getElementById('pocket-cancel').addEventListener('click', closePocketModal);
  document.getElementById('pocket-cancel-2').addEventListener('click', closePocketModal);
  dom.pocketConfirm.addEventListener('click', confirmPocketOpen);

  api.onMenuOpenPocket(() => openPocketModal());
  api.onMenuExportAll(() => {
    if (state.photos.length > 0) exportBatchPng();
  });
}
