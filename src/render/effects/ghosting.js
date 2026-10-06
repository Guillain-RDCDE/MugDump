import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params, intensity }) {
  // ── VHS Ghosting ──────────────────────────────────────────────────────
  // Blends in a horizontally-offset semi-transparent copy of the image,
  // then a second dimmer copy at 2× offset — mimics VHS tape ghosting.
  const ghostOffset = (params.offset ?? 60) / 100;
  const ghostFade = (params.fade ?? 70) / 100;
  const shift2 = Math.max(2, Math.round(s * ghostOffset));
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data,
    o = dst.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Ghost 1: shift left by offset
      const g1x = Math.max(0, x - shift2);
      const g1i = (y * width + g1x) * 4;
      // Ghost 2: shift left by 2× offset (dimmer)
      const g2x = Math.max(0, x - shift2 * 2);
      const g2i = (y * width + g2x) * 4;
      const a1 = (1 - ghostFade) * 0.8;
      const a2 = (1 - ghostFade) * 0.35;
      o[i] = Math.min(255, d[i] + d[g1i] * a1 + d[g2i] * a2);
      o[i + 1] = Math.min(255, d[i + 1] + d[g1i + 1] * a1 + d[g2i + 1] * a2);
      o[i + 2] = Math.min(255, d[i + 2] + d[g1i + 2] * a1 + d[g2i + 2] * a2);
      o[i + 3] = 255;
    }
  }
  blendIntensity(o, d, intensity);
  ctx.putImageData(dst, 0, 0);
}
