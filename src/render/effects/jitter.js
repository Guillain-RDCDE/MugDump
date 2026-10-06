import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params, intensity }) {
  // ── Scanline Jitter ────────────────────────────────────────────────────
  // Displaces each row of pixels horizontally by a deterministic amount,
  // grouped by GB tile row for an authentic corrupted-signal look.
  const jitterPct = (params.amount ?? 40) / 100;
  const jitterFreq = (params.frequency ?? 50) / 100; // 0.1–1.0: lower = fewer affected rows
  const maxShift = Math.max(1, Math.round(s * jitterPct * 3));
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data,
    o = dst.data;
  const tileH = Math.max(1, s); // pixels per GB pixel row

  for (let y = 0; y < height; y++) {
    const tileY = Math.floor(y / tileH);
    const frac = (Math.sin(tileY * 43758.5453123) * 43758.5453123) % 1;
    const norm = frac < 0 ? frac + 1 : frac;
    // Frequency: only displace rows where the "noise" exceeds (1 - jitterFreq)
    const shouldJitter = norm > 1 - jitterFreq;
    const shift = shouldJitter ? Math.round((norm * 2 - 1) * maxShift) : 0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + shift));
      const i = (y * width + x) * 4;
      const si = (y * width + sx) * 4;
      o[i] = d[si];
      o[i + 1] = d[si + 1];
      o[i + 2] = d[si + 2];
      o[i + 3] = 255;
    }
  }

  blendIntensity(o, d, intensity);
  ctx.putImageData(dst, 0, 0);
}
