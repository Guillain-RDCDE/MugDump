import { PHOTO_HEIGHT, PHOTO_WIDTH, renderToCanvas } from '../core/gbcam.js';
import { getEffectiveSettings, setScopedSetting } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { BORDER_FRAMES } from '../data/border-frames.js';
import { _borderImageCache, getColorizedBorderCanvas } from '../render/photo.js';
import { repaintGrid } from './grid.js';
import { updateSidebarPreview } from './sidebar-preview.js';

// ── Border picker ─────────────────────────────────────────────────────────────

// ── Border hover preview ────────────────────────────────────────────────────
// Large preview of a frame (colourised to the current palette, over the current
// photo) shown while hovering its button — so you can see it before clicking.
let _borderPreviewEl = null;

function _getBorderPreviewEl() {
  if (_borderPreviewEl) return _borderPreviewEl;
  const el = document.createElement('div');
  el.className = 'border-preview-popover';
  el.style.display = 'none';
  el.appendChild(document.createElement('canvas'));
  document.body.appendChild(el);
  _borderPreviewEl = el;
  return el;
}

function showBorderPreview(borderId, anchorEl) {
  const S = 2,
    W = 160,
    H = 144;
  const el = _getBorderPreviewEl();
  const cv = el.querySelector('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const palette =
    (state.selectedIndex != null ? getEffectiveSettings(state.selectedIndex)?.palette : null) ||
    state.palette;
  ctx.fillStyle = (palette.colors && palette.colors[0]) || '#9bbc0f';
  ctx.fillRect(0, 0, cv.width, cv.height);

  // Current photo (selected, else first non-empty) drawn inside the frame window
  let photo = null;
  if (state.photos && state.photos.length) {
    const sel = state.selectedIndex;
    const idx =
      sel != null && state.photos[sel] && !state.photos[sel].isEmpty
        ? sel
        : state.photos.findIndex((p) => !p.isEmpty);
    if (idx >= 0 && state.photos[idx] && !state.photos[idx].isEmpty) photo = state.photos[idx];
  }
  if (photo && photo.pixels) {
    const pc = document.createElement('canvas');
    pc.width = PHOTO_WIDTH;
    pc.height = PHOTO_HEIGHT;
    renderToCanvas(pc.getContext('2d'), photo.pixels, palette, 1);
    ctx.drawImage(pc, 16 * S, 16 * S, PHOTO_WIDTH * S, PHOTO_HEIGHT * S);
  }

  // Frame on top — colourised if its image is cached, else the raw PNG
  const fc = getColorizedBorderCanvas(borderId, palette);
  if (fc) ctx.drawImage(fc, 0, 0, cv.width, cv.height);
  else if (_borderImageCache[borderId])
    ctx.drawImage(_borderImageCache[borderId], 0, 0, cv.width, cv.height);

  // Position to the left of the hovered button (sidebar is on the right), clamped
  el.style.display = 'block';
  const pr = el.getBoundingClientRect();
  const ar = anchorEl.getBoundingClientRect();
  let left = ar.left - pr.width - 12;
  if (left < 8) left = Math.min(ar.right + 12, window.innerWidth - pr.width - 8);
  let top = ar.top + ar.height / 2 - pr.height / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - pr.height - 8));
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = top + 'px';
}

function hideBorderPreview() {
  if (_borderPreviewEl) _borderPreviewEl.style.display = 'none';
}

export function setupBorderPicker() {
  const grid = document.getElementById('border-frame-grid');
  if (!grid) return;

  BORDER_FRAMES.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'border-frame-btn';
    btn.dataset.frameId = id;
    btn.title = `Frame ${label}`;

    const img = document.createElement('img');
    img.src = `frames/${id}.png`;
    img.alt = label;
    img.draggable = false;
    btn.appendChild(img);
    const lbl = document.createElement('span');
    lbl.textContent = label;
    btn.appendChild(lbl);

    btn.addEventListener('click', () => {
      pushUndo();
      setScopedSetting('borderId', id);
      // Picking a frame should show it right away — enable borders too.
      setScopedSetting('borderEnabled', true);
      const enableCb = document.getElementById('border-enabled-check');
      if (enableCb) enableCb.checked = true;
      document
        .querySelectorAll('.border-frame-btn')
        .forEach((b) => b.classList.toggle('active', b.dataset.frameId === id));
      repaintGrid();
      updateSidebarPreview();
    });

    btn.addEventListener('mouseenter', () => showBorderPreview(id, btn));
    btn.addEventListener('mouseleave', hideBorderPreview);

    grid.appendChild(btn);
  });

  // Restore active state
  const currentId = state.borderId;
  grid.querySelectorAll('.border-frame-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.frameId === currentId);
  });
}
