import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Wave Warp ─────────────────────────────────────────────────────────
  // Displaces each row horizontally by a sine function of its y position,
  // creating a smooth rippling warp across the image.
  const ampPct = (params.amplitude ?? 30) / 100;
  const freqPct = (params.frequency ?? 40) / 100;
  const amplitude = Math.max(1, Math.round(width * ampPct * 0.25));
  const cycles = 1 + freqPct * 7; // 1 to 8 full cycles over image height

  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd.length);

  for (let y = 0; y < height; y++) {
    const offsetX = Math.round(Math.sin((y / height) * cycles * Math.PI * 2) * amplitude);
    for (let x = 0; x < width; x++) {
      const srcX = (((x - offsetX) % width) + width) % width;
      const di = (y * width + x) * 4;
      const si = (y * width + srcX) * 4;
      out[di] = sd[si];
      out[di + 1] = sd[si + 1];
      out[di + 2] = sd[si + 2];
      out[di + 3] = sd[si + 3];
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
