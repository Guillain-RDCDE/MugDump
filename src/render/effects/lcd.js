/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, s, params }) {
  const spStr = (params.subpixel ?? 30) / 100;
  const lcdBleed = (params.bleed ?? 0) / 100;
  // Scale separator lines proportionally so they look the same at any render scale.
  // Target ~15% of the cell; clamp to at least 1px.
  const sepH = Math.max(1, Math.round(s * 0.15));
  const sepW = Math.max(1, Math.round(s * 0.12));
  // Row gaps
  for (let y = s - sepH; y < height; y += s) {
    ec.fillStyle = 'rgba(0,0,0,0.38)';
    ec.fillRect(0, y, width, sepH);
  }
  // Column separators
  for (let x = s; x < width; x += s) {
    ec.fillStyle = 'rgba(0,0,0,0.22)';
    ec.fillRect(x - sepW, 0, sepW, height);
  }
  // RGB sub-pixel tint columns (strength from slider)
  if (s >= 4 && spStr > 0) {
    const cw = Math.max(1, Math.round(s / 3));
    for (let x = 0; x < width; x += s) {
      ec.fillStyle = `rgba(255,80,80,${spStr})`;
      ec.fillRect(x, 0, cw, height);
      ec.fillStyle = `rgba(80,255,80,${spStr})`;
      ec.fillRect(x + cw, 0, cw, height);
      ec.fillStyle = `rgba(80,80,255,${spStr})`;
      ec.fillRect(x + cw * 2, 0, cw, height);
    }
  }
  // Backlight bleed — faint white glow from corners/edges
  if (lcdBleed > 0) {
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ];
    const bleedR = Math.max(width, height) * 0.6;
    for (const [cx2, cy2] of corners) {
      const bg = ec.createRadialGradient(cx2, cy2, 0, cx2, cy2, bleedR);
      bg.addColorStop(0, `rgba(255,255,255,${lcdBleed * 0.18})`);
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ec.fillStyle = bg;
      ec.fillRect(0, 0, width, height);
    }
  }
}
