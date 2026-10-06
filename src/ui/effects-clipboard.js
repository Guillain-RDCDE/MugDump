import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { updateFilterUI } from './effects-panel.js';
import { showToast } from './feedback.js';
import { repaintGrid } from './grid.js';
import { syncControlsToEffectiveSettings } from './tone-controls.js';

// ── Effect copy / paste ──────────────────────────────────────────────────────

export function copyEffects() {
  const _cpTgt = state.selectedIndex;
  const _cpEff = _cpTgt !== null ? getEffectiveSettings(_cpTgt) : null;
  const src = _cpEff || state;
  // Resolve paletteId: per-photo override first, then global palette's id
  const cpPaletteId =
    _cpTgt !== null && state.photoSettings[_cpTgt]?.paletteId
      ? state.photoSettings[_cpTgt].paletteId
      : (state.palette?.id ?? null);
  state.effectClipboard = {
    // Palette
    paletteId: cpPaletteId,
    // Filters
    activeFilters: _cpEff ? [..._cpEff.activeFilters] : [...state.activeFilters],
    filterIntensity: src.filterIntensity ?? state.filterIntensity,
    filterVariant: src.filterVariant ?? state.filterVariant,
    filterParams: JSON.parse(JSON.stringify(src.filterParams ?? state.filterParams)),
    // Tone / exposure
    brightness: src.brightness ?? state.brightness,
    contrast: src.contrast ?? state.contrast,
    toneIntensity: src.toneIntensity ?? state.toneIntensity,
    shadowColor: src.shadowColor ?? state.shadowColor,
    highlightColor: src.highlightColor ?? state.highlightColor,
    toneBalance: src.toneBalance ?? state.toneBalance,
  };
  document.querySelectorAll('.btn-paste-effects').forEach((b) => (b.disabled = false));
  showToast('All settings copied');
}

export function pasteEffects() {
  if (!state.effectClipboard) return;
  pushUndo();
  const cb = state.effectClipboard;
  const targets =
    state.selectedPhotos.size > 0
      ? [...state.selectedPhotos]
      : state.selectedIndex !== null
        ? [state.selectedIndex]
        : [];
  if (targets.length === 0) {
    showToast('Select a photo to paste to');
    return;
  }
  for (const idx of targets) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    const ps = state.photoSettings[idx];
    // Palette
    if (cb.paletteId) ps.paletteId = cb.paletteId;
    // Filters
    ps.filterIntensity = cb.filterIntensity;
    ps.filterVariant = cb.filterVariant;
    ps.filterParams = JSON.parse(JSON.stringify(cb.filterParams));
    ps.activeFilters = [...cb.activeFilters];
    // Tone / exposure
    ps.brightness = cb.brightness;
    ps.contrast = cb.contrast;
    ps.toneIntensity = cb.toneIntensity;
    ps.shadowColor = cb.shadowColor;
    ps.highlightColor = cb.highlightColor;
    ps.toneBalance = cb.toneBalance;
  }
  updateFilterUI();
  syncControlsToEffectiveSettings(state.selectedIndex);
  repaintGrid();
  showToast(`Settings pasted to ${targets.length} photo${targets.length > 1 ? 's' : ''}`);
}
