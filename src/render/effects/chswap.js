import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Channel Swap ───────────────────────────────────────────────────────
  // Rearranges RGB channels (RGB, RBG, GRB, GBR, BRG, BGR).
  const mode = params.mode ?? 'rgb';
  const channelMap = {
    rgb: [0, 1, 2],
    rbg: [0, 2, 1],
    grb: [1, 0, 2],
    gbr: [1, 2, 0],
    brg: [2, 0, 1],
    bgr: [2, 1, 0],
  };
  const map = channelMap[mode] || [0, 1, 2];
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const tmp = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = tmp[i + map[0]];
    data[i + 1] = tmp[i + map[1]];
    data[i + 2] = tmp[i + map[2]];
  }
  blendIntensity(data, tmp, intensity);
  ctx.putImageData(imageData, 0, 0);
}
