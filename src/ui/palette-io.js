import {
  loadCustomPalettes,
  refreshCustomPalettes,
  saveCustomPalettesToStorage,
} from '../app/palette-store.js';
import { sortByBrightness } from '../core/color.js';
import { parseGbpFile, parsePalFile } from '../core/palette-files.js';
import { showToast } from './feedback.js';
import { rebuildPalettePickerList } from './palette-picker.js';

// Batch-import multiple .pal/.gbp/.json files from the palette-bar Import button
export async function batchImportPaletteFiles(files) {
  const customs = loadCustomPalettes();
  let added = 0,
    skipped = 0;

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
          if (!p.colors.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) continue;
          customs.push({
            id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            name: p.name,
            colors: p.colors,
            custom: true,
          });
          added++;
        }
      } catch (_) {
        skipped++;
      }
    } else if (ext === 'pal' || ext === 'gbp') {
      try {
        const buf = await file.arrayBuffer();
        const colors = ext === 'gbp' ? parseGbpFile(buf) : parsePalFile(buf);
        if (!colors || colors.length < 4) {
          skipped++;
          continue;
        }
        const name = file.name.replace(/\.(pal|gbp)$/i, '');
        customs.push({
          id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          name,
          colors: sortByBrightness(colors),
          custom: true,
        });
        added++;
      } catch (_) {
        skipped++;
      }
    }
  }

  if (added === 0) {
    showToast('No valid palettes found');
    return;
  }

  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  rebuildPalettePickerList();
  showToast(
    `Imported ${added} palette${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}`,
  );
}

// ── Palette import / export ──────────────────────────────────────────────

export function exportPalettesJson() {
  const customs = loadCustomPalettes();
  if (customs.length === 0) {
    showToast('No custom palettes to export');
    return;
  }

  const json = JSON.stringify(
    customs.map(({ id, name, colors }) => ({ id, name, colors })),
    null,
    2,
  );
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gbcam-palettes.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${customs.length} palette${customs.length !== 1 ? 's' : ''}`);
}

export function importPalettesJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const incoming = JSON.parse(e.target.result);
      if (!Array.isArray(incoming)) throw new Error('Expected an array');

      const validated = incoming
        .filter(
          (p) =>
            typeof p.name === 'string' &&
            Array.isArray(p.colors) &&
            p.colors.length === 4 &&
            p.colors.every((c) => /^#[0-9a-fA-F]{6}$/.test(c)),
        )
        .map((p) => ({
          id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          name: p.name,
          colors: p.colors,
          custom: true,
        }));

      if (validated.length === 0) {
        showToast('No valid palettes found in file');
        return;
      }

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
