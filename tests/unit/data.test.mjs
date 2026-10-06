import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEX_RE } from '../../src/core/color.js';
import { BASE_PALETTES } from '../../src/data/palettes/base.js';
import { EXTENDED_PALETTES } from '../../src/data/palettes/extended.js';
import { PALETTES } from '../../src/data/palettes/index.js';
import { PAL_GROUP_LABELS, PAL_GROUP_ORDER } from '../../src/data/palette-groups.js';
import {
  FILTER_DEFS,
  FX_FILTER_GROUP,
  FX_GROUP_ORDER,
  buildDefaultFilterParams,
} from '../../src/data/filter-defs.js';
import { BORDER_FRAMES } from '../../src/data/border-frames.js';
import { state } from '../../src/app/state.js';
import { readdirSync } from 'node:fs';

test('every palette is well-formed and belongs to a known group', () => {
  assert.ok(Object.keys(PALETTES).length > 500);
  for (const [key, pal] of Object.entries(PALETTES)) {
    assert.equal(pal.id, key, `id mismatch for ${key}`);
    assert.ok(pal.name && typeof pal.name === 'string', `${key} has no name`);
    assert.equal(pal.colors.length, 4, `${key} needs 4 colours`);
    for (const c of pal.colors) assert.ok(HEX_RE.test(c), `${key}: bad colour ${c}`);
    assert.ok(PAL_GROUP_ORDER.includes(pal.group), `${key}: unknown group ${pal.group}`);
  }
  for (const g of PAL_GROUP_ORDER) assert.ok(PAL_GROUP_LABELS[g], `group ${g} has no label`);
});

test('base and extended palette sets do not overlap', () => {
  const overlap = Object.keys(BASE_PALETTES).filter((k) => k in EXTENDED_PALETTES);
  assert.deepEqual(overlap, []);
  assert.ok(PALETTES.dmg, 'the default palette must exist');
});

test('filter definitions are consistent with their groups, defaults and ordering', () => {
  const ids = FILTER_DEFS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate filter id');
  for (const id of ids)
    assert.ok(FX_GROUP_ORDER.includes(FX_FILTER_GROUP[id]), `${id} has no family`);
  assert.deepEqual(
    [...state.filterOrder].sort(),
    [...ids].sort(),
    'default order must list every filter',
  );
  const defaults = buildDefaultFilterParams();
  for (const fd of FILTER_DEFS) {
    for (const p of fd.params) {
      if (p.stateKey) continue;
      assert.ok(p.key in defaults[fd.id], `${fd.id}.${p.key} has no default`);
      if (p.type === 'range')
        assert.ok(
          Number(p.def) >= p.min && Number(p.def) <= p.max,
          `${fd.id}.${p.key} default out of range`,
        );
      if (p.type === 'seg')
        assert.ok(
          p.opts.some(([v]) => v === p.def),
          `${fd.id}.${p.key} default not an option`,
        );
    }
  }
});

test('every border frame has its PNG in src/public/frames', () => {
  const files = new Set(readdirSync(new URL('../../src/public/frames/', import.meta.url)));
  for (const { id } of BORDER_FRAMES) assert.ok(files.has(`${id}.png`), `missing frame ${id}.png`);
});
