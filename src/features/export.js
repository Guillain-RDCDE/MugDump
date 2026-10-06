import { bounceSequence, encodeGif } from '../core/gif.js';
import { paletteToRGB } from '../core/color.js';
import { PALETTES } from '../data/palettes/index.js';
import { PHOTO_HEIGHT, PHOTO_WIDTH, parseSav } from '../core/gbcam.js';
import { api } from '../platform/index.js';
import { pickSaveFiles } from '../platform/pick-files.js';
import { getEffectiveSettings } from '../app/settings.js';
import { state } from '../app/state.js';
import { albumFolderName, dateQueryMatches } from '../core/albums.js';
import { coerceGbCamSave } from '../core/savestate.js';
import { renderPhotoComplete } from '../render/photo.js';
import { getExportDimensions } from '../ui/export-panel.js';
import { showToast } from '../ui/feedback.js';

// ── Export: single PNG ───────────────────────────────────────────────────────

export async function exportSinglePng() {
  const index = state.selectedIndex;
  if (index === null) return;
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;

  const scale =
    state.exportScale === 'custom'
      ? Math.max(
          1,
          Math.round(
            (parseInt(document.getElementById('custom-width')?.value) || 512) / PHOTO_WIDTH,
          ),
        )
      : state.exportScale;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const effExp = getEffectiveSettings(index);
  renderPhotoComplete(ctx, photo, effExp, scale, index, { forExport: true });

  const dataUrl = canvas.toDataURL('image/png');
  const filterTag = effExp.activeFilters.size > 0 ? `_${[...effExp.activeFilters].join('+')}` : '';
  const scaleTag =
    state.exportScale === 'custom' ? `${getExportDimensions().width}px` : `${state.exportScale}x`;
  const defaultName = `gbcam_${String(index + 1).padStart(2, '0')}_${effExp.palette.id}_${scaleTag}${filterTag}.png`;

  const saved = await api.savePng(dataUrl, defaultName);
  if (saved) showToast(`Saved: ${typeof saved === 'string' ? saved.split('/').pop() : saved}`);
}

// ── Export: batch PNG ────────────────────────────────────────────────────────

export async function exportBatchPng() {
  const photos = state.photos.filter((p) => !p.isEmpty);
  if (photos.length === 0) {
    showToast('No photos to export');
    return;
  }

  const { width } = getExportDimensions();
  const scaleTag = state.exportScale === 'custom' ? `${width}px` : `${state.exportScale}x`;
  const batch = [];

  const batchScale =
    state.exportScale === 'custom'
      ? Math.max(1, Math.round(width / PHOTO_WIDTH))
      : state.exportScale;

  for (const photo of photos) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const effBatch = getEffectiveSettings(photo.index);
    renderPhotoComplete(ctx, photo, effBatch, batchScale, photo.index, { forExport: true });
    const dataUrl = canvas.toDataURL('image/png');
    const batchFilterTag =
      effBatch.activeFilters.size > 0 ? `_${[...effBatch.activeFilters].join('+')}` : '';
    const name = `gbcam_${String(photo.index + 1).padStart(2, '0')}_${effBatch.palette.id}_${scaleTag}${batchFilterTag}.png`;
    batch.push({ dataUrl, name });
  }

  const result = await api.savePngBatch(batch);
  if (result) showToast(`Exported ${result.count} photos`);
}

// ── Export: dated albums from savestates ─────────────────────────────────────
// Pick N .sta / .sav files → a dated sub-folder per savestate (folder named from
// the savestate's timestamp), each holding its photos as PNG. Each savestate is a
// self-contained roll, so the filesystem + timestamps do the sorting.

export async function exportSavestateAlbums() {
  const all = await pickSaveFiles();
  if (!all.length) return;

  const query = (document.getElementById('album-date-filter')?.value || '').trim();
  const files = query ? all.filter((f) => dateQueryMatches(f.name, query)) : all;
  if (query && !files.length) {
    showToast(`No savestates match "${query}"`);
    return;
  }

  const eff = getEffectiveSettings(-1); // neutral: global palette / settings, no per-photo overrides
  const { width } = getExportDimensions();
  const scale =
    state.exportScale === 'custom'
      ? Math.max(1, Math.round(width / PHOTO_WIDTH))
      : state.exportScale;

  showToast(`Developing ${files.length} file${files.length !== 1 ? 's' : ''}…`);
  await new Promise((r) => setTimeout(r, 0)); // let the toast paint before the heavy loop

  const used = new Set();
  const batch = [];
  let albums = 0,
    skipped = 0;

  for (const file of files) {
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch {
      skipped++;
      continue;
    }
    const cam = coerceGbCamSave(buffer);
    if (!cam) {
      skipped++;
      continue;
    }
    const nonEmpty = parseSav(cam).photos.filter((p) => !p.isEmpty);
    if (!nonEmpty.length) {
      skipped++;
      continue;
    }

    const folder = albumFolderName(file.name, used);
    albums++;
    nonEmpty.forEach((photo, i) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      renderPhotoComplete(ctx, photo, eff, scale, photo.index, { forExport: true });
      batch.push({
        dataUrl: canvas.toDataURL('image/png'),
        name: `${folder}/${folder}_${String(i + 1).padStart(2, '0')}.png`,
      });
    });
  }

  if (!batch.length) {
    showToast('No Game Boy Camera photos found in those files');
    return;
  }

  const result = await api.savePngBatch(batch, 'mugdump-albums.zip');
  if (result) {
    showToast(
      `${batch.length} photo${batch.length !== 1 ? 's' : ''} in ${albums} dated album${albums !== 1 ? 's' : ''}` +
        (skipped ? ` (${skipped} skipped)` : ''),
    );
  }
}

