const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── GB Camera 2bpp preview decoder ─────────────────────────────────────────
// Inline port of the decode logic from renderer/js/gbcam.js (Node-safe, no DOM).
// Returns a plain Array of pixel indices (0–3, length 14336) for the first
// non-empty photo in the given save file, or null if decoding fails / all empty.

function decodeFirstPhotoPreview(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length !== 131072) return null;

    const PHOTO_DATA_OFFSET = 0x2000;
    const SLOT_SIZE         = 0x1000;
    const BYTES_PER_PHOTO   = 3584;   // 224 tiles × 16 bytes
    const PHOTO_WIDTH       = 128;
    const PHOTO_HEIGHT      = 112;
    const TILES_WIDE        = 16;
    const TILES_TALL        = 14;
    const BYTES_PER_TILE    = 16;

    function isEmpty(idx) {
      const off = PHOTO_DATA_OFFSET + idx * SLOT_SIZE;
      const freq = new Uint32Array(256);
      for (let i = 0; i < BYTES_PER_PHOTO; i++) freq[buf[off + i]]++;
      return Math.max(...freq) / BYTES_PER_PHOTO > 0.96;
    }

    function decode(idx) {
      const photoOff = PHOTO_DATA_OFFSET + idx * SLOT_SIZE;
      const pixels   = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT);
      for (let tr = 0; tr < TILES_TALL; tr++) {
        for (let tc = 0; tc < TILES_WIDE; tc++) {
          const tOff = photoOff + (tr * TILES_WIDE + tc) * BYTES_PER_TILE;
          for (let row = 0; row < 8; row++) {
            const lo = buf[tOff + row * 2];
            const hi = buf[tOff + row * 2 + 1];
            for (let col = 0; col < 8; col++) {
              const bit = 7 - col;
              pixels[(tr * 8 + row) * PHOTO_WIDTH + tc * 8 + col] =
                ((hi >> bit) & 1) << 1 | ((lo >> bit) & 1);
            }
          }
        }
      }
      return pixels;
    }

    for (let i = 0; i < 30; i++) {
      if (!isEmpty(i)) return Array.from(decode(i));
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Window ────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#111113',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Menu ───────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open .sav File…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu-open-sav'),
        },
        {
          label: 'Open from Analogue Pocket…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow.webContents.send('menu-open-pocket'),
        },
        { type: 'separator' },
        {
          label: 'Export All Photos…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow.webContents.send('menu-export-all'),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC: Open .sav ─────────────────────────────────────────────────────────

ipcMain.handle('open-sav-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Game Boy Camera .sav file',
    filters: [
      { name: 'Game Boy Camera Save', extensions: ['sav', 'SAV', 'srm', 'SRM'] },
      { name: 'All files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) return null;

  const filePath = filePaths[0];
  const buffer = fs.readFileSync(filePath);

  // Validate: GB Camera SRAM is always 128KB
  if (buffer.length !== 131072) {
    return { error: `Unexpected file size: ${buffer.length} bytes (expected 131072). This might not be a GB Camera save.`, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), name: path.basename(filePath) };
  }

  return {
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    name: path.basename(filePath),
    path: filePath,
  };
});

// ─── IPC: Detect Analogue Pocket SD card ─────────────────────────────────

ipcMain.handle('detect-pocket', async () => {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return { saves: [] };
  }

  const volumeRoots = [];

  if (process.platform === 'darwin') {
    try {
      const volumes = fs.readdirSync('/Volumes').filter(v => !v.startsWith('.'));
      for (const vol of volumes) {
        volumeRoots.push(path.join('/Volumes', vol));
      }
    } catch (_) {}
  } else if (process.platform === 'win32') {
    for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
      volumeRoots.push(`${letter}:\\`);
    }
  }

  // Recursively collect 128KB .sav files up to a given depth
  function collectSavFiles(dir, volumeName, out, depth = 0) {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectSavFiles(fullPath, volumeName, out, depth + 1);
      } else if (['sav','srm'].includes(entry.name.toLowerCase().split('.').pop())) {
        try {
          if (fs.statSync(fullPath).size === 131072) {
            out.push({ path: fullPath, name: entry.name, volume: volumeName });
          }
        } catch (_) {}
      }
    }
  }

  const saves = [];

  for (const root of volumeRoots) {
    const volume = path.basename(root);

    // Identify as Analogue Pocket SD card:
    // Must have Assets/ (present on all AP cards) OR Memories/ (built-in core saves)
    const hasAssets   = fs.existsSync(path.join(root, 'Assets'));
    const hasMemories = fs.existsSync(path.join(root, 'Memories'));
    const hasSaves    = fs.existsSync(path.join(root, 'Saves'));

    if (!hasAssets && !hasMemories) continue;

    // ── Primary: Memories/Save States/ (AP built-in cores — "Memories" UI) ──
    // The AP stores SRAM saves here when using Memories > Save States
    if (hasMemories) {
      const saveStatesDir = path.join(root, 'Memories', 'Save States');
      if (fs.existsSync(saveStatesDir)) {
        collectSavFiles(saveStatesDir, volume, saves);
      }
      // Also check the Memories root itself in case of a flat layout
      collectSavFiles(path.join(root, 'Memories'), volume, saves, 0);
    }

    // ── Fallback: Saves/{gb,gbc,…}/ (openFPGA cores) ──
    if (hasSaves) {
      for (const dir of ['gb', 'gbc', 'Game Boy', 'GameBoy', 'Analogue.gb', 'Analogue.gbc']) {
        const savesDir = path.join(root, 'Saves', dir);
        if (fs.existsSync(savesDir)) {
          collectSavFiles(savesDir, volume, saves);
        }
      }
    }
  }

  // Deduplicate by path (Memories root scan + Save States scan may overlap)
  const seen = new Set();
  const unique = saves.filter(s => { if (seen.has(s.path)) return false; seen.add(s.path); return true; });

  // Attach a preview (first non-empty photo, pixel indices 0–3) to each save
  for (const save of unique) {
    save.previewPixels = decodeFirstPhotoPreview(save.path);
  }

  return { saves: unique };
});

