/** Helpers shared by the effect modules. */

/**
 * Deterministic pseudo-random float in [0,1) seeded from two integers.
 * Used to stabilise noise/glitch effects so they don't flicker on every repaint.
 * @param {number} seed1 — first seed (e.g. photo index)
 * @param {number} seed2 — second seed (e.g. pixel index or row)
 */
export function seededRand(seed1, seed2) {
  let h = (seed1 * 1664525 + seed2 * 1013904223 + 0x9e3779b9) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/**
 * Blend an effect's RGBA output back towards the untouched source so the
 * intensity slider works for pixel-rewriting effects: at intensity 1 the
 * output is kept, at 0 the source wins. Alpha is left as is.
 * @param {Uint8ClampedArray} out — effect output, modified in place
 * @param {Uint8ClampedArray} src — original pixels
 * @param {number} intensity — 0..1
 */
export function blendIntensity(out, src, intensity) {
  const t = Math.min(1, Math.max(0, intensity));
  if (t >= 1) return;
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round(src[i] * (1 - t) + out[i] * t);
    out[i + 1] = Math.round(src[i + 1] * (1 - t) + out[i + 1] * t);
    out[i + 2] = Math.round(src[i + 2] * (1 - t) + out[i + 2] * t);
  }
}
