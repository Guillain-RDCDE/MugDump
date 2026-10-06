/** Overlay effect: draws onto the offscreen context `ec`, composited at `intensity` by the registry. */
export function apply({ ec, width, height, s, params }) {
  // Pixel grid — draws lines on GB pixel boundaries so each pixel has a clear border.
  // Only meaningful when each GB pixel occupies ≥ 2 screen pixels.
  // Weight slider is in "units at 4×", scaled proportionally so the visual weight
  // stays consistent at any render scale (1 unit ≈ 1px at 4×, 5px at 20×, etc.).
  const gridOpacity = (params.opacity ?? 30) / 100;
  const lineWBase = params.weight ?? 1;
  const lineW = Math.max(1, Math.round((lineWBase * s) / 4));
  if (s >= 2) {
    ec.strokeStyle = `rgba(0,0,0,${gridOpacity})`;
    ec.lineWidth = lineW;
    // Vertical lines at each GB pixel boundary — use canvas width so border area is covered
    const numGridCols = Math.ceil(width / s);
    for (let col = 1; col <= numGridCols; col++) {
      const x = col * s - lineW / 2;
      ec.beginPath();
      ec.moveTo(x, 0);
      ec.lineTo(x, height);
      ec.stroke();
    }
    // Horizontal lines at each GB pixel boundary — use canvas height so border area is covered
    const numGridRows = Math.ceil(height / s);
    for (let row = 1; row <= numGridRows; row++) {
      const y = row * s - lineW / 2;
      ec.beginPath();
      ec.moveTo(0, y);
      ec.lineTo(width, y);
      ec.stroke();
    }
  }
}
