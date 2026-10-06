import { state } from '../app/state.js';
import { dom } from './dom.js';

// ── Views ───────────────────────────────────────────────────────────────────

export function showMainView() {
  dom.welcome.classList.add('hidden');
  dom.main.style.display = 'flex';
  // Reveal file-only titlebar buttons (Export .sav, Save Project)
  dom.app.classList.add('has-file');
}

export function resetToWelcome() {
  // Clear loaded file state
  state.sav = null;
  state.photos = [];
  state.activeCount = 0;
  state.filename = null;
  state.filePath = null;
  state.selectedIndex = null;
  state.photoSettings = {};
  state.gifMode = false;
  state.gifSelection = new Set();
  state.gifFrameOrder = [];
  state.viewMode = 'grid';
  // Return to welcome screen
  dom.main.style.display = 'none';
  dom.welcome.classList.remove('hidden');
  dom.app.classList.remove('has-file');
  // Clear grid
  if (dom.photoGrid) dom.photoGrid.innerHTML = '';
}
