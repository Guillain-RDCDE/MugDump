import {
  getEffectiveSettings,
  getWritableFilterParams,
  setScopedSetting,
} from '../app/settings.js';
import { state } from '../app/state.js';
import { pushUndo } from '../app/undo.js';
import {
  FILTER_DEFS,
  FX_FILTER_GROUP,
  FX_GROUP_LABELS,
  FX_GROUP_ORDER,
  buildDefaultFilterParams,
} from '../data/filter-defs.js';
import { showToast } from './feedback.js';
import { repaintGrid, repaintInteractive } from './grid.js';
import { updateSidebarPreview } from './sidebar-preview.js';
import { renderSoloView } from './solo-view.js';

const FX_COLLAPSE_KEY = 'mugdump:fxgroups';

function getCollapsedFxGroups() {
  const stored = localStorage.getItem(FX_COLLAPSE_KEY);
  if (stored === null) return new Set(['retro', 'glitch']); // default: only Pixel-perfect open
  try {
    return new Set(JSON.parse(stored));
  } catch (_) {
    return new Set(['retro', 'glitch']);
  }
}

function setFxGroupCollapsed(g, collapsed) {
  const set = getCollapsedFxGroups();
  if (collapsed) set.add(g);
  else set.delete(g);
  try {
    localStorage.setItem(FX_COLLAPSE_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

function makeFxGroupHeader(g, collapsed) {
  const h = document.createElement('div');
  h.className = 'fi-group-header' + (collapsed ? ' collapsed' : '');
  h.dataset.group = g;
  const chevron = document.createElement('span');
  chevron.className = 'fi-group-chevron';
  chevron.textContent = '▾';
  const label = document.createElement('span');
  label.className = 'fi-group-label';
  label.textContent = FX_GROUP_LABELS[g] || g;
  const dot = document.createElement('span');
  dot.className = 'fi-group-dot';
  dot.title = 'An effect in this group is active';
  h.appendChild(chevron);
  h.appendChild(label);
  h.appendChild(dot);
  h.addEventListener('click', () => {
    const nowCollapsed = !h.classList.contains('collapsed');
    h.classList.toggle('collapsed', nowCollapsed);
    setFxGroupCollapsed(g, nowCollapsed);
    document.querySelectorAll(`#filter-accordion .fi-item[data-group="${g}"]`).forEach((it) => {
      it.style.display = nowCollapsed ? 'none' : '';
    });
  });
  return h;
}

// Enable/disable a tone/effects section (exposure | splitTone | effects),
// keeping its "apply" checkbox and the preview in sync.
export function setSectionEnabled(section, on) {
  state.sectionEnabled[section] = on;
  const cb = document.querySelector(`.section-check[data-section="${section}"]`);
  if (cb) cb.checked = on;
  repaintGrid();
  if (state.viewMode === 'solo' && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}

export function resetEffects() {
  pushUndo();
  // Reset all filter state for selected photo(s), or global if none selected
  const targets =
    state.selectedPhotos.size > 0
      ? [...state.selectedPhotos]
      : state.selectedIndex !== null
        ? [state.selectedIndex]
        : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      ps.activeFilters = [];
      ps.filterParams = buildDefaultFilterParams();
      ps.filterIntensity = 1.0;
      ps.filterVariant = 'medium';
    }
  } else {
    state.activeFilters.clear();
    state.filterParams = buildDefaultFilterParams();
    state.filterIntensity = 1.0;
    state.filterVariant = 'medium';
  }
  updateFilterUI();
  setSectionEnabled('effects', false);
  showToast('Effects reset');
}

function updateFilterOrder(repaint = false) {
  // Capture the current DOM order of .fi-item elements and update state.filterOrder
  const items = document.querySelectorAll('.fi-item');
  const newOrder = Array.from(items).map((item) => item.dataset.filter);
  state.filterOrder = newOrder;
  localStorage.setItem('filterOrder', JSON.stringify(newOrder));
  if (repaint) {
    repaintGrid();
    if (state.viewMode === 'solo' && state.selectedIndex !== null)
      renderSoloView(state.selectedIndex);
    updateSidebarPreview();
  }
}

// ── Filter UI management ───────────────────────────────────────────────────

export function updateFilterUI() {
  // Sync checkboxes and accordion expand/collapse state
  const _uiTgt = state.selectedPhotos.size > 0 ? [...state.selectedPhotos][0] : state.selectedIndex;
  const eff = _uiTgt !== null && _uiTgt !== undefined ? getEffectiveSettings(_uiTgt) : null;
  syncFilterAccordion(eff);
}

function toggleFilter(filterName) {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    // Per-photo toggle — apply to selected photos only
    const firstPs = state.photoSettings[targets[0]];
    const firstAf = firstPs?.activeFilters
      ? new Set(firstPs.activeFilters)
      : new Set(state.activeFilters);
    const adding = !firstAf.has(filterName);
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      if (adding) cur.add(filterName);
      else cur.delete(filterName);
      ps.activeFilters = [...cur];
    }
    if (adding) {
      state.focusedFilter = filterName;
      _autoEnableEffectsSection();
    } else if (state.focusedFilter === filterName) {
      const remaining = new Set(state.photoSettings[targets[0]]?.activeFilters || []);
      state.focusedFilter = [...remaining].pop() || null;
    }
  } else {
    // Global toggle — no photo selected, applies to all
    if (state.activeFilters.has(filterName)) {
      state.activeFilters.delete(filterName);
      if (state.focusedFilter === filterName) {
        state.focusedFilter = [...state.activeFilters].pop() || null;
      }
    } else {
      state.activeFilters.add(filterName);
      state.focusedFilter = filterName;
      _autoEnableEffectsSection();
    }
  }
  updateFilterUI();
  repaintGrid();
  updateSidebarPreview();
}

