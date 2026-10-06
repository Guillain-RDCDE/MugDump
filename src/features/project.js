/**
 * Save / open .gbcp projects: the save file plus every setting, so a session
 * can be resumed. The file format itself lives in project-format.js.
 */
import { PALETTES } from '../data/palettes/index.js';
import { api } from '../platform/index.js';
import { loadSavFile } from '../app/open-file.js';
import {
  loadCustomPalettes,
  loadRecentPalettes,
  refreshCustomPalettes,
  saveCustomPalettesToStorage,
  saveRecentPalettes,
} from '../app/palette-store.js';
import { setScopedSetting } from '../app/settings.js';
import { state } from '../app/state.js';
import { dom } from '../ui/dom.js';
import { setExportScale } from '../ui/export-panel.js';
import { loadFavPalettes, renderFavPalettes, saveFavPalettes } from '../ui/fav-palettes.js';
import { updateFilterUI } from '../ui/effects-actions.js';
import { showToast } from '../ui/feedback.js';
import { setGifLoop } from '../ui/gif-builder.js';
import { repaintGrid } from '../ui/grid.js';
import { rebuildPalettePickerList, setPalette } from '../ui/palette-picker.js';
import { parseProject, serializeProject } from './project-format.js';

export function buildProjectJson() {
  return serializeProject({
    sav: state.sav,
    filename: state.filename,
    paletteId: state.palette.id,
    settings: state,
    customPalettes: loadCustomPalettes(),
    recentPalettes: loadRecentPalettes(),
    favPalettes: loadFavPalettes(),
  });
}

export async function saveProject() {
  if (!state.sav) return;
  const baseName = (state.filename || 'gbcamera').replace(/\.sav$/i, '');
  const result = await api.saveProject(buildProjectJson(), `${baseName}.gbcp`);
  if (result) showToast(`Project saved: ${result}`);
}

/** Apply the settings block of a parsed project to the live state and UI. */
function applyProjectSettings(s) {
  if (s.paletteId && PALETTES[s.paletteId]) setPalette(s.paletteId);
  if (s.exportScale !== undefined) setExportScale(s.exportScale);
  if (s.exportFilter) {
    // Legacy single-filter field from older projects; harmless with the accordion.
    setScopedSetting('exportFilter', s.exportFilter);
    repaintGrid();
  }
  if (s.filterIntensity !== undefined) state.filterIntensity = s.filterIntensity;
  if (s.filterVariant) state.filterVariant = s.filterVariant;
  if (s.gifDelay) {
    state.gifDelay = s.gifDelay;
    if (dom.gifDelay) dom.gifDelay.value = s.gifDelay;
    if (dom.gifDelayVal) dom.gifDelayVal.textContent = `${s.gifDelay}ms`;
  }
  if (s.gifLoop) setGifLoop(s.gifLoop);
  if (s.photoSettings) state.photoSettings = s.photoSettings;

  // Filter order: state + accordion DOM
  if (s.filterOrder?.length) {
    state.filterOrder = s.filterOrder;
    const accordion = document.getElementById('filter-accordion');
    for (const filterId of s.filterOrder) {
      const item = accordion?.querySelector(`.fi-item[data-filter="${filterId}"]`);
      if (item) accordion.appendChild(item);
    }
  }

  // Merge incoming custom palettes without overwriting existing ones
  if (s.customPalettes?.length) {
    const existing = loadCustomPalettes();
    const existingIds = new Set(existing.map((p) => p.id));
    const incoming = s.customPalettes.filter((p) => !existingIds.has(p.id));
    if (incoming.length > 0) {
      saveCustomPalettesToStorage([...existing, ...incoming]);
      refreshCustomPalettes();
      rebuildPalettePickerList();
    }
  }
  if (s.recentPalettes) saveRecentPalettes(s.recentPalettes);
  if (s.favPalettes) {
    saveFavPalettes(s.favPalettes);
    renderFavPalettes();
  }
  // Per-photo settings were restored after the grid was drawn — reflect them.
  updateFilterUI();
  repaintGrid();
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
    project = parseProject(result.json);
  } catch (e) {
    showToast(e.message);
    return;
  }
  // Same pipeline as opening a .sav, then layer the saved settings on top.
  await loadSavFile({ buffer: project.buffer, name: project.filename || result.name, path: null });
  applyProjectSettings(project.settings);
  showToast(`Project loaded: ${result.name}`);
}
