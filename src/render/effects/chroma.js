import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params, intensity }) {
  // ── Chromatic Aberration — independent H/V/R channel shifts ──────────
  const cp = params;
  const hpx = Math.round((s * (cp.shiftH ?? 75)) / 100);
  const vpx = Math.round((s * (cp.shiftV ?? 0)) / 100);
  const rpx = Math.round((s * (cp.shiftR ?? 0)) / 100);
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data,
    o = dst.data;
  const cx2 = width / 2,
    cy2 = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Radial component: normalised direction vector from centre
      let nx = 0,
        ny = 0;
      if (rpx !== 0) {
        const dx = x - cx2,
          dy = y - cy2;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = dx / dist;
        ny = dy / dist;
      }
      // Red channel: shift +H/+V/+R
      const rx = Math.min(width - 1, Math.max(0, Math.round(x + hpx + nx * rpx)));
      const ry = Math.min(height - 1, Math.max(0, Math.round(y + vpx + ny * rpx)));
      // Blue channel: shift -H/-V/-R
      const bx = Math.min(width - 1, Math.max(0, Math.round(x - hpx - nx * rpx)));
      const by = Math.min(height - 1, Math.max(0, Math.round(y - vpx - ny * rpx)));

      const ri = (ry * width + rx) * 4;
      const bi = (by * width + bx) * 4;
      o[i] = d[ri]; // R from shifted source
      o[i + 1] = d[i + 1]; // G stays
      o[i + 2] = d[bi + 2]; // B from shifted source
      o[i + 3] = 255;
    }
  }

  blendIntensity(o, d, intensity);

  ctx.putImageData(dst, 0, 0);
}
