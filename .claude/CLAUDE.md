# MugDump — notes for Claude

Project memory. Read first; keep it short and current.

## What this is

Game Boy Camera photo tool: reads 128 KB `.sav`/`.srm` saves and Analogue Pocket `.sta`
savestates, applies palettes/effects/frames, exports PNG/GIF. One source tree (`src/`)
serves the web app (GitHub Pages) and the Electron desktop app. Fork of dmg-darkroom;
MugDump-specific work is documented in README and CHANGELOG.

## Git rules

- **Work on `main` only. No feature branches.** Commit directly on `main` and push.
- Author identity must be `Guillain d'Erceville <167749917+Guillain-RDCDE@users.noreply.github.com>`
  (check `git config user.name` / `user.email` before the first commit of a session).
  The former civil name and the old personal e-mail must never appear anywhere public.
- Never commit `.gb`/`.gbc` ROMs or real photo saves; tests use synthetic saves
  (`tests/fixtures/synthetic-sav.mjs`).

## Layout (see README "Project layout")

- `src/core/` pure logic, no DOM/Electron — decoder, `.sta` coercion, GIF, colours, palette files.
- `src/data/` palettes, border frames, effect definitions. `src/app/` state, settings, undo,
  storage keys (`storage.js`), file loading. `src/render/` canvas pipeline; one effect per file
  in `src/render/effects/` with a registry. `src/ui/` one module per panel/widget.
  `src/features/` exports and `.gbcp` projects (`project-format.js` is the pure codec).
  `src/platform/` the `api` object (browser impl or Electron preload); contract in
  `types/platform-api.d.ts`.
- `electron/` main (ESM), `preload.cjs`, `ipc/` per concern. Renderer is sandboxed.
- `docs/` is **generated** by `npm run build` (Vite) and committed: it is the Pages site and
  what Electron loads. Never edit by hand; rebuild and commit it with every change. CI fails
  if it is stale.

## Workflow

```
npm run check          # eslint + prettier + tsc (JSDoc) + unit tests — must pass
npm run build          # regenerate docs/ before committing
npm run test:e2e       # web scenarios (set PLAYWRIGHT_CHROMIUM_PATH in sandboxes)
xvfb-run -a npm run test:e2e:electron   # desktop scenarios on headless Linux
```

Visual regression for refactors: `tests/e2e/visual/capture.mjs` + `compare.mjs`
(20 UI states + one export per effect; instructions in the file header). Last full run:
all artefacts identical to the pre-refactor build (0.10).

## Conventions

- Prettier formats everything except Markdown, `docs/`, and `src/data/palettes/extended.js`.
- New persisted setting → add a key to `src/app/storage.js`; new native capability →
  `electron/ipc/*.js` + `preload.cjs` + `src/platform/web-api.js` + the `.d.ts`.
- Bump `version` in `package.json` + CHANGELOG entry; the UI reads the version at build time.
- Installers: `npm run dist:mac|win|linux` (AppImage step cannot run in the cloud sandbox;
  the unpacked app has been verified to contain only electron/, src/core/, docs/, package.json).

## Known leftovers

- GitHub Pages still serves the committed `docs/`; `.github/workflows/deploy-pages.yml` is
  ready (manual trigger) once the Pages source is switched to Actions.
- The `.sta` extraction is verified on synthetic savestates only (no real Pocket sample in repo).
- `src/ui/` is not type-checked yet (add to `tsconfig.json` "include" as JSDoc lands).
