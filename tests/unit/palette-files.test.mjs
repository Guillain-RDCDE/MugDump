import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeGbpFile,
  encodePalFile,
  parseGbpFile,
  parsePalFile,
} from '../../src/core/palette-files.js';

const colors = ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'];

test('.gbp round-trip (lightest → darkest, 16 bytes)', () => {
  const bytes = encodeGbpFile(colors);
  assert.equal(bytes.length, 16);
  assert.deepEqual([...bytes.subarray(12)], [0, 0, 0, 0]);
  assert.deepEqual(parseGbpFile(bytes.buffer), colors);
});

test('.pal round-trip (stored darkest → lightest, APGB footer)', () => {
  const bytes = encodePalFile(colors);
  assert.equal(bytes.length, 56);
  assert.deepEqual([...bytes.subarray(0, 3)], [0x0f, 0x38, 0x0f]); // darkest first on disk
  assert.deepEqual([...bytes.subarray(48, 51)], [0x9b, 0xbc, 0x0f]); // border = lightest
  assert.equal(bytes[51], 0x81);
  assert.equal(String.fromCharCode(...bytes.subarray(52)), 'APGB');
  assert.deepEqual(parsePalFile(bytes.buffer), colors);
});

test('files shorter than one palette are rejected', () => {
  assert.equal(parseGbpFile(new ArrayBuffer(11)), null);
  assert.equal(parsePalFile(new ArrayBuffer(4)), null);
});
