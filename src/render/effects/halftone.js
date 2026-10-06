/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, s, params }) {
  const htRad = (params.radius ?? 38) / 100;
  const htDarkness = (params.darkness ?? 35) / 100;
  const htShape = params.shape ?? 'circle';
  const r = Math.max(1, Math.round(s * htRad));
  ec.fillStyle = `rgba(0,0,0,${htDarkness.toFixed(2)})`;
  for (let y = Math.round(s * 0.5); y < height; y += s) {
    for (let x = Math.round(s * 0.5); x < width; x += s) {
      ec.beginPath();
      if (htShape === 'circle') {
        ec.arc(x, y, r, 0, Math.PI * 2);
      } else if (htShape === 'square') {
        ec.rect(x - r, y - r, r * 2, r * 2);
      } else if (htShape === 'diamond') {
        ec.moveTo(x, y - r);
        ec.lineTo(x + r, y);
        ec.lineTo(x, y + r);
        ec.lineTo(x - r, y);
        ec.closePath();
      }
      ec.fill();
    }
  }
}
