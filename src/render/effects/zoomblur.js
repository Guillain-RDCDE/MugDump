/** Direct effect: rewrites the pixels of `ctx` in place (intensity is blended internally). */
export function apply({ ctx, width, height, params, intensity }) {
  // ── Zoom Blur ─────────────────────────────────────────────────────────
  // Composites multiple scaled copies of the image radiating outward from
  // the centre at decreasing opacity, producing a radial motion-blur effect.
  // The original is always the base layer so brightness is preserved at all amounts.
  const zoomAmt = (params.amount ?? 30) / 100;
  const steps = 12;
  const maxExpand = 0.6; // at 100% the outermost copy is 1.6× the canvas size

  // Snapshot the current canvas before modifying it
  const tmp = Object.assign(document.createElement('canvas'), { width, height });
  tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);

  // Draw original at full opacity as the base
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tmp, 0, 0);

  // Blend zoomed copies on top — each at low opacity, scaled with zoomAmt and intensity
  const blendAlpha = (Math.min(0.9, zoomAmt) / steps) * Math.min(1, Math.max(0, intensity));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sc = 1 + t * zoomAmt * maxExpand;
    const dx = (width - width * sc) / 2;
    const dy = (height - height * sc) / 2;
    ctx.globalAlpha = blendAlpha * (1 - t * 0.4); // fade off at outermost
    ctx.drawImage(tmp, dx, dy, width * sc, height * sc);
  }
  ctx.globalAlpha = 1;
}
