import { PHOTO_HEIGHT, PHOTO_WIDTH } from '../core/gbcam.js';
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { renderPhotoComplete } from '../render/photo.js';
import { getTransform } from '../render/transform.js';
import { dom } from './dom.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { syncControlsToEffectiveSettings } from './tone-controls.js';

// ── Solo view ─────────────────────────────────────────────────────────────────

export function enterSoloMode() {
  state.viewMode = 'solo';
  dom.gridPanel.classList.add('solo-mode');
  document.getElementById('btn-view-grid')?.classList.remove('active');
  document.getElementById('btn-view-solo')?.classList.add('active');

  // Auto-select first non-empty photo if nothing selected
  if (state.selectedIndex === null) {
    const first = state.photos.findIndex((p) => !p.isEmpty);
    if (first >= 0) {
      state.selectedIndex = first;
      dom.photoGrid.querySelector(`[data-index="${first}"]`)?.classList.add('selected');
    }
  }
  if (state.selectedIndex !== null) renderSoloView(state.selectedIndex);
}

export function enterGridMode() {
  state.viewMode = 'grid';
  dom.gridPanel.classList.remove('solo-mode');
  document.getElementById('btn-view-grid')?.classList.add('active');
  document.getElementById('btn-view-solo')?.classList.remove('active');
  // Scroll selected photo into view
  if (state.selectedIndex !== null) {
    dom.photoGrid
      .querySelector(`[data-index="${state.selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function renderSoloView(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;

  const wrap = dom.soloCanvas?.parentElement;
  if (!wrap || !dom.soloCanvas) return;

  // Calculate largest integer scale that fits the available canvas area
  const availW = wrap.clientWidth - 8; // minor padding
  const availH = wrap.clientHeight - 8;
  const effSolo = getEffectiveSettings(index);
  const hasBorderSolo = effSolo.borderEnabled && effSolo.borderId;
  const soloDisplayW = hasBorderSolo ? 160 : PHOTO_WIDTH;
  const soloDisplayH = hasBorderSolo ? 144 : PHOTO_HEIGHT;
  const scaleW = Math.max(1, Math.floor(availW / soloDisplayW));
  const scaleH = Math.max(1, Math.floor(availH / soloDisplayH));
  const SOLO_SCALE = Math.max(1, Math.min(scaleW, scaleH));

  const ctx = dom.soloCanvas.getContext('2d');
  renderPhotoComplete(ctx, photo, effSolo, SOLO_SCALE, index);

  // Update info strip
  if (dom.soloLabel) dom.soloLabel.textContent = `Photo ${index + 1}`;
  if (dom.soloMeta) {
    const t = getTransform(index);
    const rotLabel = t.rotate ? ` · ${t.rotate}°` : '';
    const flipLabel = t.flipH || t.flipV ? ` · flipped` : '';
    dom.soloMeta.textContent = `${PHOTO_WIDTH}×${PHOTO_HEIGHT}px · slot ${index + 1}/30${rotLabel}${flipLabel}`;
  }
  // Sync transform button active states
  document.querySelectorAll('#solo-transforms .transform-btn').forEach((btn) => {
    const t2 = getTransform(index);
    if (btn.dataset.action === 'flip-h') btn.classList.toggle('active', t2.flipH);
    if (btn.dataset.action === 'flip-v') btn.classList.toggle('active', t2.flipV);
  });
  updateSidebarPreview();
}

export function soloStep(dir) {
  const photos = state.photos;
  let idx = state.selectedIndex ?? 0;
  let tries = 0;
  while (tries < 30) {
    idx = (idx + dir + photos.length) % photos.length;
    if (!photos[idx]?.isEmpty) break;
    tries++;
  }
  if (photos[idx]?.isEmpty) return;

  dom.photoGrid.querySelectorAll('.photo-slot').forEach((el) => el.classList.remove('selected'));
  dom.photoGrid.querySelector(`[data-index="${idx}"]`)?.classList.add('selected');
  state.selectedIndex = idx;
  state.selectedPhotos = new Set([idx]);
  syncControlsToEffectiveSettings(idx);
  renderSoloView(idx);
}
