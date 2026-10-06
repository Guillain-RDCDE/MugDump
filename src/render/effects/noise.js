import { seededRand, blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity, photoSeed }) {
  // ── Noise / Static ──────────────────────────────────────────────────────
  // Film: per-pixel luminance noise. Static: random R/G/B noise. Bands: row noise.
  // Uses seeded PRNG (photoSeed) so noise is stable across repaints.
  const noiseAmt = (params.amount ?? 40) / 100;
  const noiseType = params.type ?? 'film';
  const orig = ctx.getImageData(0, 0, width, height);
  const d = orig.data;
  const src = new Uint8ClampedArray(d); // original for intensity blend

  if (noiseType === 'film') {
    for (let i = 0; i < d.length; i += 4) {
      const g = (seededRand(photoSeed, i) - 0.5) * noiseAmt * 200;
      d[i] = Math.min(255, Math.max(0, d[i] + g));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + g));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + g));
    }
  } else if (noiseType === 'static') {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] + (seededRand(photoSeed, i) - 0.5) * noiseAmt * 200));
      d[i + 1] = Math.min(
        255,
        Math.max(0, d[i + 1] + (seededRand(photoSeed, i + 1) - 0.5) * noiseAmt * 200),
      );
      d[i + 2] = Math.min(
        255,
        Math.max(0, d[i + 2] + (seededRand(photoSeed, i + 2) - 0.5) * noiseAmt * 200),
      );
    }
  } else if (noiseType === 'bands') {
    for (let y = 0; y < height; y++) {
      const rowNoise = (seededRand(photoSeed, y) - 0.5) * noiseAmt * 180;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        d[i] = Math.min(255, Math.max(0, d[i] + rowNoise));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + rowNoise));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + rowNoise));
      }
    }
  }
  blendIntensity(d, src, intensity);
  ctx.putImageData(orig, 0, 0);
}
