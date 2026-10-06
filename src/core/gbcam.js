/**
 * Game Boy Camera SRAM decoder.
 *
 * Pure module: no DOM access except in renderToCanvas(), which only needs a
 * CanvasRenderingContext2D-like object. Shared by the renderer, the Electron
 * main process (SD-card previews) and the unit tests.
 *
 * Format reference:
 *   The GB Camera's SRAM is 128KB (131072 bytes), organized as 16 banks × 8KB.
 *   - Bank 0 (0x0000–0x1FFF): game state, thumbnail data, slot metadata
 *   - Banks 1–15 (0x2000–0x1FFFF): full photo tile data
 *
 * Each photo slot is 0x1000 bytes (4096), laid out as:
 *   - 0x000–0xDFF (3584 bytes): 128×112 pixel image in 2bpp tile format
 *                               16 tiles wide × 14 tiles tall = 224 tiles × 16 bytes
 *   - 0xE00–0xEFF (256 bytes):  4×4 tile thumbnail (16×14px 2bpp)
 *   - 0xF00–0xFFF (256 bytes):  metadata / camera settings
 *
 * 30 photos × 4096 bytes + 0x2000 header = 131072 bytes (128KB SRAM exact)
 *
 * Color index mapping (per BGP register in the GB Camera):
 *   0 = lightest (maps to palette[0])
 *   3 = darkest  (maps to palette[3])
 *
 * Sources: GB Camera SRAM reverse engineering by the Game Boy Camera Club,
 * AntonioND's docs, and gbcam2png by raphnet.
 */

import { hexToRgb } from './color.js';

export const PHOTO_WIDTH = 128;
export const PHOTO_HEIGHT = 112;
export const PHOTO_COUNT = 30;
export const SRAM_SIZE = 131072; // 128KB

/** Width/height of a photo once it sits inside a 160×144 border frame. */
export const FRAME_WIDTH = 160;
export const FRAME_HEIGHT = 144;
/** Offset of the photo inside the frame. */
export const FRAME_INSET = 16;

const TILE_PX = 8;
const BYTES_PER_TILE = 16; // 8×8 pixels, 2bpp
const TILES_WIDE = PHOTO_WIDTH / TILE_PX; // 16
const TILES_TALL = PHOTO_HEIGHT / TILE_PX; // 14
const TILES_PER_PHOTO = TILES_WIDE * TILES_TALL; // 224
const BYTES_PER_PHOTO = TILES_PER_PHOTO * BYTES_PER_TILE; // 3584 = 0xE00 (image data only)
const SLOT_SIZE = 0x1000; // 4096 — full slot (image + thumbnail + metadata)
const PHOTO_DATA_OFFSET = 0x2000; // Start of photo data in SRAM

/** Share of identical bytes above which a slot is considered empty. */
const EMPTY_THRESHOLD = 0.96;

const slotOffset = (photoIndex) => PHOTO_DATA_OFFSET + photoIndex * SLOT_SIZE;

/**
 * Decode one 8×8 tile (16 bytes) into 64 colour indices.
 *
 * Game Boy 2bpp tile layout: each of the 8 rows uses 2 bytes (lo, hi). For the
 * pixel at column `col` (0 = left), bit `7 - col` of each byte gives one bit of
 * the colour index: colour = (hi_bit << 1) | lo_bit.
 */
function decodeTile(sav, offset, out, outOffset, stride) {
  for (let row = 0; row < 8; row++) {
    const lo = sav[offset + row * 2];
    const hi = sav[offset + row * 2 + 1];
    const rowStart = outOffset + row * stride;
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      out[rowStart + col] = (((hi >> bit) & 1) << 1) | ((lo >> bit) & 1);
    }
  }
}

/**
 * Decode a photo slot into a Uint8Array of PHOTO_WIDTH × PHOTO_HEIGHT colour
 * indices (0–3), not yet mapped to a palette.
 */
export function decodePhoto(sav, photoIndex) {
  const base = slotOffset(photoIndex);
  const pixels = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT);
  for (let tileRow = 0; tileRow < TILES_TALL; tileRow++) {
    for (let tileCol = 0; tileCol < TILES_WIDE; tileCol++) {
      const tileIndex = tileRow * TILES_WIDE + tileCol;
      decodeTile(
        sav,
        base + tileIndex * BYTES_PER_TILE,
        pixels,
        tileRow * TILE_PX * PHOTO_WIDTH + tileCol * TILE_PX,
        PHOTO_WIDTH,
      );
    }
  }
  return pixels;
}

/**
 * Heuristic empty-slot detection: if more than 96% of the image bytes share a
 * single value (typically 0x00 or 0xFF) the slot holds no photo. Real photos
 * always mix the four shades.
 */
export function isPhotoEmpty(sav, photoIndex) {
  const offset = slotOffset(photoIndex);
  const freq = new Uint32Array(256);
  for (let i = 0; i < BYTES_PER_PHOTO; i++) freq[sav[offset + i]]++;
  let dominant = 0;
  for (let i = 0; i < 256; i++) if (freq[i] > dominant) dominant = freq[i];
  return dominant / BYTES_PER_PHOTO > EMPTY_THRESHOLD;
}

/**
 * Parse a whole SRAM image.
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {{ photos: Array<{index:number, pixels:Uint8Array|null, isEmpty:boolean}>, activeCount:number, sav:Uint8Array }}
 */
export function parseSav(data) {
  const sav = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (sav.length !== SRAM_SIZE) {
    console.warn(`[GBCam] Unexpected SRAM size: ${sav.length} (expected ${SRAM_SIZE})`);
  }
  const photos = [];
  for (let i = 0; i < PHOTO_COUNT; i++) {
    const empty = isPhotoEmpty(sav, i);
    photos.push({ index: i, pixels: empty ? null : decodePhoto(sav, i), isEmpty: empty });
  }
  const activeCount = photos.filter((p) => !p.isEmpty).length;
  return { photos, activeCount, sav };
}

/** Pixel indices of the first non-empty slot, or null when the save holds no photo. */
export function decodeFirstPhoto(sav) {
  for (let i = 0; i < PHOTO_COUNT; i++) {
    if (!isPhotoEmpty(sav, i)) return decodePhoto(sav, i);
  }
  return null;
}

/**
 * Paint decoded pixels onto a 2D context with the given palette.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Uint8Array} pixels — colour indices 0–3
 * @param {{colors: string[]}} palette — colors[0] lightest … colors[3] darkest
 * @param {number} scale — integer pixel scale
 */
export function renderToCanvas(ctx, pixels, palette, scale = 1) {
  const w = PHOTO_WIDTH * scale;
  const h = PHOTO_HEIGHT * scale;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  const rgb = palette.colors.map(hexToRgb);

  for (let y = 0; y < PHOTO_HEIGHT; y++) {
    for (let x = 0; x < PHOTO_WIDTH; x++) {
      const [r, g, b] = rgb[pixels[y * PHOTO_WIDTH + x]];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * w + (x * scale + dx)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
