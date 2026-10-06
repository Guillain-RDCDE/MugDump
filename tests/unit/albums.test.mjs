import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumFolderName, dateQueryMatches, savestateFileDate } from '../../src/core/albums.js';

test('albumFolderName derives a dated folder and disambiguates collisions', () => {
  const used = new Set();
  assert.equal(albumFolderName('20260701_155523_Play Cartridge.sta', used), '2026-07-01_15-55-23');
  assert.equal(
    albumFolderName('20260701_155523_Play Cartridge.sta', used),
    '2026-07-01_15-55-23_2',
  );
  assert.equal(albumFolderName('20260701_155523 copy.sta', used), '2026-07-01_15-55-23_3');
  assert.equal(albumFolderName('My Save (1).sav', used), 'My_Save_1');
  assert.equal(albumFolderName('???.sav', used), 'album');
});

test('savestateFileDate reads YYYYMMDD and separated forms', () => {
  assert.equal(savestateFileDate('20260704_120000_x.sta'), '2026-07-04');
  assert.equal(savestateFileDate('2026-07-04 camera.sav'), '2026-07-04');
  assert.equal(savestateFileDate('GBCAMERA.sav'), null);
});

test('dateQueryMatches handles prefixes, ranges, separators and bad input', () => {
  const f = '20260715_101010_Play Cartridge.sta';
  assert.equal(dateQueryMatches(f, ''), true);
  assert.equal(dateQueryMatches(f, '2026'), true);
  assert.equal(dateQueryMatches(f, '2026-07'), true);
  assert.equal(dateQueryMatches(f, '2026/07/15'), true);
  assert.equal(dateQueryMatches(f, '2026.7.15'), true);
  assert.equal(dateQueryMatches(f, '2026-07-16'), false);
  assert.equal(dateQueryMatches(f, '2026-07-01..2026-07-15'), true);
  assert.equal(dateQueryMatches(f, '2026-07-16..2026-08'), false);
  assert.equal(dateQueryMatches(f, 'july'), false);
  assert.equal(dateQueryMatches('GBCAMERA.sav', '2026'), false);
});
