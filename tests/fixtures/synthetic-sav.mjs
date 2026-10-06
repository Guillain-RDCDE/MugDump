/**
 * Synthetic Game Boy Camera saves for tests.
 *
 * Builds a 128 KB SRAM image from pixel-index arrays (0–3) without needing any
 * real (copyrighted) cartridge dump, plus a fake Analogue Pocket savestate that
 * wraps it the way coerceGbCamSave() expects.
 */

export const SRAM_SIZE = 131072;
export const PHOTO_WIDTH = 128;
export const PHOTO_HEIGHT = 112;
const PHOTO_DATA_OFFSET = 0x2000;
const SLOT_SIZE = 0x1000;
const TILES_WIDE = 16;
const BYTES_PER_TILE = 16;

/** Encode a 128×112 array of 0–3 values into GB 2bpp tiles (3584 bytes). */
export function encodePhoto(pixels) {
  const out = new Uint8Array(3584);
  for (let ty = 0; ty < 14; ty++) {
    for (let tx = 0; tx < TILES_WIDE; tx++) {
      const tileOff = (ty * TILES_WIDE + tx) * BYTES_PER_TILE;
      for (let row = 0; row < 8; row++) {
        let lo = 0;
        let hi = 0;
        for (let col = 0; col < 8; col++) {
          const v = pixels[(ty * 8 + row) * PHOTO_WIDTH + tx * 8 + col] & 3;
          const bit = 7 - col;
          lo |= (v & 1) << bit;
          hi |= ((v >> 1) & 1) << bit;
        }
        out[tileOff + row * 2] = lo;
        out[tileOff + row * 2 + 1] = hi;
      }
    }
  }
  return out;
}

/** Deterministic test patterns, each a 128×112 Uint8Array of 0–3. */
export const patterns = {
  diagonal: () => fill((x, y) => ((x + y) >> 5) & 3),
  checker: () => fill((x, y) => (((x >> 4) + (y >> 4)) & 1 ? 3 : 0)),
  circle: () =>
    fill((x, y) => {
      const d = Math.hypot(x - 64, y - 56);
      return d < 20 ? 3 : d < 35 ? 2 : d < 50 ? 1 : 0;
    }),
  bands: () => fill((x) => (x >> 5) & 3),
};

function fill(fn) {
  const px = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT);
  for (let y = 0; y < PHOTO_HEIGHT; y++) {
    for (let x = 0; x < PHOTO_WIDTH; x++) px[y * PHOTO_WIDTH + x] = fn(x, y);
  }
  return px;
}

/**
 * Build a full SRAM image. `slots` maps slot index → pixel array; every other
 * slot is left 0xFF-filled, which the decoder treats as empty.
 */
export function buildSav(slots = {}) {
  const sav = new Uint8Array(SRAM_SIZE).fill(0xff);
  sav.fill(0x00, 0, PHOTO_DATA_OFFSET); // bank 0: game state (zeros are fine)
  for (const [idx, pixels] of Object.entries(slots)) {
    sav.set(encodePhoto(pixels), PHOTO_DATA_OFFSET + Number(idx) * SLOT_SIZE);
  }
  return sav;
}

/** The default fixture: 4 photos in slots 0, 1, 2 and 7. */
export function defaultSav() {
  return buildSav({
    0: patterns.diagonal(),
    1: patterns.checker(),
    2: patterns.circle(),
    7: patterns.bands(),
  });
}

/**
 * Wrap a SRAM image in a fake Analogue Pocket savestate: `prefix` bytes of
 * unrelated data, then the cart RAM carrying the GB Camera management block
 * ("Magic" echo at 0x10D2 and primary at 0x11D0), then some trailing bytes.
 */
export function buildSta(sav, { prefix = 0x3000, suffix = 0x800 } = {}) {
  const magic = [0x4d, 0x61, 0x67, 0x69, 0x63]; // "Magic"
  const cart = new Uint8Array(sav);
  cart.set(magic, 0x10d2);
  cart.set(magic, 0x11d0);
  const sta = new Uint8Array(prefix + cart.length + suffix);
  for (let i = 0; i < prefix; i++) sta[i] = (i * 31 + 7) & 0xff;
  sta.set(cart, prefix);
  for (let i = 0; i < suffix; i++) sta[prefix + cart.length + i] = (i * 17) & 0xff;
  return sta;
}
