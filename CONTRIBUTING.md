# Contributing to MugDump

## Setup

```bash
npm install
npm run dev        # Electron + Vite dev server (hot reload)
npm run dev:web    # browser only
```

Node 22 is the supported version (see `.nvmrc`).

## Before you commit

All work happens directly on `main`; the repository keeps no other branch.

```bash
npm run check      # ESLint + Prettier + type-check (tsc on JSDoc) + unit tests
```

`docs/` is the web build (`npm run build`, Vite): the GitHub Pages site **and** what the
desktop app loads. It is build output and is not committed; `npm start`, the end-to-end
scripts and the `dist:*` scripts rebuild it first. Static assets (icons, frames, the
social preview used by the README) live in `src/public/`.

Optional, slower checks:

```bash
npm run test:e2e             # web scenarios (Playwright, needs a Chromium: npx playwright install chromium)
npm run test:e2e:electron    # desktop scenarios (needs a display; `xvfb-run -a` on Linux servers)
```

For a refactoring that must not change what the user sees, `tests/e2e/visual/` captures
screenshots of 20 UI states plus an export of every effect from two builds and compares
them pixel for pixel (instructions at the top of `capture.mjs`).

## Where things live

| You want to… | Look in |
| --- | --- |
| change how saves are decoded or `.sta` savestates are found | `src/core/gbcam.js`, `src/core/savestate.js` (+ `tests/unit/`) |
| add or tweak a visual effect | `src/data/filter-defs.js` (controls + defaults), `src/render/effects/<id>.js` (pixels) and the registry in `src/render/effects/index.js` |
| add palettes | `src/data/palettes/` (`base.js` for curated sets, `extended.js` for packs) |
| change a panel or dialog | the matching module in `src/ui/` and the markup in `src/index.html` |
| add a native capability | `electron/ipc/*.js` (handler), `electron/preload.cjs` (bridge), `src/platform/web-api.js` (browser counterpart), `types/platform-api.d.ts` (contract) |
| remember something between sessions | add the key to `src/app/storage.js` and use its accessors |
| change export formats | `src/features/export.js`, `src/core/gif.js` |

Rules of thumb:

- `src/core/` must stay free of DOM and Electron imports: it runs in Node for the main
  process and for the tests.
- Platform differences go behind the `api` object from `src/platform/index.js`, never
  behind `typeof window.api` checks in UI code.
- `src/core/`, `src/platform/`, `electron/` and the tests are type-checked from JSDoc;
  keep their annotations accurate (`npm run typecheck`).
- Anything with pixels gets a unit test on synthetic data (`tests/fixtures/synthetic-sav.mjs`
  builds valid 128 KB saves from patterns, so no real photo or ROM is ever needed).

## Releasing

1. Bump `version` in `package.json` and add a CHANGELOG entry.
2. The version string in the app comes from `package.json` at build time.
3. `npm run dist:mac` / `dist:win` / `dist:linux` for installers. The packaged app contains
   only `electron/`, `src/core/`, `docs/` and `package.json`: everything the renderer
   needs is already bundled into `docs/`.

## Deploying the web app

Every push to `main` builds the web app and deploys it to GitHub Pages
(`.github/workflows/deploy-pages.yml`, Pages source: "GitHub Actions").
