/**
 * Analogue Pocket savestate support.
 *
 * A plain .sav/.srm is exactly 131072 bytes. A Pocket savestate (.sta) embeds
 * the cart RAM inside a larger blob; we locate it through the GB Camera
 * management block, whose "Magic" string appears twice 0xFE bytes apart
 * (echo at cart-RAM 0x10D2, primary at 0x11D0), then slice 128 KB from the
 * cart-RAM base.
 */
import { SRAM_SIZE } from './gbcam.js';

const MAGIC = [0x4d, 0x61, 0x67, 0x69, 0x63]; // "Magic"
const MAGIC_ECHO_OFFSET = 0x10d2;
const MAGIC_PRIMARY_GAP = 0xfe;

function hasMagicAt(buf, p) {
  for (let i = 0; i < MAGIC.length; i++) if (buf[p + i] !== MAGIC[i]) return false;
  return true;
}

/**
 * Accept a 131072-byte GB Camera save as-is, or extract the 128 KB cart RAM
 * from a savestate. Returns a Uint8Array of SRAM_SIZE bytes, or null when no
 * GB Camera cart RAM can be found.
 * @param {ArrayBuffer|Uint8Array} data
 */
export function coerceGbCamSave(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length === SRAM_SIZE) return buf;
  for (let i = MAGIC_ECHO_OFFSET; i + MAGIC_PRIMARY_GAP + MAGIC.length <= buf.length; i++) {
    if (hasMagicAt(buf, i) && hasMagicAt(buf, i + MAGIC_PRIMARY_GAP)) {
      const base = i - MAGIC_ECHO_OFFSET; // cart RAM offset 0
      const out = new Uint8Array(SRAM_SIZE).fill(0xff);
      out.set(buf.subarray(base, Math.min(buf.length, base + SRAM_SIZE)), 0);
      return out;
    }
  }
  return null;
}
