/**
 * Analogue Pocket palette file formats.
 *
 * .gbp — 16 bytes
 *   bytes  0–11: 4 × RGB (lightest → darkest), straight to our convention
 *   bytes 12–15: zero padding
 *
 * .pal — 56 bytes
 *   bytes  0–11: BG palette (4 × RGB, stored darkest → lightest)
 *   bytes 12–23: Window palette (same)
 *   bytes 24–35: OBJ0 palette  (same)
 *   bytes 36–47: OBJ1 palette  (same)
 *   bytes 48–50: border/LCD-off color
 *   byte     51: 0x81 flags
 *   bytes 52–55: 'APGB' magic footer
 */
import { hexToRgb, rgbToHex } from './color.js';

function readRgbQuad(u8, offset = 0) {
  const colors = [];
  for (let i = 0; i < 4; i++) {
    const o = offset + i * 3;
    colors.push(rgbToHex([u8[o], u8[o + 1], u8[o + 2]]));
  }
  return colors;
}

function writeRgbQuad(buf, offset, colors) {
  colors.forEach((hex, i) => buf.set(hexToRgb(hex), offset + i * 3));
}

/** Parse a .gbp file → 4 hex colours (lightest → darkest), or null if too short. */
export function parseGbpFile(buffer) {
  if (buffer.byteLength < 12) return null;
  return readRgbQuad(new Uint8Array(buffer));
}

/** Parse a .pal file → 4 hex colours (lightest → darkest), or null if too short. */
export function parsePalFile(buffer) {
  if (buffer.byteLength < 12) return null;
  // The BG section is stored darkest → lightest; reverse to our convention.
  return readRgbQuad(new Uint8Array(buffer)).reverse();
}

export function encodeGbpFile(colors) {
  const buf = new Uint8Array(16); // last 4 bytes stay 0x00
  writeRgbQuad(buf, 0, colors);
  return buf;
}

export function encodePalFile(colors) {
  const buf = new Uint8Array(56);
  const rev = [...colors].reverse(); // .pal stores darkest → lightest
  writeRgbQuad(buf, 0, rev); // BG
  writeRgbQuad(buf, 12, rev); // Window
  writeRgbQuad(buf, 24, rev); // OBJ0
  writeRgbQuad(buf, 36, rev); // OBJ1
  buf.set(hexToRgb(colors[0]), 48); // border colour = lightest
  buf[51] = 0x81;
  buf.set([0x41, 0x50, 0x47, 0x42], 52); // 'APGB'
  return buf;
}
