import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params, intensity }) {
  // ── Interlace ──────────────────────────────────────────────────────────
  // Simulates interlaced video: odd fields are slightly shifted horizontally
  // and alternating lines are darkened, mimicking CRT field interleaving.
  const amt = (params.intensity ?? 60) / 100;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);

  // Field offset in pixels (how much odd lines shift right)
  const fieldOffset = Math.round(amt * s * 2); // 2 screen pixels at full
  const darken = 1 - amt * 0.65; // odd lines darkened up to 65%

  for (let y = 0; y < height; y++) {
    const isOdd = y % 2 === 1;
    const dx = isOdd ? fieldOffset : 0;
    const dark = isOdd ? darken : 1;
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(width - 1, Math.max(0, x - dx));
      const di = (y * width + x) * 4;
      const si = (y * width + srcX) * 4;
      out[di] = sd[si] * dark;
      out[di + 1] = sd[si + 1] * dark;
      out[di + 2] = sd[si + 2] * dark;
      out[di + 3] = sd[si + 3];
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
