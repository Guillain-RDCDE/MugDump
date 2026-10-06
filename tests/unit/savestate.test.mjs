import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceGbCamSave } from '../../src/core/savestate.js';
import { SRAM_SIZE, parseSav } from '../../src/core/gbcam.js';
import { buildSta, defaultSav, patterns } from '../fixtures/synthetic-sav.mjs';

test('a plain 128 KB save is returned as-is', () => {
  const sav = defaultSav();
  assert.equal(coerceGbCamSave(sav), sav);
  assert.equal(coerceGbCamSave(sav.buffer).length, SRAM_SIZE);
});

test('the cart RAM is extracted from a Pocket savestate', () => {
  const sav = defaultSav();
  const sta = buildSta(sav, { prefix: 0x3000, suffix: 0x800 });
  const out = coerceGbCamSave(sta);
  assert.equal(out.length, SRAM_SIZE);
  const { activeCount, photos } = parseSav(out);
  assert.equal(activeCount, 4);
  assert.deepEqual(photos[2].pixels, patterns.circle());
});

test('a savestate truncated inside the cart RAM is padded with 0xFF', () => {
  const sav = defaultSav();
  const sta = buildSta(sav, { prefix: 0x1000, suffix: 0 }).subarray(0, 0x1000 + 0x3000);
  const out = coerceGbCamSave(sta);
  assert.equal(out.length, SRAM_SIZE);
  assert.equal(out[SRAM_SIZE - 1], 0xff);
  assert.equal(parseSav(out).activeCount, 1); // only slot 0 survived the cut
});

test('blobs without the management block are rejected', () => {
  assert.equal(coerceGbCamSave(new Uint8Array(SRAM_SIZE + 1)), null);
  assert.equal(coerceGbCamSave(new Uint8Array(SRAM_SIZE - 1)), null);
  assert.equal(coerceGbCamSave(new Uint8Array(100)), null);
  // A single "Magic" without its echo 0xFE bytes earlier is not the block.
  const onlyOneMagic = new Uint8Array(0x30000);
  onlyOneMagic.set([0x4d, 0x61, 0x67, 0x69, 0x63], 0x50d2);
  assert.equal(coerceGbCamSave(onlyOneMagic), null);
});
