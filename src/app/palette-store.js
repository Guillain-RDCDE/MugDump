import { STORAGE_KEYS, readJson, writeJson } from './storage.js';
import { PALETTES } from '../data/palettes/index.js';

// ── Custom palettes — localStorage persistence ────────────────────────────

export function loadCustomPalettes() {
  return readJson(STORAGE_KEYS.customPalettes, []);
}

export function saveCustomPalettesToStorage(palettes) {
  writeJson(STORAGE_KEYS.customPalettes, palettes);
}

// Merge custom palettes into the live PALETTES object and rebuild the bar
export function refreshCustomPalettes() {
  // Remove old custom entries
  for (const key of Object.keys(PALETTES)) {
    if (PALETTES[key].custom) delete PALETTES[key];
  }
  // Add loaded custom palettes
  for (const pal of loadCustomPalettes()) {
    PALETTES[pal.id] = { ...pal, custom: true };
  }
}

// ── Recent palettes (kept for project file backwards-compat) ──────────────

const MAX_RECENT_PALETTES = 6;

export function loadRecentPalettes() {
  return readJson(STORAGE_KEYS.recentPalettes, []);
}

export function saveRecentPalettes(ids) {
  writeJson(STORAGE_KEYS.recentPalettes, ids);
}

export function addRecentPalette(id) {
  let recents = loadRecentPalettes().filter((r) => r !== id);
  recents.unshift(id);
  recents = recents.slice(0, MAX_RECENT_PALETTES);
  saveRecentPalettes(recents);
}
