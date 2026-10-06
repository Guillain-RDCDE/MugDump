import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_COUNT,
  PHOTO_HEIGHT,
  PHOTO_WIDTH,
  SRAM_SIZE,
  decodeFirstPhoto,
  decodePhoto,
  isPhotoEmpty,
  parseSav,
} from '../../src/core/gbcam.js';
import { buildSav, defaultSav, patterns } from '../fixtures/synthetic-sav.mjs';

test('constants describe a 128 KB SRAM of 30 photos', () => {
  assert.equal(SRAM_SIZE, 131072);
  assert.equal(PHOTO_COUNT, 30);
  assert.equal(PHOTO_WIDTH * PHOTO_HEIGHT, 14336);
});

test('decodePhoto round-trips the 2bpp tile encoding', () => {
  const sav = buildSav({ 3: patterns.diagonal() });
  assert.deepEqual(decodePhoto(sav, 3), patterns.diagonal());
});

test('isPhotoEmpty flags 0xFF-filled slots and keeps real photos', () => {
  const sav = defaultSav();
  assert.equal(isPhotoEmpty(sav, 0), false);
  assert.equal(isPhotoEmpty(sav, 3), true);
  assert.equal(isPhotoEmpty(sav, 29), true);
});

test('parseSav accepts both ArrayBuffer and Uint8Array and counts active photos', () => {
  const u8 = defaultSav();
  for (const input of [u8, u8.buffer]) {
    const { photos, activeCount, sav } = parseSav(input);
    assert.equal(photos.length, PHOTO_COUNT);
    assert.equal(activeCount, 4);
    assert.equal(sav.length, SRAM_SIZE);
    assert.deepEqual(
      photos.filter((p) => !p.isEmpty).map((p) => p.index),
      [0, 1, 2, 7],
    );
    assert.equal(photos[3].pixels, null);
    assert.deepEqual(photos[7].pixels, patterns.bands());
  }
});

test('decodeFirstPhoto returns the first filled slot or null', () => {
  assert.deepEqual(decodeFirstPhoto(buildSav({ 5: patterns.circle() })), patterns.circle());
  assert.equal(decodeFirstPhoto(buildSav()), null);
});