ipcMain.handle('read-file', async (_event, saveObj) => {
  // saveObj may be a string (legacy) or { path } object
  const filePath = typeof saveObj === 'string' ? saveObj : saveObj.path;
  try {
    const buffer = fs.readFileSync(filePath);
    return {
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      name: path.basename(filePath),
      path: filePath,
    };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── IPC: Save PNG ──────────────────────────────────────────────────────────

ipcMain.handle('save-png', async (_event, dataUrl, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Photo as PNG',
    defaultPath: defaultName,
    filters: [{ name: 'PNG Images', extensions: ['png'] }],
  });

  if (canceled || !filePath) return null;

  // dataUrl is "data:image/png;base64,..."
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

// ─── IPC: Save GIF ──────────────────────────────────────────────────────────
// Receives: { frames: [{indices: number[], palette: number[][], width, height}], delay, scale }
// Uses omggif (CommonJS) to encode the GIF in the main process

ipcMain.handle('save-gif', async (_event, options) => {
  const { frames, delay, scale, loop, defaultName } = options;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Animated GIF',
    defaultPath: defaultName || 'gbcam-animation.gif',
    filters: [{ name: 'GIF Images', extensions: ['gif'] }],
  });

  if (canceled || !filePath) return null;

  try {
    const gifBuffer = encodeGif(frames, delay, scale, loop);
    fs.writeFileSync(filePath, gifBuffer);
    return filePath;
  } catch (e) {
    return { error: e.message };
  }
});

// ─── IPC: Save batch PNGs ───────────────────────────────────────────────────

ipcMain.handle('save-png-batch', async (_event, photos) => {
  // photos: [{ dataUrl, name }]
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose folder for batch export',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (canceled || filePaths.length === 0) return null;
  const dir = filePaths[0];

  for (const { dataUrl, name } of photos) {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(dir, name), Buffer.from(base64, 'base64'));
  }

  return { dir, count: photos.length };
});

// ─── IPC: Export raw .sav ───────────────────────────────────────────────────

ipcMain.handle('export-sav', async (_event, { buffer, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export .sav file',
    defaultPath: defaultName,
    filters: [{ name: 'GB Camera Save', extensions: ['sav', 'SAV'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return path.basename(filePath);
});

// ─── IPC: Save project (.gbcp) ──────────────────────────────────────────────

ipcMain.handle('save-project', async (_event, { json, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save DMG DarkRoom Project',
    defaultPath: defaultName,
    filters: [{ name: 'GB Camera Project', extensions: ['gbcp'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, json, 'utf8');
  return path.basename(filePath);
});

// ─── IPC: Open project (.gbcp) ──────────────────────────────────────────────

ipcMain.handle('open-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open DMG DarkRoom Project',
    filters: [{ name: 'GB Camera Project', extensions: ['gbcp'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;
  try {
    const json = fs.readFileSync(filePaths[0], 'utf8');
    return { json, name: path.basename(filePaths[0]) };
  } catch (e) {
    return { error: e.message };
  }
});

// ─── IPC: Reveal in Finder ──────────────────────────────────────────────────

ipcMain.handle('reveal-in-finder', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ─── IPC: Fetch JSON (for Lospec palette import) ─────────────────────────────
// Fetched in main process so it bypasses renderer CSP and CORS restrictions.

ipcMain.handle('fetch-json', async (_event, url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

// ─── GIF Encoder ────────────────────────────────────────────────────────────

function scaleIndices(indices, width, height, scale) {
  if (scale === 1) return indices;
  const sw = width * scale;
  const sh = height * scale;
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = indices[y * width + x];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          out[(y * scale + dy) * sw + (x * scale + dx)] = val;
        }
      }
    }
  }
  return out;
}

function encodeGif(frames, delayMs, scale, loop) {
  const { GifWriter } = require('omggif');

  const width = frames[0].width * scale;
  const height = frames[0].height * scale;
  const delayCs = Math.max(1, Math.round(delayMs / 10)); // centiseconds

  // loop: 'infinite' or 'bounce' → repeat forever (0); 'once' → no Netscape extension
  const gwOpts = (loop === 'once') ? {} : { loop: 0 };

  // Allocate a buffer large enough (frames × pixels × worst-case LZW expansion)
  const bufSize = width * height * frames.length * 2 + 100000;
  const buf = Buffer.alloc(bufSize);
  const gw = new GifWriter(buf, width, height, gwOpts);

  for (const frame of frames) {
    const scaled = scaleIndices(new Uint8Array(frame.indices), frame.width, frame.height, scale);
    // omggif expects palette as [0xRRGGBB, ...]
    const palette = frame.palette.map(([r, g, b]) => (r << 16) | (g << 8) | b);
    // Pad palette to power of 2 (minimum 4 entries for 2-bit)
    while (palette.length < 4) palette.push(0);

    gw.addFrame(0, 0, width, height, scaled, {
      palette,
      delay: delayCs,
      disposal: 2,
    });
  }

  return buf.slice(0, gw.end());
}
