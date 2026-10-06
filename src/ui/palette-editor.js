import { renderToCanvas } from '../core/gbcam.js';
import { api } from '../platform/index.js';
import {
  loadCustomPalettes,
  refreshCustomPalettes,
  saveCustomPalettesToStorage,
} from '../app/palette-store.js';
import { state } from '../app/state.js';
import { sortByBrightness } from '../core/color.js';
import { encodeGbpFile, encodePalFile, parseGbpFile, parsePalFile } from '../core/palette-files.js';
import { openColorPicker } from './color-picker.js';
import { showToast } from './feedback.js';
import { batchImportPaletteFiles, exportPalettesJson, importPalettesJson } from './palette-io.js';
import { closePalettePicker, rebuildPalettePickerList, setPalette } from './palette-picker.js';

// ── Palette editor modal ──────────────────────────────────────────────────

let editingPaletteId = null; // null = new palette

const SHADE_LABELS = ['Lightest (0)', 'Light (1)', 'Dark (2)', 'Darkest (3)'];

// Apply an array of 4 hex colors to the open editor (pickers + hex inputs)
function applyColorsToEditor(colors) {
  const rows = document.querySelectorAll('#palette-color-pickers .pal-editor-row');
  colors.forEach((hex, i) => {
    if (!rows[i]) return;
    const picker = rows[i].querySelector('input[type=color]');
    const hexIn = rows[i].querySelector('input[type=text]');
    const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000';
    if (picker) picker.value = safe.toLowerCase();
    if (hexIn) hexIn.value = safe.toUpperCase();
  });
  updatePalettePreview();
}

export function openPaletteEditor(existingPalette = null) {
  editingPaletteId = existingPalette ? existingPalette.id : null;

  document.getElementById('palette-modal-title').textContent = existingPalette
    ? `Edit: ${existingPalette.name}`
    : 'New Palette';

  // Clear Lospec status
  const lospecStatus = document.getElementById('lospec-status');
  if (lospecStatus) lospecStatus.textContent = '';
  const lospecUrl = document.getElementById('palette-lospec-url');
  if (lospecUrl) lospecUrl.value = '';

  // Name
  document.getElementById('palette-name-input').value = existingPalette ? existingPalette.name : '';

  // Color pickers with paired hex text inputs
  const container = document.getElementById('palette-color-pickers');
  container.innerHTML = '';
  const colors = existingPalette
    ? existingPalette.colors
    : ['#FFFFFF', '#AAAAAA', '#555555', '#000000'];

  colors.forEach((color, i) => {
    const row = document.createElement('div');
    row.className = 'pal-editor-row';
    row.style.cssText = 'display:flex; align-items:center; gap:10px;';

    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px; color:var(--text-2); width:82px; flex-shrink:0;';
    label.textContent = SHADE_LABELS[i];

    // Hidden <input type="color"> for value storage + event compatibility
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = color.toLowerCase();
    picker.dataset.shade = i;
    picker.style.display = 'none';

    // Custom swatch button opens inline picker
    const swatchBtn = document.createElement('button');
    swatchBtn.type = 'button';
    swatchBtn.className = 'pal-color-swatch-btn';
    swatchBtn.style.background = color.toLowerCase();
    swatchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openColorPicker(swatchBtn, picker.value, (hex) => {
        picker.value = hex;
        swatchBtn.style.background = hex;
        hexInput.value = hex.toUpperCase();
        updatePalettePreview();
      });
    });

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = color.toUpperCase();
    hexInput.maxLength = 7;
    hexInput.placeholder = '#RRGGBB';
    hexInput.style.cssText =
      'width:80px; padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:12px; font-family:var(--font-mono); outline:none; -webkit-user-select:text; user-select:text;';

    // Sync hex input → picker + swatch + preview (only when valid)
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v.toLowerCase();
        swatchBtn.style.background = v.toLowerCase();
        updatePalettePreview();
      }
    });

    row.appendChild(label);
    row.appendChild(picker);
    row.appendChild(swatchBtn);
    row.appendChild(hexInput);
    container.appendChild(row);
  });

  // Delete button visibility
  const deleteBtn = document.getElementById('palette-modal-delete');
  deleteBtn.style.display = existingPalette && existingPalette.custom ? 'inline-flex' : 'none';

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
  return Array.from(document.querySelectorAll('#palette-color-pickers input[type=color]')).map(
    (p) => p.value,
  );
}

