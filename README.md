<p align="center">
  <img src="docs/icon.png" width="120" alt="MugDump">
</p>

# MugDump

**Dump and develop your Game Boy Camera mug shots.** Pull the photos off your
Game Boy Camera and turn them into PNGs and GIFs — palettes, effects, frames and all.

**[▶ Open the web app](https://guillain-rdcde.github.io/MugDump/)** — no install, runs in your browser. · **[Changelog](CHANGELOG.md)**

> ⚠️ **Reading the SD card directly (and deleting saves on it) only works in [Chrome](https://www.google.com/chrome/) or [Edge](https://www.microsoft.com/edge)** — it relies on the File System Access API, which Firefox and Safari don't support. In those browsers, just **drag a `.sav` / `.srm` file onto the window** instead, or grab the desktop app. Everything else (palettes, effects, export) works in every browser.

> *mug shot* (the portraits the Game Boy Camera was made for) + *memory dump*
> (pulling those photos out of the cartridge) = **MugDump**.

---

## 🟢 Beginner — "I just want my photos"

Four steps, nothing technical:

1. **On your Analogue Pocket:** open the Game Boy Camera, then create a **Save State** — *Memories › Create a Save State*.
2. **Pop the SD card** into your computer.
3. **Open MugDump** → click **Analogue Pocket…** → pick your save. *(In the web app, use **Chrome** or **Edge** — see the note above.)*
4. **Click a photo, choose a palette, hit Export.** 🎉

That's the whole thing. No files to hunt for, no settings to understand.

*No Analogue Pocket? You can also drag any `.sav` / `.srm` save straight onto the window.*

*Tidying up? In the SD-card picker, each save has an **✕** — one click (with a confirm) deletes it straight off the card.*

---

## 🔵 Pro — the full toolbox

Everything works **per-photo** or **globally** across your whole 30-photo roll, with undo and copy/paste of settings between photos.

**Loading**
- `.sav` / `.srm` (128 KB Game Boy Camera SRAM) — drag-and-drop or file picker
- **Analogue Pocket** SD detection (`Memories/Save States`, openFPGA `Saves/<core>`) — Chrome/Edge or desktop app
- Delete saves off the SD card from the picker (per-save **✕**, with confirm)
- Save & reload your work as a `.gbcp` project

**Palettes**
- 100+ palettes — DMG, GBC, SGB and Lospec community packs, grouped by category
- Custom palette editor with `.pal` / `.gbp` import / export, favourites, random picker

**Effects & tone**
- CRT, LCD grid, halftone, dot-matrix, phosphor glow, chromatic aberration, vignette,
  noise, VHS ghosting, dithering, pixel-sort, glitch — each with its own controls
- Brightness, contrast, split toning

**Border frames**
- 21 authentic Game Boy Camera frames, recoloured to match your palette

**Export**
- Batch **PNG** at any scale · animated **GIF** builder (reorder, per-frame palette, loop/bounce) · 30-photo **contact sheet**

### Keyboard shortcuts

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `←` / `→` | Prev / next photo | `R` / `L` | Rotate cw / ccw |
| `G` / `S` | Grid / solo view | `H` / `V` | Flip horizontal / vertical |
| `F` | Fullscreen presentation | `P` | Before/after preview |
| `Ctrl/Cmd+Z` | Undo | `Ctrl/Cmd+C` · `+V` | Copy / paste settings |
| `Ctrl/Cmd+A` | Select all | `-` / `+` | Prev / next favourite palette |

### Run it locally

Desktop app (Electron):

```bash
npm install
npm start
```

Build installers (output in `dist/`):

```bash
npm run build:win     # Windows (NSIS)
npm run build:mac     # macOS (dmg)
npm run build:linux   # Linux (AppImage)
```

The same code also runs as a static web app — just serve the `docs/` folder.

### How it works

Game Boy Camera SRAM is exactly 128 KB. Photos start at offset `0x2000`, in 30 slots
of `0x1000` bytes; each is a 128×112 image stored as 2-bits-per-pixel Game Boy tiles
(16×14 tiles, 16 bytes each). Every pixel is a value 0–3 mapped onto the four colours
of your palette. `.srm` files are the same SRAM under RetroArch's name.

Decoder: [`renderer/js/gbcam.js`](renderer/js/gbcam.js) · editor/UI:
[`renderer/js/app.js`](renderer/js/app.js). The desktop shell ([`main.js`](main.js)) and
the browser shim ([`docs/js/web-api.js`](docs/js/web-api.js)) expose the same `window.api`,
so the app code is identical on desktop and web.

---

<sub>A fork of [DMG DarkRoom](https://github.com/clickysteve/dmg-darkroom) by clickysteve. SRAM format research: [AntonioND/gbcam2png](https://github.com/AntonioND/gbcam2png) & the [Game Boy Camera Club](https://gameboycameraclub.com). Palettes: [The Cutting Room Floor](https://tcrf.net/Notes:Game_Boy_Color_Bootstrap_ROM) and [Lospec](https://lospec.com). Border frames: [RomanObaraz/gb-cam-lab](https://github.com/RomanObaraz/gb-cam-lab).</sub>
