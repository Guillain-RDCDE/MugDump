/**
 * Effect/filter actions: enable, toggle, reset and reorder effects for the
 * current scope (selected photos, or the global settings), keeping the sidebar
 * sections and the previews in sync. The accordion DOM lives in effects-panel.js.
 */
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { buildDefaultFilterParams } from '../data/filter-defs.js';
import { syncFilterAccordion } from './effects-panel.js';
import { showToast } from './feedback.js';
import { repaintGrid } from './grid.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { renderSoloView } from './solo-view.js';

// Enable/disable a tone/effects section (exposure | splitTone | effects),
// keeping its "apply" checkbox and the preview in sync.
export function setSectionEnabled(section, on) {
  state.sectionEnabled[section] = on;
  const cb = document.querySelector(`.section-check[data-section="${section}"]`);
  if (cb) cb.checked = on;
  repaintGrid();
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}

export function resetEffects() {
  pushUndo();
  // Reset all filter state for selected photo(s), or global if none selected
  const targets =
    state.selectedPhotos.size > 0
      ? [...state.selectedPhotos]
      : state.selectedIndex !== null
        ? [state.selectedIndex]
        : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      ps.activeFilters = [];
      ps.filterParams = buildDefaultFilterParams();
      ps.filterIntensity = 1.0;
      ps.filterVariant = 'medium';
    }
  } else {
    state.activeFilters.clear();
    state.filterParams = buildDefaultFilterParams();
    state.filterIntensity = 1.0;
    state.filterVariant = 'medium';
  }
  updateFilterUI();
  setSectionEnabled('effects', false);
  showToast('Effects reset');
}

export function updateFilterOrder(repaint = false) {
  // Capture the current DOM order of .fi-item elements and update state.filterOrder
  const items = document.querySelectorAll('.fi-item');
  const newOrder = Array.from(items).map((item) => item.dataset.filter);
  state.filterOrder = newOrder;
  if (repaint) {
    repaintGrid();
    if (state.viewMode === 'solo' && state.selectedIndex !== null)
      renderSoloView(state.selectedIndex);
    updateSidebarPreview();
  }
}

export function updateFilterUI() {
  // Sync checkboxes and accordion expand/collapse state
  const _uiTgt = state.selectedPhotos.size > 0 ? [...state.selectedPhotos][0] : state.selectedIndex;
  const eff = _uiTgt !== null && _uiTgt !== undefined ? getEffectiveSettings(_uiTgt) : null;
  syncFilterAccordion(eff);
}

export function toggleFilter(filterName) {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    // Per-photo toggle — apply to selected photos only
    const firstPs = state.photoSettings[targets[0]];
    const firstAf = firstPs?.activeFilters
      ? new Set(firstPs.activeFilters)
      : new Set(state.activeFilters);
    const adding = !firstAf.has(filterName);
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      if (adding) cur.add(filterName);
      else cur.delete(filterName);
      ps.activeFilters = [...cur];
    }
    if (adding) {
      state.focusedFilter = filterName;
      autoEnableEffectsSection();
    } else if (state.focusedFilter === filterName) {
      const remaining = new Set(state.photoSettings[targets[0]]?.activeFilters || []);
      state.focusedFilter = [...remaining].pop() || null;
    }
  } else {
    // Global toggle — no photo selected, applies to all
    if (state.activeFilters.has(filterName)) {
      state.activeFilters.delete(filterName);
      if (state.focusedFilter === filterName) {
        state.focusedFilter = [...state.activeFilters].pop() || null;
      }
    } else {
      state.activeFilters.add(filterName);
      state.focusedFilter = filterName;
      autoEnableEffectsSection();
    }
  }
  updateFilterUI();
  repaintGrid();
  updateSidebarPreview();
}

/** If the effects section is disabled, automatically enable it (and update its checkbox). */
function autoEnableEffectsSection() {
  if (!state.sectionEnabled.effects) {
    state.sectionEnabled.effects = true;
    const cb = document.querySelector('.section-check[data-section="effects"]');
    if (cb) cb.checked = true;
  }
}

// Ensure a filter is active for the current scope — used when the user starts
// tweaking a filter's params without first ticking its box. Mirrors toggleFilter's
// "add" path, minus the undo push (the control already pushed) and grid repaint.
export function enableFilter(filterName) {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      cur.add(filterName);
      ps.activeFilters = [...cur];
    }
  } else {
    state.activeFilters.add(filterName);
  }
  state.focusedFilter = filterName;
  autoEnableEffectsSection();
  updateFilterUI();
}
