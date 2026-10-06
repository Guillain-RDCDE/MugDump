import { PALETTES } from '../data/palettes/index.js';
import { api } from '../platform/index.js';
import { loadSavFile } from '../app/open-file.js';
import {
  RECENT_PALETTES_KEY,
  loadCustomPalettes,
  loadRecentPalettes,
  refreshCustomPalettes,
  saveCustomPalettesToStorage,
} from '../app/palette-store.js';
import { setScopedSetting } from '../app/settings.js';
import { state } from '../app/state.js';
import { dom } from '../ui/dom.js';
import { setExportScale } from '../ui/export-panel.js';
import { FAV_PALETTES_KEY, loadFavPalettes, renderFavPalettes } from '../ui/fav-palettes.js';
import { showToast } from '../ui/feedback.js';
import { setGifLoop } from '../ui/gif-builder.js';
import { repaintGrid } from '../ui/grid.js';
import { rebuildPalettePickerList, setPalette } from '../ui/palette-picker.js';

// ── Export filters / effects ───────────────────────────────────────────────

// Legacy: called by openProject() for backwards compat with older .gbcp files
// that stored a single exportFilter value. No-op for current accordion design.
function setExportFilter(filter) {
  setScopedSetting('exportFilter', filter);
  repaintGrid();
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

  return JSON.stringify(
    {
      version: 1,
      app: 'MugDump',
      filename: state.filename || 'GBCAMERA.sav',
      sav: sav64,
      settings: {
        paletteId: state.palette.id,
        exportScale: state.exportScale,
        exportFilter: state.exportFilter,
        filterIntensity: state.filterIntensity,
        filterVariant: state.filterVariant,
        filterParams: state.filterParams,
        brightness: state.brightness,
        contrast: state.contrast,
        toneIntensity: state.toneIntensity,
        shadowColor: state.shadowColor,
        highlightColor: state.highlightColor,
        toneBalance: state.toneBalance,
        gifDelay: state.gifDelay,
        gifLoop: state.gifLoop,
        photoSettings: state.photoSettings,
        photoTransforms: state.photoTransforms,
        filterOrder: state.filterOrder,
        customPalettes: loadCustomPalettes(),
        recentPalettes: loadRecentPalettes(),
        favPalettes: loadFavPalettes(),
      },
    },
    null,
    2,
  );
}

export async function saveProject() {
  if (!state.sav) return;
  const baseName = (state.filename || 'gbcamera').replace(/\.sav$/i, '');
  const defaultName = `${baseName}.gbcp`;
  const result = await api.saveProject(buildProjectJson(), defaultName);
  if (result) showToast(`Project saved: ${result}`);
}

export async function openProject() {
  const result = await api.openProject();
  if (!result) return;
  if (result.error) {
    showToast(`Error: ${result.error}`);
    return;
  }

  let project;
  try {
    project = JSON.parse(result.json);
  } catch (_) {
    showToast('Invalid project file');
    return;
  }

  if (project.version !== 1 || !project.sav) {
    showToast('Unrecognised project format');
    return;
  }

  // Decode base64 sav → ArrayBuffer
  const binary = atob(project.sav);
  const buffer = new ArrayBuffer(binary.length);
  const u8 = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);

  // Load the photos (same pipeline as a normal .sav open)
  await loadSavFile({ buffer, name: project.filename || result.name, path: null });

  // Restore settings
  const s = project.settings || {};
  if (s.paletteId && PALETTES[s.paletteId]) setPalette(s.paletteId);
  if (s.exportScale !== undefined) setExportScale(s.exportScale);
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
    document
      .querySelectorAll('.crt-variant-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.variant === s.filterVariant));
  }
  if (s.gifDelay) {
    state.gifDelay = s.gifDelay;
    if (dom.gifDelay) dom.gifDelay.value = s.gifDelay;
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

  // Restore filter order (and reorder accordion DOM to match)
  if (Array.isArray(s.filterOrder) && s.filterOrder.length > 0) {
    state.filterOrder = s.filterOrder;
    localStorage.setItem('filterOrder', JSON.stringify(s.filterOrder));
    const accordion = document.getElementById('filter-accordion');
    if (accordion) {
      s.filterOrder.forEach((filterId) => {
        const item = accordion.querySelector(`.fi-item[data-filter="${filterId}"]`);
        if (item) accordion.appendChild(item);
      });
    }
  }

  // Merge incoming custom palettes without overwriting existing ones
  if (Array.isArray(s.customPalettes) && s.customPalettes.length > 0) {
    const existing = loadCustomPalettes();
    const existingIds = new Set(existing.map((p) => p.id));
    const incoming = s.customPalettes.filter((p) => !existingIds.has(p.id));
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