export async function exportGif() {
  if (state.gifFrameOrder.length === 0) {
    showToast('Add frames first');
    return;
  }

  try {
    // Resolve numeric scale (custom mode → pixel ratio)
    const scale =
      state.exportScale === 'custom'
        ? Math.max(
            1,
            Math.round(
              (parseInt(document.getElementById('custom-width')?.value) || 512) / PHOTO_WIDTH,
            ),
          )
        : state.exportScale;

    // Frame sequence from gifFrameOrder — ping-pong when bouncing
    const sequence =
      state.gifLoop === 'bounce' ? bounceSequence(state.gifFrameOrder) : state.gifFrameOrder;

    const frames = [];

    for (const frame of sequence) {
      const photo = state.photos[frame.photoIndex];
      if (!photo || photo.isEmpty) continue;
      // Per-frame override → per-photo effective palette → global palette
      const eff = getEffectiveSettings(frame.photoIndex);
      const pal = (frame.paletteId && PALETTES[frame.paletteId]) || eff.palette;
      frames.push({
        indices: Array.from(photo.pixels),
        palette: paletteToRGB(pal),
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
      });
    }

    if (frames.length === 0) {
      showToast('No valid frames');
      return;
    }

    const loopTag = state.gifLoop !== 'infinite' ? `_${state.gifLoop}` : '';
    const defaultName = `mugdump_anim_${scale}x${loopTag}.gif`;

    const bytes = encodeGif(frames, { delay: state.gifDelay, scale, loop: state.gifLoop });
    const result = await api.saveGif({ bytes, defaultName });

    if (!result) return; // user canceled save dialog
    if (result.error) {
      showToast(`GIF error: ${result.error}`);
      return;
    }

    const fLabel = `${frames.length} frame${frames.length !== 1 ? 's' : ''}`;
    const lLabel =
      state.gifLoop === 'once' ? '· once' : state.gifLoop === 'bounce' ? '· bounce' : '';
    showToast(`GIF saved (${fLabel}${lLabel ? ' ' + lLabel : ''})`);
  } catch (e) {
    console.error('[exportGif]', e);
    showToast(`Export failed: ${e.message}`);
  }
}

// ── Export: raw .sav file ──────────────────────────────────────────────────

export async function exportSav() {
  if (!state.sav) return;
  const defaultName = state.filename || 'GBCAMERA.sav';
  const result = await api.exportSav(state.sav.buffer, defaultName);
  if (result) showToast(`Saved: ${result}`);
}

// ── Contact sheet export ──────────────────────────────────────────────────────

export async function exportContactSheet() {
  const filled = state.photos.filter((p) => !p.isEmpty);
  if (filled.length === 0) {
    showToast('No photos to export');
    return;
  }

  // Use 160×144 cells so bordered and non-bordered photos share the same grid.
  // Non-bordered photos are centred (black fill fills the border area).
  const SHEET_SCALE = 4;
  const cols = Math.min(filled.length, 5);
  const rows = Math.ceil(filled.length / cols);
  const CELL = 160 * SHEET_SCALE; // 640 px wide per cell
  const CELLH = 144 * SHEET_SCALE; // 576 px tall
  const GAP = 8;
  const PAD = 16;
  const LABEL = 18; // px for photo number below each cell

  const sheetW = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const sheetH = PAD * 2 + rows * (CELLH + LABEL + GAP) - GAP;

  const sheet = document.createElement('canvas');
  sheet.width = sheetW;
  sheet.height = sheetH;
  const sc = sheet.getContext('2d');

  // Background
  sc.fillStyle = '#111113';
  sc.fillRect(0, 0, sheetW, sheetH);

  for (let i = 0; i < filled.length; i++) {
    const photo = filled[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL + GAP);
    const y = PAD + row * (CELLH + LABEL + GAP);

    // Render photo (with border if any) + filters + tone
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d');
    const effSheet = getEffectiveSettings(photo.index);
    renderPhotoComplete(tctx, photo, effSheet, SHEET_SCALE, photo.index, { forExport: true });

    // Black fill for cell, then centre the rendered photo (non-bordered = centred in 160×144 slot)
    sc.fillStyle = '#000';
    sc.fillRect(x, y, CELL, CELLH);
    const offX = Math.floor((CELL - tmp.width) / 2);
    const offY = Math.floor((CELLH - tmp.height) / 2);
    sc.drawImage(tmp, x + offX, y + offY);

    // Photo number label
    sc.fillStyle = 'rgba(255,255,255,0.45)';
    sc.font = '11px ui-monospace, monospace';
    sc.textAlign = 'center';
    sc.fillText(`${photo.index + 1}`, x + CELL / 2, y + CELLH + 13);
  }

  const dataUrl = sheet.toDataURL('image/png');
  const name = `gbcam_contact_${state.palette.id}.png`;

  if (api.savePng) {
    const saved = await api.savePng(dataUrl, name);
    if (saved) showToast(`Contact sheet saved`);
  } else {
    const a = Object.assign(document.createElement('a'), { href: dataUrl, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Contact sheet downloaded');
  }
}
