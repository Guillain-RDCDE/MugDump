import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEX_RE,
  hexToHsl,
  hexToRgb,
  hslToHex,
  paletteToRGB,
  perceivedBrightness,
  rgbToHex,
  sortByBrightness,
} from '../../src/core/color.js';

test('hex ↔ rgb', () => {
  assert.deepEqual(hexToRgb('#9BBC0F'), [0x9b, 0xbc, 0x0f]);
  assert.equal(rgbToHex([0x9b, 0xbc, 0x0f]), '#9bbc0f');
  assert.ok(HEX_RE.test('#9bbc0f'));
  assert.ok(!HEX_RE.test('9bbc0f'));
});

test('hex ↔ hsl round-trips within rounding error', () => {
  for (const hex of ['#9bbc0f', '#0f380f', '#ff8800', '#0033aa', '#808080']) {
    const [h, s, l] = hexToHsl(hex);
    const back = hexToRgb(hslToHex(h, s, l));
    const orig = hexToRgb(hex);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - orig[i]) <= 3, `${hex} channel ${i}`);
  }
  assert.deepEqual(hexToHsl('#000000'), [0, 0, 0]);
  assert.equal(hslToHex(0, 0, 100), '#ffffff');
});

test('brightness ordering is lightest → darkest', () => {
  assert.ok(perceivedBrightness('#ffffff') > perceivedBrightness('#000000'));
  assert.deepEqual(sortByBrightness(['#000000', '#ffffff', '#555555', '#aaaaaa']), [
    '#ffffff',
    '#aaaaaa',
    '#555555',
    '#000000',
  ]);
});

test('paletteToRGB maps the four shades', () => {
  const rgb = paletteToRGB({ colors: ['#ffffff', '#aaaaaa', '#555555', '#000000'] });
  assert.deepEqual(rgb, [
    [255, 255, 255],
    [170, 170, 170],
    [85, 85, 85],
    [0, 0, 0],
  ]);
});
