/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, s, params }) {
  // ── Dot Matrix ─────────────────────────────────────────────────────────
  // Dark overlay with circular cut-outs per GB pixel — makes each pixel
  // appear as a rounded dot with visible gaps between them (like a DMD).
  ec.fillStyle = 'rgba(0,0,0,0.88)';
  ec.fillRect(0, 0, width, height);
  // Punch circular holes so the underlying pixel colours show through
  ec.globalCompositeOperation = 'destination-out';
  const dotRadPct = (params.radius ?? 44) / 100;
  const halationPct = (params.halation ?? 0) / 100;
  const dotR = Math.max(1, Math.round(s * dotRadPct));
  const dotRows = Math.ceil(height / s);
  const dotCols = Math.ceil(width / s);
  for (let py = 0; py < dotRows; py++) {
    for (let px = 0; px < dotCols; px++) {
      const cx = Math.round(px * s + s * 0.5);
      const cy = Math.round(py * s + s * 0.5);
      ec.beginPath();
      ec.arc(cx, cy, dotR, 0, Math.PI * 2);
      ec.fill();
    }
  }
  ec.globalCompositeOperation = 'source-over';
  // Halation — soft outer glow around each dot
  if (halationPct > 0) {
    for (let py = 0; py < dotRows; py++) {
      for (let px = 0; px < dotCols; px++) {
        const cx2 = Math.round(px * s + s * 0.5);
        const cy2 = Math.round(py * s + s * 0.5);
        const gR = dotR + Math.round(s * halationPct * 0.8);
        const hGrad = ec.createRadialGradient(cx2, cy2, dotR * 0.8, cx2, cy2, gR);
        hGrad.addColorStop(0, `rgba(255,255,255,${halationPct * 0.3})`);
        hGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ec.fillStyle = hGrad;
        ec.beginPath();
        ec.arc(cx2, cy2, gR, 0, Math.PI * 2);
        ec.fill();
      }
    }
  }
}