/** If the effects section is disabled, automatically enable it (and update its checkbox). */
function _autoEnableEffectsSection() {
  if (!state.sectionEnabled.effects) {
    state.sectionEnabled.effects = true;
    const cb = document.querySelector('.section-check[data-section="effects"]');
    if (cb) cb.checked = true;
  }
}

// Ensure a filter is active for the current scope — used when the user starts
// tweaking a filter's params without first ticking its box. Mirrors toggleFilter's
// "add" path, minus the undo push (the control already pushed) and grid repaint.
function enableFilter(filterName) {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      cur.add(filterName);
      ps.activeFilters = [...cur];
    }
  } else {
    state.activeFilters.add(filterName);
  }
  state.focusedFilter = filterName;
  _autoEnableEffectsSection();
  updateFilterUI();
}

/**
 * Sync accordion checkboxes, expand/collapse state, and param slider values
 * to reflect `eff` (effective settings object) — or global state if eff is null.
 */
export function syncFilterAccordion(eff) {
  const af = eff ? eff.activeFilters : state.activeFilters;
  const fp = eff ? eff.filterParams : state.filterParams;
  const fv = eff ? eff.filterVariant : state.filterVariant;

  document.querySelectorAll('.fi-item').forEach((item) => {
    const filterId = item.dataset.filter;
    const active = af.has(filterId);
    const cb = item.querySelector('.fi-check');
    if (cb) cb.checked = active;

    // Expand/collapse: auto-open when filter becomes active; never auto-close
    item.classList.toggle('fi-active', active);
    if (active) item.classList.add('fi-open');

    // Sync param values
    const fp_f = (fp && fp[filterId]) || {};
    item.querySelectorAll('[data-fi-key]').forEach((el) => {
      const key = el.dataset.fiKey;
      const stateKey = el.dataset.fiStatekey;
      const curVal = stateKey ? fv : (fp_f[key] ?? el._fiDef);
      if (el.tagName === 'INPUT' && el.type === 'range') {
        el.value = curVal;
        const valEl =
          el.previousElementSibling?.querySelector('.fi-val') ||
          el.parentElement?.querySelector('.fi-val');
        if (valEl && el._fiFmt) valEl.textContent = el._fiFmt(Number(curVal));
      } else if (el.classList.contains('seg-control')) {
        el.querySelectorAll('.seg-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.val === String(curVal));
        });
      }
    });
  });

  // Flag group headers that contain an active effect, so a collapsed family
  // still signals there's something switched on inside it.
  const _fxActiveGroups = new Set();
  document.querySelectorAll('#filter-accordion .fi-item.fi-active').forEach((it) => {
    if (it.dataset.group) _fxActiveGroups.add(it.dataset.group);
  });
  document.querySelectorAll('#filter-accordion .fi-group-header').forEach((h) => {
    h.classList.toggle('has-active', _fxActiveGroups.has(h.dataset.group));
  });
}

