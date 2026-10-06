import { PHOTO_HEIGHT, PHOTO_WIDTH } from '../core/gbcam.js';
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { renderPhotoComplete } from '../render/photo.js';
import { hideGifPreviewInfo } from './gif-builder.js';

// ── Multi-select and sidebar preview helpers ───────────────────────────────────────

export function updateSidebarPreview() {
  const canvas = document.getElementById('sidebar-preview-canvas');
  const emptyEl = document.getElementById('sidebar-preview-empty');

  const idx = state.selectedIndex;
  const photo = idx !== null ? state.photos[idx] : null;

  if (!canvas || !photo || photo.isEmpty) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  hideGifPreviewInfo(); // hide GIF frame counter when showing static preview

  const SCALE = 4; // match THUMB_SCALE — ensures filter appearance matches grid thumbnails
  const eff = getEffectiveSettings(idx);
  const hasBorderPrev = eff.borderEnabled && eff.borderId;
  const W = (hasBorderPrev ? 160 : PHOTO_WIDTH) * SCALE;
  const H = (hasBorderPrev ? 144 : PHOTO_HEIGHT) * SCALE;

  // Update canvas resolution and container aspect ratio
  canvas.width = W;
  canvas.height = H;
  const previewWrap = document.getElementById('sidebar-preview-wrap');
  if (previewWrap) previewWrap.style.aspectRatio = hasBorderPrev ? '160/144' : '8/7';

  const tmp = document.createElement('canvas');
  const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });

  renderPhotoComplete(tmpCtx, photo, eff, SCALE, idx);

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

/** Preview panel chrome: sticky pin (on by default) and 1×–6× size stepper, both remembered. */
export function setupPreviewPanel() {
  const previewPinBtn = document.getElementById('preview-pin-btn');
  const previewGroup = document.getElementById('preview-group');
  const PREVIEW_PIN_KEY = 'mugdump:previewPinned';

  function applyPreviewPin(pinned) {
    if (!previewGroup) return;
    previewGroup.classList.toggle('preview-pinned', pinned);
    if (previewPinBtn) previewPinBtn.classList.toggle('active', pinned);
  }

  if (previewPinBtn && previewGroup) {
    // Pinned by default — the preview is the whole point, it must stay visible at
    // the top while you scroll the options below. (Still toggleable via 📌.)
    const storedPin = localStorage.getItem(PREVIEW_PIN_KEY);
    const savedPin = storedPin === null ? true : storedPin === 'true';
    applyPreviewPin(savedPin);
    previewPinBtn.addEventListener('click', () => {
      const nowPinned = !previewGroup.classList.contains('preview-pinned');
      applyPreviewPin(nowPinned);
      localStorage.setItem(PREVIEW_PIN_KEY, String(nowPinned));
    });
  }

  // Preview size stepper (1×–6× of the native 128px width, remembered)
  const PREVIEW_SCALE_KEY = 'mugdump:previewScale';
  const previewWrapEl = document.getElementById('sidebar-preview-wrap');
  const sizeDecBtn = document.getElementById('preview-size-dec');
  const sizeIncBtn = document.getElementById('preview-size-inc');
  const sizeLabelEl = document.getElementById('preview-size-label');
  let previewScale = parseInt(localStorage.getItem(PREVIEW_SCALE_KEY) || '2', 10);
  if (!(previewScale >= 1 && previewScale <= 6)) previewScale = 2;
  function applyPreviewScale(n) {
    previewScale = Math.min(6, Math.max(1, n));
    if (previewWrapEl) previewWrapEl.style.maxWidth = previewScale * 128 + 'px';
    if (sizeLabelEl) sizeLabelEl.textContent = previewScale + '×';
    localStorage.setItem(PREVIEW_SCALE_KEY, String(previewScale));
  }
  applyPreviewScale(previewScale);
  sizeDecBtn?.addEventListener('click', () => applyPreviewScale(previewScale - 1));
  sizeIncBtn?.addEventListener('click', () => applyPreviewScale(previewScale + 1));
}
