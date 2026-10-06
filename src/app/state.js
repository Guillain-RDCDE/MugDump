import { PALETTES } from '../data/palettes/index.js';
import { buildDefaultFilterParams } from '../data/filter-defs.js';

// ── State ──────────────────────────────────────────────────────────────────

export const state = {
  sav: null, // raw Uint8Array of the loaded .sav
  photos: [], // parsed photo objects from parseSav
  activeCount: 0,
  filename: null,
  filePath: null,
  selectedIndex: null, // currently selected photo index (0–29)
  palette: PALETTES.dmg,
  exportScale: 20,
  exportFormat: 'png', // 'png' | 'gif'
  exportFilter: 'none', // legacy single-filter field; kept for backwards compat with old .gbcp files
  filterIntensity: 1.0, // 0.0–1.0
  filterVariant: 'medium', // crt only: 'fine'|'medium'|'thick'|'wide'
  filterParams: buildDefaultFilterParams(), // per-filter granular parameters (see FILTER_DEFS)
  photoTransforms: {}, // { photoIndex: { rotate: 0, flipH: false, flipV: false } }
  presentationMode: false, // fullscreen presentation overlay active
  gifMode: false, // are we in GIF selection mode?
  gifSelection: new Set(), // photo indices in the sequence (for O(1) grid highlight)
  gifFrameOrder: [], // [{photoIndex, paletteId}] — ordered frame list
  gifPaletteScope: null, // null=global; number=frame order index being re-palettted
  gifDelay: 250, // ms per frame
  gifLoop: 'infinite', // 'infinite' | 'once' | 'bounce'
  activeFilters: new Set(), // active filter names for stackable effects
  sectionEnabled: { exposure: false, splitTone: false, effects: false }, // per-section on/off (off by default)
  effectsPreviewMode: false, // toggle before/after for effects; false = effects visible (normal rendering)
  filterOrder: [
    'crt',
    'lcd',
    'grid',
    'vignette',
    'halftone',
    'dot',
    'glow',
    'chroma',
    'jitter',
    'noise',
    'ghosting',
    'pixsort',
    'blkglitch',
    'wavewarp',
    'zoomblur',
    'bayer',
    'floyd',
    'interlace',
    'chswap',
    'rgbplanes',
    'colcorrupt',
  ],
  gifPreviewTimer: null, // setInterval handle for live GIF preview
  viewMode: 'grid', // 'grid' | 'solo'
  applyScope: 'all', // 'all' | 'photo' — whether controls write to global or this photo
  photoSettings: {}, // { [photoIndex]: { paletteId?, exportFilter?, filterIntensity?, filterVariant?, filterParams?, brightness?, contrast?, toneIntensity?, shadowColor?, highlightColor?, toneBalance? } }
  // Tone adjustments
  brightness: 0, // -100 to +100
  contrast: 0, // -100 to +100
  toneIntensity: 0, // 0–100 (split toning strength)
  shadowColor: '#0033aa',
  highlightColor: '#ff8800',
  toneBalance: 0, // -100 (more shadow) to +100 (more highlight)
  selectedPhotos: new Set(), // indices of currently selected photos (multi)
  lastSelectedIndex: null, // last clicked photo index, for shift-range
  focusedFilter: null, // which filter's param panel is open
  effectClipboard: null, // copied effect settings for paste
  borderId: 'int-frame-0', // global border frame id
  borderEnabled: false, // global border on/off
  filterScope: 'full', // 'full' = filters apply to border+photo; 'photo' = photo area only
};
