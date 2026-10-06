import { PALETTES } from '../data/palettes/index.js';

// ── Custom palettes — localStorage persistence ────────────────────────────

const CUSTOM_PALETTES_KEY = 'gbcam_custom_palettes';

export function loadCustomPalettes() {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveCustomPalettesToStorage(palettes) {
  localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
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

export const RECENT_PALETTES_KEY = 'gbcam_recent_palettes';

const MAX_RECENT_PALETTES = 6;

export function loadRecentPalettes() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PALETTES_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

export function addRecentPalette(id) {
  let recents = loadRecentPalettes().filter((r) => r !== id);
  recents.unshift(id);
  recents = recents.slice(0, MAX_RECENT_PALETTES);
  localStorage.setItem(RECENT_PALETTES_KEY, JSON.stringify(recents));
}
