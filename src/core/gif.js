/**
 * Animated GIF encoding (gifenc), shared by the web and desktop builds so both
 * produce byte-identical files.
 */
import * as gifenc from 'gifenc';

// gifenc ships an ESM build (named exports, used by Vite) and a CommonJS build
// (what Node resolves for the unit tests, where the named exports are only
// reachable through the default export).
const GIFEncoder = gifenc.GIFEncoder ?? gifenc.default.GIFEncoder;

/** Nearest-neighbour upscale of a colour-index buffer. */
export function scaleIndices(indices, width, height, scale) {
  if (scale === 1) return indices;
  const sw = width * scale;
  const out = new Uint8Array(sw * height * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x];
      for (let dy = 0; dy < scale; dy++) {
        const row = (y * scale + dy) * sw + x * scale;
        for (let dx = 0; dx < scale; dx++) out[row + dx] = v;
      }
    }
  }
  return out;
}

/**
 * Expand a frame list for "bounce" playback: forward, then back through the
 * middle frames (endpoints are not duplicated). Lists of 1–2 frames are
 * returned unchanged.
 */
export function bounceSequence(frames) {
  if (frames.length <= 2) return frames;
  const mid = [...frames].reverse().slice(1, frames.length - 1);
  return [...frames, ...mid];
}

/**
 * Encode frames into a GIF.
 * @param {Array<{indices: ArrayLike<number>, palette: number[][], width: number, height: number}>} frames
 * @param {{delay: number, scale: number, loop: 'infinite'|'once'|'bounce'}} options — delay in ms
 * @returns {Uint8Array}
 */
export function encodeGif(frames, { delay, scale, loop }) {
  if (!frames.length) throw new Error('No frames to encode');
  const w = frames[0].width * scale;
  const h = frames[0].height * scale;
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const scaled = scaleIndices(new Uint8Array(frame.indices), frame.width, frame.height, scale);
    const opts = { palette: frame.palette, delay };
    // gifenc writes the Netscape loop block from the first frame's `repeat`:
    // 0 = loop forever, -1 = no block at all (the GIF plays once).
    if (i === 0) opts.repeat = loop === 'once' ? -1 : 0;
    gif.writeFrame(scaled, w, h, opts);
  });
  gif.finish();
  return gif.bytes();
}
