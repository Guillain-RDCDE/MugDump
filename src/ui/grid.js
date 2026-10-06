import { PHOTO_HEIGHT, PHOTO_WIDTH } from '../core/gbcam.js';
import { getEffectiveSettings, hasPhotoOverride } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { THUMB_SCALE, renderPhotoComplete } from '../render/photo.js';
import { dom } from './dom.js';
import { updateFilterUI } from './effects-actions.js';
import { showToast } from './feedback.js';
import { toggleGifSelection, updateGifFrameNumbers, updateGifPreview } from './gif-builder.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { enterSoloMode, renderSoloView } from './solo-view.js';
import { syncControlsToEffectiveSettings } from './tone-controls.js';

/** Deselect all photos and clear visual state. */
export function deselectAll() {
  state.selectedPhotos.clear();
  state.selectedIndex = null;
  state.lastSelectedIndex = null;
  dom.photoGrid.querySelectorAll('.photo-slot').forEach((el) => {
    el.classList.remove('selected', 'multi-selected');
  });
  updateSidebarPreview();
}

/** Clear edits on selected photos — removes tone, exposure, and filter overrides
 *  but preserves each photo's palette choice. Requires at least one photo selected. */
export function clearEdits() {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (!targets) {
    showToast('Select a photo first');
    return;
  }
  pushUndo();
  for (const idx of targets) {
    // Preserve per-photo palette id; clear everything else
    const savedPaletteId = state.photoSettings[idx]?.paletteId;
    delete state.photoSettings[idx];
    if (savedPaletteId) {
      state.photoSettings[idx] = { paletteId: savedPaletteId };
    }
    delete state.photoTransforms[idx];
    repaintGridSlot(idx);
  }
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
  updateFilterUI();
  const n = targets.length;
  showToast(`Cleared edits on ${n} photo${n > 1 ? 's' : ''}`);
  updateSidebarPreview();
}

// ── Grid ────────────────────────────────────────────────────────────────────