/**
 * Build the filter accordion DOM inside #filter-accordion.
 * Called once from init(). Event handlers live here.
 */
export function setupFilterAccordion() {
  const container = document.getElementById('filter-accordion');
  if (!container) return;
  container.innerHTML = '';

  const collapsedFx = getCollapsedFxGroups();
  const _fxGroupItems = {};

  for (const fd of FILTER_DEFS) {
    const item = document.createElement('div');
    item.className = 'fi-item';
    item.dataset.filter = fd.id;

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'fi-header';

    const chevron = document.createElement('span');
    chevron.className = 'fi-chevron section-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'fi-drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.textContent = '⋮⋮';
    dragHandle.title = 'Drag to reorder';

    const lbl = document.createElement('span');
    lbl.className = 'fi-label';
    lbl.textContent = fd.label;

    const checkWrap = document.createElement('label');
    checkWrap.className = 'section-check-wrap fi-check-wrap';
    checkWrap.title = `Enable ${fd.label}`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'fi-check';
    cb.dataset.filter = fd.id;
    checkWrap.appendChild(cb);

    // Per-filter reset button — resets this filter's params to defaults
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-ghost btn-xs btn-icon fi-reset';
    resetBtn.title = `Reset ${fd.label} to defaults`;
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't toggle collapse
      pushUndo();
      const defaults = buildDefaultFilterParams()[fd.id] || {};
      const fp = getWritableFilterParams(fd.id);
      Object.assign(fp, defaults);
      // Sync sliders in this item's param panel
      item.querySelectorAll('input[type="range"][data-fi-key]').forEach((slider) => {
        const key = slider.dataset.fiKey;
        if (key in defaults) {
          slider.value = defaults[key];
          const valEl = slider.closest('.range-wrap')?.querySelector('.fi-val');
          if (valEl && slider._fiFmt) valEl.textContent = slider._fiFmt(defaults[key]);
        }
      });
      item.querySelectorAll('.seg-control[data-fi-key]').forEach((seg) => {
        const key = seg.dataset.fiKey;
        if (key in defaults) {
          seg
            .querySelectorAll('.seg-btn')
            .forEach((b) => b.classList.toggle('active', b.dataset.val === String(defaults[key])));
        }
      });
      repaintInteractive();
    });

    header.appendChild(dragHandle);
    header.appendChild(chevron);
    header.appendChild(lbl);
    header.appendChild(resetBtn);
    header.appendChild(checkWrap);

    // ── Draggable reordering ────────────────────────────────────────────────
    // draggable is only enabled while the pointer is held on the header row,
    // so sliders and controls in the params panel never accidentally start a drag.
    item.draggable = false;
    header.addEventListener('mousedown', () => {
      item.draggable = true;
    });
    item.addEventListener('dragend', () => {
      item.draggable = false;
      item.classList.remove('fi-dragging');
      document.querySelectorAll('.fi-item').forEach((el) => el.classList.remove('fi-drag-over'));
      updateFilterOrder(true);
    });
    // Safety: release draggability if the mouse is released anywhere without a drop
    document.addEventListener(
      'mouseup',
      () => {
        item.draggable = false;
      },
      { passive: true },
    );
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', item.innerHTML);
      item.classList.add('fi-dragging');
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const dragging = document.querySelector('.fi-item.fi-dragging');
      if (dragging && dragging !== item) {
        item.classList.add('fi-drag-over');
        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          item.parentNode.insertBefore(dragging, item);
        } else {
          item.parentNode.insertBefore(dragging, item.nextSibling);
        }
        updateFilterOrder();
      }
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('fi-drag-over');
    });
    item.appendChild(header);

    // ── Params body ─────────────────────────────────────────────────────────
    const outer = document.createElement('div');
    outer.className = 'fi-body-outer';
    const inner = document.createElement('div');
    inner.className = 'fi-body-inner';
    const content = document.createElement('div');
    content.className = 'fi-body-content';
    inner.appendChild(content);

    for (const p of fd.params) {
      if (p.type === 'range') {
        const wrap = document.createElement('div');
        wrap.className = 'range-wrap fp-row';
        const hdr2 = document.createElement('div');
        hdr2.className = 'range-header';
        const pLbl = document.createElement('span');
        pLbl.className = 'ctrl-label';
        pLbl.textContent = p.label;
        const pVal = document.createElement('span');
        pVal.className = 'range-val fi-val';
        pVal.textContent = p.fmt(p.def);
        hdr2.appendChild(pLbl);
        hdr2.appendChild(pVal);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = p.min;
        slider.max = p.max;
        slider.step = p.step;
        slider.value = p.def;
        slider.dataset.fiKey = p.key;
        if (p.stateKey) slider.dataset.fiStatekey = p.stateKey;
        slider._fiDef = p.def;
        slider._fiFmt = p.fmt;

        slider.addEventListener('pointerdown', () => {
          pushUndo();
          if (!cb.checked) enableFilter(fd.id);
        });
        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          pVal.textContent = p.fmt(v);
          if (p.stateKey) {
            setScopedSetting(p.stateKey, slider.value);
          } else {
            const fp = getWritableFilterParams(fd.id);
            fp[p.key] = v;
          }
          repaintInteractive();
        });

        wrap.appendChild(hdr2);
        wrap.appendChild(slider);
        content.appendChild(wrap);
      } else if (p.type === 'seg') {
        const wrap = document.createElement('div');
        wrap.className = 'fp-row';
        const pLbl = document.createElement('div');
        pLbl.className = 'ctrl-label';
        pLbl.style.marginBottom = '4px';
        pLbl.textContent = p.label;
        const seg = document.createElement('div');
        seg.className = 'seg-control';
        seg.dataset.fiKey = p.key;
        if (p.stateKey) seg.dataset.fiStatekey = p.stateKey;
        seg._fiDef = p.def;

        for (const [optVal, optLabel] of p.opts) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'seg-btn' + (optVal === p.def ? ' active' : '');
          btn.textContent = optLabel;
          btn.dataset.val = optVal;
          btn.addEventListener('click', () => {
            pushUndo();
            if (!cb.checked) enableFilter(fd.id);
            seg
              .querySelectorAll('.seg-btn')
              .forEach((b) => b.classList.toggle('active', b === btn));
            if (p.stateKey) {
              setScopedSetting(p.stateKey, optVal);
            } else {
              const fp = getWritableFilterParams(fd.id);
              fp[p.key] = optVal;
            }
            repaintInteractive();
          });
          seg.appendChild(btn);
        }

        wrap.appendChild(pLbl);
        wrap.appendChild(seg);
        content.appendChild(wrap);
      }
    }

    outer.appendChild(inner);
    item.appendChild(outer);

    // ── Toggle filter on checkbox change ─────────────────────────────────
    cb.addEventListener('change', () => {
      toggleFilter(fd.id);
      if (cb.checked) item.classList.add('fi-open'); // auto-expand on enable
    });

    // ── Chevron click: expand/collapse params body ────────────────────────
    header.addEventListener('click', (e) => {
      if (e.target.closest('.fi-check-wrap')) return; // let checkbox handle it
      item.classList.toggle('fi-open');
    });

    const _g = FX_FILTER_GROUP[fd.id] || 'glitch';
    item.dataset.group = _g;
    if (collapsedFx.has(_g)) item.style.display = 'none';
    (_fxGroupItems[_g] = _fxGroupItems[_g] || []).push(item);
  }

  // Lay the items out under collapsible family headers (Pixel-perfect / Retro / Glitch)
  for (const g of FX_GROUP_ORDER) {
    const items = _fxGroupItems[g];
    if (!items || !items.length) continue;
    container.appendChild(makeFxGroupHeader(g, collapsedFx.has(g)));
    for (const it of items) container.appendChild(it);
  }
}
