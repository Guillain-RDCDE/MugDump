import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  MAX_SAVE_FILE_BYTES,
  createPathAllowList,
  readAllowedCameraSave,
  readCameraSave,
} from '../../electron/ipc/read-save.js';
import { SRAM_SIZE } from '../../src/core/gbcam.js';
import { buildSta, defaultSav } from '../fixtures/synthetic-sav.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'mugdump-read-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

const file = (name, bytes) => {
  const p = path.join(dir, name);
  writeFileSync(p, bytes);
  return p;
};

test('the allow-list only knows absolute paths it was given', () => {
  const list = createPathAllowList();
  const p = path.join(dir, 'a.sav');
  assert.equal(list.has(p), false);
  list.allow(p);
  assert.equal(list.has(p), true);
  assert.equal(list.has(path.join(dir, 'sub', '..', 'a.sav')), true, 'normalised');
  assert.equal(list.has(path.join(dir, 'b.sav')), false);
  list.allow('relative.sav');
  assert.equal(list.has('relative.sav'), false, 'relative paths are never allowed');
  list.allow(/** @type {any} */ (42));
  assert.equal(list.has(/** @type {any} */ (42)), false);
});

test('read-file refuses a path the user never handed to the app', async () => {
  const p = file('untracked.sav', defaultSav());
  const out = await readAllowedCameraSave(createPathAllowList(), p);
  assert.match(out.error, /Refusing to read/);
});

test('read-file reads an allowed save and an allowed savestate', async () => {
  const list = createPathAllowList();
  const sav = file('ok.sav', defaultSav());
  const sta = file('ok.sta', buildSta(defaultSav()));
  list.allow(sav);
  list.allow(sta);
  for (const p of [sav, sta]) {
    const out = await readAllowedCameraSave(list, p);
    assert.equal(out.error, undefined);
    assert.equal(out.buffer.byteLength, SRAM_SIZE);
    assert.equal(out.path, p);
  }
});

test('read-file validates its argument', async () => {
  const out = await readAllowedCameraSave(createPathAllowList(), { path: 42 });
  assert.match(out.error, /non-empty string/);
});

test('the size is checked before the file is read', async () => {
  const big = path.join(dir, 'big.sta');
  // A genuine savestate padded past the limit: only the size check rejects it.
  writeFileSync(big, buildSta(defaultSav()));
  truncateSync(big, MAX_SAVE_FILE_BYTES + 1);
  const out = await readCameraSave(big);
  assert.match(out.error, /File too large/);
});

test('a directory or a junk file is rejected', async () => {
  assert.match((await readCameraSave(dir)).error, /Not a regular file/);
  assert.match((await readCameraSave(file('junk.sav', Buffer.alloc(100)))).error, /Unexpected/);
});
