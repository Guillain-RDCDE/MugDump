/**
 * MugDump renderer entry point.
 *
 * Runs unchanged in the browser (GitHub Pages) and inside the Electron shell;
 * platform differences live behind platform/index.js.
 */
import { api, isElectron } from './platform/index.js';
import { setupDragDrop, loadSavFile } from './app/open-file.js';
import { state } from './app/state.js';
import { exportBatchPng } from './features/export.js';
import { preloadBorderImages } from './render/photo.js';
import { setupBorderPicker } from './ui/border-picker.js';
import { setupCollapsibleSections } from './ui/collapsible-sections.js';
import { setupFilterAccordion } from './ui/effects-panel.js';
import { setExportScale } from './ui/export-panel.js';
import { setupFavCarouselResponsive } from './ui/fav-palettes.js';
import { setStatus } from './ui/feedback.js';
import { setThumbnailSize } from './ui/grid.js';
import { setupKeyboard } from './ui/keyboard.js';
import { setupPanelResize, setupSidebarCollapse, setupSidebarToggle } from './ui/layout.js';
import { setupOverflowMenus } from './ui/overflow-menus.js';
import { setupPaletteEditor } from './ui/palette-editor.js';
import { buildPaletteBar } from './ui/palette-picker.js';
import { openPocketModal } from './ui/pocket-modal.js';
import { setupPresetControls } from './ui/presets.js';
import { setupPreviewPanel } from './ui/sidebar-preview.js';
import { setupTheme } from './ui/theme.js';
import { wireButtons } from './ui/wire-buttons.js';

const DEFAULT_EXPORT_SCALE = 20;
const DEFAULT_THUMBNAIL_PX = 120;

function wireNativeMenu() {
  api.onMenuOpenSav(async () => loadSavFile(await api.openSavFile()));
  api.onMenuOpenPocket(() => openPocketModal());
  api.onMenuExportAll(() => {
    if (state.photos.length > 0) exportBatchPng();
  });
}

function init() {
  document.body.classList.toggle('web', !isElectron);
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = `${__APP_VERSION__} `;

  setupTheme();
  buildPaletteBar();
  wireButtons();
  setupPaletteEditor();
  setupPresetControls();
  setupPreviewPanel();
  setupDragDrop();
  setupPanelResize();
  setupSidebarToggle();
  setupOverflowMenus();
  setupKeyboard();
  setupFavCarouselResponsive();
  setupSidebarCollapse();
  setupCollapsibleSections();
  setupFilterAccordion();
  preloadBorderImages();
  setupBorderPicker();
  wireNativeMenu();
  setStatus('No file loaded');
  setExportScale(DEFAULT_EXPORT_SCALE);
  setThumbnailSize(DEFAULT_THUMBNAIL_PX);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
