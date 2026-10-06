import { state } from '../app/state.js';

/**
 * Applies a visual effect overlay onto an already-rendered export canvas.
 * All effects are rendered to an offscreen canvas first, then composited at
 * `intensity` opacity so the user's intensity slider works for every filter.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width     — canvas width in px
 * @param {number} height    — canvas height in px
 * @param {number} scale     — pixels-per-GB-pixel
 * @param {string} filter    — filter id from FILTER_DEFS (e.g. 'crt', 'noise', 'bayer', etc.)
 * @param {number} intensity — 0.0–1.0 (default 1.0)
 * @param {string} variant   — crt only: 'fine'|'medium'|'thick'|'wide' (default 'medium')
 */
// ── Tone adjustments (brightness / contrast / split toning) ─────────────────

export function applyToneAdjustments(ctx, width, height, settings, forExport = false) {
  if (!forExport && state.effectsPreviewMode) return;
  const s = settings || state;
  const brightness = (state.sectionEnabled?.exposure ?? true) ? (s.brightness ?? 0) : 0;
  const contrast = (state.sectionEnabled?.exposure ?? true) ? (s.contrast ?? 0) : 0;
  const toneIntensity = (state.sectionEnabled?.splitTone ?? true) ? (s.toneIntensity ?? 0) : 0;
  const { shadowColor, highlightColor, toneBalance } = s;
  if (brightness === 0 && contrast === 0 && toneIntensity === 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  // Pre-compute contrast factor (S-curve through 128)
  const contrastFactor = contrast !== 0 ? (259 * (contrast + 255)) / (255 * (259 - contrast)) : 1;

  // Parse split toning colors
  const sr = parseInt(shadowColor.slice(1, 3), 16);
  const sg = parseInt(shadowColor.slice(3, 5), 16);
  const sb = parseInt(shadowColor.slice(5, 7), 16);
  const hr = parseInt(highlightColor.slice(1, 3), 16);
  const hg = parseInt(highlightColor.slice(3, 5), 16);
  const hb = parseInt(highlightColor.slice(5, 7), 16);
  const toneStr = toneIntensity / 100;
  const mid = (toneBalance + 100) / 200; // 0..1, default 0.5

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i],
      g = d[i + 1],
      b = d[i + 2];

    // Brightness
    if (brightness !== 0) {
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
    }

    // Contrast
    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, Math.round(contrastFactor * (r - 128) + 128)));
      g = Math.min(255, Math.max(0, Math.round(contrastFactor * (g - 128) + 128)));
      b = Math.min(255, Math.max(0, Math.round(contrastFactor * (b - 128) + 128)));
    }

    // Split toning — blend toward shadow/highlight tint based on luminance
    if (toneIntensity > 0) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sw = mid > 0 ? Math.max(0, 1 - lum / mid) : 0;
      const hw = mid < 1 ? Math.max(0, (lum - mid) / (1 - mid)) : 0;
      r = Math.min(255, Math.max(0, Math.round(r + toneStr * (sw * (sr - r) + hw * (hr - r)))));
      g = Math.min(255, Math.max(0, Math.round(g + toneStr * (sw * (sg - g) + hw * (hg - g)))));
      b = Math.min(255, Math.max(0, Math.round(b + toneStr * (sw * (sb - b) + hw * (hb - b)))));
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}
