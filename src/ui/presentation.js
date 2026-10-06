import { PHOTO_HEIGHT, PHOTO_WIDTH } from '../core/gbcam.js';
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { renderPhotoComplete } from '../render/photo.js';
import { getTransform } from '../render/transform.js';
import { dom } from './dom.js';

// ── Fullscreen presentation mode ──────────────────────────────────────────────

let _presIndex = null;

export function openPresentation(index) {
  const filled = state.photos.map((p, i) => ({ p, i })).filter((x) => !x.p.isEmpty);
  if (filled.length === 0) return;

  _presIndex = filled.find((x) => x.i === index)?.i ?? filled[0].i;
  state.presentationMode = true;
  dom.presentationOverlay?.classList.remove('hidden');
  renderPresentation();
}

export function closePresentation() {
  state.presentationMode = false;
  dom.presentationOverlay?.classList.add('hidden');
  _presIndex = null;
}

export function presentationStep(dir) {
  const filled = state.photos.map((p, i) => i).filter((i) => !state.photos[i].isEmpty);
  if (filled.length === 0) return;
  const cur = filled.indexOf(_presIndex);
  const next = (cur + dir + filled.length) % filled.length;
  _presIndex = filled[next];
  renderPresentation();
}

function renderPresentation() {
  if (_presIndex === null || !dom.presCanvas) return;
  const photo = state.photos[_presIndex];
  if (!photo || photo.isEmpty) return;

  // Fit photo to the viewport (with generous padding)
  const vw = window.innerWidth - 160;
  const vh = window.innerHeight - 120;
  const t = getTransform(_presIndex);
  const rotated = t.rotate === 90 || t.rotate === 270;
  const srcW = rotated ? PHOTO_HEIGHT : PHOTO_WIDTH;
  const srcH = rotated ? PHOTO_WIDTH : PHOTO_HEIGHT;
  const scale = Math.max(1, Math.floor(Math.min(vw / srcW, vh / srcH)));

  const ctx = dom.presCanvas.getContext('2d');
  const effPres = getEffectiveSettings(_presIndex);
  renderPhotoComplete(ctx, photo, effPres, scale, _presIndex);

  const filled = state.photos.filter((p) => !p.isEmpty).length;
  const pos = state.photos.slice(0, _presIndex + 1).filter((p) => !p.isEmpty).length;
  if (dom.presLabel) dom.presLabel.textContent = `Photo ${_presIndex + 1}  ·  ${pos} / ${filled}`;
}