function updatePalettePreview() {
  const canvas = document.getElementById('palette-preview-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = getCurrentEditorColors();
  const previewPalette = { colors };

  // Use selected photo, or first non-empty photo; render at 2× into 256×224 canvas
  const idx =
    state.selectedIndex !== null ? state.selectedIndex : state.photos.findIndex((p) => !p.isEmpty);

  if (idx >= 0 && state.photos[idx] && !state.photos[idx].isEmpty) {
    renderToCanvas(ctx, state.photos[idx].pixels, previewPalette, 2);
  } else {
    ctx.fillStyle = colors[0] || '#FFFFFF';
    ctx.fillRect(0, 0, 256, 224);
  }
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

// ── Smart palette import (URL / hex values / Lospec / coolors) ──────────

async function importFromText(text) {
  const raw = text.trim();
  if (!raw) return;

  const statusEl = document.getElementById('lospec-status');
  function setStatus(msg, color = 'var(--text-3)') {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color;
    }
  }

  // Extract any 6-digit hex values from the input (handles coolors URLs, pasted lists, etc.)
  const hexMatches = [...raw.matchAll(/(?:#|%23)?([0-9a-fA-F]{6})(?:[^0-9a-fA-F]|$)/g)]
    .map((m) => '#' + m[1])
    .filter((c, i, a) => a.indexOf(c) === i); // deduplicate

  // If 2+ hex values present and it's not a Lospec URL, treat as direct hex import
  if (hexMatches.length >= 2 && !raw.toLowerCase().includes('lospec.com')) {
    const colors = sortByBrightness(hexMatches.slice(0, 4));
    applyColorsToEditor(colors);
    const src = raw.includes('coolors.co')
      ? 'coolors.co'
      : raw.includes('http')
        ? new URL(raw).hostname
        : 'hex values';
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
    if (!api.fetchJson) throw new Error('fetchJson not available');
    const data = await api.fetchJson(`https://lospec.com/palette-list/${slug}.json`);

    if (!Array.isArray(data.colors) || data.colors.length < 4) {
      setStatus(`Need 4 colors — palette only has ${data.colors?.length ?? 0}`, 'var(--yellow)');
      return;
    }

    const colors = sortByBrightness(
      data.colors.slice(0, 4).map((c) => (c.startsWith('#') ? c : '#' + c)),
    );

    const nameInput = document.getElementById('palette-name-input');
    if (nameInput && !nameInput.value.trim() && data.name) nameInput.value = data.name;

    applyColorsToEditor(colors);
    setStatus(
      `"${data.name}" imported${data.colors.length > 4 ? ` (first 4 of ${data.colors.length})` : ''}`,
      'var(--accent)',
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
    const i = customs.findIndex((p) => p.id === editingPaletteId);
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
  const customs = loadCustomPalettes().filter((p) => p.id !== editingPaletteId);
  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  closePaletteEditor();
  rebuildPalettePickerList();
  // Fall back to DMG if deleted palette was selected
  if (state.palette.id === editingPaletteId) setPalette('dmg');
  showToast('Palette deleted');
}

// ── Init ────────────────────────────────────────────────────────────────────

/** Wire the palette editor modal and the palette import/export buttons. */
export function setupPaletteEditor() {
  document.getElementById('btn-new-palette').addEventListener('click', () => {
    closePalettePicker();
    openPaletteEditor();
  });
  document.getElementById('palette-modal-close').addEventListener('click', closePaletteEditor);
  document.getElementById('palette-modal-cancel').addEventListener('click', closePaletteEditor);
  document.getElementById('palette-modal-save').addEventListener('click', savePaletteEditor);
  document
    .getElementById('palette-modal-delete')
    .addEventListener('click', deletePaletteFromEditor);

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
  const loadPalBtn = document.getElementById('btn-load-pal-file');
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
    const allJson = files.every((f) => f.name.toLowerCase().endsWith('.json'));
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
