import { state } from './state.js';
import { updateFilterUI } from '../ui/effects-actions.js';
import { showToast } from '../ui/feedback.js';
import { repaintGrid } from '../ui/grid.js';
import { updateSidebarPreview } from '../ui/sidebar-preview.js';
import { syncControlsToEffectiveSettings } from '../ui/tone-controls.js';

// ── Undo ─────────────────────────────────────────────────────────────────────

const MAX_UNDO = 30;

const undoStack = [];

/** Deep-clone the parts of state that we want to undo. */
function captureState() {
  return {
    activeFilters: new Set(state.activeFilters),
    filterParams: JSON.parse(JSON.stringify(state.filterParams)),
    filterIntensity: state.filterIntensity,
    filterVariant: state.filterVariant,
    palette: state.palette ? { ...state.palette } : null,
    brightness: state.brightness,
    contrast: state.contrast,
    toneIntensity: state.toneIntensity,
    shadowColor: state.shadowColor,
    highlightColor: state.highlightColor,
    toneBalance: state.toneBalance,
    photoSettings: JSON.parse(JSON.stringify(state.photoSettings)),
    photoTransforms: JSON.parse(JSON.stringify(state.photoTransforms)),
    sectionEnabled: JSON.parse(JSON.stringify(state.sectionEnabled || {})),
    borderId: state.borderId,
    borderEnabled: state.borderEnabled,
  };
}

/** Push the current state onto the undo stack before a destructive action. */
export function pushUndo() {
  undoStack.push(captureState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

/** Restore the most recent undo snapshot. */
export function performUndo() {
  if (undoStack.length === 0) {
    showToast('Nothing to undo');
    return;
  }
  const snap = undoStack.pop();
  state.activeFilters = snap.activeFilters;
  state.filterParams = snap.filterParams;
  state.filterIntensity = snap.filterIntensity;
  state.filterVariant = snap.filterVariant;
  state.palette = snap.palette;
  state.brightness = snap.brightness ?? state.brightness;
  state.contrast = snap.contrast ?? state.contrast;
  state.toneIntensity = snap.toneIntensity ?? state.toneIntensity;
  state.shadowColor = snap.shadowColor ?? state.shadowColor;
  state.highlightColor = snap.highlightColor ?? state.highlightColor;
  state.toneBalance = snap.toneBalance ?? state.toneBalance;
  if (snap.photoSettings) state.photoSettings = snap.photoSettings;
  if (snap.photoTransforms) state.photoTransforms = snap.photoTransforms;
  if (snap.sectionEnabled) state.sectionEnabled = snap.sectionEnabled;
  if (snap.borderId != null) state.borderId = snap.borderId;
  if (snap.borderEnabled != null) state.borderEnabled = snap.borderEnabled;
  updateFilterUI();
  syncControlsToEffectiveSettings(state.selectedIndex);
  repaintGrid();
  updateSidebarPreview();
  showToast('Undo');
}
