import { PALETTES } from '../data/palettes/index.js';
import { state } from './state.js';

// ── Per-photo settings helpers ─────────────────────────────────────────────

/** Returns a merged settings object for rendering photo at `index`.
 *  Per-photo overrides take precedence over global state. */
export function getEffectiveSettings(index) {
  const ps = state.photoSettings[index];
  if (!ps) {
    return {
      palette: state.palette,
      exportFilter: state.exportFilter,
      filterIntensity: state.filterIntensity,
      filterVariant: state.filterVariant,
      filterParams: state.filterParams,
      activeFilters: new Set(state.activeFilters),
      brightness: state.brightness,
      contrast: state.contrast,
      toneIntensity: state.toneIntensity,
      shadowColor: state.shadowColor,
      highlightColor: state.highlightColor,
      toneBalance: state.toneBalance,
      borderId: state.borderId,
      borderEnabled: state.borderEnabled,
      filterScope: state.filterScope,
    };
  }
  return {
    palette: ps.paletteId ? PALETTES[ps.paletteId] || state.palette : state.palette,
    exportFilter: ps.exportFilter ?? state.exportFilter,
    filterIntensity: ps.filterIntensity ?? state.filterIntensity,
    filterVariant: ps.filterVariant ?? state.filterVariant,
    filterParams: ps.filterParams ?? state.filterParams,
    activeFilters: ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters),
    brightness: ps.brightness ?? state.brightness,
    contrast: ps.contrast ?? state.contrast,
    toneIntensity: ps.toneIntensity ?? state.toneIntensity,
    shadowColor: ps.shadowColor ?? state.shadowColor,
    highlightColor: ps.highlightColor ?? state.highlightColor,
    toneBalance: ps.toneBalance ?? state.toneBalance,
    borderId: ps.borderId ?? state.borderId,
    borderEnabled: ps.borderEnabled ?? state.borderEnabled,
    filterScope: state.filterScope, // always global (not per-photo)
  };
}

/** Write a setting to the selected photos' per-photo overrides, or globally if nothing is selected. */
export function setScopedSetting(key, value) {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      state.photoSettings[idx][key] = value;
    }
  } else {
    state[key] = value;
  }
}

/** Returns the filterParams object for the current scope. Per-photo when a photo is selected, global otherwise. */
export function getWritableFilterParams(filter) {
  const idx = state.selectedPhotos.size > 0 ? [...state.selectedPhotos][0] : state.selectedIndex;
  if (idx !== null && idx !== undefined) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    if (!state.photoSettings[idx].filterParams) {
      state.photoSettings[idx].filterParams = JSON.parse(JSON.stringify(state.filterParams));
    }
    const fp = state.photoSettings[idx].filterParams;
    if (!fp[filter]) fp[filter] = {};
    return fp[filter];
  }
  if (!state.filterParams[filter]) state.filterParams[filter] = {};
  return state.filterParams[filter];
}

/** True when photo at `index` has any per-photo setting override. */
export function hasPhotoOverride(index) {
  const ps = state.photoSettings[index];
  if (!ps) return false;
  return Object.keys(ps).some(
    (k) => ps[k] !== undefined && (k !== 'filterParams' || Object.keys(ps[k]).length > 0),
  );
}

/** Returns the palette id that should be shown as "active" in the picker. */
export function getDisplayPaletteId() {
  if (state.selectedIndex !== null) {
    return getEffectiveSettings(state.selectedIndex).palette?.id || state.palette.id;
  }
  return state.palette.id;
}
