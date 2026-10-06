import { STORAGE_KEYS, readJson, writeJson } from '../app/storage.js';
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { showToast } from './feedback.js';
import { repaintGridSlot } from './grid.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { renderSoloView } from './solo-view.js';
import { syncControlsToEffectiveSettings } from './tone-controls.js';

// ── Effect Presets ──────────────────────────────────────────────────────────

export function getPresets() {
  return readJson(STORAGE_KEYS.presets, {});
}

export function savePreset(name) {
  if (!name) return;
  // Capture the effective settings of the currently selected/viewed photo.
  // If no photo is selected, fall back to global state.
  const idx = state.selectedIndex;
  const eff = idx !== null ? getEffectiveSettings(idx) : null;
  const src = {
    activeFilters: eff ? [...eff.activeFilters] : [...state.activeFilters],
    filterIntensity: eff ? eff.filterIntensity : state.filterIntensity,
    filterVariant: eff ? eff.filterVariant : state.filterVariant,
    filterParams: JSON.parse(JSON.stringify(eff ? eff.filterParams : state.filterParams)),
    brightness: eff ? eff.brightness : state.brightness,
    contrast: eff ? eff.contrast : state.contrast,
    toneIntensity: eff ? eff.toneIntensity : state.toneIntensity,
    shadowColor: eff ? eff.shadowColor : state.shadowColor,
    highlightColor: eff ? eff.highlightColor : state.highlightColor,
    toneBalance: eff ? eff.toneBalance : state.toneBalance,
    borderId: eff ? eff.borderId : state.borderId,
    borderEnabled: eff ? eff.borderEnabled : state.borderEnabled,
  };
  const presets = getPresets();
  presets[name] = src;
  writeJson(STORAGE_KEYS.presets, presets);
  renderPresetList();
  showToast(`Preset "${name}" saved`);
}

export function loadPreset(name) {
  const presets = getPresets();
  const p = presets[name];
  if (!p) return;

  // Apply to selected photos only (per-photo overrides).
  // If nothing explicitly selected, apply to the current single-selected photo.
  const targets =
    state.selectedPhotos.size > 0
      ? [...state.selectedPhotos]
      : state.selectedIndex !== null
        ? [state.selectedIndex]
        : [];

  if (targets.length === 0) {
    showToast('Select a photo first');
    return;
  }

  for (const idx of targets) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    const ps = state.photoSettings[idx];
    if (p.activeFilters !== undefined) ps.activeFilters = [...p.activeFilters];
    if (p.filterIntensity !== undefined) ps.filterIntensity = p.filterIntensity;
    if (p.filterVariant !== undefined) ps.filterVariant = p.filterVariant;
    if (p.filterParams) ps.filterParams = JSON.parse(JSON.stringify(p.filterParams));
    if (p.brightness !== undefined) ps.brightness = p.brightness;
    if (p.contrast !== undefined) ps.contrast = p.contrast;
    if (p.toneIntensity !== undefined) ps.toneIntensity = p.toneIntensity;
    if (p.shadowColor !== undefined) ps.shadowColor = p.shadowColor;
    if (p.highlightColor !== undefined) ps.highlightColor = p.highlightColor;
    if (p.toneBalance !== undefined) ps.toneBalance = p.toneBalance;
    if (p.borderId !== undefined) ps.borderId = p.borderId;
    if (p.borderEnabled !== undefined) ps.borderEnabled = p.borderEnabled;
  }

  // Repaint affected thumbnails
  for (const idx of targets) repaintGridSlot(idx);

  // Sync sidebar UI to the effective settings of the primary selected photo
  if (state.selectedIndex !== null) {
    syncControlsToEffectiveSettings(state.selectedIndex);
  }
  updateSidebarPreview();
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);

  const n = targets.length;
  showToast(`Preset "${name}" applied to ${n} photo${n !== 1 ? 's' : ''}`);
}

export function deletePreset(name) {
  const presets = getPresets();
  delete presets[name];
  writeJson(STORAGE_KEYS.presets, presets);
  renderPresetList();
}

export function renderPresetList() {
  const sel = document.getElementById('preset-select');
  if (!sel) return;
  const presets = getPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  const prev = sel.value;
  sel.innerHTML = '<option value="">— select preset —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  // Restore selection if still valid
  if (prev && names.includes(prev)) sel.value = prev;
}

export function exportPresets() {
  const presets = getPresets();
  if (Object.keys(presets).length === 0) {
    showToast('No presets to export');
    return;
  }
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mugdump-presets.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${Object.keys(presets).length} preset(s)`);
}

/** Wire the preset toolbar (save / load / delete / import / export). */
export function setupPresetControls() {
  document.getElementById('btn-save-preset')?.addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (name && name.trim()) savePreset(name.trim());
  });

  document.getElementById('btn-load-preset')?.addEventListener('click', () => {
    const sel = document.getElementById('preset-select');
    if (sel?.value) loadPreset(sel.value);
    else showToast('Select a preset first');
  });

  document.getElementById('btn-delete-preset')?.addEventListener('click', () => {
    const sel = document.getElementById('preset-select');
    if (!sel?.value) {
      showToast('Select a preset first');
      return;
    }
    if (confirm(`Delete preset "${sel.value}"?`)) deletePreset(sel.value);
  });

  document.getElementById('btn-export-presets')?.addEventListener('click', exportPresets);

  document.getElementById('btn-import-presets')?.addEventListener('click', () => {
    document.getElementById('preset-import-input')?.click();
  });

  document.getElementById('preset-import-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (typeof imported !== 'object' || Array.isArray(imported))
          throw new Error('Invalid format');
        const existing = getPresets();
        const merged = { ...existing, ...imported };
        writeJson(STORAGE_KEYS.presets, merged);
        renderPresetList();
        showToast(`Imported ${Object.keys(imported).length} preset(s)`);
      } catch {
        showToast('Import failed — not a valid preset file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // allow re-importing same file
  });

  renderPresetList();
}
