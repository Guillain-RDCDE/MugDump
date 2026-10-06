/**
 * Effect registry and pipeline.
 *
 * Every effect lives in its own module and exports `apply(env)` where env is
 * { ctx, ec, width, height, s, params, intensity, variant, photoSeed }:
 *   ctx       — the photo canvas context (direct effects rewrite it in place)
 *   ec        — an offscreen context the same size (overlay effects draw here;
 *               the registry composites it onto ctx at `intensity`)
 *   s         — integer pixels per Game Boy pixel
 *   params    — this effect's parameters (see data/filter-defs.js)
 *   photoSeed — stable per-photo seed for noise-like effects
 */
import { state } from '../../app/state.js';
import * as crt from './crt.js';
import * as lcd from './lcd.js';
import * as grid from './grid.js';
import * as vignette from './vignette.js';
import * as halftone from './halftone.js';
import * as dot from './dot.js';
import * as glow from './glow.js';
import * as chroma from './chroma.js';
import * as jitter from './jitter.js';
import * as noise from './noise.js';
import * as ghosting from './ghosting.js';
import * as pixsort from './pixsort.js';
import * as blkglitch from './blkglitch.js';
import * as wavewarp from './wavewarp.js';
import * as zoomblur from './zoomblur.js';
import * as bayer from './bayer.js';
import * as floyd from './floyd.js';
import * as interlace from './interlace.js';
import * as chswap from './chswap.js';
import * as rgbplanes from './rgbplanes.js';
import * as colcorrupt from './colcorrupt.js';

const EFFECTS = {
  crt: { apply: crt.apply, overlay: true },
  lcd: { apply: lcd.apply, overlay: true },
  grid: { apply: grid.apply, overlay: true },
  vignette: { apply: vignette.apply, overlay: true },
  halftone: { apply: halftone.apply, overlay: true },
  dot: { apply: dot.apply, overlay: true },
  glow: { apply: glow.apply, overlay: false },
  chroma: { apply: chroma.apply, overlay: false },
  jitter: { apply: jitter.apply, overlay: false },
  noise: { apply: noise.apply, overlay: false },
  ghosting: { apply: ghosting.apply, overlay: false },
  pixsort: { apply: pixsort.apply, overlay: false },
  blkglitch: { apply: blkglitch.apply, overlay: false },
  wavewarp: { apply: wavewarp.apply, overlay: false },
  zoomblur: { apply: zoomblur.apply, overlay: false },
  bayer: { apply: bayer.apply, overlay: false },
  floyd: { apply: floyd.apply, overlay: false },
  interlace: { apply: interlace.apply, overlay: false },
  chswap: { apply: chswap.apply, overlay: false },
  rgbplanes: { apply: rgbplanes.apply, overlay: false },
  colcorrupt: { apply: colcorrupt.apply, overlay: false },
};

export const EFFECT_IDS = Object.keys(EFFECTS);

/**
 * Apply one effect to an already-rendered canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width — canvas width in px
 * @param {number} height — canvas height in px
 * @param {number} scale — pixels per GB pixel
 * @param {string} filter — effect id (see data/filter-defs.js)
 * @param {number} intensity — 0..1
 * @param {string} variant — CRT scanline variant
 * @param {object} filterParams — per-effect parameter map
 * @param {number} photoSeed — stable seed (photo index)
 */
export function applyExportFilter(
  ctx,
  width,
  height,
  scale,
  filter,
  intensity = 1.0,
  variant = 'medium',
  filterParams,
  photoSeed = 0,
) {
  const effect = EFFECTS[filter];
  if (!effect || intensity <= 0) return;
  const allParams = filterParams || state.filterParams;
  const env = {
    ctx,
    width,
    height,
    s: Math.max(1, Math.round(scale)),
    params: allParams[filter] || {},
    intensity,
    variant,
    photoSeed,
  };

  if (!effect.overlay) {
    effect.apply(env);
    return;
  }

  // Overlay effects render onto an offscreen canvas that is then drawn over the
  // photo at the requested intensity.
  const overlay = Object.assign(document.createElement('canvas'), { width, height });
  env.ec = overlay.getContext('2d');
  effect.apply(env);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity));
  ctx.drawImage(overlay, 0, 0);
  ctx.restore();
}

/**
 * Apply every active effect in the user's chosen order.
 * `activeFilters` is a Set of effect ids; `filterParams` the parameter map.
 */
export function applyActiveEffects(
  ctx,
  width,
  height,
  scale,
  filterIntensity,
  filterVariant,
  filterParams,
  activeFilters,
  forExport = false,
  photoSeed = 0,
) {
  if (!forExport && state.effectsPreviewMode) return;
  if (state.sectionEnabled?.effects === false) return;
  const af = activeFilters || state.activeFilters;
  if (af.size === 0) return;
  // Follow state.filterOrder, then any active effect missing from it (a stale
  // stored order must never silently drop a newer effect).
  const baseOrder = state.filterOrder || [];
  const known = new Set(baseOrder);
  const order = [...baseOrder, ...[...af].filter((id) => !known.has(id))];
  for (const id of order) {
    if (af.has(id)) {
      applyExportFilter(
        ctx,
        width,
        height,
        scale,
        id,
        filterIntensity,
        filterVariant,
        filterParams,
        photoSeed,
      );
    }
  }
}
