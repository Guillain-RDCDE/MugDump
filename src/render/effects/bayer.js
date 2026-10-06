import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Bayer Dithering ────────────────────────────────────────────────────
  // Ordered dithering using Bayer matrix, reduces color depth for retro effect.
  const levels = params.levels ?? 4;
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const step = Math.floor(256 / levels);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bayerOrig = new Uint8ClampedArray(data); // copy for intensity blend
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const row = Math.floor(pixelIndex / width) % 4;
    const col = (pixelIndex % width) % 4;
    const threshold = (bayerMatrix[row][col] / 16) * 255;
    for (let c = 0; c < 3; c++) {
      const quantized = Math.floor(data[i + c] / step) * step;
      data[i + c] = data[i + c] > quantized + threshold ? quantized + step : quantized;
    }
  }
  blendIntensity(data, bayerOrig, intensity);
  ctx.putImageData(imageData, 0, 0);
}
