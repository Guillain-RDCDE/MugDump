/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, s, params, variant }) {
  // Scanline gap: a dark strip at the BOTTOM of each simulated GB pixel row.
  // Each variant controls what fraction of the row height becomes a dark gap.
  // This means variants are dramatically different at any scale ≥ 2.
  const cfgs = {
    fine: { gap: 0.22, alpha: 0.45 }, // subtle gap, light darkening
    medium: { gap: 0.4, alpha: 0.7 }, // classic CRT look
    thick: { gap: 0.58, alpha: 0.84 }, // heavy scanlines
    wide: { gap: 0.76, alpha: 0.94 }, // almost half the row is dark
  };
  const cfg = cfgs[variant] || cfgs.medium;
  const crtMix = (params.mix ?? 100) / 100; // 0–1 blend
  const rowH = Math.max(1, s);
  const gapH = Math.min(Math.max(1, Math.round(rowH * cfg.gap)), rowH - 1);
  const brightH = Math.max(1, rowH - gapH);

  // Draw dark gaps at the bottom of each GB pixel row (use canvas height so border area is covered too)
  const numCrtRows = Math.ceil(height / rowH);
  for (let row = 0; row < numCrtRows; row++) {
    const rowTop = row * rowH;
    ec.fillStyle = `rgba(0,0,0,${cfg.alpha * crtMix})`;
    ec.fillRect(0, rowTop + brightH, width, gapH);
  }

  // Screen curvature — edge darkening + specular highlight
  const curve = params.curve ?? 'none';
  if (curve !== 'none') {
    const cx = width / 2,
      cy = height / 2;
    const isStrong = curve === 'strong';
    const edgeDark = isStrong ? 0.62 : 0.34;
    const innerR = Math.min(width, height) * (isStrong ? 0.15 : 0.28);
    const outerR = Math.max(width, height) * 0.88;
    const edgeGrad = ec.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, `rgba(0,0,0,${edgeDark})`);
    ec.fillStyle = edgeGrad;
    ec.fillRect(0, 0, width, height);
    // Specular highlight at top-centre (convex glass look)
    const specA = isStrong ? 0.14 : 0.07;
    const specGrad = ec.createRadialGradient(cx, height * 0.07, 0, cx, height * 0.28, width * 0.55);
    specGrad.addColorStop(0, `rgba(255,255,255,${specA})`);
    specGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ec.fillStyle = specGrad;
    ec.fillRect(0, 0, width, height);
  }
}
