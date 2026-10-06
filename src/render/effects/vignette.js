/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, params }) {
  const _fv = params.falloff ?? 50;
  const _shape = (params.shape ?? 0) / 100; // 0=round, 1=square
  const _t =
    (typeof _fv === 'string' ? ({ soft: 20, medium: 50, hard: 80 }[_fv] ?? 50) : _fv) / 100; // 0..1
  const cx = width / 2,
    cy = height / 2;
  // Bring vignette closer to centre: inner starts at 20% (soft) → 0% (hard)
  const innerMult = 0.2 - _t * 0.18; // 0.20 → 0.02
  const outerMult = 0.75 - _t * 0.15; // 0.75 → 0.60
  const darkMax = 0.3 + _t * 0.68; // 0.30 → 0.98

  if (_shape > 0.05) {
    // Square-ish vignette — squish canvas coords then apply circular gradient
    ec.save();
    ec.translate(cx, cy);
    ec.scale(1, (width / height) * (1 - _shape * 0.4) + _shape * ((height / width) * 1.4));
    ec.translate(-cx, -cy);
    const squishR = Math.min(width, height) * Math.max(0, innerMult + _shape * 0.05);
    const squishOuter = Math.max(width, height) * (outerMult + _shape * 0.05);
    const gSq = ec.createRadialGradient(cx, cy, squishR, cx, cy, squishOuter);
    gSq.addColorStop(0, 'rgba(0,0,0,0)');
    gSq.addColorStop(0.5, `rgba(0,0,0,${(darkMax * 0.3).toFixed(2)})`);
    gSq.addColorStop(1, `rgba(0,0,0,${darkMax})`);
    ec.fillStyle = gSq;
    ec.fillRect(-width, -height, width * 3, height * 3);
    ec.restore();
  } else {
    const inner = Math.min(width, height) * Math.max(0, innerMult);
    const outer = Math.max(width, height) * outerMult;
    const grad = ec.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, `rgba(0,0,0,${(darkMax * 0.25).toFixed(2)})`);
    grad.addColorStop(1, `rgba(0,0,0,${darkMax})`);
    ec.fillStyle = grad;
    ec.fillRect(0, 0, width, height);
  }
}
