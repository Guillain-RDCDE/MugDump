/**
 * app.js — DMG DarkRoom renderer
 *
 * Dependencies (loaded via script tags before this file):
 *   - gbcam.js  → window.GBCam
 *   - palettes.js → window.PALETTES, window.paletteToRGB
 */

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  sav: null,            // raw Uint8Array of the loaded .sav
  photos: [],           // parsed photo objects from GBCam.parseSav
  activeCount: 0,
  filename: null,
  filePath: null,
  selectedIndex: null,  // currently selected photo index (0–29)
  palette: PALETTES.dmg,
  exportScale: 8,
  exportFormat: 'png',  // 'png' | 'gif'
  exportFilter:    'none',   // 'none' | 'crt' | 'lcd' | 'grid' | 'vignette' | 'halftone' | 'border'
  filterIntensity: 1.0,     // 0.0–1.0
  filterVariant:   'medium', // crt only: 'fine'|'medium'|'thick'|'wide'
  filterParams: {           // per-filter granular parameters
    crt:      { phosphor: 'green' },   // 'none'|'green'|'amber'
    lcd:      { subpixel: 10 },        // 0–20 %
    dot:      { radius: 44 },          // 20–80 % of scale
    glow:     { blur: 110 },           // 50–300 % of scale
    chroma:   { shift: 75 },           // 25–150 % of scale
    grid:     { opacity: 30 },         // 10–60 %
    vignette: { falloff: 'medium' },   // 'soft'|'medium'|'hard'
    halftone: { radius: 38 },          // 20–60 % of scale
    border:   { thickness: 'medium' }, // 'thin'|'medium'|'thick'
  },
  photoTransforms: {},      // { photoIndex: { rotate: 0, flipH: false, flipV: false } }
  hideEmpty: false,         // whether to collapse empty grid slots
  presentationMode: false,  // fullscreen presentation overlay active
  gifMode: false,          // are we in GIF selection mode?
  gifSelection: new Set(), // photo indices in the sequence (for O(1) grid highlight)
  gifFrameOrder: [],       // [{photoIndex, paletteId}] — ordered frame list
  gifPaletteScope: null,   // null=global; number=frame order index being re-palettted
  gifDelay: 250,           // ms per frame
  gifLoop: 'infinite',     // 'infinite' | 'once' | 'bounce'
  gifPreviewTimer: null,   // setInterval handle for live GIF preview
  lightboxOpen: false,     // lightbox overlay visible
  viewMode: 'grid',        // 'grid' | 'solo'
  applyScope: 'all',       // 'all' | 'photo' — whether controls write to global or this photo
  photoSettings: {},       // { [photoIndex]: { paletteId?, exportFilter?, filterIntensity?, filterVariant?, filterParams?, brightness?, contrast?, toneIntensity?, shadowColor?, highlightColor?, toneBalance? } }
  // Tone adjustments
  brightness:      0,      // -100 to +100
  contrast:        0,      // -100 to +100
  toneIntensity:   0,      // 0–100 (split toning strength)
  shadowColor:     '#0033aa',
  highlightColor:  '#ff8800',
  toneBalance:     0,      // -100 (more shadow) to +100 (more highlight)
};

// ── DOM refs ───────────────────────────────────────────────────────────────

const dom = {
  app:             document.getElementById('app'),
  welcome:         document.getElementById('welcome'),
  main:            document.getElementById('main'),
  photoGrid:       document.getElementById('photo-grid'),
  gridPanel:       document.getElementById('grid-panel'),
  detailEmpty:     document.getElementById('detail-empty'),
  exportControls:  document.getElementById('export-controls'),
  gifPreviewWrap:  document.getElementById('gif-preview-wrap'),
  gifPreviewCanvas:document.getElementById('gif-preview-canvas'),
  gifPreviewInfo:  document.getElementById('gif-preview-info'),
  lbOverlay:       document.getElementById('lightbox-overlay'),
  lbCanvas:        document.getElementById('lb-canvas'),
  lbLabel:         document.getElementById('lb-label'),
  lbMeta:          document.getElementById('lb-meta'),
  gridPanel:       document.getElementById('grid-panel'),
  soloView:        document.getElementById('solo-view'),
  soloCanvas:      document.getElementById('solo-canvas'),
  soloLabel:       document.getElementById('solo-label'),
  soloMeta:        document.getElementById('solo-meta'),
  gifToolbar:      document.getElementById('gif-toolbar'),
  gifFrameStrip:   document.getElementById('gif-frame-strip'),
  gifFrameList:    document.getElementById('gif-frame-list'),
  gifFrameEmpty:   document.getElementById('gif-frame-empty'),
  gifCount:        document.getElementById('gif-count'),
  gifDelay:        document.getElementById('gif-delay'),
  gifDelayVal:     document.getElementById('gif-delay-val'),
  statusText:      document.getElementById('status-text'),
  statusDot:       document.getElementById('status-dot'),
  pocketModal:     document.getElementById('pocket-modal'),
  pocketSaveList:  document.getElementById('pocket-save-list'),
  pocketConfirm:   document.getElementById('pocket-confirm'),
  toast:              document.getElementById('toast'),
  dropOverlay:        document.getElementById('drop-overlay'),
  presentationOverlay:document.getElementById('presentation-overlay'),
  presCanvas:         document.getElementById('pres-canvas'),
  presLabel:          document.getElementById('pres-label'),
  presClose:          document.getElementById('pres-close'),
  presPrev:           document.getElementById('pres-prev'),
  presNext:           document.getElementById('pres-next'),
};

// ── Toast ───────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 2500);
}

// ── Per-photo settings helpers ─────────────────────────────────────────────

/** Returns a merged settings object for rendering photo at `index`.
 *  Per-photo overrides take precedence over global state. */
function getEffectiveSettings(index) {
  const ps = state.photoSettings[index];
  if (!ps) {
    return {
      palette:        state.palette,
      exportFilter:   state.exportFilter,
      filterIntensity:state.filterIntensity,
      filterVariant:  state.filterVariant,
      filterParams:   state.filterParams,
      brightness:     state.brightness,
      contrast:       state.contrast,
      toneIntensity:  state.toneIntensity,
      shadowColor:    state.shadowColor,
      highlightColor: state.highlightColor,
      toneBalance:    state.toneBalance,
    };
  }
  return {
    palette:        ps.paletteId ? (PALETTES[ps.paletteId] || state.palette) : state.palette,
    exportFilter:   ps.exportFilter   ?? state.exportFilter,
    filterIntensity:ps.filterIntensity ?? state.filterIntensity,
    filterVariant:  ps.filterVariant  ?? state.filterVariant,
    filterParams:   ps.filterParams   ?? state.filterParams,
    brightness:     ps.brightness     ?? state.brightness,
    contrast:       ps.contrast       ?? state.contrast,
    toneIntensity:  ps.toneIntensity  ?? state.toneIntensity,
    shadowColor:    ps.shadowColor    ?? state.shadowColor,
    highlightColor: ps.highlightColor ?? state.highlightColor,
    toneBalance:    ps.toneBalance    ?? state.toneBalance,
  };
}

/** Write a setting to the per-photo override or global state, depending on scope. */
function setScopedSetting(key, value) {
  if (state.applyScope === 'photo' && state.selectedIndex !== null) {
    if (!state.photoSettings[state.selectedIndex]) state.photoSettings[state.selectedIndex] = {};
    state.photoSettings[state.selectedIndex][key] = value;
  } else {
    state[key] = value;
  }
}

/** Returns the filterParams object that event handlers should mutate for the current scope/photo. */
function getWritableFilterParams(filter) {
  if (state.applyScope === 'photo' && state.selectedIndex !== null) {
    const idx = state.selectedIndex;
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    if (!state.photoSettings[idx].filterParams) {
      // inherit a deep copy of current global params so defaults are preserved
      state.photoSettings[idx].filterParams = JSON.parse(JSON.stringify(state.filterParams));
    }
    const fp = state.photoSettings[idx].filterParams;
    if (!fp[filter]) fp[filter] = {};
    return fp[filter];
  }
  if (!state.filterParams[filter]) state.filterParams[filter] = {};
  return state.filterParams[filter];
}

/** True when photo at `index` has any per-photo setting override. */
function hasPhotoOverride(index) {
  const ps = state.photoSettings[index];
  if (!ps) return false;
  return Object.keys(ps).some(k => ps[k] !== undefined && (k !== 'filterParams' || Object.keys(ps[k]).length > 0));
}

/** Remove all per-photo overrides for `index`. */
function clearPhotoOverride(index) {
  delete state.photoSettings[index];
}

/** Returns the palette id that should be shown as "active" in the picker, given current scope. */
function getDisplayPaletteId() {
  if (state.applyScope === 'photo' && state.selectedIndex !== null) {
    return getEffectiveSettings(state.selectedIndex).palette?.id || state.palette.id;
  }
  return state.palette.id;
}

/** Sync all right-panel controls to reflect the effective settings for `index`.
 *  Called when scope='photo' and the selected photo changes, or scope toggles. */
function syncControlsToEffectiveSettings(index) {
  if (index === null || index === undefined) return;
  const eff = getEffectiveSettings(index);

  // Palette picker button
  updatePalettePickerBtn(eff.palette);
  // Picker list active state
  const effPalId = eff.palette?.id;
  document.querySelectorAll('.pal-item').forEach(item => {
    item.classList.toggle('active', item.dataset.palette === effPalId);
  });
  updateCurrentPalettePin();

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === eff.exportFilter);
  });

  // Intensity slider
  const intSlider = document.getElementById('filter-intensity');
  const intVal    = document.getElementById('filter-intensity-val');
  if (intSlider) intSlider.value = Math.round(eff.filterIntensity * 100);
  if (intVal)    intVal.textContent = `${Math.round(eff.filterIntensity * 100)}%`;

  // CRT variant buttons
  document.querySelectorAll('.crt-variant-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.variant === eff.filterVariant);
  });

  // Rebuild filter param UI — pass display values so no photoSettings entry is created just for display
  buildFilterParams(eff.exportFilter, eff.filterParams?.[eff.exportFilter] || {});

  // Tone controls
  const bEl  = document.getElementById('tone-brightness');
  const bVal = document.getElementById('tone-brightness-val');
  if (bEl)  bEl.value = eff.brightness;
  if (bVal) bVal.textContent = eff.brightness > 0 ? `+${eff.brightness}` : String(eff.brightness);

  const cEl  = document.getElementById('tone-contrast');
  const cVal = document.getElementById('tone-contrast-val');
  if (cEl)  cEl.value = eff.contrast;
  if (cVal) cVal.textContent = eff.contrast > 0 ? `+${eff.contrast}` : String(eff.contrast);

  const tiEl  = document.getElementById('tone-intensity');
  const tiVal = document.getElementById('tone-intensity-val');
  if (tiEl)  tiEl.value = eff.toneIntensity;
  if (tiVal) tiVal.textContent = `${eff.toneIntensity}%`;

  const scEl = document.getElementById('tone-shadow-color');
  if (scEl)  scEl.value = eff.shadowColor;

  const hcEl = document.getElementById('tone-highlight-color');
  if (hcEl)  hcEl.value = eff.highlightColor;

  const balEl  = document.getElementById('tone-balance');
  const balVal = document.getElementById('tone-balance-val');
  if (balEl)  balEl.value = eff.toneBalance;
  if (balVal) balVal.textContent = eff.toneBalance > 0 ? `+${eff.toneBalance}` : String(eff.toneBalance);

  // Scope reset button visibility
  const resetScopeBtn = document.getElementById('btn-scope-reset');
  if (resetScopeBtn) resetScopeBtn.classList.toggle('hidden', !hasPhotoOverride(index));
}

// ── Status bar ─────────────────────────────────────────────────────────────

function setStatus(text, active = false) {
  dom.statusText.textContent = text;
  dom.statusDot.className = 'status-dot' + (active ? ' green' : '');
}

// ── Load SAV ───────────────────────────────────────────────────────────────

async function loadSavFile(result) {
  if (!result || result.error) {
    if (result?.error) showToast(`⚠ ${result.error}`);
    return;
  }

  const { buffer, name, path: filePath } = result;
  const { photos, activeCount, sav } = GBCam.parseSav(buffer);

  state.sav = sav;
  state.photos = photos;
  state.activeCount = activeCount;
  state.filename = name;
  state.filePath = filePath || null;
  state.selectedIndex = null;
  state.gifMode = false;
  state.gifSelection.clear();
  state.photoTransforms = {}; // reset transforms on new file load
  state.photoSettings   = {}; // reset per-photo overrides on new file load
  if (filePath) saveLastSavPath(filePath);

  renderGrid();
  showMainView();
  setStatus(`${name} — ${activeCount} photo${activeCount !== 1 ? 's' : ''} found`, true);
}

// ── Photo transforms ────────────────────────────────────────────────────────

/** Get (or default-initialise) the transform for a photo index */
function getTransform(idx) {
  if (!state.photoTransforms[idx]) {
    state.photoTransforms[idx] = { rotate: 0, flipH: false, flipV: false };
  }
  return state.photoTransforms[idx];
}

function hasTransform(idx) {
  const t = state.photoTransforms[idx];
  return t && (t.rotate !== 0 || t.flipH || t.flipV);
}

/**
 * Render a photo onto ctx with transform applied.
 * Adjusts ctx.canvas dimensions to match the post-rotation output size.
 */
function renderPhotoWithTransform(ctx, photo, palette, scale, idx) {
  const t  = getTransform(idx);
  const sw = GBCam.PHOTO_WIDTH  * scale;
  const sh = GBCam.PHOTO_HEIGHT * scale;

  if (!t.rotate && !t.flipH && !t.flipV) {
    ctx.canvas.width  = sw;
    ctx.canvas.height = sh;
    GBCam.renderToCanvas(ctx, photo.pixels, palette, scale);
    return;
  }

  const rotated = (t.rotate === 90 || t.rotate === 270);
  const dw = rotated ? sh : sw;
  const dh = rotated ? sw : sh;

  const tmp = Object.assign(document.createElement('canvas'), { width: sw, height: sh });
  GBCam.renderToCanvas(tmp.getContext('2d'), photo.pixels, palette, scale);

  ctx.canvas.width  = dw;
  ctx.canvas.height = dh;
  ctx.save();
  ctx.translate(dw / 2, dh / 2);
  if (t.flipH) ctx.scale(-1,  1);
  if (t.flipV) ctx.scale( 1, -1);
  ctx.rotate(t.rotate * Math.PI / 180);
  ctx.drawImage(tmp, -sw / 2, -sh / 2);
  ctx.restore();
}

function applyTransformAction(idx, action) {
  const t = getTransform(idx);
  if (action === 'rotate-cw')  { t.rotate = (t.rotate + 90)  % 360; }
  if (action === 'rotate-ccw') { t.rotate = (t.rotate + 270) % 360; }
  if (action === 'flip-h')     { t.flipH = !t.flipH; }
  if (action === 'flip-v')     { t.flipV = !t.flipV; }
  if (action === 'reset-transform') { t.rotate = 0; t.flipH = false; t.flipV = false; }
}

// ── Views ───────────────────────────────────────────────────────────────────

function showMainView() {
  dom.welcome.classList.add('hidden');
  dom.main.style.display = 'flex';
  // Reveal file-only titlebar buttons (Export .sav, Save Project)
  dom.app.classList.add('has-file');
}

// ── Grid ────────────────────────────────────────────────────────────────────

