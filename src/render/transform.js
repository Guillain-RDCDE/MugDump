import { PHOTO_HEIGHT, PHOTO_WIDTH, renderToCanvas } from '../core/gbcam.js';
import { state } from '../app/state.js';

// ── Photo transforms ────────────────────────────────────────────────────────

/** Get (or default-initialise) the transform for a photo index */
export function getTransform(idx) {
  if (!state.photoTransforms[idx]) {
    state.photoTransforms[idx] = { rotate: 0, flipH: false, flipV: false };
  }
  return state.photoTransforms[idx];
}

/**
 * Render a photo onto ctx with transform applied.
 * Adjusts ctx.canvas dimensions to match the post-rotation output size.
 */
export function renderPhotoWithTransform(ctx, photo, palette, scale, idx) {
  const t = getTransform(idx);
  const sw = PHOTO_WIDTH * scale;
  const sh = PHOTO_HEIGHT * scale;

  if (!t.rotate && !t.flipH && !t.flipV) {
    ctx.canvas.width = sw;
    ctx.canvas.height = sh;
    renderToCanvas(ctx, photo.pixels, palette, scale);
    return;
  }

  const rotated = t.rotate === 90 || t.rotate === 270;
  const dw = rotated ? sh : sw;
  const dh = rotated ? sw : sh;

  const tmp = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
  renderToCanvas(tmp.getContext('2d'), photo.pixels, palette, scale);

  ctx.canvas.width = dw;
  ctx.canvas.height = dh;
  ctx.save();
  ctx.translate(dw / 2, dh / 2);
  if (t.flipH) ctx.scale(-1, 1);
  if (t.flipV) ctx.scale(1, -1);
  ctx.rotate((t.rotate * Math.PI) / 180);
  ctx.drawImage(tmp, -sw / 2, -sh / 2);
  ctx.restore();
}

export function applyTransformAction(idx, action) {
  const t = getTransform(idx);
  if (action === 'rotate-cw') {
    t.rotate = (t.rotate + 90) % 360;
  }
  if (action === 'rotate-ccw') {
    t.rotate = (t.rotate + 270) % 360;
  }
  if (action === 'flip-h') {
    t.flipH = !t.flipH;
  }
  if (action === 'flip-v') {
    t.flipV = !t.flipV;
  }
  if (action === 'reset-transform') {
    t.rotate = 0;
    t.flipH = false;
    t.flipV = false;
  }
}
