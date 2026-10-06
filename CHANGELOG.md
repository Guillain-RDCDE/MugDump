# Changelog

All notable changes to MugDump. MugDump is a fork of
[DMG DarkRoom](https://github.com/clickysteve/dmg-darkroom); versions below cover
the MugDump line.

## 0.11 — 2026-10-06
- **Architecture overhaul.** The renderer is now a set of ES modules under `src/`
  (core / data / app / render / ui / features / platform) built with Vite into `docs/`;
  the Electron app loads that same output, so the web and desktop copies can no
  longer drift apart. The 6 900-line `app.js` monolith and its duplicate are gone.
- **One decoder, one GIF encoder.** `src/core/` is shared by the browser, the Electron
  main process and the tests. GIFs are encoded with gifenc on both platforms, so the
  desktop app and the web app now produce identical files.
- **Desktop hardening.** Sandboxed renderer, IPC inputs validated in the main process,
  external links open in the system browser, Lospec is the only host the app will
  fetch from, and batch export can no longer write outside the chosen folder.
- **Tooling.** ESLint, Prettier, unit tests (`node:test`, with synthetic saves instead
  of real photos), Playwright smoke tests for web and desktop, and a GitHub Actions
  workflow that also checks `docs/` is up to date. The version is read from
  `package.json` at build time instead of being hand-copied.
- **Smaller modules.** Each visual effect is its own file under `src/render/effects/`
  (shared helpers for intensity blending and seeded noise), the stylesheet is split into
  19 partials imported in cascade order, effect actions are separated from the accordion
  DOM, every `localStorage` key lives in `src/app/storage.js`, and the `.gbcp` format is a
  pure, unit-tested module (`src/features/project-format.js`).
- **Type-checked contract.** `types/platform-api.d.ts` declares the platform API; `tsc`
  checks the core, platform, Electron and test code from their JSDoc (`npm run typecheck`).
- **End-to-end coverage.** Playwright scenarios drive exports, the GIF builder, presets,
  custom palettes, projects, dated albums and persistence in the browser, and the IPC
  bridge, savestate reading, SD-card safety checks and the network allow-list in Electron.
  A visual-regression tool (`tests/e2e/visual/`) compares screenshots and every effect's
  export between two builds.
- Fixed: the **Once** loop mode exported a GIF that still looped forever.
- Fixed: duplicating a GIF frame did not update the frame counter.
- Fixed: opening a project did not repaint per-photo settings until the next interaction.
- Fixed: exporting a single photo at a **custom size** crashed on an undefined width.
- Fixed: the second **Cancel** button of the Analogue Pocket dialog did nothing (its
  inline handler was blocked by the page's content-security policy).
- Removed the unreachable lightbox (replaced long ago by the solo view), the orphaned
  hide-empty toggle and other dead code; Linux desktop builds now look for the Pocket SD card under `/media` and `/mnt`.

## 0.10 — 2026-07-04
- **Search savestates by date** — the *Develop savestates into dated albums* flow now
  takes an optional date filter, so you only develop the rolls you want. Type a prefix
  (`2026`, `2026-07`, `2026-07-01`, `/` or `-`) or an inclusive range (`2026-07-01..2026-07-15`).
  The dates come straight from the savestate filenames, so it's an instant search over
  your whole card — no indexing.

## 0.9 — 2026-07-04
- **Develop savestates into dated albums** — pick several Analogue Pocket savestates
  (`.sta`) at once and get one archive with a **dated folder of PNGs per savestate**,
  each folder named from that savestate's timestamp. Each savestate is a self-contained
  roll, so the filesystem and timestamps do the sorting — no infinite-roll bookkeeping.
  On the web this is a single `.zip`; the desktop app writes the folders straight to a
  location you choose.

## 0.7 — 2026-06-17
- **Delete saves straight off the SD card** — every save in the Analogue Pocket
  picker now has an **✕**; one click (with a confirm) removes it from the card.
  Works in the desktop app and in Chrome/Edge on the web.
- The Pocket picker now tells you up front when your browser can't read the SD
  card (Firefox/Safari), instead of a misleading "no saves found".

## 0.6 — 2026-06-17
- Redesigned the welcome screen: cleaner single-action hero, lighter typography,
  pill button, an airy "Getting started" guide, and a square logo.
- The resizable preview now stays centred in its panel instead of pinned left.
- Fixed: changing palette while in solo view (or the lightbox) now updates the
  visible image immediately, not just the grid.

## 0.5 — 2026-06-17
- Effects are now grouped into three collapsible families — **Pixel-perfect**
  (open by default), **Retro display**, and **Glitch & corrupt** — so the clean
  pixel look is preserved by default and the destructive effects are tucked away.
  A dot marks a collapsed family that still has an active effect.
- Tweaking any of an effect's parameters now enables that effect (and the Effects
  section) automatically — no more silent sliders.
- Adjusting any tone/exposure/effects slider auto-ticks its "apply" box; the
  section reset un-ticks it.
- Border picker: hovering a frame shows a large live preview (colourised to your
  palette, over your current photo) so you can see it before clicking.

## 0.4 — 2026-06-17
- Added a complete **light theme** with a sun/moon toggle in the top-right; the
  choice is remembered.
- **Export All** button added to the grid header (next to Select All).
- The preview can be pinned (on by default) and resized (1×–6×, remembered).
- Tidier titlebar (just name + version) and a discreet link to the repo.

## 0.3 — 2026-06-17
- The **All Palettes** grid is now grouped by category, matching the picker menu,
  and each category can be collapsed (remembered) — e.g. hide Super Game Boy.
- Web batch export now produces a single **.zip** instead of dozens of separate
  downloads (JSZip is bundled locally so the page CSP no longer blocks it).
- Published the app as a web app on GitHub Pages.

## 0.2 — 2026-06-17
- Analogue Pocket SD scan is now near-instant (parallel drive probing + targeted
  folder scan instead of walking the whole card) with an animated loading spinner.
- Added a first-run onboarding guide on the welcome screen.
- Fixed broken border frames (wrong relative path) and made picking a frame enable
  the border immediately.

## 0.1 — 2026-06-17
- Initial MugDump release: forked DMG DarkRoom, rebranded throughout, new
  Game Boy-green eye/lens app icon, and a Windows installer.
