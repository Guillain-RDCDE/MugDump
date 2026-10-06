import { paletteToRGB } from '../core/color.js';
import { BORDER_FRAMES } from '../data/border-frames.js';
import { applyActiveEffects } from './effects.js';
import { applyToneAdjustments } from './tone.js';
import { renderPhotoWithTransform } from './transform.js';

export const _borderImageCache = {}; // id → HTMLImageElement (loaded)

export function preloadBorderImages() {
  BORDER_FRAMES.forEach(({ id }) => {
    const img = new Image();
    img.onload = () => {
      _borderImageCache[id] = img;
    };
    img.onerror = () => console.warn(`Border frame not found: ${id}`);
    img.src = `frames/${id}.png`;
  });
}

/**
 * Returns a 160×144 canvas with border pixels colorized to the given palette.
 * Photo area (x 16-143, y 16-127) remains transparent.
 * Returns null if the image hasn't loaded yet.
 */
export function getColorizedBorderCanvas(borderId, palette) {
  const img = _borderImageCache[borderId];
  if (!img) return null;

  const raw = document.createElement('canvas');
  raw.width = 160;
  raw.height = 144;
  const rawCtx = raw.getContext('2d', { willReadFrequently: true });
  rawCtx.drawImage(img, 0, 0);

  const imageData = rawCtx.getImageData(0, 0, 160, 144);
  const d = imageData.data;
  const rgb = paletteToRGB(palette); // [[r,g,b]×4] — index 0=lightest, 3=darkest

  // Photo window bounds in the 160×144 frame (pixels here stay transparent so the photo shows through)
  const PX1 = 16,
    PX2 = 143,
    PY1 = 16,
    PY2 = 127;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      // Transparent pixel — check whether it's the photo window or a border area
      const pidx = i / 4;
      const px = pidx % 160;
      const py = Math.floor(pidx / 160);
      if (px >= PX1 && px <= PX2 && py >= PY1 && py <= PY2) {
        // Inside photo window — leave transparent so the photo beneath shows through
        continue;
      }
      // Outside photo window (e.g. film-strip perforations): fill with darkest palette colour
      // so they look the same in exports as they do in the preview (dark page background).
      const [pr, pg, pb] = rgb[3];
      d[i] = pr;
      d[i + 1] = pg;
      d[i + 2] = pb;
      d[i + 3] = 255;
      continue;
    }
    // Non-transparent border pixel — colorize based on brightness
    const R = d[i];
    const gbIdx = Math.min(3, Math.max(0, Math.round(((255 - R) * 3) / 255)));
    const [pr, pg, pb] = rgb[gbIdx];
    d[i] = pr;
    d[i + 1] = pg;
    d[i + 2] = pb;
    d[i + 3] = 255;
  }

  rawCtx.putImageData(imageData, 0, 0);
  return raw;
}

/**
 * Render a photo with an optional GB Camera border frame.
 * Falls through to renderPhotoWithTransform when borderId is 'none'.
 * When a border is active the canvas becomes 160×144×scale.
 * eff must contain { palette, borderId }.
 */
function renderPhotoWithBorder(ctx, photo, eff, scale, idx) {
  const borderEnabled = eff.borderEnabled && eff.borderId;
  const borderId = borderEnabled ? eff.borderId : 'none';

  if (borderId === 'none') {
    renderPhotoWithTransform(ctx, photo, eff.palette, scale, idx);
    return;
  }

  const BW = 160 * scale;
  const BH = 144 * scale;
  const OX = 16 * scale;
  const OY = 16 * scale;

  ctx.canvas.width = BW;
  ctx.canvas.height = BH;
  ctx.clearRect(0, 0, BW, BH);

  // Draw photo (with any transform) into the photo area slot
  const tmpPhoto = document.createElement('canvas');
  const tmpCtx = tmpPhoto.getContext('2d');
  renderPhotoWithTransform(tmpCtx, photo, eff.palette, scale, idx);
  ctx.drawImage(tmpPhoto, OX, OY);

  // Overlay colorised border (transparent centre reveals photo)
  const borderBase = getColorizedBorderCanvas(borderId, eff.palette);
  if (borderBase) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(borderBase, 0, 0, BW, BH);
  }
}

/**
 * Full render pipeline for a photo: composite → effects → tone.
 * Handles both 'full' scope (effects apply to border+photo) and
 * 'photo' scope (effects applied to photo area only before border composite).
 *
 * Replaces the pattern: renderPhotoWithBorder + applyActiveEffects + applyToneAdjustments
 * at every call site.
 *
 * opts.forExport  — pass forExport=true to effects/tone functions
 */
export function renderPhotoComplete(ctx, photo, eff, scale, idx, opts = {}) {
  const { forExport = false } = opts;

  const borderEnabled = eff.borderEnabled && eff.borderId;
  const photoScopeOnly = eff.filterScope === 'photo' && borderEnabled;
  const filtersToApply = eff.activeFilters;

  if (photoScopeOnly) {
    // Photo-scope: apply effects+tone to the raw 128×112 photo canvas,
    // then composite it behind a clean border.
    const BW = 160 * scale;
    const BH = 144 * scale;
    ctx.canvas.width = BW;
    ctx.canvas.height = BH;
    ctx.clearRect(0, 0, BW, BH);

    const tmpPhoto = document.createElement('canvas');
    const tmpCtx = tmpPhoto.getContext('2d', { willReadFrequently: true });
    renderPhotoWithTransform(tmpCtx, photo, eff.palette, scale, idx);
    const PW = tmpPhoto.width;
    const PH = tmpPhoto.height;

    if (filtersToApply.size > 0) {
      applyActiveEffects(
        tmpCtx,
        PW,
        PH,
        scale,
        eff.filterIntensity,
        eff.filterVariant,
        eff.filterParams,
        filtersToApply,
        forExport,
        idx,
      );
    }
    applyToneAdjustments(tmpCtx, PW, PH, eff, forExport);

    ctx.drawImage(tmpPhoto, 16 * scale, 16 * scale);

    const borderBase = getColorizedBorderCanvas(eff.borderId, eff.palette);
    if (borderBase) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(borderBase, 0, 0, BW, BH);
    }
  } else {
    // Full-scope (default): render photo+border composite first,
    // then apply effects+tone to the full canvas.
    renderPhotoWithBorder(ctx, photo, eff, scale, idx);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (filtersToApply.size > 0) {
      applyActiveEffects(
        ctx,
        W,
        H,
        scale,
        eff.filterIntensity,
        eff.filterVariant,
        eff.filterParams,
        filtersToApply,
        forExport,
        idx,
      );
    }
    applyToneAdjustments(ctx, W, H, eff, forExport);
  }
}

/** Grid thumbnails are rendered at a fixed 4× so effects stay legible. */
export const THUMB_SCALE = 4;
