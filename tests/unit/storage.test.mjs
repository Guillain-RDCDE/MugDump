import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEYS,
  readJson,
  readString,
  writeJson,
  writeString,
} from '../../src/app/storage.js';

function fakeStorage({ throwing = false } = {}) {
  const map = new Map();
  return {
    getItem: (k) => {
      if (throwing) throw new Error('blocked');
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => {
      if (throwing) throw new Error('quota');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

test('keys are unique and stable', () => {
  const values = Object.values(STORAGE_KEYS);
  assert.equal(new Set(values).size, values.length);
  assert.equal(STORAGE_KEYS.customPalettes, 'gbcam_custom_palettes'); // older installs depend on it
});

test('JSON and string accessors round-trip and fall back on bad data', () => {
  globalThis.localStorage = fakeStorage();
  writeJson('k', { a: [1, 2] });
  assert.deepEqual(readJson('k', null), { a: [1, 2] });
  assert.deepEqual(readJson('missing', []), []);
  globalThis.localStorage.setItem('k', '{corrupt');
  assert.deepEqual(readJson('k', 'fallback'), 'fallback');
  writeString('s', 42);
  assert.equal(readString('s'), '42');
  assert.equal(readString('none', 'dflt'), 'dflt');
});

test('a throwing storage never breaks callers', () => {
  globalThis.localStorage = fakeStorage({ throwing: true });
  assert.doesNotThrow(() => writeJson('k', 1));
  assert.doesNotThrow(() => writeString('k', 1));
  assert.equal(readJson('k', 'fb'), 'fb');
  assert.equal(readString('k', 'fb'), 'fb');
});
