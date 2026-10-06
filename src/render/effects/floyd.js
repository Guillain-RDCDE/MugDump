import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Floyd-Steinberg Dithering ──────────────────────────────────────────
  // Error diffusion dithering. Converts to luminance first so GB palette images
  // (which are already 4-colour) still show pronounced halftoning. At levels=2
  // this produces pure B&W dithering with classic dot-pattern halftone.
  const levels = params.levels ?? 2;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const floydOrig = new Uint8ClampedArray(data); // copy for intensity blend

  // Build luminance channel with error buffer, then quantise
  const lums = new Float32Array(width * height);
  const errors = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    lums[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }

  const step = 255 / (levels - 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = Math.max(0, Math.min(255, lums[idx] + errors[idx]));
      const quantized = Math.round(val / step) * step;
      const err = val - quantized;
      lums[idx] = quantized;
      // Distribute error (Floyd-Steinberg weights)
      if (x + 1 < width) errors[idx + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x - 1 >= 0) errors[idx + width - 1] += (err * 3) / 16;
        errors[idx + width] += (err * 5) / 16;
        if (x + 1 < width) errors[idx + width + 1] += (err * 1) / 16;
      }
    }
  }

  // Write quantised luminance back to all RGB channels (grayscale result)
  for (let i = 0; i < width * height; i++) {
    const v = Math.round(lums[i]);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
  blendIntensity(data, floydOrig, intensity);
  ctx.putImageData(imageData, 0, 0);
}
