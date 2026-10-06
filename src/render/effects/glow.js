/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, s, params }) {
  // ── Phosphor Glow ──────────────────────────────────────────────────────
  // Creates a coloured phosphor bloom: tint a copy of the source, blur it
  // heavily, then screen-blend it back so bright pixels glow outward.
  const glowBlurPct = (params.blur ?? 110) / 100;
  const glowIntensity = (params.intensity ?? 80) / 100;
  const ph = params.phosphor ?? 'none';

  // If intensity is zero and no phosphor tint, nothing to render
  if (glowIntensity <= 0 && ph === 'none') return;

  const phColors = {
    green: 'rgba(0,255,80,0.40)',
    amber: 'rgba(255,170,0,0.42)',
    blue: 'rgba(80,160,255,0.40)',
  };

  // Step 1: draw source image onto tinting canvas
  const bloomSrc = Object.assign(document.createElement('canvas'), { width, height });
  const bsc = bloomSrc.getContext('2d');
  bsc.drawImage(ctx.canvas, 0, 0);

  // Step 2: overlay phosphor colour using 'source-atop' so tint only goes where pixels are
  if (ph !== 'none' && phColors[ph]) {
    bsc.globalCompositeOperation = 'source-atop';
    bsc.fillStyle = phColors[ph];
    bsc.fillRect(0, 0, width, height);
    bsc.globalCompositeOperation = 'source-over';
  }

  // Step 3: blur the tinted source. At blur=0 skip blurring.
  const blurPx = Math.round(s * 3.5 * glowBlurPct);
  const bloom = Object.assign(document.createElement('canvas'), { width, height });
  const bc = bloom.getContext('2d');
  if (blurPx > 0) {
    bc.filter = `blur(${blurPx}px)`;
  }
  bc.drawImage(bloomSrc, 0, 0);
  bc.filter = 'none';

  // Step 4: screen blend — bright pixels push toward white/colour with bloom aura
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, glowIntensity));
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(bloom, 0, 0);
  ctx.restore();
}
