import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_SETTING_KEYS,
  base64ToBytes,
  bytesToBase64,
  parseProject,
  serializeProject,
} from '../../src/features/project-format.js';
import { parseSav } from '../../src/core/gbcam.js';
import { defaultSav, patterns } from '../fixtures/synthetic-sav.mjs';

const settings = {
  exportScale: 8,
  exportFilter: 'none',
  filterIntensity: 0.5,
  filterVariant: 'thick',
  filterParams: { crt: { mix: 80 } },
  brightness: 10,
  contrast: -5,
  toneIntensity: 20,
  shadowColor: '#0033aa',
  highlightColor: '#ff8800',
  toneBalance: 0,
  gifDelay: 300,
  gifLoop: 'bounce',
  photoSettings: { 2: { paletteId: 'pocket', activeFilters: ['crt'] } },
  photoTransforms: { 0: { rotate: 90, flipH: false, flipV: true } },
  filterOrder: ['crt', 'noise'],
  // not part of the format — must be dropped
  selectedIndex: 4,
  sav: 'never',
};

test('base64 helpers round-trip 128 KB', () => {
  const sav = defaultSav();
  assert.deepEqual(base64ToBytes(bytesToBase64(sav)), sav);
});

test('serialize → parse round-trips the save and the settings', () => {
  const sav = defaultSav();
  const json = serializeProject({
    sav,
    filename: 'roll.sav',
    paletteId: 'dmg',
    settings,
    customPalettes: [
      { id: 'custom_1', name: 'Mine', colors: ['#ffffff', '#aaaaaa', '#555555', '#000000'] },
    ],
    favPalettes: ['dmg', 'pocket'],
  });
  const project = parseProject(json);
  assert.equal(project.filename, 'roll.sav');
  assert.equal(parseSav(project.buffer).activeCount, 4);
  assert.deepEqual(parseSav(project.buffer).photos[2].pixels, patterns.circle());
  for (const key of PROJECT_SETTING_KEYS)
    assert.deepEqual(project.settings[key], settings[key], key);
  assert.equal(project.settings.paletteId, 'dmg');
  assert.equal(project.settings.selectedIndex, undefined);
  assert.equal(project.settings.customPalettes.length, 1);
  assert.deepEqual(project.settings.favPalettes, ['dmg', 'pocket']);
  assert.deepEqual(project.settings.recentPalettes, []);
});

test('a version-1 file written by MugDump 0.10 still opens', () => {
  // Exact shape produced by buildProjectJson() before the refactor.
  const legacy = {
    version: 1,
    app: 'MugDump',
    filename: 'GBCAMERA.sav',
    sav: bytesToBase64(defaultSav()),
    settings: {
      paletteId: 'gbcam_gold',
      exportScale: 20,
      exportFilter: 'crt',
      filterIntensity: 1,
      filterVariant: 'medium',
      filterParams: {},
      brightness: 0,
      contrast: 0,
      toneIntensity: 0,
      shadowColor: '#0033aa',
      highlightColor: '#ff8800',
      toneBalance: 0,
      gifDelay: 250,
      gifLoop: 'infinite',
      photoSettings: { 7: { brightness: 30 } },
      photoTransforms: {},
      filterOrder: ['crt', 'lcd'],
      customPalettes: [],
      recentPalettes: ['dmg'],
      favPalettes: [],
    },
  };
  const project = parseProject(JSON.stringify(legacy));
  assert.equal(project.settings.paletteId, 'gbcam_gold');
  assert.deepEqual(Object.keys(project.settings.photoSettings), ['7']);
  assert.equal(project.settings.photoSettings[7].brightness, 30);
  assert.deepEqual(project.settings.recentPalettes, ['dmg']);
});

test('malformed input is rejected with a clear message', () => {
  assert.throws(() => parseProject('{not json'), /Invalid project file/);
  assert.throws(
    () => parseProject(JSON.stringify({ version: 2, sav: 'AA==' })),
    /Unrecognised project format/,
  );
  assert.throws(() => parseProject(JSON.stringify({ version: 1 })), /Unrecognised project format/);
  assert.throws(
    () => parseProject(JSON.stringify({ version: 1, sav: 'AAAA' })),
    /Unrecognised project format/,
  );
  assert.throws(
    () => parseProject(JSON.stringify({ version: 1, sav: '!!!' })),
    /Invalid project file/,
  );
});

test('garbage settings are dropped rather than crashing', () => {
  const json = JSON.stringify({
    version: 1,
    sav: bytesToBase64(defaultSav()),
    settings: {
      photoSettings: 'nope',
      photoTransforms: { x: 1, 3: null, 5: { rotate: 90 } },
      filterOrder: [1, 2],
      favPalettes: 'dmg',
    },
  });
  const { settings } = parseProject(json);
  assert.equal(settings.photoSettings, undefined);
  assert.deepEqual(settings.photoTransforms, { 5: { rotate: 90 } });
  assert.equal(settings.filterOrder, undefined);
  assert.equal(settings.favPalettes, undefined);
});
