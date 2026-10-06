import { PALETTES } from '../data/palettes/index.js';
import { addRecentPalette, refreshCustomPalettes } from '../app/palette-store.js';
import { getDisplayPaletteId } from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import { PAL_GROUP_LABELS, PAL_GROUP_ORDER } from '../data/palette-groups.js';
import { setExportFormat } from './export-panel.js';
import { isFavPalette, renderFavPalettes, toggleFavPalette } from './fav-palettes.js';
import { repaintGrid } from './grid.js';
import { openPaletteEditor } from './palette-editor.js';
import { closePaletteGrid } from './palette-grid.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { enterGridMode, renderSoloView } from './solo-view.js';

// ── Palette ─────────────────────────────────────────────────────────────────

export function setPalette(id) {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    targets.forEach((i) => {
      if (!state.photoSettings[i]) state.photoSettings[i] = {};
      state.photoSettings[i].paletteId = id;
    });
  } else {
    state.palette = PALETTES[id];
  }
  addRecentPalette(id);
  const displayId = getDisplayPaletteId();
  updatePalettePickerBtn(PALETTES[displayId] || state.palette);
  renderFavPalettes();
  // Update active highlight in dropdown list
  document.querySelectorAll('.pal-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.palette === displayId);
    if (item.dataset.palette === displayId) {
      item.querySelector('.pal-item-name').style.color = '';
    }
  });
  repaintGrid();
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}

export function updatePalettePickerBtn(pal) {
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

export function buildPaletteBar() {
  buildPalettePickerUI();
  renderFavPalettes();
  buildBrowseButtonIcon();
}

// ── Palette picker UI ─────────────────────────────────────────────────────

function buildPalettePickerUI() {
  updatePalettePickerBtn();
  rebuildPalettePickerList();

  const btn = document.getElementById('palette-picker-btn');
  const dropdown = document.getElementById('palette-picker-dropdown');
  const search = document.getElementById('palette-picker-search');

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
      if (state.viewMode === 'solo') {
        enterGridMode();
        return;
      }
      if (state.gifMode) {
        // Exit GIF mode and reset format buttons back to PNG
        setExportFormat('png');
        document.querySelectorAll('.fmt-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.fmt === 'png');
        });
      }
      closePalettePicker();
      closePaletteGrid();
    }
  });
}

export function closePalettePicker() {
  const dropdown = document.getElementById('palette-picker-dropdown');
  const btn = document.getElementById('palette-picker-btn');
  if (dropdown) dropdown.classList.add('hidden');
  if (btn) btn.classList.remove('open');
}

export function rebuildPalettePickerList() {
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
    ...Object.keys(grouped).filter((g) => !PAL_GROUP_ORDER.includes(g)),
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
      credit.addEventListener('click', (e) => e.stopPropagation());
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
  starBtn.addEventListener('click', (e) => {
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
  items.forEach((item) => {
    const n = (item.querySelector('.pal-item-name')?.textContent || '').toLowerCase();
    item.style.display = !q || n.includes(q) ? '' : 'none';
  });
  // Hide section headers when all their items are hidden
  document.querySelectorAll('#palette-picker-list .pal-section-header').forEach((header) => {
    let next = header.nextElementSibling;
    let allHidden = true;
    while (next && !next.classList.contains('pal-section-header')) {
      if (next.style.display !== 'none') {
        allHidden = false;
        break;
      }
      next = next.nextElementSibling;
    }
    header.style.display = allHidden ? 'none' : '';
  });
}

// ── Browse button: inject colourful mini-grid icon + update text ────────────

function buildBrowseButtonIcon() {
  const btn = document.getElementById('btn-palette-grid');
  if (!btn) return;

  // 3 representative palettes × 4 colours = 3-row colour grid
  const ids = ['dmg', 'gbcam_gold', 'gbc_a_up'];
  const cw = 5,
    ch = 5,
    gap = 1;
  const cols = 4,
    rows = ids.length;
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

export function updateCurrentPalettePin() {
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
  pal.colors.forEach((c) => {
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
  star.addEventListener('click', (e) => {
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
