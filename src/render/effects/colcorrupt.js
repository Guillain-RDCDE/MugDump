import { blendIntensity } from './shared.js';
import { PHOTO_HEIGHT } from '../../core/gbcam.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params, intensity, photoSeed }) {
  // ── Color Corrupt ──────────────────────────────────────────────────────
  // Randomly selected GB pixel rows get their colour channels scrambled:
  // channel swap, inversion, hue rotation, or saturation crush — mimics
  // corrupted video data or damaged tape read errors.
  const densityPct = (params.density ?? 35) / 100;
  const strengthPct = (params.strength ?? 65) / 100;

  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);

  // Seeded RNG so corruption bands are stable across repaints
  let _rngCC = (photoSeed * 1664525 + 1013904223) | 0;
  const _randCC = () => {
    _rngCC = (_rngCC * 1664525 + 1013904223) | 0;
    return (_rngCC >>> 0) / 0x100000000;
  };

  // Assign a corruption type per GB pixel row (stable per seed)
  const gbH = PHOTO_HEIGHT;
  const rowTypes = new Array(gbH);
  for (let row = 0; row < gbH; row++) {
    rowTypes[row] = _randCC() < densityPct ? Math.floor(_randCC() * 4) : -1;
  }

  for (let y = 0; y < height; y++) {
    const gbRow = Math.min(gbH - 1, Math.floor(y / Math.max(1, s)));
    const type = rowTypes[gbRow];
    if (type < 0) continue;

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = sd[i],
        g = sd[i + 1],
        b = sd[i + 2];
      let nr = r,
        ng = g,
        nb = b;

      if (type === 0) {
        // Swap R ↔ B
        nr = Math.round(r * (1 - strengthPct) + b * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + r * strengthPct);
      } else if (type === 1) {
        // Invert all channels
        nr = Math.round(r * (1 - strengthPct) + (255 - r) * strengthPct);
        ng = Math.round(g * (1 - strengthPct) + (255 - g) * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + (255 - b) * strengthPct);
      } else if (type === 2) {
        // Boost saturation — push each channel away from grey
        const grey = (r + g + b) / 3;
        nr = Math.min(255, Math.max(0, Math.round(r + (r - grey) * strengthPct * 2.5)));
        ng = Math.min(255, Math.max(0, Math.round(g + (g - grey) * strengthPct * 2.5)));
        nb = Math.min(255, Math.max(0, Math.round(b + (b - grey) * strengthPct * 2.5)));
      } else {
        // Channel cycle: R→G, G→B, B→R
        nr = Math.round(r * (1 - strengthPct) + g * strengthPct);
        ng = Math.round(g * (1 - strengthPct) + b * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + r * strengthPct);
      }
      out[i] = nr;
      out[i + 1] = ng;
      out[i + 2] = nb;
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
