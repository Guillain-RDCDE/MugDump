import { seededRand, blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity, photoSeed }) {
  // ── RGB Planes ─────────────────────────────────────────────────────────
  // Separates R, G, B channels into independently displaced planes. Per-row
  // offsets vary by scanline using a seeded hash — creates the prism/rainbow
  // horizontal-strip channel-split look characteristic of analogue signal corruption.
  const shiftPct = (params.shift ?? 50) / 100;
  const scatterPct = (params.scatter ?? 40) / 100;
  const maxShift = Math.max(1, Math.round(width * shiftPct * 0.28));

  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd.length);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  for (let y = 0; y < height; y++) {
    // Per-row seeded scatter — low scatter = parallel strips, high = chaotic
    const rowNoise = seededRand(photoSeed, y * 1337 + 7) - 0.5;

    // R shifts right, B shifts left; scatter adds per-row variation to both
    const rOff = Math.round((0.35 + rowNoise * scatterPct) * maxShift);
    const gOff = Math.round(rowNoise * scatterPct * maxShift * 0.25);
    const bOff = Math.round((0.35 - rowNoise * scatterPct) * maxShift);

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rx = Math.min(width - 1, Math.max(0, x - rOff));
      const gx = Math.min(width - 1, Math.max(0, x - gOff));
      const bx = Math.min(width - 1, Math.max(0, x + bOff));
      out[i] = sd[(y * width + rx) * 4];
      out[i + 1] = sd[(y * width + gx) * 4 + 1];
      out[i + 2] = sd[(y * width + bx) * 4 + 2];
      out[i + 3] = 255;
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
