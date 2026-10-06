import { getEffectiveSettings, setScopedSetting } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { attachColorPickerToInput, syncColorSwatchBtn } from './color-picker.js';
import { syncFilterAccordion } from './effects-panel.js';
import { setSectionEnabled } from './effects-actions.js';
import { showToast } from './feedback.js';
import { repaintInteractive } from './grid.js';
import { updateCurrentPalettePin, updatePalettePickerBtn } from './palette-picker.js';

/** Sync all right-panel controls to reflect the effective settings for `index`.
 *  Called when scope='photo' and the selected photo changes, or scope toggles. */
export function syncControlsToEffectiveSettings(index) {
  if (index === null || index === undefined) return;
  const eff = getEffectiveSettings(index);

  // Palette picker button
  updatePalettePickerBtn(eff.palette);
  // Picker list active state
  const effPalId = eff.palette?.id;
  document.querySelectorAll('.pal-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.palette === effPalId);
  });
  updateCurrentPalettePin();

  // Sync filter accordion checkboxes + param values
  syncFilterAccordion(eff);

  // Tone controls
  const bEl = document.getElementById('tone-brightness');
  const bVal = document.getElementById('tone-brightness-val');
  if (bEl) bEl.value = eff.brightness;
  if (bVal) bVal.textContent = eff.brightness > 0 ? `+${eff.brightness}` : String(eff.brightness);

  const cEl = document.getElementById('tone-contrast');
  const cVal = document.getElementById('tone-contrast-val');
  if (cEl) cEl.value = eff.contrast;
  if (cVal) cVal.textContent = eff.contrast > 0 ? `+${eff.contrast}` : String(eff.contrast);

  const tiEl = document.getElementById('tone-intensity');
  const tiVal = document.getElementById('tone-intensity-val');
  if (tiEl) tiEl.value = eff.toneIntensity;
  if (tiVal) tiVal.textContent = `${eff.toneIntensity}%`;

  const scEl = document.getElementById('tone-shadow-color');
  if (scEl) {
    scEl.value = eff.shadowColor;
    syncColorSwatchBtn(scEl, eff.shadowColor);
  }

  const hcEl = document.getElementById('tone-highlight-color');
  if (hcEl) {
    hcEl.value = eff.highlightColor;
    syncColorSwatchBtn(hcEl, eff.highlightColor);
  }

  const balEl = document.getElementById('tone-balance');
  const balVal = document.getElementById('tone-balance-val');
  if (balEl) balEl.value = eff.toneBalance;
  if (balVal)
    balVal.textContent = eff.toneBalance > 0 ? `+${eff.toneBalance}` : String(eff.toneBalance);

  // Border picker + checkbox
  const borderCb = document.getElementById('border-enabled-check');
  if (borderCb) borderCb.checked = eff.borderEnabled ?? false;
  document.querySelectorAll('.border-frame-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.frameId === eff.borderId);
  });
}

// ── Tone controls wiring ─────────────────────────────────────────────────────

export function setupToneControls() {
  function redrawDetail() {
    repaintInteractive();
  }

  const brightnessEl = document.getElementById('tone-brightness');
  const brightnessVal = document.getElementById('tone-brightness-val');
  const contrastEl = document.getElementById('tone-contrast');
  const contrastVal = document.getElementById('tone-contrast-val');
  const intensityEl = document.getElementById('tone-intensity');
  const intensityVal = document.getElementById('tone-intensity-val');
  const shadowColorEl = document.getElementById('tone-shadow-color');
  const highlightColorEl = document.getElementById('tone-highlight-color');
  const balanceEl = document.getElementById('tone-balance');
  const balanceVal = document.getElementById('tone-balance-val');
  const resetBtn = document.getElementById('exposure-reset');

  if (!brightnessEl) return; // not in DOM (shouldn't happen)

  // Attach custom color pickers to shadow / highlight inputs
  if (shadowColorEl) attachColorPickerToInput(shadowColorEl);
  if (highlightColorEl) attachColorPickerToInput(highlightColorEl);

  brightnessEl.addEventListener('input', () => {
    setScopedSetting('brightness', parseInt(brightnessEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.brightness ?? state.brightness;
    brightnessVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });

  contrastEl.addEventListener('input', () => {
    setScopedSetting('contrast', parseInt(contrastEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.contrast ?? state.contrast;
    contrastVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });

  intensityEl.addEventListener('input', () => {
    setScopedSetting('toneIntensity', parseInt(intensityEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneIntensity ?? state.toneIntensity;
    intensityVal.textContent = `${v}%`;
    redrawDetail();
  });

  shadowColorEl.addEventListener('input', () => {
    setScopedSetting('shadowColor', shadowColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  highlightColorEl.addEventListener('input', () => {
    setScopedSetting('highlightColor', highlightColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  balanceEl.addEventListener('input', () => {
    setScopedSetting('toneBalance', parseInt(balanceEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneBalance ?? state.toneBalance;
    balanceVal.textContent = v > 0 ? `+${v}` : String(v);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  // Exposure reset — brightness + contrast only
  resetBtn?.addEventListener('click', () => {
    pushUndo();
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
        ps.brightness = 0;
        ps.contrast = 0;
      }
    } else {
      state.brightness = 0;
      state.contrast = 0;
    }
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    setSectionEnabled('exposure', false);
    showToast('Exposure reset');
  });

  // Split Tone reset — toning fields only
  document.getElementById('split-tone-reset')?.addEventListener('click', () => {
    pushUndo();
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
        ps.toneIntensity = 0;
        ps.toneBalance = 0;
        ps.shadowColor = '#0033aa';
        ps.highlightColor = '#ff8800';
      }
    } else {
      state.toneIntensity = 0;
      state.toneBalance = 0;
      state.shadowColor = '#0033aa';
      state.highlightColor = '#ff8800';
    }
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    setSectionEnabled('splitTone', false);
    showToast('Split tone reset');
  });
}