function renderGrid() {
  dom.photoGrid.innerHTML = '';

  for (const photo of state.photos) {
    const slot = document.createElement('div');
    slot.className = 'photo-slot' + (photo.isEmpty ? ' empty' : '');
    slot.dataset.index = photo.index;

    // Slot number badge
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = String(photo.index + 1).padStart(2, '0');
    slot.appendChild(num);

    if (photo.isEmpty) {
      const placeholder = document.createElement('div');
      placeholder.className = 'empty-placeholder';
      placeholder.textContent = '—';
      slot.appendChild(placeholder);
    } else {
      // Canvas thumbnail
      const canvas = document.createElement('canvas');
      canvas.width  = GBCam.PHOTO_WIDTH;
      canvas.height = GBCam.PHOTO_HEIGHT;
      const ctx = canvas.getContext('2d');
      const effThumb = getEffectiveSettings(photo.index);
      GBCam.renderToCanvas(ctx, photo.pixels, effThumb.palette);
      // Filters not applied to thumbnails — too destructive at 128×112px.
      // Tone adjustments are lightweight and fine at native res.
      applyToneAdjustments(ctx, GBCam.PHOTO_WIDTH, GBCam.PHOTO_HEIGHT, effThumb);
      slot.appendChild(canvas);

      // GIF selection (invisible div for event delegation; frame number via data attr)
      const check = document.createElement('div');
      check.className = 'gif-check';
      check.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGifSelection(photo.index, slot);
      });
      slot.appendChild(check);

      slot.addEventListener('click', () => selectPhoto(photo.index));
    }

    dom.photoGrid.appendChild(slot);
  }

  // Apply selected state
  if (state.selectedIndex !== null) {
    const el = dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`);
    if (el) el.classList.add('selected');
  }

  // Apply GIF selections
  for (const idx of state.gifSelection) {
    const el = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
    if (el) el.classList.add('selected-for-gif');
  }
  updateGifFrameNumbers();
}

// Re-render all canvases when palette/filter/tone changes (without rebuilding the DOM)
function repaintGrid() {
  const slots = dom.photoGrid.querySelectorAll('.photo-slot:not(.empty)');
  for (const slot of slots) {
    const index = parseInt(slot.dataset.index);
    repaintGridSlot(index);
  }
  // Repaint live views
  if (state.gifMode && state.gifSelection.size > 0) {
    updateGifPreview();
  }
  if (state.viewMode === 'solo' && state.selectedIndex !== null) {
    renderSoloView(state.selectedIndex);
  }
  if (state.lightboxOpen && state.selectedIndex !== null) {
    renderLightbox(state.selectedIndex);
  }
}

// Re-render a single thumbnail slot (after palette or transform change)
function repaintGridSlot(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  const slot   = dom.photoGrid.querySelector(`[data-index="${index}"]`);
  if (!slot) return;
  const canvas = slot.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // Thumbnails rendered at native res (CSS handles upscale via image-rendering:pixelated).
  // Filters not applied to thumbnails — destructive at 128×112px. Tone is fine.
  const eff = getEffectiveSettings(index);
  GBCam.renderToCanvas(ctx, photo.pixels, eff.palette);
  applyToneAdjustments(ctx, canvas.width, canvas.height, eff);
  // Slot badges
  slot.classList.toggle('has-transform',      hasTransform(index));
  slot.classList.toggle('has-photo-settings', hasPhotoOverride(index));
}

// ── Photo selection ─────────────────────────────────────────────────────────

function selectPhoto(index) {
  if (state.gifMode) {
    // In GIF mode the whole slot toggles frame selection
    const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
    if (slot && !slot.classList.contains('empty')) toggleGifSelection(index, slot);
    return;
  }

  // Update selected state on slots
  dom.photoGrid.querySelectorAll('.photo-slot').forEach(el => el.classList.remove('selected'));
  const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
  if (slot) slot.classList.add('selected');

  state.selectedIndex = index;

  if (state.viewMode === 'solo') {
    renderSoloView(index);
  }

  // Sync right-panel controls to show effective settings for this photo
  if (state.applyScope === 'photo') {
    syncControlsToEffectiveSettings(index);
  }
  // Lightbox no longer auto-opens on grid click — use F key or the ⛶ button
}

// ── Detail / lightbox rendering ───────────────────────────────────────────────

// renderDetail: kept as a compatibility stub — callers expecting a "view update"
// will now refresh the lightbox if it's open.
function renderDetail(index) {
  if (state.lightboxOpen && index !== null && index === state.selectedIndex) {
    renderLightbox(index);
  }
}

// ── Solo view ─────────────────────────────────────────────────────────────────

function enterSoloMode() {
  state.viewMode = 'solo';
  dom.gridPanel.classList.add('solo-mode');
  document.getElementById('btn-view-grid')?.classList.remove('active');
  document.getElementById('btn-view-solo')?.classList.add('active');

  // Auto-select first non-empty photo if nothing selected
  if (state.selectedIndex === null) {
    const first = state.photos.findIndex(p => !p.isEmpty);
    if (first >= 0) {
      state.selectedIndex = first;
      dom.photoGrid.querySelector(`[data-index="${first}"]`)?.classList.add('selected');
    }
  }
  if (state.selectedIndex !== null) renderSoloView(state.selectedIndex);
}

function enterGridMode() {
  state.viewMode = 'grid';
  dom.gridPanel.classList.remove('solo-mode');
  document.getElementById('btn-view-grid')?.classList.add('active');
  document.getElementById('btn-view-solo')?.classList.remove('active');
  // Scroll selected photo into view
  if (state.selectedIndex !== null) {
    dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderSoloView(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;

  const wrap = dom.soloCanvas?.parentElement;
  if (!wrap || !dom.soloCanvas) return;

  // Calculate largest integer scale that fits the available canvas area
  const availW = wrap.clientWidth  - 8;  // minor padding
  const availH = wrap.clientHeight - 8;
  const scaleW = Math.max(1, Math.floor(availW / GBCam.PHOTO_WIDTH));
  const scaleH = Math.max(1, Math.floor(availH / GBCam.PHOTO_HEIGHT));
  const SOLO_SCALE = Math.max(1, Math.min(scaleW, scaleH));

  const ctx = dom.soloCanvas.getContext('2d');
  const effSolo = getEffectiveSettings(index);
  renderPhotoWithTransform(ctx, photo, effSolo.palette, SOLO_SCALE, index);

  const w = dom.soloCanvas.width, h = dom.soloCanvas.height;
  if (effSolo.exportFilter !== 'none') {
    applyExportFilter(ctx, w, h, SOLO_SCALE,
      effSolo.exportFilter, effSolo.filterIntensity, effSolo.filterVariant, effSolo.filterParams);
  }
  applyToneAdjustments(ctx, w, h, effSolo);

  // Update info strip
  if (dom.soloLabel) dom.soloLabel.textContent = `Photo ${index + 1}`;
  if (dom.soloMeta) {
    const t = getTransform(index);
    const rotLabel  = t.rotate ? ` · ${t.rotate}°` : '';
    const flipLabel = (t.flipH || t.flipV) ? ` · flipped` : '';
    dom.soloMeta.textContent = `${GBCam.PHOTO_WIDTH}×${GBCam.PHOTO_HEIGHT}px · slot ${index + 1}/30${rotLabel}${flipLabel}`;
  }
  // Sync transform button active states
  document.querySelectorAll('#solo-transforms .transform-btn').forEach(btn => {
    const t2 = getTransform(index);
    if (btn.dataset.action === 'flip-h') btn.classList.toggle('active', t2.flipH);
    if (btn.dataset.action === 'flip-v') btn.classList.toggle('active', t2.flipV);
  });
}

function soloStep(dir) {
  const photos = state.photos;
  let idx = state.selectedIndex ?? 0;
  let tries = 0;
  while (tries < 30) {
    idx = ((idx + dir + photos.length) % photos.length);
    if (!photos[idx]?.isEmpty) break;
    tries++;
  }
  if (photos[idx]?.isEmpty) return;

  dom.photoGrid.querySelectorAll('.photo-slot').forEach(el => el.classList.remove('selected'));
  dom.photoGrid.querySelector(`[data-index="${idx}"]`)?.classList.add('selected');
  state.selectedIndex = idx;
  renderSoloView(idx);
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function openLightbox(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  state.lightboxOpen = true;
  dom.lbOverlay.classList.remove('hidden');
  renderLightbox(index);
}

function closeLightbox() {
  state.lightboxOpen = false;
  dom.lbOverlay.classList.add('hidden');
}

function renderLightbox(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) { closeLightbox(); return; }

  const PREVIEW_SCALE = 8;
  const ctx = dom.lbCanvas.getContext('2d');
  const effLb = getEffectiveSettings(index);
  renderPhotoWithTransform(ctx, photo, effLb.palette, PREVIEW_SCALE, index);

  const w = dom.lbCanvas.width, h = dom.lbCanvas.height;
  if (effLb.exportFilter !== 'none') {
    applyExportFilter(ctx, w, h, PREVIEW_SCALE,
      effLb.exportFilter, effLb.filterIntensity, effLb.filterVariant, effLb.filterParams);
  }
  applyToneAdjustments(ctx, w, h, effLb);

  dom.lbLabel.textContent = `Photo ${index + 1}`;
  const t = getTransform(index);
  const rotLabel  = t.rotate ? ` · ${t.rotate}°` : '';
  const flipLabel = (t.flipH || t.flipV) ? ` · flipped` : '';
  dom.lbMeta.textContent = `${GBCam.PHOTO_WIDTH}×${GBCam.PHOTO_HEIGHT}px · 2bpp · slot ${index + 1}/30${rotLabel}${flipLabel}`;

  // Sync transform button active states in lightbox footer
  document.querySelectorAll('#lb-transforms .transform-btn').forEach(btn => {
    const action = btn.dataset.action;
    if (action === 'flip-h') btn.classList.toggle('active', t.flipH);
    if (action === 'flip-v') btn.classList.toggle('active', t.flipV);
  });
}

function lightboxStep(dir) {
  if (!state.lightboxOpen) return;
  const photos = state.photos;
  let idx = state.selectedIndex ?? 0;
  let tries = 0;
  while (tries < 30) {
    idx = ((idx + dir + photos.length) % photos.length);
    if (!photos[idx]?.isEmpty) break;
    tries++;
  }
  if (photos[idx]?.isEmpty) return;

  dom.photoGrid.querySelectorAll('.photo-slot').forEach(el => el.classList.remove('selected'));
  const slot = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
  if (slot) {
    slot.classList.add('selected');
    slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  state.selectedIndex = idx;
  renderLightbox(idx);
}

// ── Palette ─────────────────────────────────────────────────────────────────

function setPalette(id) {
  if (state.applyScope === 'photo' && state.selectedIndex !== null) {
    if (!state.photoSettings[state.selectedIndex]) state.photoSettings[state.selectedIndex] = {};
    state.photoSettings[state.selectedIndex].paletteId = id;
  } else {
    state.palette = PALETTES[id];
  }
  addRecentPalette(id);
  const displayId = getDisplayPaletteId();
  updatePalettePickerBtn(PALETTES[displayId] || state.palette);
  renderFavPalettes();
  // Update active highlight in dropdown list
  document.querySelectorAll('.pal-item').forEach(item => {
    item.classList.toggle('active', item.dataset.palette === displayId);
    if (item.dataset.palette === displayId) {
      item.querySelector('.pal-item-name').style.color = '';
    }
  });
  repaintGrid();
}

function updatePalettePickerBtn(pal) {
  pal = pal || state.palette;
  const swatch = document.getElementById('palette-picker-swatch');
  const nameEl = document.getElementById('palette-picker-name');

  function fillSwatch(el) {
    el.innerHTML = '';
    for (const color of pal.colors) {
      const span = document.createElement('span');
      span.style.background = color;
      el.appendChild(span);
    }
  }

  if (swatch) fillSwatch(swatch);
  if (nameEl) nameEl.textContent = pal.name;
}

function buildPaletteBar() {
  buildPalettePickerUI();
  renderFavPalettes();
  buildBrowseButtonIcon();
}

// ── Export scale / format controls ──────────────────────────────────────────

function getExportDimensions() {
  // Returns { width, height } for the current export scale setting
  if (state.exportScale === 'custom') {
    const w = parseInt(document.getElementById('custom-width')?.value) || 512;
    const h = Math.round(w * (GBCam.PHOTO_HEIGHT / GBCam.PHOTO_WIDTH));
    return { width: w, height: h };
  }
  return {
    width:  GBCam.PHOTO_WIDTH  * state.exportScale,
    height: GBCam.PHOTO_HEIGHT * state.exportScale,
  };
}

function setExportScale(scale) {
  state.exportScale = scale;
  const isCustom = scale === 'custom';

  document.querySelectorAll('.scale-btn').forEach(btn => {
    const val = btn.dataset.scale === 'custom' ? 'custom' : parseInt(btn.dataset.scale);
    btn.classList.toggle('active', val === scale);
  });

  const wrap = document.getElementById('custom-size-wrap');
  if (wrap) wrap.style.display = isCustom ? 'block' : 'none';

  if (isCustom) {
    // Trigger initial display update
    updateCustomSizeDisplay();
  }
}

function updateCustomSizeDisplay() {
  const input = document.getElementById('custom-width');
  const display = document.getElementById('custom-size-display');
  if (!input || !display) return;
  const w = parseInt(input.value) || 512;
  const h = Math.round(w * (GBCam.PHOTO_HEIGHT / GBCam.PHOTO_WIDTH));
  display.textContent = `${w}×${h}`;
}

function setExportFormat(fmt) {
  state.exportFormat = fmt;
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.fmt === fmt);
  });
  if (fmt === 'gif') {
    enterGifMode();
  } else {
    exitGifMode();
  }
}

// ── Export: single PNG ───────────────────────────────────────────────────────

async function exportSinglePng() {
  const index = state.selectedIndex;
  if (index === null) return;
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;

  const scale = state.exportScale === 'custom'
    ? Math.max(1, Math.round((parseInt(document.getElementById('custom-width')?.value) || 512) / GBCam.PHOTO_WIDTH))
    : state.exportScale;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const effExp = getEffectiveSettings(index);
  renderPhotoWithTransform(ctx, photo, effExp.palette, scale, index);

  const { width, height } = { width: canvas.width, height: canvas.height };
  applyExportFilter(ctx, width, height, scale,
    effExp.exportFilter, effExp.filterIntensity, effExp.filterVariant, effExp.filterParams);
  applyToneAdjustments(ctx, width, height, effExp);

  const dataUrl = canvas.toDataURL('image/png');
  const filterTag = effExp.exportFilter !== 'none' ? `_${effExp.exportFilter}` : '';
  const scaleTag = state.exportScale === 'custom' ? `${width}px` : `${state.exportScale}x`;
  const defaultName = `gbcam_${String(index + 1).padStart(2, '0')}_${effExp.palette.id}_${scaleTag}${filterTag}.png`;

  const saved = await window.api.savePng(dataUrl, defaultName);
  if (saved) showToast(`Saved: ${typeof saved === 'string' ? saved.split('/').pop() : saved}`);
}

// ── Export: batch PNG ────────────────────────────────────────────────────────

async function exportBatchPng() {
  const photos = state.photos.filter(p => !p.isEmpty);
  if (photos.length === 0) { showToast('No photos to export'); return; }

  const { width, height } = getExportDimensions();
  const scaleTag = state.exportScale === 'custom' ? `${width}px` : `${state.exportScale}x`;
  const batch = [];

  const batchScale = state.exportScale === 'custom' ? Math.max(1, Math.round(width / GBCam.PHOTO_WIDTH)) : state.exportScale;
  const filterTag  = state.exportFilter !== 'none' ? `_${state.exportFilter}` : '';

  for (const photo of photos) {
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const effBatch = getEffectiveSettings(photo.index);
    renderPhotoWithTransform(ctx, photo, effBatch.palette, batchScale, photo.index);
    applyExportFilter(ctx, canvas.width, canvas.height, batchScale,
      effBatch.exportFilter, effBatch.filterIntensity, effBatch.filterVariant, effBatch.filterParams);
    applyToneAdjustments(ctx, canvas.width, canvas.height, effBatch);
    const dataUrl = canvas.toDataURL('image/png');
    const phFilterTag = effBatch.exportFilter !== 'none' ? `_${effBatch.exportFilter}` : '';
    const name = `gbcam_${String(photo.index + 1).padStart(2, '0')}_${effBatch.palette.id}_${scaleTag}${phFilterTag}.png`;
    batch.push({ dataUrl, name });
  }

  const result = await window.api.savePngBatch(batch);
  if (result) showToast(`Exported ${result.count} photos`);
}

// ── Export: animated GIF ────────────────────────────────────────────────────

function enterGifMode() {
  state.gifMode = true;
  dom.photoGrid.classList.add('gif-mode');
  dom.gifToolbar.classList.add('visible');
  if (dom.gifFrameStrip) dom.gifFrameStrip.classList.add('visible');
  updateGifCount();
  renderGifFrameStrip();
}

function exitGifMode() {
  if (state.gifPreviewTimer) {
    clearInterval(state.gifPreviewTimer);
    state.gifPreviewTimer = null;
  }
  state.gifMode = false;
  state.gifSelection.clear();
  state.gifFrameOrder = [];
  state.gifPaletteScope = null;
  dom.photoGrid.classList.remove('gif-mode');
  dom.gifToolbar.classList.remove('visible');
  if (dom.gifFrameStrip) dom.gifFrameStrip.classList.remove('visible');
  dom.photoGrid.querySelectorAll('.photo-slot').forEach(el => {
    el.classList.remove('selected-for-gif');
    el.removeAttribute('data-gif-frame');
  });
  if (dom.gifPreviewWrap) dom.gifPreviewWrap.classList.remove('visible');
}

function toggleGifSelection(index, slotEl) {
  if (state.gifSelection.has(index)) {
    // Remove — find all occurrences in frame order (allow duplicates in future)
    state.gifFrameOrder = state.gifFrameOrder.filter(f => f.photoIndex !== index);
    state.gifSelection.delete(index);
    slotEl.classList.remove('selected-for-gif');
    slotEl.removeAttribute('data-gif-frame');
  } else {
    state.gifSelection.add(index);
    state.gifFrameOrder.push({ photoIndex: index, paletteId: null });
    slotEl.classList.add('selected-for-gif');
  }
  updateGifCount();
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}

function updateGifCount() {
  const n = state.gifFrameOrder.length;
  dom.gifCount.textContent = `${n} frame${n !== 1 ? 's' : ''}`;
}

// ── GIF frame strip ─────────────────────────────────────────────────────────

const GIF_THUMB_W = 96;
const GIF_THUMB_H = 84;

function renderGifFrameStrip() {
  if (!dom.gifFrameList) return;
  dom.gifFrameList.innerHTML = '';

  const empty = state.gifFrameOrder.length === 0;
  if (dom.gifFrameEmpty) dom.gifFrameEmpty.style.display = empty ? '' : 'none';

  state.gifFrameOrder.forEach((frame, orderIdx) => {
    const photo = state.photos[frame.photoIndex];
    if (!photo) return;

    const chip = document.createElement('div');
    chip.className = 'gif-chip';
    chip.draggable = true;
    chip.dataset.orderIdx = orderIdx;

    // Frame number badge
    const num = document.createElement('div');
    num.className = 'gif-chip-num';
    num.textContent = orderIdx + 1;

    // Thumbnail canvas
    const canvas = document.createElement('canvas');
    canvas.width  = GIF_THUMB_W;
    canvas.height = GIF_THUMB_H;
    canvas.className = 'gif-chip-canvas';

    // Resolve palette for this frame
    const pal = frame.paletteId ? PALETTES[frame.paletteId] : state.palette;
    if (pal) {
      // GBCam.renderToCanvas needs an integer scale — render at 1× then scale via drawImage
      const tmp = Object.assign(document.createElement('canvas'), {
        width: GBCam.PHOTO_WIDTH, height: GBCam.PHOTO_HEIGHT,
      });
      GBCam.renderToCanvas(tmp.getContext('2d'), photo.pixels, pal, 1);
      canvas.getContext('2d').drawImage(tmp, 0, 0, GIF_THUMB_W, GIF_THUMB_H);
    }

    // Palette swatch button
    const palBtn = document.createElement('button');
    palBtn.className = 'gif-chip-pal';
    palBtn.title = `Palette: ${pal ? pal.name : 'global'} — click to change`;
    if (frame.paletteId) palBtn.classList.add('overridden');

    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch gif-chip-swatch';
    (pal || state.palette).colors.forEach(color => {
      const sp = document.createElement('span');
      sp.style.background = color;
      swatch.appendChild(sp);
    });
    palBtn.appendChild(swatch);
    palBtn.addEventListener('click', e => {
      e.stopPropagation();
      openFramePalettePicker(orderIdx, palBtn);
    });

    // Duplicate button
    const dup = document.createElement('button');
    dup.className = 'gif-chip-dup';
    dup.textContent = '+';
    dup.title = 'Duplicate frame';
    dup.addEventListener('click', e => {
      e.stopPropagation();
      duplicateGifFrame(orderIdx);
    });

    // Remove button
    const rm = document.createElement('button');
    rm.className = 'gif-chip-remove';
    rm.textContent = '×';
    rm.title = 'Remove frame';
    rm.addEventListener('click', e => {
      e.stopPropagation();
      removeGifFrame(orderIdx);
    });

    chip.appendChild(num);
    chip.appendChild(canvas);
    chip.appendChild(palBtn);
    chip.appendChild(dup);
    chip.appendChild(rm);
    dom.gifFrameList.appendChild(chip);

    // ── Drag to reorder ──────────────────────────────────────────────────
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(orderIdx));
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
    chip.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chip.classList.add('drag-over');
    });
    chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
    chip.addEventListener('drop', e => {
      e.preventDefault();
      chip.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx   = orderIdx;
      if (fromIdx === toIdx) return;
      const [moved] = state.gifFrameOrder.splice(fromIdx, 1);
      state.gifFrameOrder.splice(toIdx, 0, moved);
      updateGifFrameNumbers();
      renderGifFrameStrip();
      updateGifPreview();
    });
  });
}

function removeGifFrame(orderIdx) {
  const frame = state.gifFrameOrder[orderIdx];
  if (!frame) return;
  state.gifFrameOrder.splice(orderIdx, 1);
  // Only remove from selection Set if no other frames reference this photo
  if (!state.gifFrameOrder.some(f => f.photoIndex === frame.photoIndex)) {
    state.gifSelection.delete(frame.photoIndex);
    const slot = dom.photoGrid.querySelector(`[data-index="${frame.photoIndex}"]`);
    if (slot) {
      slot.classList.remove('selected-for-gif');
      slot.removeAttribute('data-gif-frame');
    }
  }
  updateGifCount();
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}

// Mini palette picker scoped to a single GIF frame
let _framePalettePopover = null;
function openFramePalettePicker(orderIdx, anchorEl) {
  // Close any open one
  if (_framePalettePopover) { _framePalettePopover.remove(); _framePalettePopover = null; }

  const popover = document.createElement('div');
  popover.className = 'frame-pal-popover';
  _framePalettePopover = popover;

  // "Use global" option
  const globalOpt = document.createElement('button');
  globalOpt.className = 'frame-pal-opt' + (!state.gifFrameOrder[orderIdx]?.paletteId ? ' active' : '');
  globalOpt.textContent = 'Global palette';
  globalOpt.addEventListener('click', () => {
    state.gifFrameOrder[orderIdx].paletteId = null;
    popover.remove(); _framePalettePopover = null;
    renderGifFrameStrip(); updateGifPreview();
  });
  popover.appendChild(globalOpt);

  // Separator
  const sep = document.createElement('div');
  sep.className = 'frame-pal-sep';
  popover.appendChild(sep);

  // All palettes in groups
  const currentId = state.gifFrameOrder[orderIdx]?.paletteId;
  for (const [id, pal] of Object.entries(PALETTES)) {
    const opt = document.createElement('button');
    opt.className = 'frame-pal-opt' + (currentId === id ? ' active' : '');

    const sw = document.createElement('div');
    sw.className = 'palette-swatch frame-pal-swatch';
    pal.colors.forEach(c => { const s = document.createElement('span'); s.style.background = c; sw.appendChild(s); });

    const nm = document.createElement('span');
    nm.textContent = pal.name;
    nm.className = 'frame-pal-name';

    opt.appendChild(sw);
    opt.appendChild(nm);
    opt.addEventListener('click', () => {
      state.gifFrameOrder[orderIdx].paletteId = id;
      popover.remove(); _framePalettePopover = null;
      renderGifFrameStrip(); updateGifPreview();
    });
    popover.appendChild(opt);
  }

  // Position relative to anchor
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const ph = popover.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  popover.style.left = `${rect.left}px`;
  popover.style.top = spaceBelow > ph + 8
    ? `${rect.bottom + 4}px`
    : `${rect.top - ph - 4}px`;

  // Close on outside click
  const close = e => {
    if (!popover.contains(e.target) && e.target !== anchorEl) {
      popover.remove(); _framePalettePopover = null;
      document.removeEventListener('mousedown', close);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function setGifLoop(mode) {
  state.gifLoop = mode;
  document.querySelectorAll('.gif-loop-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.loop === mode);
  });
  // Reflect the new loop mode in the live preview immediately
  if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
}

async function exportGif() {
  if (state.gifFrameOrder.length === 0) {
    showToast('Select at least one photo');
    return;
  }

  // Resolve numeric scale (custom mode → pixel ratio)
  const scale = state.exportScale === 'custom'
    ? Math.max(1, Math.round((parseInt(document.getElementById('custom-width')?.value) || 512) / GBCam.PHOTO_WIDTH))
    : state.exportScale;

  // Build the frame sequence from gifFrameOrder — apply bounce (ping-pong) if selected
  const baseFrames = state.gifFrameOrder;
  let sequence = baseFrames;
  if (state.gifLoop === 'bounce' && baseFrames.length > 2) {
    // Forward + reversed middle (exclude duplicate endpoints)
    const mid = [...baseFrames].reverse().slice(1, baseFrames.length - 1);
    sequence = [...baseFrames, ...mid];
  }

  const frames = [];

  for (const frame of sequence) {
    const photo = state.photos[frame.photoIndex];
    if (!photo || photo.isEmpty) continue;
    // Per-frame palette override — fall back to global palette
    const pal = (frame.paletteId && PALETTES[frame.paletteId]) || state.palette;
    frames.push({
      indices: Array.from(photo.pixels),
      palette: paletteToRGB(pal),
      width:  GBCam.PHOTO_WIDTH,
      height: GBCam.PHOTO_HEIGHT,
    });
  }

  if (frames.length === 0) { showToast('No valid frames'); return; }

  const loopTag = state.gifLoop !== 'infinite' ? `_${state.gifLoop}` : '';
  const defaultName = `gbcam_anim_${scale}x${loopTag}.gif`;

  const result = await window.api.saveGif({
    frames,
    delay:  state.gifDelay,
    scale,
    loop:   state.gifLoop,   // 'infinite' | 'once' | 'bounce'
    defaultName,
  });

  if (result && !result.error) {
    const fLabel = `${frames.length} frame${frames.length !== 1 ? 's' : ''}`;
    const lLabel = state.gifLoop === 'once' ? '· plays once' : state.gifLoop === 'bounce' ? '· bounce' : '';
    showToast(`GIF saved (${fLabel} ${lLabel})`);
  } else if (result?.error) {
    showToast(`Error: ${result.error}`);
  }
}

// ── Analogue Pocket modal ────────────────────────────────────────────────────

let selectedPocketSave = null;

async function openPocketModal() {
  dom.pocketModal.classList.remove('hidden');
  dom.pocketSaveList.innerHTML = '<p style="color:var(--text-3);font-size:12px;">Scanning for Analogue Pocket SD card…</p>';
  dom.pocketConfirm.disabled = true;
  selectedPocketSave = null;

  const { saves } = await window.api.detectPocket();
  dom.pocketSaveList.innerHTML = '';

  if (saves.length === 0) {
    dom.pocketSaveList.innerHTML =
      '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">' +
      'No GB Camera saves found. Make sure your Analogue Pocket SD card is inserted, ' +
      'and that you have run GB Camera at least once.</p>';
    return;
  }

  for (const save of saves) {
    const item = document.createElement('div');
    item.className = 'save-item';
    item.innerHTML =
      `<span class="save-name">${save.name}</span>` +
      `<span class="save-path">📼 ${save.volume} › ${save.path.split('/').slice(-2).join('/')}</span>`;
    item.addEventListener('click', () => {
      dom.pocketSaveList.querySelectorAll('.save-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedPocketSave = save;
      dom.pocketConfirm.disabled = false;
    });
    dom.pocketSaveList.appendChild(item);
  }
}

function closePocketModal() {
  dom.pocketModal.classList.add('hidden');
}

async function confirmPocketOpen() {
  if (!selectedPocketSave) return;
  closePocketModal();
  // Pass the whole save object — Electron uses .path, web uses .handle
  const result = await window.api.readFile(selectedPocketSave);
  await loadSavFile(result);
}

// ── Drag & drop ─────────────────────────────────────────────────────────────

function setupDragDrop() {
  const overlay = dom.dropOverlay;

  document.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    overlay?.classList.remove('hidden');
  });

  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) overlay?.classList.add('hidden');
  });

  document.addEventListener('drop', async e => {
    e.preventDefault();
    overlay?.classList.add('hidden');
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (window.api?.readFile && file.path) {
      // Electron: use native path for proper size validation in main process
      const result = await window.api.readFile(file.path);
      await loadSavFile(result);
    } else {
      // Web / fallback
      const buffer = await file.arrayBuffer();
      await loadSavFile({
        buffer,
        name: file.name,
        path: null,
        error: buffer.byteLength !== 131072
          ? `Unexpected file size: ${buffer.byteLength} bytes (expected 131072 for GB Camera SRAM).`
          : null,
      });
    }
  });
}

// ── Wire up buttons ──────────────────────────────────────────────────────────

function wireButtons() {
  // Welcome screen
  document.getElementById('btn-open-sav').addEventListener('click', async () => {
    const result = await window.api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById('btn-open-pocket').addEventListener('click', openPocketModal);

  // Titlebar buttons
  document.getElementById('tb-open-sav').addEventListener('click', async () => {
    const result = await window.api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById('tb-open-pocket').addEventListener('click', openPocketModal);

  // Palette bar (handled in buildPaletteBar)

  // Scale controls (numeric or 'custom')
  document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.scale === 'custom' ? 'custom' : parseInt(btn.dataset.scale);
      setExportScale(val);
    });
  });

  // Custom width input
  const customWidthInput = document.getElementById('custom-width');
  if (customWidthInput) {
    customWidthInput.addEventListener('input', updateCustomSizeDisplay);
  }

  // Thumbnail size slider
  const thumbSlider = document.getElementById('thumb-size-slider');
  if (thumbSlider) {
    thumbSlider.addEventListener('input', () => setThumbnailSize(parseInt(thumbSlider.value)));
  }

  // Format controls
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => setExportFormat(btn.dataset.fmt));
  });

  // Export filter buttons — click active filter again to turn it off
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = (state.exportFilter === btn.dataset.filter) ? 'none' : btn.dataset.filter;
      setExportFilter(next);
    });
  });

  // Filter intensity slider
  const intensitySlider = document.getElementById('filter-intensity');
  const intensityVal    = document.getElementById('filter-intensity-val');
  if (intensitySlider) {
    intensitySlider.addEventListener('input', () => {
      setScopedSetting('filterIntensity', intensitySlider.value / 100);
      if (intensityVal) intensityVal.textContent = `${intensitySlider.value}%`;
      repaintGrid();
    });
  }

  // CRT scanline variant buttons
  document.querySelectorAll('.crt-variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setScopedSetting('filterVariant', btn.dataset.variant);
      document.querySelectorAll('.crt-variant-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.variant === btn.dataset.variant));
      repaintGrid();
    });
  });

  // Lightbox
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-prev').addEventListener('click',  () => lightboxStep(-1));
  document.getElementById('lb-next').addEventListener('click',  () => lightboxStep( 1));
  document.getElementById('lb-export').addEventListener('click', exportSinglePng);
  dom.lbOverlay.addEventListener('click', e => { if (e.target === dom.lbOverlay) closeLightbox(); });

  document.getElementById('lb-transforms').addEventListener('click', e => {
    const btn = e.target.closest('.transform-btn');
    if (!btn || state.selectedIndex === null) return;
    const action = btn.dataset.action;
    if (action === 'fullscreen') { openPresentation(state.selectedIndex); return; }
    applyTransformAction(state.selectedIndex, action);
    _repaintAfterTransform(state.selectedIndex);
  });

  // View mode toggle (Grid / Solo)
  document.getElementById('btn-view-grid')?.addEventListener('click', enterGridMode);
  document.getElementById('btn-view-solo')?.addEventListener('click', enterSoloMode);

  // Solo navigation + transforms
  document.getElementById('solo-prev')?.addEventListener('click', () => soloStep(-1));
  document.getElementById('solo-next')?.addEventListener('click', () => soloStep( 1));
  document.getElementById('solo-transforms')?.addEventListener('click', e => {
    const btn = e.target.closest('.transform-btn');
    if (!btn || state.selectedIndex === null) return;
    const action = btn.dataset.action;
    if (action === 'fullscreen') { openPresentation(state.selectedIndex); return; }
    applyTransformAction(state.selectedIndex, action);
    _repaintAfterTransform(state.selectedIndex);
  });

  // Export buttons
  document.getElementById('btn-export-single').addEventListener('click', exportSinglePng);
  document.getElementById('btn-export-all').addEventListener('click', exportBatchPng);
  document.getElementById('btn-export-gif').addEventListener('click', exportGif);
  document.getElementById('btn-contact-sheet')?.addEventListener('click', exportContactSheet);

  // Scope toggle (All Photos / This Photo)
  document.getElementById('btn-scope-all')?.addEventListener('click', () => {
    state.applyScope = 'all';
    document.getElementById('btn-scope-all')?.classList.add('active');
    document.getElementById('btn-scope-photo')?.classList.remove('active');
    document.getElementById('btn-scope-reset')?.classList.add('hidden');
    // Restore right-panel controls to global state
    updatePalettePickerBtn();
    const globalId = state.palette.id;
    document.querySelectorAll('.pal-item').forEach(item =>
      item.classList.toggle('active', item.dataset.palette === globalId));
    updateCurrentPalettePin();
  });
  document.getElementById('btn-scope-photo')?.addEventListener('click', () => {
    state.applyScope = 'photo';
    document.getElementById('btn-scope-photo')?.classList.add('active');
    document.getElementById('btn-scope-all')?.classList.remove('active');
    if (state.selectedIndex !== null) {
      syncControlsToEffectiveSettings(state.selectedIndex);
    }
  });
  document.getElementById('btn-scope-reset')?.addEventListener('click', () => {
    if (state.selectedIndex === null) return;
    clearPhotoOverride(state.selectedIndex);
    repaintGridSlot(state.selectedIndex);
    if (state.viewMode === 'solo') renderSoloView(state.selectedIndex);
    if (state.lightboxOpen) renderLightbox(state.selectedIndex);
    syncControlsToEffectiveSettings(state.selectedIndex);
    document.getElementById('btn-scope-reset')?.classList.add('hidden');
    showToast('Per-photo settings cleared');
  });

  // Tone controls
  setupToneControls();

  // Titlebar: export .sav + project + reload
  document.getElementById('tb-export-sav')?.addEventListener('click', exportSav);
  document.getElementById('tb-save-project')?.addEventListener('click', saveProject);
  document.getElementById('tb-open-project')?.addEventListener('click', openProject);
  document.getElementById('tb-reload-sav')?.addEventListener('click', reloadSav);

  // Grid header: hide empty
  document.getElementById('btn-hide-empty')?.addEventListener('click', toggleHideEmpty);

  // (Photo transform buttons are now in the lightbox footer — see #lb-transforms above)

  // Presentation overlay
  dom.presClose?.addEventListener('click', closePresentation);
  dom.presPrev?.addEventListener('click',  () => presentationStep(-1));
  dom.presNext?.addEventListener('click',  () => presentationStep( 1));
  dom.presentationOverlay?.addEventListener('click', e => {
    if (e.target === dom.presentationOverlay) closePresentation();
  });

  // Palette grid
  document.getElementById('btn-palette-grid').addEventListener('click', openPaletteGrid);
  document.getElementById('palette-grid-close').addEventListener('click', closePaletteGrid);

  // GIF toolbar
  document.getElementById('gif-cancel').addEventListener('click', () => {
    setExportFormat('png');
    // Reset format buttons
    document.querySelectorAll('.fmt-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.fmt === 'png');
    });
  });

  // GIF loop mode
  document.querySelectorAll('.gif-loop-btn').forEach(btn => {
    btn.addEventListener('click', () => setGifLoop(btn.dataset.loop));
  });

  // GIF delay slider
  dom.gifDelay.addEventListener('input', () => {
    state.gifDelay = parseInt(dom.gifDelay.value);
    dom.gifDelayVal.textContent = `${state.gifDelay}ms`;
    if (state.gifMode && state.gifSelection.size > 1) updateGifPreview();
  });

  // Pocket modal
  document.getElementById('pocket-cancel').addEventListener('click', closePocketModal);
  dom.pocketConfirm.addEventListener('click', confirmPocketOpen);

  // Menu events from main process
  window.api.onMenuOpenSav(async () => {
    const result = await window.api.openSavFile();
    await loadSavFile(result);
  });
  window.api.onMenuOpenPocket(() => openPocketModal());
  window.api.onMenuExportAll(() => {
    if (state.photos.length > 0) exportBatchPng();
  });
}

// ── Thumbnail size ────────────────────────────────────────────────────────────

function setThumbnailSize(px) {
  dom.photoGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;
}

// ── Panel resize (drag handle between grid and detail panel) ─────────────────

function setupPanelResize() {
  const handle = document.getElementById('panel-resize-handle');
  const detailPanel = document.getElementById('detail-panel');
  if (!handle || !detailPanel) return;

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = detailPanel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const dx = startX - e.clientX; // dragging left = panel wider
      const newWidth = Math.max(260, Math.min(600, startWidth + dx));
      detailPanel.style.width = `${newWidth}px`;
      detailPanel.style.flex = 'none';
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

// ── Custom palettes — localStorage persistence ────────────────────────────

const CUSTOM_PALETTES_KEY = 'gbcam_custom_palettes';

function loadCustomPalettes() {
  try {
    const raw = localStorage.getItem(CUSTOM_PALETTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function saveCustomPalettesToStorage(palettes) {
  localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
}

function getCustomPalettes() {
  return loadCustomPalettes();
}

// Merge custom palettes into the live PALETTES object and rebuild the bar
function refreshCustomPalettes() {
  // Remove old custom entries
  for (const key of Object.keys(PALETTES)) {
    if (PALETTES[key].custom) delete PALETTES[key];
  }
  // Add loaded custom palettes
  for (const pal of loadCustomPalettes()) {
    PALETTES[pal.id] = { ...pal, custom: true };
  }
}

// ── Palette editor modal ──────────────────────────────────────────────────

let editingPaletteId = null; // null = new palette

const SHADE_LABELS = ['Lightest (0)', 'Light (1)', 'Dark (2)', 'Darkest (3)'];

// Perceived brightness using Rec. 601 luminance weights (lightest = highest value)
function perceivedBrightness(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Sort hex color array lightest → darkest
function sortByBrightness(colors) {
  return [...colors].sort((a, b) => perceivedBrightness(b) - perceivedBrightness(a));
}

// Apply an array of 4 hex colors to the open editor (pickers + hex inputs)
function applyColorsToEditor(colors) {
  const rows = document.querySelectorAll('#palette-color-pickers .pal-editor-row');
  colors.forEach((hex, i) => {
    if (!rows[i]) return;
    const picker = rows[i].querySelector('input[type=color]');
    const hexIn  = rows[i].querySelector('input[type=text]');
    const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';
    if (picker) picker.value = safe.toLowerCase();
    if (hexIn)  hexIn.value  = safe.toUpperCase();
  });
  updatePalettePreview();
}

function openPaletteEditor(existingPalette = null) {
  editingPaletteId = existingPalette ? existingPalette.id : null;

  document.getElementById('palette-modal-title').textContent =
    existingPalette ? `Edit: ${existingPalette.name}` : 'New Palette';

  // Clear Lospec status
  const lospecStatus = document.getElementById('lospec-status');
  if (lospecStatus) lospecStatus.textContent = '';
  const lospecUrl = document.getElementById('palette-lospec-url');
  if (lospecUrl) lospecUrl.value = '';

  // Name
  document.getElementById('palette-name-input').value =
    existingPalette ? existingPalette.name : '';

  // Color pickers with paired hex text inputs
  const container = document.getElementById('palette-color-pickers');
  container.innerHTML = '';
  const colors = existingPalette ? existingPalette.colors : ['#FFFFFF', '#AAAAAA', '#555555', '#000000'];

  colors.forEach((color, i) => {
    const row = document.createElement('div');
    row.className = 'pal-editor-row';
    row.style.cssText = 'display:flex; align-items:center; gap:10px;';

    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px; color:var(--text-2); width:82px; flex-shrink:0;';
    label.textContent = SHADE_LABELS[i];

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = color.toLowerCase();
    picker.dataset.shade = i;
    picker.style.cssText = 'width:40px; height:32px; border:none; border-radius:4px; cursor:pointer; background:none; padding:0; flex-shrink:0;';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = color.toUpperCase();
    hexInput.maxLength = 7;
    hexInput.placeholder = '#RRGGBB';
    hexInput.style.cssText = 'width:80px; padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:12px; font-family:var(--font-mono); outline:none;';

    // Sync picker → hex input + preview
    picker.addEventListener('input', () => {
      hexInput.value = picker.value.toUpperCase();
      updatePalettePreview();
    });

    // Sync hex input → picker + preview (only when valid)
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v.toLowerCase();
        updatePalettePreview();
      }
    });

    row.appendChild(label);
    row.appendChild(picker);
    row.appendChild(hexInput);
    container.appendChild(row);
  });

  // Delete button visibility
  const deleteBtn = document.getElementById('palette-modal-delete');
  deleteBtn.style.display = (existingPalette && existingPalette.custom) ? 'inline-flex' : 'none';

  // Show modal
  document.getElementById('palette-modal').classList.remove('hidden');
  updatePalettePreview();
  document.getElementById('palette-name-input').focus();
}

function closePaletteEditor() {
  document.getElementById('palette-modal').classList.add('hidden');
  editingPaletteId = null;
}

function getCurrentEditorColors() {
  return Array.from(document.querySelectorAll('#palette-color-pickers input[type=color]'))
    .map(p => p.value);
}

function updatePalettePreview() {
  const canvas = document.getElementById('palette-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = getCurrentEditorColors();
  const previewPalette = { colors };

  // Use selected photo, or first non-empty photo; render at 2× into 256×224 canvas
  const idx = state.selectedIndex !== null ? state.selectedIndex
    : state.photos.findIndex(p => !p.isEmpty);

  if (idx >= 0 && state.photos[idx] && !state.photos[idx].isEmpty) {
    GBCam.renderToCanvas(ctx, state.photos[idx].pixels, previewPalette, 2);
  } else {
    ctx.fillStyle = colors[0] || '#FFFFFF';
    ctx.fillRect(0, 0, 256, 224);
  }
}

// ── Analogue Pocket .pal / .gbp format ───────────────────────────────────
//
// .gbp — 16 bytes
//   bytes  0–11: 4 × RGB (lightest → darkest), straight to our convention
//   bytes 12–15: zero padding
//
// .pal — 56 bytes
//   bytes  0–11: BG palette (4 × RGB, stored darkest → lightest)
//   bytes 12–23: Window palette (same)
//   bytes 24–35: OBJ0 palette  (same)
//   bytes 36–47: OBJ1 palette  (same)
//   bytes 48–50: border/LCD-off color
//   byte     51: 0x81 flags
//   bytes 52–55: 'APGB' magic footer

function parseGbpFile(buffer) {
  if (buffer.byteLength < 12) return null;
  const u8 = new Uint8Array(buffer);
  const colors = [];
  for (let i = 0; i < 4; i++) {
    const r = u8[i * 3], g = u8[i * 3 + 1], b = u8[i * 3 + 2];
    colors.push('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
  }
  return colors; // already lightest → darkest
}

function parsePalFile(buffer) {
  if (buffer.byteLength < 12) return null;
  const u8 = new Uint8Array(buffer);
  const colors = [];
  for (let i = 0; i < 4; i++) {
    const r = u8[i * 3], g = u8[i * 3 + 1], b = u8[i * 3 + 2];
    colors.push('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''));
  }
  // BG section is stored darkest→lightest; reverse to get our convention
  return colors.reverse();
}

function encodeGbpFile(colors) {
  const buf = new Uint8Array(16); // last 4 bytes stay 0x00
  for (let i = 0; i < 4; i++) {
    const n = parseInt(colors[i].replace('#', ''), 16);
    buf[i * 3]     = (n >> 16) & 0xff;
    buf[i * 3 + 1] = (n >> 8)  & 0xff;
    buf[i * 3 + 2] =  n        & 0xff;
  }
  return buf;
}

function encodePalFile(colors) {
  const buf = new Uint8Array(56);
  // .pal stores darkest→lightest, so reverse our convention
  const rev = [...colors].reverse();

  function writePalette(offset) {
    for (let i = 0; i < 4; i++) {
      const n = parseInt(rev[i].replace('#', ''), 16);
      buf[offset + i * 3]     = (n >> 16) & 0xff;
      buf[offset + i * 3 + 1] = (n >> 8)  & 0xff;
      buf[offset + i * 3 + 2] =  n        & 0xff;
    }
  }
  writePalette(0);   // BG
  writePalette(12);  // Window
  writePalette(24);  // OBJ0
  writePalette(36);  // OBJ1

  // Border color = lightest
  const n0 = parseInt(colors[0].replace('#', ''), 16);
  buf[48] = (n0 >> 16) & 0xff;
  buf[49] = (n0 >> 8)  & 0xff;
  buf[50] =  n0        & 0xff;

  buf[51] = 0x81;
  buf[52] = 0x41; // A
  buf[53] = 0x50; // P
  buf[54] = 0x47; // G
  buf[55] = 0x42; // B

  return buf;
}

function downloadBinary(uint8, filename) {
  const blob = new Blob([uint8], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function safeFilename(name) {
  return (name || 'palette').replace(/[^a-z0-9_\-. ]/gi, '_').trim() || 'palette';
}

function exportEditorAsPal() {
  const colors = getCurrentEditorColors();
  const name = safeFilename(document.getElementById('palette-name-input')?.value);
  downloadBinary(encodePalFile(colors), `${name}.pal`);
}

function exportEditorAsGbp() {
  const colors = getCurrentEditorColors();
  const name = safeFilename(document.getElementById('palette-name-input')?.value);
  downloadBinary(encodeGbpFile(colors), `${name}.gbp`);
}

// Parse a single .pal or .gbp file and apply it to the open editor
function handlePalFileImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const ext = file.name.toLowerCase().split('.').pop();
    let colors;
    if (ext === 'gbp') {
      colors = parseGbpFile(e.target.result);
    } else if (ext === 'pal') {
      colors = parsePalFile(e.target.result);
    }
    if (!colors || colors.length < 4) {
      showToast('Could not parse palette file');
      return;
    }
    const nameInput = document.getElementById('palette-name-input');
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = file.name.replace(/\.(pal|gbp)$/i, '');
    }
    applyColorsToEditor(sortByBrightness(colors));
    const statusEl = document.getElementById('lospec-status');
    if (statusEl) {
      statusEl.textContent = `Loaded: ${file.name}`;
      statusEl.style.color = 'var(--accent)';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Batch-import multiple .pal/.gbp/.json files from the palette-bar Import button
async function batchImportPaletteFiles(files) {
  const customs = loadCustomPalettes();
  let added = 0, skipped = 0;

  for (const file of files) {
    const ext = file.name.toLowerCase().split('.').pop();

    if (ext === 'json') {
      // Existing JSON logic (single file, handled inline here)
      try {
        const text = await file.text();
        const incoming = JSON.parse(text);
        if (!Array.isArray(incoming)) continue;
        for (const p of incoming) {
          if (typeof p.name !== 'string') continue;
          if (!Array.isArray(p.colors) || p.colors.length !== 4) continue;
          if (!p.colors.every(c => /^#[0-9a-fA-F]{6}$/.test(c))) continue;
          customs.push({
            id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            name: p.name, colors: p.colors, custom: true,
          });
          added++;
        }
      } catch (_) { skipped++; }
    } else if (ext === 'pal' || ext === 'gbp') {
      try {
        const buf = await file.arrayBuffer();
        const colors = ext === 'gbp' ? parseGbpFile(buf) : parsePalFile(buf);
        if (!colors || colors.length < 4) { skipped++; continue; }
        const name = file.name.replace(/\.(pal|gbp)$/i, '');
        customs.push({
          id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          name, colors: sortByBrightness(colors), custom: true,
        });
        added++;
      } catch (_) { skipped++; }
    }
  }

  if (added === 0) { showToast('No valid palettes found'); return; }

  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  rebuildPalettePickerList();
  showToast(`Imported ${added} palette${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`);
}

// ── Smart palette import (URL / hex values / Lospec / coolors) ──────────

async function importFromText(text) {
  const raw = text.trim();
  if (!raw) return;

  const statusEl = document.getElementById('lospec-status');
  function setStatus(msg, color = 'var(--text-3)') {
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color; }
  }

  // Extract any 6-digit hex values from the input (handles coolors URLs, pasted lists, etc.)
  const hexMatches = [...raw.matchAll(/(?:#|%23)?([0-9a-fA-F]{6})(?:[^0-9a-fA-F]|$)/g)]
    .map(m => '#' + m[1])
    .filter((c, i, a) => a.indexOf(c) === i); // deduplicate

  // If 2+ hex values present and it's not a Lospec URL, treat as direct hex import
  if (hexMatches.length >= 2 && !raw.toLowerCase().includes('lospec.com')) {
    const colors = sortByBrightness(hexMatches.slice(0, 4));
    applyColorsToEditor(colors);
    const src = raw.includes('coolors.co') ? 'coolors.co' :
                raw.includes('http')       ? new URL(raw).hostname :
                'hex values';
    setStatus(`${colors.length} colors imported from ${src}`, 'var(--accent)');
    return;
  }

  // Lospec: accept full URL, bare domain path, or just a slug
  let slug = raw;
  const lospecMatch = raw.match(/lospec\.com\/palette-list\/([^/?#\s]+)/i);
  if (lospecMatch) slug = lospecMatch[1];
  slug = slug.replace(/\/+$/, '').replace(/\.json$/, '');

  setStatus('Fetching from Lospec…', 'var(--text-3)');

  try {
    if (!window.api?.fetchJson) throw new Error('fetchJson not available');
    const data = await window.api.fetchJson(`https://lospec.com/palette-list/${slug}.json`);

    if (!Array.isArray(data.colors) || data.colors.length < 4) {
      setStatus(`Need 4 colors — palette only has ${data.colors?.length ?? 0}`, 'var(--yellow)');
      return;
    }

    const colors = sortByBrightness(
      data.colors.slice(0, 4).map(c => c.startsWith('#') ? c : '#' + c)
    );

    const nameInput = document.getElementById('palette-name-input');
    if (nameInput && !nameInput.value.trim() && data.name) nameInput.value = data.name;

    applyColorsToEditor(colors);
    setStatus(
      `"${data.name}" imported${data.colors.length > 4 ? ` (first 4 of ${data.colors.length})` : ''}`,
      'var(--accent)'
    );
  } catch (e) {
    setStatus(`Failed: ${e.message}`, '#ff453a');
  }
}

