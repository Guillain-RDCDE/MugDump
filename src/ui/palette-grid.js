import { STORAGE_KEYS, readJson, readString, writeJson, writeString } from '../app/storage.js';
import { PALETTES } from '../data/palettes/index.js';
import { PHOTO_HEIGHT, PHOTO_WIDTH, renderToCanvas } from '../core/gbcam.js';
import { state } from '../app/state.js';
import { PAL_GROUP_LABELS, PAL_GROUP_ORDER } from '../data/palette-groups.js';
import { isFavPalette, toggleFavPalette } from './fav-palettes.js';
import { setPalette } from './palette-picker.js';

// ── Palette visual grid ────────────────────────────────────────────────────

export function openPaletteGrid() {
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
    const savedSize = readString(STORAGE_KEYS.paletteGridSize);
    if (savedSize) sizeSlider.value = savedSize;
    updatePaletteGridSize(parseInt(sizeSlider.value));
    sizeSlider.oninput = () => {
      updatePaletteGridSize(parseInt(sizeSlider.value));
      writeString(STORAGE_KEYS.paletteGridSize, sizeSlider.value);
    };
  }

  buildPaletteGrid();
}

function updatePaletteGridSize(px) {
  const list = document.getElementById('palette-grid-list');
  if (list) list.style.gridTemplateColumns = `repeat(auto-fill, minmax(min(${px}px, 48%), 1fr))`;
}

export function closePaletteGrid() {
  const modal = document.getElementById('palette-grid-modal');
  if (modal) modal.classList.add('hidden');
}

// Collapsed categories in the All Palettes grid — remembered across sessions.
function getCollapsedPgridGroups() {
  return new Set(readJson(STORAGE_KEYS.paletteGridCollapsed, []));
}

function setPgridGroupCollapsed(group, collapsed) {
  const set = getCollapsedPgridGroups();
  if (collapsed) set.add(group);
  else set.delete(group);
  writeJson(STORAGE_KEYS.paletteGridCollapsed, [...set]);
}

async function buildPaletteGrid() {
  const list = document.getElementById('palette-grid-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-3);font-size:12px;padding:8px;">Rendering…</p>';

  // Use selected photo, or first non-empty one
  const photoIdx =
    state.selectedIndex !== null ? state.selectedIndex : state.photos.findIndex((p) => !p.isEmpty);
  const photo = photoIdx >= 0 && !state.photos[photoIdx]?.isEmpty ? state.photos[photoIdx] : null;

  await new Promise((r) => requestAnimationFrame(r));
  list.innerHTML = '';

  const renderQueue = [];
  const collapsedGroups = getCollapsedPgridGroups();

  function makePaletteCell(id, pal, groupKey) {
    const cell = document.createElement('div');
    cell.className = 'pgrid-cell' + (state.palette.id === id ? ' active' : '');
    cell.dataset.paletteId = id;
    cell.dataset.group = groupKey;
    if (collapsedGroups.has(groupKey)) cell.style.display = 'none';

    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;

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
    gridStar.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavPalette(id);
      gridStar.classList.toggle('starred', isFavPalette(id));
    });

    cell.appendChild(canvas);
    cell.appendChild(namEl);
    cell.appendChild(swatchRow);
    cell.appendChild(gridStar);

    cell.addEventListener('click', () => {
      setPalette(id);
      closePaletteGrid();
    });

    renderQueue.push({ canvas, pal, photo });
    return cell;
  }

  // Click a section header to collapse/expand that category — remembered across sessions.
  function addGridSectionHeader(text, groupKey) {
    const h = document.createElement('div');
    h.className = 'pgrid-section-header';
    h.dataset.group = groupKey;
    if (collapsedGroups.has(groupKey)) h.classList.add('collapsed');

    const chevron = document.createElement('span');
    chevron.className = 'pgrid-chevron';
    chevron.textContent = '▾';
    const label = document.createElement('span');
    label.textContent = text;
    h.appendChild(chevron);
    h.appendChild(label);

    h.addEventListener('click', () => {
      const nowCollapsed = !h.classList.contains('collapsed');
      h.classList.toggle('collapsed', nowCollapsed);
      if (nowCollapsed) collapsedGroups.add(groupKey);
      else collapsedGroups.delete(groupKey);
      setPgridGroupCollapsed(groupKey, nowCollapsed);
      list.querySelectorAll(`.pgrid-cell[data-group="${groupKey}"]`).forEach((cell) => {
        cell.style.display = nowCollapsed ? 'none' : '';
      });
    });

    list.appendChild(h);
  }

  // Group built-in palettes by category — same buckets/order/labels as the picker menu
  const grouped = {};
  for (const [id, pal] of Object.entries(PALETTES)) {
    if (pal.custom) continue;
    const g = pal.group || 'other';
    (grouped[g] = grouped[g] || []).push([id, pal]);
  }
  const orderedGroups = [
    ...PAL_GROUP_ORDER,
    ...Object.keys(grouped).filter((g) => !PAL_GROUP_ORDER.includes(g)),
  ];
  for (const g of orderedGroups) {
    if (!grouped[g] || grouped[g].length === 0) continue;
    addGridSectionHeader(PAL_GROUP_LABELS[g] || g, g);
    for (const [id, pal] of grouped[g]) list.appendChild(makePaletteCell(id, pal, g));
  }

  // Custom palettes last
  const customs = Object.entries(PALETTES).filter(([, p]) => p.custom);
  if (customs.length > 0) {
    addGridSectionHeader('Custom', 'custom');
    for (const [id, pal] of customs) list.appendChild(makePaletteCell(id, pal, 'custom'));
  }

  // Scroll active palette into view
  const activeCell = list.querySelector('.pgrid-cell.active');
  if (activeCell) activeCell.scrollIntoView({ block: 'center', behavior: 'instant' });

  // Render canvases in RAF batches to keep the UI responsive
  const BATCH = 30;
  for (let i = 0; i < renderQueue.length; i += BATCH) {
    await new Promise((r) => requestAnimationFrame(r));
    const batch = renderQueue.slice(i, i + BATCH);
    for (const { canvas, pal, photo: ph } of batch) {
      const ctx = canvas.getContext('2d');
      if (ph) {
        renderToCanvas(ctx, ph.pixels, pal, 1);
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
  const collapsed = getCollapsedPgridGroups();
  list.querySelectorAll('.pgrid-cell').forEach((cell) => {
    const name = (cell.querySelector('.pgrid-name')?.textContent || '').toLowerCase();
    const matches = !q || name.includes(q);
    // While searching, show every match (ignore collapse); otherwise respect collapsed categories
    const hidden = q ? !matches : !matches || collapsed.has(cell.dataset.group);
    cell.style.display = hidden ? 'none' : '';
  });
  // While searching, hide a header whose palettes are all filtered out.
  // When not searching, keep every header visible (collapsed ones included).
  list.querySelectorAll('.pgrid-section-header').forEach((header) => {
    if (!q) {
      header.style.display = '';
      return;
    }
    let next = header.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains('pgrid-section-header')) {
      if (next.classList.contains('pgrid-cell') && next.style.display !== 'none') {
        anyVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    header.style.display = anyVisible ? '' : 'none';
  });
}
