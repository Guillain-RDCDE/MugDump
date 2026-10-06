import { blendIntensity } from './shared.js';

/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Pixel Sort ────────────────────────────────────────────────────────
  // Finds contiguous runs of pixels above a luminance threshold and sorts
  // them by brightness — dark-to-bright in direction of travel — creating
  // coloured streaks that drip or slide along the image.
  const threshPct = (params.threshold ?? 50) / 100;
  const dir = params.direction ?? 'down';
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd); // start as identity copy
  const lum = (i) => (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255;

  // Helper: sort a run of pixels, write to out
  const sortRun = (pixels, ascending) => {
    const run = pixels.map((i) => [lum(i), sd[i], sd[i + 1], sd[i + 2], sd[i + 3]]);
    run.sort((a, b) => (ascending ? a[0] - b[0] : b[0] - a[0]));
    for (let j = 0; j < run.length; j++) {
      const ri = pixels[j];
      out[ri] = run[j][1];
      out[ri + 1] = run[j][2];
      out[ri + 2] = run[j][3];
      out[ri + 3] = run[j][4];
    }
  };

  if (dir === 'down' || dir === 'vertical') {
    // Sort columns top→bottom, dark at top
    for (let x = 0; x < width; x++) {
      let run = [];
      for (let y = 0; y <= height; y++) {
        const i = (y * width + x) * 4;
        const l = y < height ? lum(i) : -1;
        if (l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, true);
          run = [];
        }
      }
    }
  } else if (dir === 'up') {
    // Sort columns bottom→top, dark at bottom (bright streaks upward)
    for (let x = 0; x < width; x++) {
      let run = [];
      for (let y = height - 1; y >= -1; y--) {
        const i = (Math.max(0, y) * width + x) * 4;
        const l = y >= 0 ? lum(i) : -1;
        if (y >= 0 && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, false);
          run = [];
        }
      }
    }
  } else if (dir === 'right' || dir === 'horizontal') {
    // Sort rows left→right, dark at left
    for (let y = 0; y < height; y++) {
      let run = [];
      for (let x = 0; x <= width; x++) {
        const i = (y * width + x) * 4;
        const l = x < width ? lum(i) : -1;
        if (x < width && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, true);
          run = [];
        }
      }
    }
  } else if (dir === 'left') {
    // Sort rows right→left, dark at right (bright streaks leftward)
    for (let y = 0; y < height; y++) {
      let run = [];
      for (let x = width - 1; x >= -1; x--) {
        const i = (y * width + Math.max(0, x)) * 4;
        const l = x >= 0 ? lum(i) : -1;
        if (x >= 0 && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, false);
          run = [];
        }
      }
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