export function renderGrid() {
  dom.photoGrid.innerHTML = '';

  for (const photo of state.photos) {
    const slot = document.createElement('div');
    slot.className = 'photo-slot' + (photo.isEmpty ? ' empty' : '');
    slot.dataset.index = photo.index;

    // Slot number badge
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = String(photo.index + 1).padStart(2, '0');
    slot.appendChild(num);

    if (photo.isEmpty) {
      const placeholder = document.createElement('div');
      placeholder.className = 'empty-placeholder';
      placeholder.textContent = '—';
      slot.appendChild(placeholder);
    } else {
      // Canvas thumbnail — rendered at THUMB_SCALE (4×) for filter clarity
      const canvas = document.createElement('canvas');
      const effThumb = getEffectiveSettings(photo.index);
      const hasBorderThumb = effThumb.borderEnabled && effThumb.borderId;
      canvas.width = (hasBorderThumb ? 160 : PHOTO_WIDTH) * THUMB_SCALE;
      canvas.height = (hasBorderThumb ? 144 : PHOTO_HEIGHT) * THUMB_SCALE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      renderPhotoComplete(ctx, photo, effThumb, THUMB_SCALE, photo.index);
      slot.appendChild(canvas);

      // GIF selection (invisible div for event delegation; frame number via data attr)
      const check = document.createElement('div');
      check.className = 'gif-check';
      check.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGifSelection(photo.index, slot);
      });
      slot.appendChild(check);

      slot.addEventListener('click', (e) => selectPhoto(photo.index, e));
      slot.addEventListener('dblclick', (e) => {
        selectPhoto(photo.index, e);
        enterSoloMode();
      });
    }

    dom.photoGrid.appendChild(slot);
  }

  // Apply selected state
  if (state.selectedIndex !== null) {
    const el = dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`);
    if (el) el.classList.add('selected');
  }

  // Apply multi-selected state
  for (const idx of state.selectedPhotos) {
    if (state.selectedPhotos.size > 1) {
      const el = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
      if (el) el.classList.add('multi-selected');
    }
  }

  // Apply GIF selections
  for (const idx of state.gifSelection) {
    const el = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
    if (el) el.classList.add('selected-for-gif');
  }
  updateGifFrameNumbers();
}

// ── Repaint helpers ──────────────────────────────────────────────────────────

// Repaint only the detail/preview canvases (solo view, sidebar).
// Fast — renders 1-3 canvases instead of the full 30-slot grid.
// Use during interactive slider drag so the UI stays responsive.
function repaintDetailOnly() {
  if (state.viewMode === 'solo' && state.selectedIndex !== null) {
    renderSoloView(state.selectedIndex);
  }
  updateSidebarPreview();
}

// ── Grid repaint ─────────────────────────────────────────────────────────────

export function repaintGrid() {
  const slots = dom.photoGrid.querySelectorAll('.photo-slot:not(.empty)');
  for (const slot of slots) repaintGridSlot(parseInt(slot.dataset.index));
  if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}

// Debounced grid repaint for global-scope slider changes — fires once after the
// user stops dragging so we don't re-render all 30 thumbnails on every tick.
let _gridDebounceTimer = null;

function scheduleGridRepaint() {
  clearTimeout(_gridDebounceTimer);
  _gridDebounceTimer = setTimeout(() => {
    _gridDebounceTimer = null;
    const slots = dom.photoGrid.querySelectorAll('.photo-slot:not(.empty)');
    for (const slot of slots) repaintGridSlot(parseInt(slot.dataset.index));
    if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
  }, 200);
}

// ── Interactive repaint (sliders, seg controls) ──────────────────────────────
//
// Gated to one repaint per animation frame — slider input events can fire faster
// than 60 fps on a trackpad, so we coalesce them to avoid queuing up work.
//
//   per-photo scope → detail view + selected thumbnail(s) immediately
//   global scope    → detail view immediately + all thumbnails after 200 ms pause

let _interactiveRAF = null;

export function repaintInteractive() {
  if (_interactiveRAF !== null) return; // already a repaint queued this frame
  _interactiveRAF = requestAnimationFrame(() => {
    _interactiveRAF = null;
    repaintDetailOnly();
    if (state.selectedPhotos.size > 0) {
      // Per-photo edit — only repaint affected thumbnails immediately
      for (const idx of state.selectedPhotos) repaintGridSlot(idx);
    } else {
      // Global edit — repaint all thumbnails (debounced)
      scheduleGridRepaint();
    }
  });
}

// Re-render a single thumbnail slot (after palette or transform change)
export function repaintGridSlot(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const eff = getEffectiveSettings(index);
  // Re-size canvas if needed (border state may have changed)
  const hasBorderSlot = eff.borderEnabled && eff.borderId;
  const expW = (hasBorderSlot ? 160 : PHOTO_WIDTH) * THUMB_SCALE;
  const expH = (hasBorderSlot ? 144 : PHOTO_HEIGHT) * THUMB_SCALE;
  if (canvas.width !== expW || canvas.height !== expH) {
    canvas.width = expW;
    canvas.height = expH;
  }
  renderPhotoComplete(ctx, photo, eff, THUMB_SCALE, index);
  // Slot badge — photo-specific settings override indicator
  slot.classList.toggle('has-photo-settings', hasPhotoOverride(index));
}

// ── Photo selection ─────────────────────────────────────────────────────────

export function updateExportSelectedBtn() {
  const btn = document.getElementById('btn-export-single');
  if (!btn) return;
  const hasPhoto =
    state.selectedIndex !== null &&
    state.photos[state.selectedIndex] &&
    !state.photos[state.selectedIndex].isEmpty;
  btn.disabled = !hasPhoto;
  btn.style.opacity = hasPhoto ? '' : '0.4';
}

export function selectPhoto(index, event) {
  if (state.gifMode) {
    const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
    if (slot && !slot.classList.contains('empty')) toggleGifSelection(index, slot);
    return;
  }

  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;

  if (event?.shiftKey && state.lastSelectedIndex !== null) {
    // Range select: add all non-empty photos between lastSelectedIndex and index
    const lo = Math.min(state.lastSelectedIndex, index);
    const hi = Math.max(state.lastSelectedIndex, index);
    for (let i = lo; i <= hi; i++) {
      if (state.photos[i] && !state.photos[i].isEmpty) state.selectedPhotos.add(i);
    }
    state.selectedIndex = index;
  } else if (event?.metaKey || event?.ctrlKey) {
    // Cmd/Ctrl: toggle this photo in/out of selection
    if (state.selectedPhotos.has(index)) {
      state.selectedPhotos.delete(index);
    } else {
      state.selectedPhotos.add(index);
    }
    state.selectedIndex = index;
    state.lastSelectedIndex = index;
  } else {
    // Plain click: single select
    state.selectedPhotos.clear();
    state.selectedPhotos.add(index);
    state.selectedIndex = index;
    state.lastSelectedIndex = index;
  }

  // Update visual selection on all slots
  dom.photoGrid.querySelectorAll('.photo-slot').forEach((el) => {
    const i = parseInt(el.dataset.index);
    const inSet = state.selectedPhotos.has(i);
    el.classList.toggle('selected', i === state.selectedIndex);
    el.classList.toggle('multi-selected', inSet && state.selectedPhotos.size > 1);
  });

  if (state.viewMode === 'solo') renderSoloView(index);
  syncControlsToEffectiveSettings(index);
  updateExportSelectedBtn();
  updateSidebarPreview();
}

// ── Thumbnail size ────────────────────────────────────────────────────────────

export function setThumbnailSize(px) {
  // min(${px}px, 48%) caps the column minimum at just under half the container
  // width, guaranteeing at least 2 columns always fit — eliminates the deadzone
  // where the slider top-end does nothing because only 1 column is placed.
  dom.photoGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(min(${px}px, 48%), 1fr))`;
}

// Repaint all views after a transform action
export function _repaintAfterTransform(index) {
  repaintGridSlot(index);
  if (state.viewMode === 'solo') renderSoloView(index);
}