function savePaletteEditor() {
  const name = document.getElementById('palette-name-input').value.trim() || 'Custom';
  const colors = getCurrentEditorColors();

  const customs = loadCustomPalettes();

  if (editingPaletteId) {
    // Update existing
    const i = customs.findIndex(p => p.id === editingPaletteId);
    if (i >= 0) {
      customs[i] = { id: editingPaletteId, name, colors, custom: true };
    }
  } else {
    // New — generate a unique id
    const id = 'custom_' + Date.now();
    customs.push({ id, name, colors, custom: true });
    editingPaletteId = id; // so we can select it after save
  }

  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();

  // Select the saved palette
  const savedId = editingPaletteId;
  closePaletteEditor();
  rebuildPalettePickerList();
  setPalette(savedId);
  showToast(`Palette "${name}" saved`);
}

function deletePaletteFromEditor() {
  if (!editingPaletteId) return;
  const customs = loadCustomPalettes().filter(p => p.id !== editingPaletteId);
  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  closePaletteEditor();
  rebuildPalettePickerList();
  // Fall back to DMG if deleted palette was selected
  if (state.palette.id === editingPaletteId) setPalette('dmg');
  showToast('Palette deleted');
}

// ── Palette import / export ──────────────────────────────────────────────

function exportPalettesJson() {
  const customs = loadCustomPalettes();
  if (customs.length === 0) { showToast('No custom palettes to export'); return; }

  const json = JSON.stringify(customs.map(({ id, name, colors }) => ({ id, name, colors })), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'gbcam-palettes.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${customs.length} palette${customs.length !== 1 ? 's' : ''}`);
}

function importPalettesJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const incoming = JSON.parse(e.target.result);
      if (!Array.isArray(incoming)) throw new Error('Expected an array');

      const validated = incoming.filter(p =>
        typeof p.name === 'string' &&
        Array.isArray(p.colors) && p.colors.length === 4 &&
        p.colors.every(c => /^#[0-9a-fA-F]{6}$/.test(c))
      ).map(p => ({
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: p.name,
        colors: p.colors,
        custom: true,
      }));

      if (validated.length === 0) { showToast('No valid palettes found in file'); return; }

      const existing = loadCustomPalettes();
      saveCustomPalettesToStorage([...existing, ...validated]);
      refreshCustomPalettes();
      rebuildPalettePickerList();
      showToast(`Imported ${validated.length} palette${validated.length !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ── Palette picker UI ─────────────────────────────────────────────────────

function buildPalettePickerUI() {
  updatePalettePickerBtn();
  rebuildPalettePickerList();

  const btn      = document.getElementById('palette-picker-btn');
  const dropdown = document.getElementById('palette-picker-dropdown');
  const search   = document.getElementById('palette-picker-search');

  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains('hidden');
      if (isOpen) {
        closePalettePicker();
      } else {
        dropdown.classList.remove('hidden');
        btn.classList.add('open');
        updateCurrentPalettePin(); // refresh active-palette pin at top of list
        if (search) {
          search.value = '';
          filterPaletteList('');
          search.focus();
        }
      }
    });
  }

  if (search) {
    search.addEventListener('input', () => filterPaletteList(search.value));
    // Prevent closing when typing
    search.addEventListener('click', (e) => e.stopPropagation());
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('palette-picker-wrap');
    if (wrap && !wrap.contains(e.target)) closePalettePicker();
  });

  // Close on Escape — also exits GIF mode / solo mode / clears selections
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (state.lightboxOpen) { closeLightbox(); return; }
      if (state.viewMode === 'solo') { enterGridMode(); return; }
      if (state.gifMode) {
        // Exit GIF mode and reset format buttons back to PNG
        setExportFormat('png');
        document.querySelectorAll('.fmt-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.fmt === 'png');
        });
      }
      closePalettePicker();
      closePaletteGrid();
    }
  });
}

function closePalettePicker() {
  const dropdown = document.getElementById('palette-picker-dropdown');
  const btn      = document.getElementById('palette-picker-btn');
  if (dropdown) dropdown.classList.add('hidden');
  if (btn)      btn.classList.remove('open');
  renderRecentPalettes(); // update strip now that selection session is over
}

const PAL_GROUP_ORDER = [
  'hardware', 'gbc', 'gbc_game', 'gbc_unused',
  'sgb', 'sgb2',
  'community', 'gallery',
  'helllord', 'trashuncle', 'wolfbunny',
  'bgb', 'sameboy',
  'artistic',
];
const PAL_GROUP_LABELS = {
  hardware:   'GB Hardware',
  gbc:        'GBC Official',
  gbc_game:   'GBC Game Palettes',
  gbc_unused: 'GBC Unused',
  sgb:        'Super Game Boy',
  sgb2:       'SGB Vaporwave',
  community:  'Community (Lospec)',
  gallery:    'Community Gallery',
  helllord:   'R.A.Helllord',
  trashuncle: 'Trashuncle',
  wolfbunny:  'TheWolfBunny64',
  bgb:        'BGB Emulator',
  sameboy:    'SameBoy Emulator',
  artistic:   'Artistic',
};

function rebuildPalettePickerList() {
  const list = document.getElementById('palette-picker-list');
  if (!list) return;
  list.innerHTML = '';

  refreshCustomPalettes();

  // Bucket built-in palettes by group
  const grouped = {};
  for (const [id, pal] of Object.entries(PALETTES)) {
    if (pal.custom) continue;
    const g = pal.group || 'other';
    (grouped[g] = grouped[g] || []).push([id, pal]);
  }

  // Render in defined order, then any unexpected groups
  const orderedGroups = [
    ...PAL_GROUP_ORDER,
    ...Object.keys(grouped).filter(g => !PAL_GROUP_ORDER.includes(g)),
  ];

  for (const g of orderedGroups) {
    if (!grouped[g] || grouped[g].length === 0) continue;
    const header = document.createElement('div');
    header.className = 'pal-section-header';
    header.textContent = PAL_GROUP_LABELS[g] || g;
    list.appendChild(header);
    for (const [id, pal] of grouped[g]) {
      list.appendChild(makePalItem(id, pal));
    }
  }

  // Custom section at the bottom
  const customs = Object.entries(PALETTES).filter(([, p]) => p.custom);
  if (customs.length > 0) {
    const customHeader = document.createElement('div');
    customHeader.className = 'pal-section-header';
    customHeader.textContent = 'Custom';
    list.appendChild(customHeader);
    for (const [id, pal] of customs) {
      list.appendChild(makePalItem(id, pal));
    }
  }
}

function makePalItem(id, pal) {
  const item = document.createElement('div');
  item.className = 'pal-item' + (state.palette.id === id ? ' active' : '');
  item.dataset.palette = id;

  const swatch = document.createElement('div');
  swatch.className = 'palette-swatch';
  for (const color of pal.colors) {
    const span = document.createElement('span');
    span.style.background = color;
    swatch.appendChild(span);
  }

  const name = document.createElement('span');
  name.className = 'pal-item-name';
  name.textContent = pal.name;

  item.appendChild(swatch);
  item.appendChild(name);

  // Credit attribution for community palettes
  if (pal.credit) {
    const credit = document.createElement('a');
    credit.className = 'pal-item-credit';
    credit.textContent = pal.credit;
    if (pal.creditUrl) {
      credit.href = pal.creditUrl;
      credit.target = '_blank';
      credit.rel = 'noopener';
      credit.addEventListener('click', e => e.stopPropagation());
    }
    item.appendChild(credit);
  }

  if (pal.custom) {
    const editBtn = document.createElement('button');
    editBtn.className = 'pal-item-edit';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Edit palette';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePalettePicker();
      openPaletteEditor(pal);
    });
    item.appendChild(editBtn);
  }

  // Favourite star button
  const starBtn = document.createElement('button');
  starBtn.className = 'pal-item-star' + (isFavPalette(id) ? ' starred' : '');
  starBtn.dataset.palette = id;
  starBtn.textContent = '★';
  starBtn.title = isFavPalette(id) ? 'Remove from favourites' : 'Add to favourites';
  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleFavPalette(id);
  });
  item.appendChild(starBtn);

  item.addEventListener('click', () => {
    setPalette(id);
    closePalettePicker();
  });

  return item;
}

function filterPaletteList(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll('#palette-picker-list .pal-item');
  items.forEach(item => {
    const n = (item.querySelector('.pal-item-name')?.textContent || '').toLowerCase();
    item.style.display = (!q || n.includes(q)) ? '' : 'none';
  });
  // Hide section headers when all their items are hidden
  document.querySelectorAll('#palette-picker-list .pal-section-header').forEach(header => {
    let next = header.nextElementSibling;
    let allHidden = true;
    while (next && !next.classList.contains('pal-section-header')) {
      if (next.style.display !== 'none') { allHidden = false; break; }
      next = next.nextElementSibling;
    }
    header.style.display = allHidden ? 'none' : '';
  });
}

// ── GIF frame numbering ────────────────────────────────────────────────────

function updateGifFrameNumbers() {
  // Clear all badges first
  dom.photoGrid.querySelectorAll('.photo-slot').forEach(el => {
    el.removeAttribute('data-gif-frame');
  });
  // Re-assign from ordered frame list (last occurrence wins for duplicates)
  state.gifFrameOrder.forEach((frame, i) => {
    const slot = dom.photoGrid.querySelector(`[data-index="${frame.photoIndex}"]`);
    if (slot) slot.dataset.gifFrame = String(i + 1);
  });
}

// ── GIF live preview in detail panel ──────────────────────────────────────

function updateGifPreview() {
  if (state.gifPreviewTimer) {
    clearInterval(state.gifPreviewTimer);
    state.gifPreviewTimer = null;
  }

  const baseFrames = state.gifFrameOrder;

  if (!state.gifMode || baseFrames.length === 0) {
    if (dom.gifPreviewWrap) dom.gifPreviewWrap.classList.remove('visible');
    return;
  }

  // Apply bounce expansion
  let frames = baseFrames;
  if (state.gifLoop === 'bounce' && baseFrames.length > 2) {
    const mid = [...baseFrames].reverse().slice(1, baseFrames.length - 1);
    frames = [...baseFrames, ...mid];
  }

  if (dom.gifPreviewWrap) dom.gifPreviewWrap.classList.add('visible');

  const PREVIEW_SCALE = 4;
  let frameIdx = 0;
  const loopLabel = state.gifLoop === 'bounce' ? ' · ↔ bounce' : state.gifLoop === 'once' ? ' · once' : '';

  function showFrame() {
    const n = frameIdx % frames.length;
    const frameObj = frames[n];
    const photo = state.photos[frameObj.photoIndex];
    if (!photo || photo.isEmpty) { frameIdx++; return; }

    dom.gifPreviewCanvas.width  = GBCam.PHOTO_WIDTH  * PREVIEW_SCALE;
    dom.gifPreviewCanvas.height = GBCam.PHOTO_HEIGHT * PREVIEW_SCALE;
    const frameCtx = dom.gifPreviewCanvas.getContext('2d');
    const effGif = getEffectiveSettings(frameObj.photoIndex);
    const pal = frameObj.paletteId ? PALETTES[frameObj.paletteId] : effGif.palette;
    GBCam.renderToCanvas(frameCtx, photo.pixels, pal, PREVIEW_SCALE);
    if (effGif.exportFilter !== 'none') {
      applyExportFilter(frameCtx, dom.gifPreviewCanvas.width, dom.gifPreviewCanvas.height, PREVIEW_SCALE,
        effGif.exportFilter, effGif.filterIntensity, effGif.filterVariant, effGif.filterParams);
    }
    applyToneAdjustments(frameCtx, dom.gifPreviewCanvas.width, dom.gifPreviewCanvas.height, effGif);

    const palLabel = frameObj.paletteId ? ` · ${pal?.name}` : '';
    if (dom.gifPreviewInfo) {
      dom.gifPreviewInfo.textContent =
        `Frame ${n + 1}/${frames.length} · Photo ${frameObj.photoIndex + 1}${palLabel}${loopLabel}`;
    }
    frameIdx++;
  }

  showFrame(); // render first frame immediately
  if (frames.length > 1) {
    state.gifPreviewTimer = setInterval(showFrame, state.gifDelay);
  }
}

// ── Recent palettes (kept for project file backwards-compat) ──────────────

const RECENT_PALETTES_KEY = 'gbcam_recent_palettes';
const MAX_RECENT_PALETTES = 6;

function loadRecentPalettes() {
  try { return JSON.parse(localStorage.getItem(RECENT_PALETTES_KEY) || '[]'); }
  catch (_) { return []; }
}

function addRecentPalette(id) {
  let recents = loadRecentPalettes().filter(r => r !== id);
  recents.unshift(id);
  recents = recents.slice(0, MAX_RECENT_PALETTES);
  localStorage.setItem(RECENT_PALETTES_KEY, JSON.stringify(recents));
}

function renderRecentPalettes() { /* strip removed — see fav palettes */ }

// ── Favourite palettes ─────────────────────────────────────────────────────

const FAV_PALETTES_KEY = 'gbcam_fav_palettes';

function loadFavPalettes() {
  try { return JSON.parse(localStorage.getItem(FAV_PALETTES_KEY) || '[]'); }
  catch (_) { return []; }
}

function isFavPalette(id) { return loadFavPalettes().includes(id); }

function toggleFavPalette(id) {
  let favs = loadFavPalettes();
  if (favs.includes(id)) {
    favs = favs.filter(f => f !== id);
  } else {
    favs.push(id);
  }
  localStorage.setItem(FAV_PALETTES_KEY, JSON.stringify(favs));
  renderFavPalettes();
  // Sync star state in any open picker list
  document.querySelectorAll(`.pal-item-star[data-palette="${id}"]`).forEach(btn => {
    btn.classList.toggle('starred', isFavPalette(id));
    btn.title = isFavPalette(id) ? 'Remove from favourites' : 'Add to favourites';
  });
  // Sync star state in palette grid
  document.querySelectorAll(`.pgrid-star[data-palette="${id}"]`).forEach(btn => {
    btn.classList.toggle('starred', isFavPalette(id));
  });
}

function renderFavPalettes() {
  const container = document.getElementById('fav-palettes');
  if (!container) return;
  container.innerHTML = '';

  const favs = loadFavPalettes().filter(id => PALETTES[id]);
  for (const id of favs) {
    const pal = PALETTES[id];
    const btn = document.createElement('button');
    btn.className = 'fav-pal-btn' + (state.palette.id === id ? ' active' : '');
    btn.title = pal.name; // name shown as tooltip on hover

    const swatch = document.createElement('div');
    swatch.className = 'fav-pal-swatch';
    for (const color of pal.colors) {
      const span = document.createElement('span');
      span.style.background = color;
      swatch.appendChild(span);
    }

    btn.appendChild(swatch);

    btn.addEventListener('click', () => {
      setPalette(id);
      renderFavPalettes(); // refresh active state
    });

    container.appendChild(btn);
  }
}

// ── Browse button: inject colourful mini-grid icon + update text ────────────

function buildBrowseButtonIcon() {
  const btn = document.getElementById('btn-palette-grid');
  if (!btn) return;

  // 3 representative palettes × 4 colours = 3-row colour grid
  const ids = ['dmg', 'gbcam_gold', 'gbc_a_up'];
  const cw = 5, ch = 5, gap = 1;
  const cols = 4, rows = ids.length;
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * ch + (rows - 1) * gap;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('pgrid-icon');

  ids.forEach((id, row) => {
    const pal = PALETTES[id];
    if (!pal) return;
    pal.colors.slice(0, 4).forEach((color, col) => {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', col * (cw + gap));
      rect.setAttribute('y', row * (ch + gap));
      rect.setAttribute('width', cw);
      rect.setAttribute('height', ch);
      rect.setAttribute('fill', color);
      svg.appendChild(rect);
    });
  });

  btn.innerHTML = '';
  btn.appendChild(svg);
  const span = document.createElement('span');
  span.textContent = 'All Palettes';
  btn.appendChild(span);
}

// ── Current palette pin — shown at top of picker dropdown ──────────────────

function updateCurrentPalettePin() {
  const pin = document.getElementById('pal-current-pin');
  if (!pin) return;
  pin.innerHTML = '';

  const id = state.palette?.id;
  if (!id) return;
  const pal = state.palette;

  const label = document.createElement('div');
  label.className = 'pal-pin-label';
  label.textContent = 'Active palette';

  const item = document.createElement('div');
  item.className = 'pal-pin-item';

  const swatch = document.createElement('div');
  swatch.className = 'palette-swatch';
  pal.colors.forEach(c => {
    const s = document.createElement('span');
    s.style.background = c;
    swatch.appendChild(s);
  });

  const name = document.createElement('span');
  name.className = 'pal-pin-name';
  name.textContent = pal.name;

  const star = document.createElement('button');
  const isFaved = isFavPalette(id);
  star.className = 'pal-pin-star' + (isFaved ? ' starred' : '');
  star.textContent = '★';
  star.title = isFaved ? 'Remove from favourites' : 'Add to favourites';
  star.addEventListener('click', e => {
    e.stopPropagation();
    toggleFavPalette(id);
    const nowFaved = isFavPalette(id);
    star.classList.toggle('starred', nowFaved);
    star.title = nowFaved ? 'Remove from favourites' : 'Add to favourites';
  });

  item.appendChild(swatch);
  item.appendChild(name);
  item.appendChild(star);
  item.addEventListener('click', () => {
    setPalette(id);
    closePalettePicker();
  });

  pin.appendChild(label);
  pin.appendChild(item);
}

// ── Palette visual grid ────────────────────────────────────────────────────

function openPaletteGrid() {
  const modal = document.getElementById('palette-grid-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Wire up search field (fresh assignment avoids double-listeners)
  const searchEl = document.getElementById('palette-grid-search');
  if (searchEl) {
    searchEl.value = '';
    searchEl.oninput = () => filterPaletteGrid(searchEl.value);
    // Do NOT auto-focus — it traps pointer events away from slider + close button
  }

  // Wire up tile size slider, restoring last saved size
  const sizeSlider = document.getElementById('palette-grid-size');
  if (sizeSlider) {
    const savedSize = localStorage.getItem('gbcam_pgrid_size');
    if (savedSize) sizeSlider.value = savedSize;
    updatePaletteGridSize(parseInt(sizeSlider.value));
    sizeSlider.oninput = () => {
      updatePaletteGridSize(parseInt(sizeSlider.value));
      localStorage.setItem('gbcam_pgrid_size', sizeSlider.value);
    };
  }

  buildPaletteGrid();
}

function updatePaletteGridSize(px) {
  const list = document.getElementById('palette-grid-list');
  if (list) list.style.gridTemplateColumns = `repeat(auto-fill, minmax(${px}px, 1fr))`;
}

function closePaletteGrid() {
  const modal = document.getElementById('palette-grid-modal');
  if (modal) modal.classList.add('hidden');
  renderRecentPalettes(); // update strip after grid closes
}

async function buildPaletteGrid() {
  const list = document.getElementById('palette-grid-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-3);font-size:12px;padding:8px;">Rendering…</p>';

  // Use selected photo, or first non-empty one
  const photoIdx = state.selectedIndex !== null ? state.selectedIndex
    : state.photos.findIndex(p => !p.isEmpty);
  const photo = (photoIdx >= 0 && !state.photos[photoIdx]?.isEmpty) ? state.photos[photoIdx] : null;

  await new Promise(r => requestAnimationFrame(r));
  list.innerHTML = '';

  const renderQueue = [];
  for (const [id, pal] of Object.entries(PALETTES)) {
    const cell = document.createElement('div');
    cell.className = 'pgrid-cell' + (state.palette.id === id ? ' active' : '');
    cell.dataset.paletteId = id;

    const canvas = document.createElement('canvas');
    canvas.width  = GBCam.PHOTO_WIDTH;
    canvas.height = GBCam.PHOTO_HEIGHT;

    const namEl = document.createElement('div');
    namEl.className = 'pgrid-name';
    namEl.textContent = pal.name;

    // Chunky 4-colour swatch strip
    const swatchRow = document.createElement('div');
    swatchRow.className = 'pgrid-swatches';
    for (const color of pal.colors) {
      const block = document.createElement('span');
      block.style.background = color;
      swatchRow.appendChild(block);
    }

    // Star / favourite button
    const gridStar = document.createElement('button');
    gridStar.className = 'pgrid-star' + (isFavPalette(id) ? ' starred' : '');
    gridStar.dataset.palette = id;
    gridStar.textContent = '★';
    gridStar.title = isFavPalette(id) ? 'Remove from favourites' : 'Add to favourites';
    gridStar.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavPalette(id);
      gridStar.classList.toggle('starred', isFavPalette(id));
    });

    cell.appendChild(canvas);
    cell.appendChild(namEl);
    cell.appendChild(swatchRow);
    cell.appendChild(gridStar);
    list.appendChild(cell);

    cell.addEventListener('click', () => {
      setPalette(id);
      closePaletteGrid();
    });

    renderQueue.push({ canvas, pal, photo });
  }

  // Scroll active palette into view
  const activeCell = list.querySelector('.pgrid-cell.active');
  if (activeCell) activeCell.scrollIntoView({ block: 'center', behavior: 'instant' });

  // Render canvases in RAF batches to keep the UI responsive
  const BATCH = 30;
  for (let i = 0; i < renderQueue.length; i += BATCH) {
    await new Promise(r => requestAnimationFrame(r));
    const batch = renderQueue.slice(i, i + BATCH);
    for (const { canvas, pal, photo: ph } of batch) {
      const ctx = canvas.getContext('2d');
      if (ph) {
        GBCam.renderToCanvas(ctx, ph.pixels, pal, 1);
      } else {
        ctx.fillStyle = pal.colors[0] || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }
}

function filterPaletteGrid(query) {
  const q = query.toLowerCase().trim();
  const list = document.getElementById('palette-grid-list');
  if (!list) return;
  list.querySelectorAll('.pgrid-cell').forEach(cell => {
    const name = (cell.querySelector('.pgrid-name')?.textContent || '').toLowerCase();
    cell.style.display = (!q || name.includes(q)) ? '' : 'none';
  });
}

// ── Export filters / effects ───────────────────────────────────────────────

function setExportFilter(filter) {
  setScopedSetting('exportFilter', filter);
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  // Show/hide the settings sub-panel
  const settingsEl = document.getElementById('filter-settings');
  const variantEl  = document.getElementById('crt-variant-wrap');
  if (settingsEl) settingsEl.style.display = (filter !== 'none') ? '' : 'none';
  if (variantEl)  variantEl.style.display  = (filter === 'crt') ? '' : 'none';
  // Build per-filter granular controls
  buildFilterParams(filter);
  // Repaint grid thumbnails + live views
  repaintGrid();
}

/** Injects per-filter granular controls into #filter-params.
 *  displayParams: optional read-only values to populate the UI with (used when
 *  syncing controls to effective settings without creating a photoSettings entry).
 *  Omit to use the normal writable path (getWritableFilterParams). */
function buildFilterParams(filter, displayParams) {
  const container = document.getElementById('filter-params');
  if (!container) return;
  container.innerHTML = '';
  if (!filter || filter === 'none') return;

  // displayParams = values to show; writable ref is obtained lazily on interaction.
  const initP = displayParams || getWritableFilterParams(filter);

  function repaint() { repaintGrid(); }

  function addSlider(label, key, min, max, step, valFmt) {
    const wrap = document.createElement('div');
    wrap.className = 'range-wrap fp-row';
    const hdr = document.createElement('div');
    hdr.className = 'range-header';
    const lbl = document.createElement('span'); lbl.className = 'ctrl-label'; lbl.textContent = label;
    const val = document.createElement('span'); val.className = 'range-val'; val.textContent = valFmt(initP[key]);
    hdr.appendChild(lbl); hdr.appendChild(val);
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = initP[key];
    slider.addEventListener('input', () => {
      const p = getWritableFilterParams(filter); // create entry only on actual user interaction
      p[key] = parseFloat(slider.value);
      val.textContent = valFmt(p[key]);
      repaint();
    });
    wrap.appendChild(hdr); wrap.appendChild(slider);
    container.appendChild(wrap);
  }

  function addSeg(label, key, options) {
    const wrap = document.createElement('div'); wrap.className = 'fp-row';
    const lbl = document.createElement('div'); lbl.className = 'ctrl-label'; lbl.style.marginBottom = '4px'; lbl.textContent = label;
    const seg = document.createElement('div'); seg.className = 'seg-control';
    for (const [optVal, optLabel] of options) {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (initP[key] === optVal ? ' active' : '');
      btn.textContent = optLabel;
      btn.addEventListener('click', () => {
        const p = getWritableFilterParams(filter); // create entry only on actual user interaction
        p[key] = optVal;
        seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.textContent === optLabel));
        repaint();
      });
      seg.appendChild(btn);
    }
    wrap.appendChild(lbl); wrap.appendChild(seg);
    container.appendChild(wrap);
  }

  if (filter === 'crt') {
    addSeg('Phosphor tint', 'phosphor', [['none','None'],['green','Green'],['amber','Amber']]);
  } else if (filter === 'lcd') {
    addSlider('Sub-pixel tint', 'subpixel', 0, 20, 1, v => `${v}%`);
  } else if (filter === 'dot') {
    addSlider('Dot size', 'radius', 20, 80, 2, v => `${v}%`);
  } else if (filter === 'glow') {
    addSlider('Bloom radius', 'blur', 50, 300, 10, v => `${v}%`);
  } else if (filter === 'chroma') {
    addSlider('Channel shift', 'shift', 25, 150, 5, v => `${v}%`);
  } else if (filter === 'grid') {
    addSlider('Grid opacity', 'opacity', 10, 60, 5, v => `${v}%`);
  } else if (filter === 'vignette') {
    addSeg('Falloff', 'falloff', [['soft','Soft'],['medium','Medium'],['hard','Hard']]);
  } else if (filter === 'halftone') {
    addSlider('Dot size', 'radius', 20, 60, 2, v => `${v}%`);
  } else if (filter === 'border') {
    addSeg('Thickness', 'thickness', [['thin','Thin'],['medium','Medium'],['thick','Thick']]);
  }
}

/**
 * Applies a visual effect overlay onto an already-rendered export canvas.
 * All effects are rendered to an offscreen canvas first, then composited at
 * `intensity` opacity so the user's intensity slider works for every filter.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width     — canvas width in px
 * @param {number} height    — canvas height in px
 * @param {number} scale     — pixels-per-GB-pixel
 * @param {string} filter    — 'none'|'crt'|'lcd'|'grid'|'vignette'|'halftone'|'border'
 * @param {number} intensity — 0.0–1.0 (default 1.0)
 * @param {string} variant   — crt only: 'fine'|'medium'|'thick'|'wide' (default 'medium')
 */
// ── Tone adjustments (brightness / contrast / split toning) ─────────────────

function applyToneAdjustments(ctx, width, height, settings) {
  const s = settings || state;
  const { brightness, contrast, toneIntensity, shadowColor, highlightColor, toneBalance } = s;
  if (brightness === 0 && contrast === 0 && toneIntensity === 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  // Pre-compute contrast factor (S-curve through 128)
  const contrastFactor = contrast !== 0
    ? (259 * (contrast + 255)) / (255 * (259 - contrast))
    : 1;

  // Parse split toning colors
  const sr = parseInt(shadowColor.slice(1, 3), 16);
  const sg = parseInt(shadowColor.slice(3, 5), 16);
  const sb = parseInt(shadowColor.slice(5, 7), 16);
  const hr = parseInt(highlightColor.slice(1, 3), 16);
  const hg = parseInt(highlightColor.slice(3, 5), 16);
  const hb = parseInt(highlightColor.slice(5, 7), 16);
  const toneStr   = toneIntensity / 100;
  const mid       = (toneBalance + 100) / 200; // 0..1, default 0.5

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];

    // Brightness
    if (brightness !== 0) {
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
    }

    // Contrast
    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, Math.round(contrastFactor * (r - 128) + 128)));
      g = Math.min(255, Math.max(0, Math.round(contrastFactor * (g - 128) + 128)));
      b = Math.min(255, Math.max(0, Math.round(contrastFactor * (b - 128) + 128)));
    }

    // Split toning — blend toward shadow/highlight tint based on luminance
    if (toneIntensity > 0) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sw  = mid > 0    ? Math.max(0, 1 - lum / mid)          : 0;
      const hw  = mid < 1    ? Math.max(0, (lum - mid) / (1 - mid)): 0;
      r = Math.min(255, Math.max(0, Math.round(r + toneStr * (sw * (sr - r) + hw * (hr - r)))));
      g = Math.min(255, Math.max(0, Math.round(g + toneStr * (sw * (sg - g) + hw * (hg - g)))));
      b = Math.min(255, Math.max(0, Math.round(b + toneStr * (sw * (sb - b) + hw * (hb - b)))));
    }

    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyExportFilter(ctx, width, height, scale, filter,
                           intensity = 1.0, variant = 'medium', filterParams) {
  filterParams = filterParams || state.filterParams;
  if (!filter || filter === 'none') return;
  if (intensity <= 0) return;

  const s = Math.max(1, Math.round(scale));

  // Render the effect onto an offscreen canvas, then draw at the target intensity
  const eff = Object.assign(document.createElement('canvas'), { width, height });
  const ec  = eff.getContext('2d');

  if (filter === 'crt') {
    // Scanline density/thickness controlled by variant
    // fine: 1 thin line per row, low alpha
    // medium: 1 line + soft edge (default)
    // thick: 2 px lines per row
    // wide: every other row blacked out (CRT phosphor strip look)
    const configs = {
      fine:   { lineH: 1, lineA: 0.38, softA: 0,    tintA: 0.03 },
      medium: { lineH: 1, lineA: 0.55, softA: 0.20, tintA: 0.04 },
      thick:  { lineH: 2, lineA: 0.65, softA: 0.25, tintA: 0.05 },
      wide:   { lineH: Math.max(1, Math.round(s * 0.45)), lineA: 0.72, softA: 0, tintA: 0.06 },
    };
    const cfg = configs[variant] || configs.medium;

    for (let y = s - 1; y < height; y += s) {
      ec.fillStyle = `rgba(0,0,0,${cfg.lineA})`;
      ec.fillRect(0, y, width, cfg.lineH);
      if (cfg.softA > 0 && s >= 3) {
        ec.fillStyle = `rgba(0,0,0,${cfg.softA})`;
        ec.fillRect(0, y - 1, width, 1);
      }
    }
    // Phosphor tint per filterParams.crt.phosphor
    if (s >= 4 && cfg.tintA > 0) {
      const ph = (filterParams.crt || {}).phosphor ?? 'green';
      const tintColor = ph === 'amber' ? `rgba(255,180,0,${cfg.tintA})` : ph === 'green' ? `rgba(0,255,60,${cfg.tintA})` : null;
      if (tintColor) {
        for (let y = 0; y < height; y += s * 2) {
          ec.fillStyle = tintColor;
          ec.fillRect(0, y, width, s);
        }
      }
    }

  } else if (filter === 'lcd') {
    const spStr = ((filterParams.lcd || {}).subpixel ?? 10) / 100;
    // Row gaps
    for (let y = s - 1; y < height; y += s) {
      ec.fillStyle = 'rgba(0,0,0,0.38)';
      ec.fillRect(0, y, width, 1);
    }
    // Column separators
    for (let x = s; x < width; x += s) {
      ec.fillStyle = 'rgba(0,0,0,0.22)';
      ec.fillRect(x - 1, 0, 1, height);
    }
    // RGB sub-pixel tint columns (strength from slider)
    if (s >= 4 && spStr > 0) {
      const cw = Math.max(1, Math.round(s / 3));
      for (let x = 0; x < width; x += s) {
        ec.fillStyle = `rgba(255,80,80,${spStr})`;
        ec.fillRect(x, 0, cw, height);
        ec.fillStyle = `rgba(80,255,80,${spStr})`;
        ec.fillRect(x + cw, 0, cw, height);
        ec.fillStyle = `rgba(80,80,255,${spStr})`;
        ec.fillRect(x + cw * 2, 0, cw, height);
      }
    }

  } else if (filter === 'grid') {
    const gridOpacity = ((filterParams.grid || {}).opacity ?? 30) / 100;
    if (s >= 3) {
      ec.strokeStyle = `rgba(0,0,0,${gridOpacity})`;
      ec.lineWidth = 1;
      for (let x = s; x < width; x += s) {
        ec.beginPath(); ec.moveTo(x - 0.5, 0); ec.lineTo(x - 0.5, height); ec.stroke();
      }
      for (let y = s; y < height; y += s) {
        ec.beginPath(); ec.moveTo(0, y - 0.5); ec.lineTo(width, y - 0.5); ec.stroke();
      }
    }

  } else if (filter === 'vignette') {
    const falloff = (filterParams.vignette || {}).falloff ?? 'medium';
    const cx = width / 2, cy = height / 2;
    const innerMult = { soft: 0.40, medium: 0.28, hard: 0.10 }[falloff] ?? 0.28;
    const outerMult = { soft: 0.95, medium: 0.82, hard: 0.65 }[falloff] ?? 0.82;
    const darkMax   = { soft: 0.55, medium: 0.72, hard: 0.88 }[falloff] ?? 0.72;
    const inner = Math.min(width, height) * innerMult;
    const outer = Math.max(width, height) * outerMult;
    const grad = ec.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(0.6, `rgba(0,0,0,${(darkMax * 0.2).toFixed(2)})`);
    grad.addColorStop(1,   `rgba(0,0,0,${darkMax})`);
    ec.fillStyle = grad;
    ec.fillRect(0, 0, width, height);

  } else if (filter === 'halftone') {
    const htRad = ((filterParams.halftone || {}).radius ?? 38) / 100;
    const r = Math.max(1, Math.round(s * htRad));
    ec.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = Math.round(s * 0.5); y < height; y += s) {
      for (let x = Math.round(s * 0.5); x < width; x += s) {
        ec.beginPath();
        ec.arc(x, y, r, 0, Math.PI * 2);
        ec.fill();
      }
    }

  } else if (filter === 'border') {
    const thk = (filterParams.border || {}).thickness ?? 'medium';
    const thkMult = { thin: 0.040, medium: 0.058, thick: 0.085 }[thk] ?? 0.058;
    const bw   = Math.max(8, Math.round(Math.min(width, height) * thkMult));
    const bwTB = Math.round(bw * 1.35);

    ec.fillStyle = '#1c1c1e';
    ec.fillRect(0, 0, width, bwTB);
    ec.fillRect(0, height - bwTB, width, bwTB);
    ec.fillRect(0, bwTB, bw, height - bwTB * 2);
    ec.fillRect(width - bw, bwTB, bw, height - bwTB * 2);

    ec.strokeStyle = 'rgba(255,255,255,0.20)';
    ec.lineWidth = 1.5;
    ec.beginPath();
    ec.moveTo(bw + 0.75, height - bwTB); ec.lineTo(bw + 0.75, bwTB);
    ec.lineTo(width - bw, bwTB + 0.75);
    ec.stroke();

    ec.strokeStyle = 'rgba(0,0,0,0.60)';
    ec.beginPath();
    ec.moveTo(width - bw - 0.75, bwTB); ec.lineTo(width - bw - 0.75, height - bwTB);
    ec.lineTo(bw, height - bwTB - 0.75);
    ec.stroke();

    const gloss = ec.createLinearGradient(0, 0, 0, bwTB);
    gloss.addColorStop(0,   'rgba(255,255,255,0.14)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    gloss.addColorStop(1,   'rgba(255,255,255,0)');
    ec.fillStyle = gloss;
    ec.fillRect(0, 0, width, bwTB);

    const gr   = Math.max(3, Math.round(bw * 0.5));
    const glow = ec.createRadialGradient(bw + gr, bwTB * 0.4, 0, bw + gr, bwTB * 0.4, gr * 3);
    glow.addColorStop(0, 'rgba(255,255,255,0.40)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ec.fillStyle = glow;
    ec.fillRect(bw, 0, gr * 6, bwTB);

    ec.strokeStyle = 'rgba(0,0,0,0.85)';
    ec.lineWidth = 1;
    ec.strokeRect(0.5, 0.5, width - 1, height - 1);

  } else if (filter === 'dot') {
    // ── Dot Matrix ─────────────────────────────────────────────────────────
    // Dark overlay with circular cut-outs per GB pixel — makes each pixel
    // appear as a rounded dot with visible gaps between them (like a DMD).
    ec.fillStyle = 'rgba(0,0,0,0.88)';
    ec.fillRect(0, 0, width, height);
    // Punch circular holes so the underlying pixel colours show through
    ec.globalCompositeOperation = 'destination-out';
    const dotRadPct = ((filterParams.dot || {}).radius ?? 44) / 100;
    const dotR = Math.max(1, Math.round(s * dotRadPct));
    for (let py = 0; py < GBCam.PHOTO_HEIGHT; py++) {
      for (let px = 0; px < GBCam.PHOTO_WIDTH; px++) {
        const cx = Math.round(px * s + s * 0.5);
        const cy = Math.round(py * s + s * 0.5);
        ec.beginPath();
        ec.arc(cx, cy, dotR, 0, Math.PI * 2);
        ec.fill();
      }
    }
    ec.globalCompositeOperation = 'source-over';

  } else if (filter === 'glow') {
    // ── Phosphor Glow ──────────────────────────────────────────────────────
    // Classic phosphor bloom: composite a blurred copy of the source onto
    // the canvas with 'screen' blend mode. Bright pixels bloom outward.
    const glowBlurPct = ((filterParams.glow || {}).blur ?? 110) / 100;
    const blurPx  = Math.max(2, Math.round(s * glowBlurPct));
    const bloom   = Object.assign(document.createElement('canvas'), { width, height });
    const bc      = bloom.getContext('2d');
    bc.filter     = `blur(${blurPx}px)`;
    bc.drawImage(ctx.canvas, 0, 0);
    bc.filter = 'none';

    ctx.save();
    ctx.globalAlpha               = Math.min(1, Math.max(0, intensity));
    ctx.globalCompositeOperation  = 'screen';
    ctx.drawImage(bloom, 0, 0);
    ctx.restore();
    return; // composited directly; skip the generic end-of-function drawImage

  } else if (filter === 'chroma') {
    // ── Chromatic Aberration ───────────────────────────────────────────────
    // Shift the R channel rightward and the B channel leftward by ~1 GB
    // pixel width, keeping G in place.  Produces that colour-fringing look.
    const chromaShiftPct = ((filterParams.chroma || {}).shift ?? 75) / 100;
    const shift = Math.max(1, Math.round(s * chromaShiftPct));
    const orig  = ctx.getImageData(0, 0, width, height);
    const dst   = new ImageData(width, height);
    const d = orig.data, o = dst.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i  = (y * width + x) * 4;
        // R from the right
        const rx = Math.min(width - 1, x + shift);
        const ri = (y * width + rx) * 4;
        // B from the left
        const bx = Math.max(0, x - shift);
        const bi = (y * width + bx) * 4;

        o[i]     = d[ri];       // shifted R
        o[i + 1] = d[i + 1];   // original G
        o[i + 2] = d[bi + 2];  // shifted B
        o[i + 3] = 255;
      }
    }

    // Blend the aberrated image with the original at requested intensity
    const t = Math.min(1, Math.max(0, intensity));
    if (t < 1) {
      for (let i = 0; i < o.length; i += 4) {
        o[i]     = Math.round(d[i]     * (1 - t) + o[i]     * t);
        o[i + 1] = Math.round(d[i + 1] * (1 - t) + o[i + 1] * t);
        o[i + 2] = Math.round(d[i + 2] * (1 - t) + o[i + 2] * t);
      }
    }

    ctx.putImageData(dst, 0, 0);
    return; // composited directly; skip the generic end-of-function drawImage
  }

  // Composite the effect onto the main canvas at the requested intensity
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity));
  ctx.drawImage(eff, 0, 0);
  ctx.restore();
}

// ── Export: raw .sav file ──────────────────────────────────────────────────

async function exportSav() {
  if (!state.sav) return;
  const defaultName = state.filename || 'GBCAMERA.sav';
  const result = await window.api.exportSav(state.sav.buffer, defaultName);
  if (result) showToast(`Saved: ${result}`);
}

// ── Project file (.gbcp) ────────────────────────────────────────────────────

function buildProjectJson() {
  // Encode the raw sav as base64
  const bytes = new Uint8Array(state.sav.buffer);
  let binary = '';
  // Chunk to avoid call stack limits on large arrays
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const sav64 = btoa(binary);

  return JSON.stringify({
    version: 1,
    app: 'DMG DarkRoom',
    filename: state.filename || 'GBCAMERA.sav',
    sav: sav64,
    settings: {
      paletteId:      state.palette.id,
      exportScale:    state.exportScale,
      exportFilter:    state.exportFilter,
      filterIntensity: state.filterIntensity,
      filterVariant:   state.filterVariant,
      filterParams:    state.filterParams,
      brightness:      state.brightness,
      contrast:        state.contrast,
      toneIntensity:   state.toneIntensity,
      shadowColor:     state.shadowColor,
      highlightColor:  state.highlightColor,
      toneBalance:     state.toneBalance,
      gifDelay:        state.gifDelay,
      gifLoop:         state.gifLoop,
      photoSettings:   state.photoSettings,
      photoTransforms: state.photoTransforms,
      customPalettes:  loadCustomPalettes(),
      recentPalettes:  loadRecentPalettes(),
      favPalettes:     loadFavPalettes(),
    },
  }, null, 2);
}

async function saveProject() {
  if (!state.sav) return;
  const baseName    = (state.filename || 'gbcamera').replace(/\.sav$/i, '');
  const defaultName = `${baseName}.gbcp`;
  const result = await window.api.saveProject(buildProjectJson(), defaultName);
  if (result) showToast(`Project saved: ${result}`);
}

async function openProject() {
  const result = await window.api.openProject();
  if (!result) return;
  if (result.error) { showToast(`Error: ${result.error}`); return; }

  let project;
  try { project = JSON.parse(result.json); }
  catch (_) { showToast('Invalid project file'); return; }

  if (project.version !== 1 || !project.sav) {
    showToast('Unrecognised project format');
    return;
  }

  // Decode base64 sav → ArrayBuffer
  const binary = atob(project.sav);
  const buffer = new ArrayBuffer(binary.length);
  const u8     = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);

  // Load the photos (same pipeline as a normal .sav open)
  await loadSavFile({ buffer, name: project.filename || result.name, path: null });

  // Restore settings
  const s = project.settings || {};
  if (s.paletteId && PALETTES[s.paletteId]) setPalette(s.paletteId);
  if (s.exportScale !== undefined)           setExportScale(s.exportScale);
  if (s.exportFilter) setExportFilter(s.exportFilter);
  if (s.filterIntensity !== undefined) {
    state.filterIntensity = s.filterIntensity;
    const sl = document.getElementById('filter-intensity');
    const vl = document.getElementById('filter-intensity-val');
    if (sl) sl.value = Math.round(s.filterIntensity * 100);
    if (vl) vl.textContent = `${Math.round(s.filterIntensity * 100)}%`;
  }
  if (s.filterVariant) {
    state.filterVariant = s.filterVariant;
    document.querySelectorAll('.crt-variant-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.variant === s.filterVariant));
  }
  if (s.gifDelay) {
    state.gifDelay = s.gifDelay;
    if (dom.gifDelay)    dom.gifDelay.value = s.gifDelay;
    if (dom.gifDelayVal) dom.gifDelayVal.textContent = `${s.gifDelay}ms`;
  }
  if (s.gifLoop) setGifLoop(s.gifLoop);
  if (s.photoSettings && typeof s.photoSettings === 'object') {
    // Restore with integer-keyed entries (JSON keys are strings, convert back)
    state.photoSettings = {};
    for (const [k, v] of Object.entries(s.photoSettings)) {
      state.photoSettings[parseInt(k)] = v;
    }
  }

  // Merge incoming custom palettes without overwriting existing ones
  if (Array.isArray(s.customPalettes) && s.customPalettes.length > 0) {
    const existing    = loadCustomPalettes();
    const existingIds = new Set(existing.map(p => p.id));
    const incoming    = s.customPalettes.filter(p => !existingIds.has(p.id));
    if (incoming.length > 0) {
      saveCustomPalettesToStorage([...existing, ...incoming]);
      refreshCustomPalettes();
      rebuildPalettePickerList();
    }
  }

  // Restore recent palettes strip
  if (Array.isArray(s.recentPalettes)) {
    localStorage.setItem(RECENT_PALETTES_KEY, JSON.stringify(s.recentPalettes));
  }
  if (Array.isArray(s.favPalettes)) {
    localStorage.setItem(FAV_PALETTES_KEY, JSON.stringify(s.favPalettes));
    renderFavPalettes();
  }

  showToast(`Project loaded: ${result.name}`);
}

// ── Hide empty slots ─────────────────────────────────────────────────────────

function toggleHideEmpty() {
  state.hideEmpty = !state.hideEmpty;
  dom.photoGrid.classList.toggle('hide-empty', state.hideEmpty);
  const btn = document.getElementById('btn-hide-empty');
  if (btn) {
    btn.classList.toggle('active', state.hideEmpty);
    btn.textContent = state.hideEmpty ? 'Show empty' : 'Hide empty';
  }
}

// ── Reload last .sav ─────────────────────────────────────────────────────────

const LAST_SAV_PATH_KEY = 'gbcam_last_sav_path';

function saveLastSavPath(filePath) {
  if (filePath) localStorage.setItem(LAST_SAV_PATH_KEY, filePath);
}

async function reloadSav() {
  const p = state.filePath || localStorage.getItem(LAST_SAV_PATH_KEY);
  if (!p) { showToast('No file to reload'); return; }
  const result = window.api?.readFile
    ? await window.api.readFile(p)
    : null;
  if (result) await loadSavFile(result);
}

// ── Drag and drop .sav ────────────────────────────────────────────────────────

function setupDragDropSav() {
  const appEl = dom.app || document.getElementById('app');
  if (!appEl) return;

  appEl.addEventListener('dragover', e => {
    const hasSav = Array.from(e.dataTransfer.items || [])
      .some(item => item.kind === 'file');
    if (!hasSav) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dom.dropOverlay?.classList.remove('hidden');
  });

  appEl.addEventListener('dragleave', e => {
    if (!appEl.contains(e.relatedTarget)) {
      dom.dropOverlay?.classList.add('hidden');
    }
  });

  appEl.addEventListener('drop', async e => {
    e.preventDefault();
    dom.dropOverlay?.classList.add('hidden');
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (window.api?.readFile && file.path) {
      // Electron: use native path
      const result = await window.api.readFile(file.path);
      await loadSavFile(result);
    } else {
      // Web: read via FileReader
      const buf = await file.arrayBuffer();
      await loadSavFile({ buffer: buf, name: file.name, path: null });
    }
  });
}

// ── Fullscreen presentation mode ──────────────────────────────────────────────

let _presIndex = null;

function openPresentation(index) {
  const filled = state.photos.map((p, i) => ({ p, i })).filter(x => !x.p.isEmpty);
  if (filled.length === 0) return;

  _presIndex = filled.find(x => x.i === index)?.i ?? filled[0].i;
  state.presentationMode = true;
  dom.presentationOverlay?.classList.remove('hidden');
  renderPresentation();
}

function closePresentation() {
  state.presentationMode = false;
  dom.presentationOverlay?.classList.add('hidden');
  _presIndex = null;
}

function presentationStep(dir) {
  const filled = state.photos.map((p, i) => i).filter(i => !state.photos[i].isEmpty);
  if (filled.length === 0) return;
  const cur = filled.indexOf(_presIndex);
  const next = (cur + dir + filled.length) % filled.length;
  _presIndex = filled[next];
  renderPresentation();
}

function renderPresentation() {
  if (_presIndex === null || !dom.presCanvas) return;
  const photo = state.photos[_presIndex];
  if (!photo || photo.isEmpty) return;

  // Fit photo to the viewport (with generous padding)
  const vw = window.innerWidth  - 160;
  const vh = window.innerHeight - 120;
  const t  = getTransform(_presIndex);
  const rotated = (t.rotate === 90 || t.rotate === 270);
  const srcW = rotated ? GBCam.PHOTO_HEIGHT : GBCam.PHOTO_WIDTH;
  const srcH = rotated ? GBCam.PHOTO_WIDTH  : GBCam.PHOTO_HEIGHT;
  const scale = Math.max(1, Math.floor(Math.min(vw / srcW, vh / srcH)));

  const ctx = dom.presCanvas.getContext('2d');
  renderPhotoWithTransform(ctx, photo, state.palette, scale, _presIndex);
  if (state.exportFilter !== 'none') {
    applyExportFilter(ctx, dom.presCanvas.width, dom.presCanvas.height, scale,
      state.exportFilter, state.filterIntensity, state.filterVariant);
  }
  applyToneAdjustments(ctx, dom.presCanvas.width, dom.presCanvas.height);

  const filled = state.photos.filter(p => !p.isEmpty).length;
  const pos    = state.photos.slice(0, _presIndex + 1).filter(p => !p.isEmpty).length;
  if (dom.presLabel) dom.presLabel.textContent = `Photo ${_presIndex + 1}  ·  ${pos} / ${filled}`;
}

// ── Contact sheet export ──────────────────────────────────────────────────────

async function exportContactSheet() {
  const filled = state.photos.filter(p => !p.isEmpty);
  if (filled.length === 0) { showToast('No photos to export'); return; }

  const cols  = Math.min(filled.length, 5);
  const rows  = Math.ceil(filled.length / cols);
  const CELL  = GBCam.PHOTO_WIDTH * 4;   // 4× scale per cell = 512px wide
  const CELLH = GBCam.PHOTO_HEIGHT * 4;
  const GAP   = 8;
  const PAD   = 16;
  const LABEL = 18; // px for photo number below each cell

  const sheetW = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const sheetH = PAD * 2 + rows * (CELLH + LABEL + GAP) - GAP;

  const sheet  = document.createElement('canvas');
  sheet.width  = sheetW;
  sheet.height = sheetH;
  const sc     = sheet.getContext('2d');

  // Background
  sc.fillStyle = '#111113';
  sc.fillRect(0, 0, sheetW, sheetH);

  for (let i = 0; i < filled.length; i++) {
    const photo = filled[i];
    const col   = i % cols;
    const row   = Math.floor(i / cols);
    const x     = PAD + col * (CELL + GAP);
    const y     = PAD + row * (CELLH + LABEL + GAP);

    // Render photo with transform + filter
    const tmp  = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    renderPhotoWithTransform(tctx, photo, state.palette, 4, photo.index);
    if (state.exportFilter !== 'none') {
      applyExportFilter(tctx, tmp.width, tmp.height, 4,
        state.exportFilter, state.filterIntensity, state.filterVariant);
    }
    applyToneAdjustments(tctx, tmp.width, tmp.height);
    sc.drawImage(tmp, x, y);

    // Photo number label
    sc.fillStyle = 'rgba(255,255,255,0.45)';
    sc.font      = '11px ui-monospace, monospace';
    sc.textAlign = 'center';
    sc.fillText(`${photo.index + 1}`, x + CELL / 2, y + CELLH + 13);
  }

  const dataUrl = sheet.toDataURL('image/png');
  const name    = `gbcam_contact_${state.palette.id}.png`;

  if (window.api?.savePng) {
    const saved = await window.api.savePng(dataUrl, name);
    if (saved) showToast(`Contact sheet saved`);
  } else {
    const a = Object.assign(document.createElement('a'), { href: dataUrl, download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('Contact sheet downloaded');
  }
}

// ── Frame duplication ─────────────────────────────────────────────────────────

function duplicateGifFrame(orderIdx) {
  const frame = state.gifFrameOrder[orderIdx];
  if (!frame) return;
  // Insert a copy immediately after
  state.gifFrameOrder.splice(orderIdx + 1, 0, { ...frame });
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}

// Repaint all views after a transform action
function _repaintAfterTransform(index) {
  repaintGridSlot(index);
  if (state.viewMode === 'solo') renderSoloView(index);
  if (state.lightboxOpen) renderLightbox(index);
}

// ── Keyboard navigation ────────────────────────────────────────────────────────

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    // Ignore when typing in an input
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Escape — close things (outermost layer first)
    if (e.key === 'Escape') {
      if (state.presentationMode)  { closePresentation(); return; }
      if (state.lightboxOpen)      { closeLightbox(); return; }
      if (document.querySelector('#palette-grid-modal:not(.hidden)')) {
        document.getElementById('palette-grid-close')?.click(); return;
      }
      if (state.gifMode) { exitGifMode(); return; }
      if (state.viewMode === 'solo') { enterGridMode(); return; }
      return;
    }

    // Fullscreen (F)
    if (e.key === 'f' || e.key === 'F') {
      if (state.presentationMode) { closePresentation(); return; }
      if (state.selectedIndex !== null) { openPresentation(state.selectedIndex); return; }
    }

    // Presentation navigation
    if (state.presentationMode) {
      if (e.key === 'ArrowLeft')  { presentationStep(-1); return; }
      if (e.key === 'ArrowRight') { presentationStep( 1); return; }
      return;
    }

    // Lightbox arrow navigation
    if (state.lightboxOpen) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); lightboxStep(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); lightboxStep( 1); return; }
    }

    // Solo view arrow navigation
    if (state.viewMode === 'solo' && !state.lightboxOpen) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); soloStep(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); soloStep( 1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); soloStep(-1); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); soloStep( 1); return; }
    }

    // Photo navigation (only when a file is loaded)
    if (state.photos.length === 0) return;

    if (!state.lightboxOpen && state.viewMode === 'grid' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const filled = state.photos.map((p, i) => i).filter(i => !state.photos[i].isEmpty);
      if (filled.length === 0) return;
      const cur = state.selectedIndex ?? -1;
      const idx = filled.indexOf(cur);
      let next;
      if (e.key === 'ArrowLeft') {
        next = idx <= 0 ? filled[filled.length - 1] : filled[idx - 1];
      } else {
        next = idx === filled.length - 1 ? filled[0] : filled[idx + 1];
      }
      selectPhoto(next);
      dom.photoGrid.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    if (!state.lightboxOpen && state.viewMode === 'grid' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const all  = state.photos.map((p, i) => i).filter(i => !state.photos[i].isEmpty);
      if (all.length === 0) return;
      const cur  = state.selectedIndex ?? all[0];
      const curPos = all.indexOf(cur);
      const cols = Math.max(1, Math.round(dom.photoGrid.offsetWidth /
        (dom.photoGrid.querySelector('.photo-slot')?.offsetWidth || 140)));
      const step = e.key === 'ArrowUp' ? -cols : cols;
      const next = all[Math.max(0, Math.min(all.length - 1, curPos + step))];
      selectPhoto(next);
      dom.photoGrid.querySelector(`[data-index="${next}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    // Space — toggle GIF selection for current photo
    if (e.key === ' ') {
      e.preventDefault();
      if (!state.gifMode) return;
      if (state.selectedIndex === null) return;
      const slot = dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`);
      if (slot && !slot.classList.contains('empty')) {
        toggleGifSelection(state.selectedIndex, slot);
      }
      return;
    }

    // Transform shortcuts (only when a photo is selected)
    if (state.selectedIndex === null) return;
    const photo = state.photos[state.selectedIndex];
    if (!photo || photo.isEmpty) return;

    if (e.key === 'r' && !e.shiftKey) { applyTransformAction(state.selectedIndex, 'rotate-cw');  _repaintAfterTransform(state.selectedIndex); }
    if (e.key === 'l')                { applyTransformAction(state.selectedIndex, 'rotate-ccw'); _repaintAfterTransform(state.selectedIndex); }
    if (e.key === 'r' &&  e.shiftKey) { applyTransformAction(state.selectedIndex, 'rotate-ccw'); _repaintAfterTransform(state.selectedIndex); } // kept for compat
    if (e.key === 'h')                { applyTransformAction(state.selectedIndex, 'flip-h');      _repaintAfterTransform(state.selectedIndex); }
    if (e.key === 'v')                { applyTransformAction(state.selectedIndex, 'flip-v');      _repaintAfterTransform(state.selectedIndex); }
  });
}

// ── Tone controls wiring ─────────────────────────────────────────────────────

function setupToneControls() {
  function redrawDetail() { repaintGrid(); }

  const brightnessEl   = document.getElementById('tone-brightness');
  const brightnessVal  = document.getElementById('tone-brightness-val');
  const contrastEl     = document.getElementById('tone-contrast');
  const contrastVal    = document.getElementById('tone-contrast-val');
  const intensityEl    = document.getElementById('tone-intensity');
  const intensityVal   = document.getElementById('tone-intensity-val');
  const shadowColorEl  = document.getElementById('tone-shadow-color');
  const highlightColorEl = document.getElementById('tone-highlight-color');
  const balanceEl      = document.getElementById('tone-balance');
  const balanceVal     = document.getElementById('tone-balance-val');
  const resetBtn       = document.getElementById('tone-reset');

  if (!brightnessEl) return; // not in DOM (shouldn't happen)

  brightnessEl.addEventListener('input', () => {
    setScopedSetting('brightness', parseInt(brightnessEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.brightness ?? state.brightness;
    brightnessVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });

  contrastEl.addEventListener('input', () => {
    setScopedSetting('contrast', parseInt(contrastEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.contrast ?? state.contrast;
    contrastVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });

  intensityEl.addEventListener('input', () => {
    setScopedSetting('toneIntensity', parseInt(intensityEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneIntensity ?? state.toneIntensity;
    intensityVal.textContent = `${v}%`;
    redrawDetail();
  });

  shadowColorEl.addEventListener('input', () => {
    setScopedSetting('shadowColor', shadowColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  highlightColorEl.addEventListener('input', () => {
    setScopedSetting('highlightColor', highlightColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  balanceEl.addEventListener('input', () => {
    setScopedSetting('toneBalance', parseInt(balanceEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneBalance ?? state.toneBalance;
    balanceVal.textContent = v > 0 ? `+${v}` : String(v);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });

  resetBtn?.addEventListener('click', () => {
    // Reset tone to defaults for the current scope target
    setScopedSetting('brightness',    0);
    setScopedSetting('contrast',      0);
    setScopedSetting('toneIntensity', 0);
    setScopedSetting('toneBalance',   0);
    setScopedSetting('shadowColor',   '#0033aa');
    setScopedSetting('highlightColor','#ff8800');

    brightnessEl.value      = 0;
    contrastEl.value        = 0;
    intensityEl.value       = 0;
    balanceEl.value         = 0;
    shadowColorEl.value     = '#0033aa';
    highlightColorEl.value  = '#ff8800';

    brightnessVal.textContent = '0';
    contrastVal.textContent   = '0';
    intensityVal.textContent  = '0%';
    balanceVal.textContent    = '0';

    redrawDetail();
  });
}

// ── Init ────────────────────────────────────────────────────────────────────

function wireButtonsPaletteEditor() {
  document.getElementById('btn-new-palette').addEventListener('click', () => {
    closePalettePicker();
    openPaletteEditor();
  });
  document.getElementById('palette-modal-close').addEventListener('click', closePaletteEditor);
  document.getElementById('palette-modal-cancel').addEventListener('click', closePaletteEditor);
  document.getElementById('palette-modal-save').addEventListener('click', savePaletteEditor);
  document.getElementById('palette-modal-delete').addEventListener('click', deletePaletteFromEditor);

  // Import field: URL / hex / Lospec
  const lospecBtn = document.getElementById('btn-lospec-import');
  const lospecInput = document.getElementById('palette-lospec-url');
  if (lospecBtn && lospecInput) {
    lospecBtn.addEventListener('click', () => importFromText(lospecInput.value));
    lospecInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') importFromText(lospecInput.value);
    });
  }

  // .pal/.gbp single-file import in editor
  const palFileInput = document.getElementById('palette-pal-input');
  const loadPalBtn   = document.getElementById('btn-load-pal-file');
  if (loadPalBtn && palFileInput) {
    loadPalBtn.addEventListener('click', () => palFileInput.click());
    palFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePalFileImport(file);
      e.target.value = '';
    });
  }

  // .pal/.gbp export from editor
  document.getElementById('palette-modal-export-pal')?.addEventListener('click', exportEditorAsPal);
  document.getElementById('palette-modal-export-gbp')?.addEventListener('click', exportEditorAsGbp);

  document.getElementById('btn-export-palettes').addEventListener('click', exportPalettesJson);

  // Palette-bar Import: accepts .json, .pal, .gbp (multi-file)
  document.getElementById('btn-import-palettes').addEventListener('click', () => {
    document.getElementById('palette-import-input').click();
  });
  document.getElementById('palette-import-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // If all .json — use old single-file importer for backwards compat
    const allJson = files.every(f => f.name.toLowerCase().endsWith('.json'));
    if (allJson && files.length === 1) {
      importPalettesJson(files[0]);
    } else {
      await batchImportPaletteFiles(files);
    }
    e.target.value = '';
  });

  // Close modal on overlay click
  document.getElementById('palette-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('palette-modal')) closePaletteEditor();
  });
}

function init() {
  buildPaletteBar();
  wireButtons();
  wireButtonsPaletteEditor();
  setupDragDrop();
  setupPanelResize();
  setupKeyboard();
  setStatus('No file loaded');
  setExportScale(8);
  setThumbnailSize(120); // default: ~120px thumbnails (auto-fill)
}

document.addEventListener('DOMContentLoaded', init);
