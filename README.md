# DMG DarkRoom

**Game Boy Camera companion app.** Load `.sav` files, browse your photos, apply palettes and darkroom effects, and export.

**Web app:** [dmgdarkroom.allmyfriendsarejpegs.com](https://dmgdarkroom.allmyfriendsarejpegs.com)

---

## Features

* **Load Game Boy Camera saves directly:** Supports `.sav` and `.srm` (RetroArch) formats — drag and drop or open from file. Also supports Analogue Pocket SD cards.
* **100+ colour palettes:** DMG, GBC, SGB, Lospec community palettes, plus a custom palette editor with `.pal`/`.gbp` import/export and favourites.
* **LoFi style effects:** CRT, LCD grid, halftone, dot matrix, phosphor glow, chromatic aberration, vignette, noise, VHS ghosting, scanline jitter, and more — each with granular per-filter controls.
* **Tone controls:** Brightness, contrast, and split toning (shadow/highlight colour with intensity and balance sliders).
* **Per-photo or global edits:** Apply palettes and effects to individual photos or across your entire roll at once, with copy/paste settings between photos.
* **GIF export:** Build animated GIFs from any combination of your 30 photos, with a drag-to-reorder frame strip, per-frame palette, bounce mode, and loop controls.
* **Batch PNG export:** Upscale and export individual, multiple, or all photos at once with your chosen palette and filters applied.
* **Contact sheet export:** All photos in a single image, great for sharing your whole roll at once.
* **Effect presets:** Save, load, export and import your favourite filter combinations as JSON files.
* **Fully free and open source — runs in your browser:** No installation needed, works at [dmgdarkroom.allmyfriendsarejpegs.com](https://dmgdarkroom.allmyfriendsarejpegs.com) — source available on [GitHub](https://github.com/clickysteve/dmg-darkroom).

---

## Usage

### Web app

Open [dmgdarkroom.allmyfriendsarejpegs.com](https://dmgdarkroom.allmyfriendsarejpegs.com) in Chrome or Edge (recommended — full File System Access API support). Firefox and Safari work with fallback file pickers.

### Desktop app (Electron)

```bash
npm install
npm start
```

---

## Technical notes

- Game Boy Camera SRAM: 128KB, photos at `0x2000`, 30 slots × 3584 bytes, 128×112px 2bpp
- Electron main process handles file I/O and GIF encoding via `omggif`
- Web version encodes GIFs via `gifenc`
- `docs/` is the GitHub Pages web app source — not symlinked, must be kept in sync with `renderer/` manually after edits

## Credits

SRAM format research: [AntonioND/gbcam2png](https://github.com/AntonioND/gbcam2png) and the Game Boy Camera community.

---

Made by [clickysteve](https://github.com/clickysteve) · [allmyfriendsarejpegs.com](https://allmyfriendsarejpegs.com)
