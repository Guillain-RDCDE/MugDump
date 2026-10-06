import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity, photoSeed }) {
  // ── Block Glitch ──────────────────────────────────────────────────────
  // Picks random horizontal strips and shifts each one sideways with
  // wraparound — simulates corrupted video block data.
  const shiftPct = (params.shift ?? 40) / 100;
  const densityPct = (params.density ?? 30) / 100;
  const sizePct = (params.size ?? 20) / 100;
  const maxHeightPct = (params.maxheight ?? 30) / 100;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);
  const maxShift = Math.max(1, Math.round(width * shiftPct * 0.5));
  const maxBlockH = Math.max(1, Math.round(height * maxHeightPct * sizePct));
  const numBlocks = Math.max(1, Math.round(densityPct * 25));

  // Seeded RNG so block layout is stable across repaints (no flicker)
  let _rngBg = (photoSeed * 1664525 + 1013904223) | 0;
  const _randBg = () => {
    _rngBg = (_rngBg * 1664525 + 1013904223) | 0;
    return (_rngBg >>> 0) / 0x100000000;
  };

  for (let b = 0; b < numBlocks; b++) {
    const y0 = Math.floor(_randBg() * height);
    const bh = Math.max(1, Math.ceil(_randBg() * maxBlockH));
    const dxs = Math.round((_randBg() - 0.5) * 2 * maxShift);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      for (let x = 0; x < width; x++) {
        const srcX = (((x - dxs) % width) + width) % width;
        const di = (y * width + x) * 4;
        const si = (y * width + srcX) * 4;
        out[di] = sd[si];
        out[di + 1] = sd[si + 1];
        out[di + 2] = sd[si + 2];
        out[di + 3] = sd[si + 3];
      }
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
