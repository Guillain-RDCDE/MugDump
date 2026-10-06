import { STORAGE_KEYS, readJson, writeJson } from '../app/storage.js';
import { PALETTES } from '../data/palettes/index.js';
import { getDisplayPaletteId } from '../app/settings.js';
import { showToast } from './feedback.js';
import { setPalette } from './palette-picker.js';

/** Responsive fav carousel: measures available width and adjusts visible chip count dynamically. */
export function setupFavCarouselResponsive() {
  const container = document.getElementById('fav-palettes');
  const btnMenu = document.getElementById('btn-fav-menu');
  if (!container || !btnMenu) return;

  // Chip width: swatch (4 × 11px) + 2×padding(2px) + 2×border(2px) = 52px + 3px gap = 55px
  const FAV_CHIP_PX = 55;
  // Two nav arrow buttons when wheel is active: 20px each + 3px gap each side = 46px
  const NAV_ARROW_PX = 46;

  let _lastCount = -1;
  let _rafId = null;

  function update() {
    _rafId = null;
    const favs = loadFavPalettes().filter((id) => PALETTES[id]);
    const total = favs.length;

    // Measure available width with menu button hidden (true remaining space)
    const menuWasVisible = btnMenu.style.display !== 'none';
    btnMenu.style.display = 'none';
    const available = container.clientWidth;
    if (menuWasVisible) btnMenu.style.display = ''; // restore to re-evaluate below

    // Calculate visible count, accounting for nav arrows if needed
    let count = Math.floor(available / FAV_CHIP_PX);
    if (total > count && count > 0) {
      // Arrows eat NAV_ARROW_PX — reduce count with arrow overhead
      count = Math.max(0, Math.floor((available - NAV_ARROW_PX) / FAV_CHIP_PX));
    }
    count = Math.min(count, FAV_PAGE_SIZE);

    const showMenu = count === 0 && total > 0;
    btnMenu.style.display = showMenu ? 'inline-flex' : 'none';

    if (count !== _lastCount) {
      _lastCount = count;
      _favVisibleCount = Math.max(0, count);
      renderFavPalettes();
    }
  }

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (_rafId) return;
      _rafId = requestAnimationFrame(update);
    }).observe(container);
  }

  // Initial call after layout settles
  requestAnimationFrame(update);
}

// ── Favourite palettes ─────────────────────────────────────────────────────

const MAX_FAV_PALETTES = 64; // total you can star

const FAV_PAGE_SIZE = 16; // max visible at once (hard cap)

let favOffset = 0; // current wheel position

let _favVisibleCount = 16; // dynamically updated by setupFavCarouselResponsive

export function loadFavPalettes() {
  return readJson(STORAGE_KEYS.favPalettes, []);
}

export function saveFavPalettes(ids) {
  writeJson(STORAGE_KEYS.favPalettes, ids);
}

export function isFavPalette(id) {
  return loadFavPalettes().includes(id);
}

export function shiftFavOffset(delta) {
  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  if (favs.length <= _favVisibleCount) return;
  favOffset = (((favOffset + delta) % favs.length) + favs.length) % favs.length;
  renderFavPalettes();
}

export function toggleFavPalette(id) {
  let favs = loadFavPalettes();
  if (favs.includes(id)) {
    favs = favs.filter((f) => f !== id);
    // clamp offset so it stays valid after removal
    const newLen = favs.filter((f) => PALETTES[f]).length;
    if (newLen <= _favVisibleCount) favOffset = 0;
    else favOffset = Math.min(favOffset, newLen - 1);
  } else {
    if (favs.length >= MAX_FAV_PALETTES) {
      showToast(`Favourites full (${MAX_FAV_PALETTES} max) — remove one first ★`);
      return;
    }
    favs.push(id);
  }
  saveFavPalettes(favs);
  renderFavPalettes();
  // Sync star state in any open picker list
  document.querySelectorAll(`.pal-item-star[data-palette="${id}"]`).forEach((btn) => {
    btn.classList.toggle('starred', isFavPalette(id));
    btn.title = isFavPalette(id) ? 'Remove from favourites' : 'Add to favourites';
  });
  // Sync star state in palette grid
  document.querySelectorAll(`.pgrid-star[data-palette="${id}"]`).forEach((btn) => {
    btn.classList.toggle('starred', isFavPalette(id));
  });
}

export function renderFavPalettes() {
  const container = document.getElementById('fav-palettes');
  if (!container) return;
  container.innerHTML = '';

  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  const total = favs.length;
  const visible = Math.min(_favVisibleCount, FAV_PAGE_SIZE);
  const hasWheel = total > visible && visible > 0;

  // ‹ left arrow
  if (hasWheel) {
    const left = document.createElement('button');
    left.className = 'fav-nav-btn';
    left.title = 'Previous favourites (-)';
    left.textContent = '‹';
    left.addEventListener('click', () => shiftFavOffset(-1));
    container.appendChild(left);
  }

  // Visible window — wraps around
  const count = Math.min(visible, total);
  for (let i = 0; i < count; i++) {
    const id = favs[(favOffset + i) % total];
    const pal = PALETTES[id];
    const btn = document.createElement('button');
    btn.className = 'fav-pal-btn' + (getDisplayPaletteId() === id ? ' active' : '');
    btn.title = pal.name;

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
      renderFavPalettes();
    });
    container.appendChild(btn);
  }

  // › right arrow
  if (hasWheel) {
    const right = document.createElement('button');
    right.className = 'fav-nav-btn';
    right.title = 'Next favourites (+)';
    right.textContent = '›';
    right.addEventListener('click', () => shiftFavOffset(1));
    container.appendChild(right);
  }

  // Keep the fav dropdown in sync
  renderFavDropdown();
}

/** Populate the fav-dropdown with clickable palette items (palette bar overflow menu). */
function renderFavDropdown() {
  const dd = document.getElementById('fav-dropdown');
  if (!dd) return;
  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  dd.innerHTML = '';
  if (favs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'overflow-item';
    empty.style.cssText = 'opacity:0.45;cursor:default;pointer-events:none;';
    empty.textContent = 'No favourites yet';
    dd.appendChild(empty);
    return;
  }
  for (const id of favs) {
    const pal = PALETTES[id];
    const item = document.createElement('button');
    item.className = 'overflow-item';
    const swatch = document.createElement('span');
    swatch.className = 'overflow-pal-swatch';
    for (const color of pal.colors) {
      const sq = document.createElement('span');
      sq.style.background = color;
      swatch.appendChild(sq);
    }
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(pal.name));
    item.addEventListener('click', () => {
      dd.classList.add('hidden');
      setPalette(id);
    });
    dd.appendChild(item);
  }
}
