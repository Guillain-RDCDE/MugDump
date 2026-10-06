/**
 * Every localStorage key the app uses, in one place, plus safe accessors
 * (localStorage can throw in private windows or when the quota is full, and
 * stored JSON can be corrupt — callers always get their fallback instead).
 */
export const STORAGE_KEYS = Object.freeze({
  customPalettes: 'gbcam_custom_palettes',
  recentPalettes: 'gbcam_recent_palettes',
  favPalettes: 'gbcam_fav_palettes',
  lastSavPath: 'gbcam_last_sav_path',
  sidebarCollapsed: 'gbcam_sidebar_collapsed',
  paletteGridSize: 'gbcam_pgrid_size',
  paletteGridCollapsed: 'mugdump:pgrid:collapsed',
  effectGroupsCollapsed: 'mugdump:fxgroups',
  sectionStates: 'mugdump:section-states',
  previewPinned: 'mugdump:previewPinned',
  previewScale: 'mugdump:previewScale',
  theme: 'mugdump:theme',
  presets: 'mugdump:presets:v1',
});

export function readString(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
