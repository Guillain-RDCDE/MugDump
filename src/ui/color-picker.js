import { hexToHsl, hslToHex } from '../core/color.js';

let _colorPickerPanel = null;

export function openColorPicker(anchorEl, initialHex, onChange) {
  if (_colorPickerPanel) {
    _colorPickerPanel.remove();
    _colorPickerPanel = null;
  }

  let [h, s, l] = hexToHsl(initialHex || '#888888');

  const panel = document.createElement('div');
  panel.className = 'color-picker-panel';
  _colorPickerPanel = panel;

  const preview = document.createElement('div');
  preview.className = 'cp-preview';
  preview.style.background = initialHex;
  panel.appendChild(preview);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'cp-hex-input';
  hexInput.value = initialHex.toUpperCase();
  hexInput.maxLength = 7;

  function update() {
    const hex = hslToHex(h, s, l);
    preview.style.background = hex;
    hexInput.value = hex.toUpperCase();
    onChange(hex);
  }

  function makeRow(labelTxt, val, min, max, onSliderChange) {
    const row = document.createElement('div');
    row.className = 'cp-slider-row';
    const lbl = document.createElement('span');
    lbl.className = 'cp-slider-label';
    lbl.textContent = labelTxt;
    const sl = document.createElement('input');
    sl.type = 'range';
    sl.min = min;
    sl.max = max;
    sl.step = 1;
    sl.value = val;
    const valEl = document.createElement('span');
    valEl.className = 'cp-slider-val';
    valEl.textContent = Math.round(val);
    sl.addEventListener('input', () => {
      valEl.textContent = sl.value;
      onSliderChange(parseFloat(sl.value));
    });
    row.appendChild(lbl);
    row.appendChild(sl);
    row.appendChild(valEl);
    return row;
  }

  panel.appendChild(
    makeRow('H', h, 0, 360, (v) => {
      h = v;
      update();
    }),
  );
  panel.appendChild(
    makeRow('S', s, 0, 100, (v) => {
      s = v;
      update();
    }),
  );
  panel.appendChild(
    makeRow('L', l, 0, 100, (v) => {
      l = v;
      update();
    }),
  );

  hexInput.addEventListener('change', () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      [h, s, l] = hexToHsl(v);
      update();
    }
  });
  panel.appendChild(hexInput);

  document.body.appendChild(panel);
  const rect = anchorEl.getBoundingClientRect();
  panel.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
  panel.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 250)}px`;

  setTimeout(() => {
    function closeHandler(e) {
      if (!panel.contains(e.target) && e.target !== anchorEl) {
        panel.remove();
        if (_colorPickerPanel === panel) _colorPickerPanel = null;
        document.removeEventListener('mousedown', closeHandler);
      }
    }
    document.addEventListener('mousedown', closeHandler);
  }, 0);
}

/** Wraps a hidden <input type=color> with a visible swatch button that opens
 *  the custom picker. Pass the className for the swatch button. */
export function attachColorPickerToInput(input, swatchClass = 'color-swatch-btn') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = swatchClass;
  btn.style.background = input.value;
  input.parentNode.insertBefore(btn, input);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openColorPicker(btn, input.value, (hex) => {
      btn.style.background = hex;
      input.value = hex;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // Remember the swatch so syncColorSwatchBtn() can update it programmatically
  Object.defineProperty(input, '_cpBtn', { value: btn, writable: true });
  return btn;
}

// Sync a swatch button to a new value (called when controls are reset/synced)
export function syncColorSwatchBtn(input, hex) {
  if (input._cpBtn) input._cpBtn.style.background = hex;
}
