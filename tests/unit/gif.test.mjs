import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bounceSequence, encodeGif, scaleIndices } from '../../src/core/gif.js';

test('scaleIndices upsamples with nearest neighbour', () => {
  const src = new Uint8Array([0, 1, 2, 3]);
  assert.equal(scaleIndices(src, 2, 2, 1), src);
  assert.deepEqual(
    [...scaleIndices(src, 2, 2, 2)],
    [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
  );
});

test('bounceSequence ping-pongs without duplicating the endpoints', () => {
  assert.deepEqual(bounceSequence([1, 2, 3, 4]), [1, 2, 3, 4, 3, 2]);
  assert.deepEqual(bounceSequence([1, 2]), [1, 2]);
  assert.deepEqual(bounceSequence([]), []);
});

const palette = [
  [255, 255, 255],
  [170, 170, 170],
  [85, 85, 85],
  [0, 0, 0],
];
const frame = (v) => ({ indices: new Uint8Array(4).fill(v), palette, width: 2, height: 2 });

test('encodeGif writes a GIF89a and a loop block only when looping', () => {
  const looping = encodeGif([frame(0), frame(3)], { delay: 100, scale: 2, loop: 'infinite' });
  const once = encodeGif([frame(0), frame(3)], { delay: 100, scale: 2, loop: 'once' });
  const header = (b) => String.fromCharCode(...b.subarray(0, 6));
  assert.equal(header(looping), 'GIF89a');
  assert.equal(header(once), 'GIF89a');
  const hasNetscape = (b) => Buffer.from(b).includes('NETSCAPE2.0');
  assert.equal(hasNetscape(looping), true);
  assert.equal(hasNetscape(once), false);
  // 4×4 logical screen
  assert.equal(looping[6] | (looping[7] << 8), 4);
  assert.equal(looping[8] | (looping[9] << 8), 4);
  assert.throws(() => encodeGif([], { delay: 100, scale: 1, loop: 'once' }));
});
