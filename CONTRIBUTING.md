# Contributing to MugDump

## Setup

```bash
npm install
npm run dev        # Electron + Vite dev server (hot reload)
npm run dev:web    # browser only
```

Node 22 is the supported version (see `.nvmrc`).

## Before you commit

```bash
npm run check      # ESLint + Prettier + unit tests
npm run build      # regenerates docs/ — commit it with your change
```

`docs/` is the GitHub Pages site **and** what the desktop app loads. It is generated
from `src/` by Vite and committed on purpose; CI fails if it is out of date. Never edit
files under `docs/` by hand.

Optional, slower checks:

```bash
npm run test:e2e             # web smoke test (Playwright, needs a Chromium: npx playwright install chromium)
npm run test:e2e:electron    # desktop smoke test (needs a display; `xvfb-run -a` on Linux servers)
```

## Where things live

| You want to… | Look in |
| --- | --- |
| change how saves are decoded or `.sta` savestates are found | `src/core/gbcam.js`, `src/core/savestate.js` (+ `tests/unit/`) |
| add or tweak a visual effect | `src/data/filter-defs.js` (controls + defaults) and `src/render/effects.js` (pixels) |
| add palettes | `src/data/palettes/` (`base.js` for curated sets, `extended.js` for packs) |
| change a panel or dialog | the matching module in `src/ui/` and the markup in `src/index.html` |
| add a native capability | `electron/ipc/*.js` (handler), `electron/preload.cjs` (bridge), `src/platform/web-api.js` (browser counterpart), `src/platform/index.js` (contract) |
| change export formats | `src/features/export.js`, `src/core/gif.js` |

Rules of thumb:

- `src/core/` must stay free of DOM and Electron imports: it runs in Node for the main
  process and for the tests.
- Platform differences go behind the `api` object from `src/platform/index.js`, never
  behind `typeof window.api` checks in UI code.
- Anything with pixels gets a unit test on synthetic data (`tests/fixtures/synthetic-sav.mjs`
  builds valid 128 KB saves from patterns, so no real photo or ROM is ever needed).

## Releasing

1. Bump `version` in `package.json` and add a CHANGELOG entry.
2. `npm run build` and commit `docs/` — the version string in the app comes from
   `package.json` at build time.
3. `npm run dist:mac` / `dist:win` / `dist:linux` for installers.
