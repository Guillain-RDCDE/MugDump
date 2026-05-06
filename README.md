# DMG DarkRoom

**Game Boy Camera companion app.** Load `.sav` files, browse your 30-slot photo library, apply palettes and darkroom effects, and export.

**Web app:** [dmgdarkroom.allmyfriendsarejpegs.com](https://dmgdarkroom.allmyfriendsarejpegs.com)

---

## Features

- **30-slot photo grid** with adjustable thumbnail size
- **100+ palettes** — DMG, GBC, SGB, community Lospec palettes, custom editor, `.pal`/`.gbp` import/export, favourites
- **Effects & Filters** — CRT, LCD, Dot Matrix, Phosphor Glow, Chromatic Aberration, Pixel Grid, Vignette, Halftone — all with granular per-filter controls
- **Tone controls** — brightness/contrast and split toning (shadow/highlight colour pickers, intensity, balance)
- **Animated GIF export** — frame strip, per-frame palette overrides, drag-to-reorder, frame duplication, bounce mode, configurable delay and loop settings
- **Per-photo transforms** — rotate (90°/180°/270°), flip horizontal/vertical
- **Keyboard navigation** — arrow keys, R/H/V for transforms, F for fullscreen
- **Fullscreen presentation mode**
- **Batch PNG export**, contact sheet export, `.sav` export, project file (`.gbcp`) save/load
- **Analogue Pocket support** — auto-detects SD card and lists compatible `.sav` files
- **Drag & drop** `.sav` files onto the window

## Usage

### Web app

Open [dmgdarkroom.allmyfriendsarejpegs.com](https://dmgdarkroom.allmyfriendsarejpegs.com) in Chrome or Edge (recommended — full File System Access API support). Firefox/Safari work with fallback file pickers; GIF export requires an internet connection to load the encoder.

### Desktop app (Electron)

```bash
npm install
npm start
```

## Technical notes

- Game Boy Camera SRAM: 128KB, photos at `0x2000`, 30 slots × 3584 bytes, 128×112px 2bpp
- Electron main process handles file I/O and GIF encoding via `omggif`
- Web version encodes GIFs via `gifenc` (loaded from CDN on demand)
- `docs/` is the GitHub Pages / web app source — not symlinked, must be kept in sync with `renderer/` manually after edits

## Credits

SRAM format research: [AntonioND/gbcam2png](https://github.com/AntonioND/gbcam2png) and the Game Boy Camera community.

---

Made by [clickysteve](https://github.com/clickysteve) · [allmyfriendsarejpegs.com](https://allmyfriendsarejpegs.com)
