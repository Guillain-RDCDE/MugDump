# Changelog

All notable changes to MugDump. MugDump is a fork of
[DMG DarkRoom](https://github.com/clickysteve/dmg-darkroom); versions below cover
the MugDump line.

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
