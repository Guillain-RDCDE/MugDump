/**
 * gbcam.js — Game Boy Camera SRAM decoder
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

window.GBCam = (() => {
  // ── Constants ──────────────────────────────────────────────────────────────

  const PHOTO_WIDTH       = 128;
  const PHOTO_HEIGHT      = 112;
  const TILE_PX           = 8;
  const BYTES_PER_TILE    = 16;   // 8×8 pixels, 2bpp
  const TILES_WIDE        = PHOTO_WIDTH  / TILE_PX;   // 16
  const TILES_TALL        = PHOTO_HEIGHT / TILE_PX;   // 14
  const TILES_PER_PHOTO   = TILES_WIDE * TILES_TALL;  // 224
  const BYTES_PER_PHOTO   = TILES_PER_PHOTO * BYTES_PER_TILE; // 3584 = 0xE00 (image data only)
  const SLOT_SIZE         = 0x1000;  // 4096 — full slot (image + thumbnail + metadata)
  const PHOTO_COUNT       = 30;
  const PHOTO_DATA_OFFSET = 0x2000;  // Start of photo data in SRAM
  const SRAM_SIZE         = 131072;  // 128KB

  // ── Tile decoder ──────────────────────────────────────────────────────────
  //
  // Game Boy 2bpp tile layout (16 bytes per 8×8 tile):
  //   Each of the 8 rows uses 2 bytes: lo_byte, hi_byte
  //   For pixel at column col (0=left, 7=right):
  //     bit_pos  = 7 - col
  //     lo_bit   = (lo_byte >> bit_pos) & 1
  //     hi_bit   = (hi_byte >> bit_pos) & 1
  //     color    = (hi_bit << 1) | lo_bit   → 0..3

  function decodeTile(sav, offset) {
    const pixels = new Uint8Array(64);
    for (let row = 0; row < 8; row++) {
      const lo = sav[offset + row * 2];
      const hi = sav[offset + row * 2 + 1];
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        pixels[row * 8 + col] = ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
      }
    }
    return pixels;
  }

  // ── Photo decoder ─────────────────────────────────────────────────────────
  //
  // Returns a Uint8Array of length PHOTO_WIDTH × PHOTO_HEIGHT
  // where each value is 0–3 (the color index, not yet mapped to a palette).

  function decodePhoto(sav, photoIndex) {
    const photoOffset = PHOTO_DATA_OFFSET + photoIndex * SLOT_SIZE;
    const pixels = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT);

    for (let tileRow = 0; tileRow < TILES_TALL; tileRow++) {
      for (let tileCol = 0; tileCol < TILES_WIDE; tileCol++) {
        const tileIndex  = tileRow * TILES_WIDE + tileCol;
        const tileOffset = photoOffset + tileIndex * BYTES_PER_TILE;
        const tile       = decodeTile(sav, tileOffset);

        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const canvasX = tileCol * 8 + px;
            const canvasY = tileRow * 8 + py;
            pixels[canvasY * PHOTO_WIDTH + canvasX] = tile[py * 8 + px];
          }
        }
      }
    }

    return pixels;
  }

  // ── Empty slot detection ───────────────────────────────────────────────────
  //
  // Heuristic: if >96% of the photo bytes are a single value (all 0x00 or all 0xFF),
  // the slot is considered empty. Real photos always have a mix of the 4 shades.

  function isPhotoEmpty(sav, photoIndex) {
    const offset = PHOTO_DATA_OFFSET + photoIndex * SLOT_SIZE;
    const freq = new Uint32Array(256);
    for (let i = 0; i < BYTES_PER_PHOTO; i++) {
      freq[sav[offset + i]]++;
    }
    const dominant = Math.max(...freq);
    return dominant / BYTES_PER_PHOTO > 0.96;
  }

  // ── Palette application ────────────────────────────────────────────────────
  //
  // Renders a decoded photo (Uint8Array of 0–3) onto a canvas context.
  // palette: { colors: ['#rrggbb', '#rrggbb', '#rrggbb', '#rrggbb'] }
  //          colors[0] = lightest, colors[3] = darkest

  function renderToCanvas(ctx, pixels, palette, scale = 1) {
    const w = PHOTO_WIDTH  * scale;
    const h = PHOTO_HEIGHT * scale;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    // Pre-parse palette hex strings to [r, g, b]
    const rgb = palette.colors.map(hex => {
      const n = parseInt(hex.replace('#', ''), 16);
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    });

    for (let y = 0; y < PHOTO_HEIGHT; y++) {
      for (let x = 0; x < PHOTO_WIDTH; x++) {
        const colorIndex = pixels[y * PHOTO_WIDTH + x];
        const [r, g, b]  = rgb[colorIndex];

        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = ((y * scale + dy) * w + (x * scale + dx)) * 4;
            data[i]     = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── Parse entire SRAM ─────────────────────────────────────────────────────

  function parseSav(arrayBuffer) {
    const sav = new Uint8Array(arrayBuffer);

    if (sav.length !== SRAM_SIZE) {
      console.warn(`[GBCam] Unexpected SRAM size: ${sav.length} (expected ${SRAM_SIZE})`);
    }

    const photos = [];
    for (let i = 0; i < PHOTO_COUNT; i++) {
      const empty  = isPhotoEmpty(sav, i);
      const pixels = empty ? null : decodePhoto(sav, i);
      photos.push({ index: i, pixels, isEmpty: empty });
    }

    const activeCount = photos.filter(p => !p.isEmpty).length;
    return { photos, activeCount, sav };
  }

  // ── Exported API ──────────────────────────────────────────────────────────

  return {
    PHOTO_WIDTH,
    PHOTO_HEIGHT,
    PHOTO_COUNT,
    parseSav,
    decodePhoto,
    renderToCanvas,
  };
})();
