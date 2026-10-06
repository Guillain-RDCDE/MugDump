import { PHOTO_HEIGHT, PHOTO_WIDTH } from '../core/gbcam.js';
import { state } from '../app/state.js';
import { enterGifMode, exitGifMode } from './gif-builder.js';

// ── Export scale / format controls ──────────────────────────────────────────

export function getExportDimensions() {
  // Returns { width, height } for the current export scale setting
  if (state.exportScale === 'custom') {
    const w = parseInt(document.getElementById('custom-width')?.value) || 512;
    const h = Math.round(w * (PHOTO_HEIGHT / PHOTO_WIDTH));
    return { width: w, height: h };
  }
  return {
    width: PHOTO_WIDTH * state.exportScale,
    height: PHOTO_HEIGHT * state.exportScale,
  };
}

export function setExportScale(scale) {
  state.exportScale = scale;
  const isCustom = scale === 'custom';

  document.querySelectorAll('.scale-btn').forEach((btn) => {
    const val = btn.dataset.scale === 'custom' ? 'custom' : parseInt(btn.dataset.scale);
    btn.classList.toggle('active', val === scale);
  });

  const wrap = document.getElementById('custom-size-wrap');
  if (wrap) wrap.style.display = isCustom ? 'block' : 'none';

  if (isCustom) {
    // Trigger initial display update
    updateCustomSizeDisplay();
  }
}

export function updateCustomSizeDisplay() {
  const input = document.getElementById('custom-width');
  const display = document.getElementById('custom-size-display');
  if (!input || !display) return;
  const w = parseInt(input.value) || 512;
  const h = Math.round(w * (PHOTO_HEIGHT / PHOTO_WIDTH));
  display.textContent = `${w}×${h}`;
}

export function setExportFormat(fmt) {
  state.exportFormat = fmt;
  document.querySelectorAll('.fmt-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fmt === fmt);
  });
  if (fmt === 'gif') {
    enterGifMode();
  } else {
    exitGifMode();
  }
}
