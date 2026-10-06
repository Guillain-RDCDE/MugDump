/**
 * Dated album helpers for the "develop savestates into albums" flow.
 * Pure string functions; the timestamp lives in the Pocket's filenames
 * (YYYYMMDD_HHMMSS), so searching by date is plain filtering.
 */

// "20260701_155523_Play Cartridge.sta" → "2026-07-01_15-55-23"; falls back to the
// sanitised stem, and disambiguates same-timestamp collisions with a numeric suffix.
export function albumFolderName(name, used) {
  const stem = String(name).replace(/\.[^.]+$/, '');
  const m = stem.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_ ]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  const base = m
    ? `${m[1]}-${m[2]}-${m[3]}_${m[4]}-${m[5]}-${m[6]}`
    : stem.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'album';
  let folder = base,
    n = 2;
  while (used.has(folder)) folder = `${base}_${n++}`;
  used.add(folder);
  return folder;
}

// ── Date search over savestate filenames ────────────────────────────────────
// The timestamp is already in the filename (YYYYMMDD_HHMMSS), so "search by date"
// is just filtering. Query = a prefix (2026 · 2026-07 · 2026/07/01) or an inclusive
// range "A..B". Comparison is on the fixed-width YYYY-MM-DD string.

export function savestateFileDate(name) {
  const m = String(name).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function dateBound(s, high) {
  const m = String(s)
    .trim()
    .replace(/[/.]/g, '-')
    .match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const mo = m[2] ? m[2].padStart(2, '0') : high ? '12' : '01';
  const d = m[3] ? m[3].padStart(2, '0') : high ? '31' : '01';
  return `${m[1]}-${mo}-${d}`;
}

export function dateQueryMatches(name, query) {
  const q = (query || '').trim();
  if (!q) return true; // no filter → keep everything
  const fd = savestateFileDate(name);
  if (!fd) return false; // filter set but the file has no date → drop it
  const parts = q.split(/\s*\.\.\s*/);
  const lo = dateBound(parts[0], false);
  const hi = dateBound(parts.length === 2 ? parts[1] : parts[0], true);
  if (!lo || !hi) return false; // unparseable query → match nothing
  return fd >= lo && fd <= hi;
}
