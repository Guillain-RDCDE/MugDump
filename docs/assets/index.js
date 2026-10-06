(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled = function(promises$2) {
      return Promise.all(promises$2.map((p) => Promise.resolve(p).then((value$1) => ({
        status: "fulfilled",
        value: value$1
      }), (reason) => ({
        status: "rejected",
        reason
      }))));
    };
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled(deps.map((dep) => {
      dep = assetsURL(dep, importerUrl);
      if (dep in seen) return;
      seen[dep] = true;
      const isCss = dep.endsWith(".css");
      const cssSelector = isCss ? '[rel="stylesheet"]' : "";
      if (!!importerUrl) for (let i$1 = links.length - 1; i$1 >= 0; i$1--) {
        const link$1 = links[i$1];
        if (link$1.href === dep && (!isCss || link$1.rel === "stylesheet")) return;
      }
      else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) return;
      const link = document.createElement("link");
      link.rel = isCss ? "stylesheet" : scriptRel;
      if (!isCss) link.as = "script";
      link.crossOrigin = "";
      link.href = dep;
      if (cspNonce) link.setAttribute("nonce", cspNonce);
      document.head.appendChild(link);
      if (isCss) return new Promise((res, rej) => {
        link.addEventListener("load", res);
        link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
      });
    }));
  }
  function handlePreloadError(err$2) {
    const e$1 = new Event("vite:preloadError", { cancelable: true });
    e$1.payload = err$2;
    window.dispatchEvent(e$1);
    if (!e$1.defaultPrevented) throw err$2;
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const SAVE_FILE_ACCEPT = ".sav,.SAV,.srm,.SRM,.sta,.STA";
function pickSaveFiles() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), {
      type: "file",
      multiple: true,
      accept: SAVE_FILE_ACCEPT
    });
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}
const SRAM_SIZE$1 = 131072;
async function scanDirForSavFiles(dirHandle, volumeName, saves, depth = 0) {
  if (depth > 5) return;
  const scanDirs = /* @__PURE__ */ new Set([
    "memories",
    "save states",
    "saves",
    "gb",
    "gbc",
    "game boy",
    "gamegear",
    "analogue.gb",
    "analogue.gbc"
  ]);
  try {
    for await (const [name, handle] of dirHandle) {
      if (handle.kind === "directory") {
        if (scanDirs.has(name.toLowerCase())) {
          await scanDirForSavFiles(handle, volumeName, saves, depth + 1);
        }
      } else if (handle.kind === "file" && /\.(sav|srm)$/i.test(name)) {
        try {
          const file = await handle.getFile();
          if (file.size === SRAM_SIZE$1) {
            saves.push({
              name,
              handle,
              parent: dirHandle,
              volume: volumeName,
              path: `${volumeName}/${name}`
            });
          }
        } catch {
        }
      }
    }
  } catch {
  }
}
function triggerDownload(url, filename) {
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5e3);
  return filename;
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept });
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
function createWebApi() {
  return {
    async openSavFile() {
      if ("showOpenFilePicker" in window) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [
              {
                description: "Game Boy Camera Save / Savestate",
                accept: { "application/octet-stream": SAVE_FILE_ACCEPT.split(",") }
              }
            ],
            multiple: false
          });
          const file2 = await handle.getFile();
          return { buffer: await file2.arrayBuffer(), name: file2.name, path: null };
        } catch (e) {
          return e.name === "AbortError" ? null : { error: e.message };
        }
      }
      const file = await pickFile(SAVE_FILE_ACCEPT);
      if (!file) return null;
      return { buffer: await file.arrayBuffer(), name: file.name, path: null };
    },
    getPathForFile() {
      return null;
    },
    async detectPocket() {
      if (!("showDirectoryPicker" in window)) return { saves: [], unsupported: true };
      try {
        const root = await window.showDirectoryPicker({ mode: "read", startIn: "desktop" });
        const saves = [];
        await scanDirForSavFiles(root, root.name, saves);
        return { saves };
      } catch {
        return { saves: [] };
      }
    },
    async readFile(save) {
      try {
        const file = await save.handle.getFile();
        return { buffer: await file.arrayBuffer(), name: file.name, path: null };
      } catch (e) {
        return { error: e.message };
      }
    },
    // Write permission is requested lazily here (on the user's click) so the
    // initial directory pick can stay read-only.
    async deletePocketSave(save) {
      if (!save?.parent || typeof save.parent.removeEntry !== "function") {
        return { error: "This browser can't delete files. Try the desktop app." };
      }
      const ok = window.confirm(
        `Delete "${save.name}" from your SD card?

This permanently removes the file. This cannot be undone.`
      );
      if (!ok) return { canceled: true };
      try {
        if (save.parent.requestPermission) {
          const perm = await save.parent.requestPermission({ mode: "readwrite" });
          if (perm !== "granted") return { error: "Write permission was denied." };
        }
        await save.parent.removeEntry(save.name);
        return { deleted: true };
      } catch (e) {
        return { error: e.message };
      }
    },
    async savePng(dataUrl, filename) {
      triggerDownload(dataUrl, filename);
      return filename;
    },
    // `name` may include a "folder/" prefix — JSZip creates the sub-folders.
    async savePngBatch(photos, zipName = "mugdump-photos.zip") {
      const { default: JSZip } = await __vitePreload(async () => {
        const { default: JSZip2 } = await import("./jszip.min.js").then((n) => n.j);
        return { default: JSZip2 };
      }, true ? [] : void 0, import.meta.url);
      const zip = new JSZip();
      for (const { dataUrl, name } of photos)
        zip.file(name, dataUrl.split(",")[1], { base64: true });
      downloadBlob(await zip.generateAsync({ type: "blob" }), zipName);
      return { dir: ".", count: photos.length, zipped: true };
    },
    async saveGif({ bytes, defaultName }) {
      return downloadBlob(
        new Blob([bytes], { type: "image/gif" }),
        defaultName || "gbcam-animation.gif"
      );
    },
    async exportSav(buffer, defaultName) {
      return downloadBlob(new Blob([buffer], { type: "application/octet-stream" }), defaultName);
    },
    async saveProject(json, defaultName) {
      return downloadBlob(new Blob([json], { type: "application/json" }), defaultName);
    },
    async openProject() {
      const file = await pickFile(".gbcp");
      if (!file) return null;
      try {
        return { json: await file.text(), name: file.name };
      } catch (e) {
        return { error: e.message };
      }
    },
    async fetchJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    // No native menu bar on the web — these never fire.
    onMenuOpenSav() {
    },
    onMenuOpenPocket() {
    },
    onMenuExportAll() {
    }
  };
}
const isElectron = typeof window !== "undefined" && Boolean(window.api);
const api = isElectron ? window.api : createWebApi();
const STORAGE_KEYS = Object.freeze({
  customPalettes: "gbcam_custom_palettes",
  recentPalettes: "gbcam_recent_palettes",
  favPalettes: "gbcam_fav_palettes",
  lastSavPath: "gbcam_last_sav_path",
  sidebarCollapsed: "gbcam_sidebar_collapsed",
  paletteGridSize: "gbcam_pgrid_size",
  paletteGridCollapsed: "mugdump:pgrid:collapsed",
  effectGroupsCollapsed: "mugdump:fxgroups",
  sectionStates: "mugdump:section-states",
  previewPinned: "mugdump:previewPinned",
  previewScale: "mugdump:previewScale",
  theme: "mugdump:theme",
  presets: "mugdump:presets:v1"
});
function readString(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writeString(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
  }
}
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function paletteToRGB(palette) {
  return palette.colors.map(hexToRgb);
}
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p2, q2, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
      if (t < 1 / 2) return q2;
      if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
      return p2;
    };
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return "#" + [r, g, b].map(
    (x) => Math.round(x * 255).toString(16).padStart(2, "0")
  ).join("");
}
function perceivedBrightness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function sortByBrightness(colors) {
  return [...colors].sort((a, b) => perceivedBrightness(b) - perceivedBrightness(a));
}
const PHOTO_WIDTH = 128;
const PHOTO_HEIGHT = 112;
const PHOTO_COUNT = 30;
const SRAM_SIZE = 131072;
const TILE_PX = 8;
const BYTES_PER_TILE = 16;
const TILES_WIDE = PHOTO_WIDTH / TILE_PX;
const TILES_TALL = PHOTO_HEIGHT / TILE_PX;
const TILES_PER_PHOTO = TILES_WIDE * TILES_TALL;
const BYTES_PER_PHOTO = TILES_PER_PHOTO * BYTES_PER_TILE;
const SLOT_SIZE = 4096;
const PHOTO_DATA_OFFSET = 8192;
const EMPTY_THRESHOLD = 0.96;
const slotOffset = (photoIndex) => PHOTO_DATA_OFFSET + photoIndex * SLOT_SIZE;
function decodeTile(sav, offset, out, outOffset, stride) {
  for (let row = 0; row < 8; row++) {
    const lo = sav[offset + row * 2];
    const hi = sav[offset + row * 2 + 1];
    const rowStart = outOffset + row * stride;
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      out[rowStart + col] = (hi >> bit & 1) << 1 | lo >> bit & 1;
    }
  }
}
function decodePhoto(sav, photoIndex) {
  const base = slotOffset(photoIndex);
  const pixels = new Uint8Array(PHOTO_WIDTH * PHOTO_HEIGHT);
  for (let tileRow = 0; tileRow < TILES_TALL; tileRow++) {
    for (let tileCol = 0; tileCol < TILES_WIDE; tileCol++) {
      const tileIndex = tileRow * TILES_WIDE + tileCol;
      decodeTile(
        sav,
        base + tileIndex * BYTES_PER_TILE,
        pixels,
        tileRow * TILE_PX * PHOTO_WIDTH + tileCol * TILE_PX,
        PHOTO_WIDTH
      );
    }
  }
  return pixels;
}
function isPhotoEmpty(sav, photoIndex) {
  const offset = slotOffset(photoIndex);
  const freq = new Uint32Array(256);
  for (let i = 0; i < BYTES_PER_PHOTO; i++) freq[sav[offset + i]]++;
  let dominant = 0;
  for (let i = 0; i < 256; i++) if (freq[i] > dominant) dominant = freq[i];
  return dominant / BYTES_PER_PHOTO > EMPTY_THRESHOLD;
}
function parseSav(data) {
  const sav = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (sav.length !== SRAM_SIZE) {
    console.warn(`[GBCam] Unexpected SRAM size: ${sav.length} (expected ${SRAM_SIZE})`);
  }
  const photos = [];
  for (let i = 0; i < PHOTO_COUNT; i++) {
    const empty = isPhotoEmpty(sav, i);
    photos.push({ index: i, pixels: empty ? null : decodePhoto(sav, i), isEmpty: empty });
  }
  const activeCount = photos.filter((p) => !p.isEmpty).length;
  return { photos, activeCount, sav };
}
function decodeFirstPhoto(sav) {
  for (let i = 0; i < PHOTO_COUNT; i++) {
    if (!isPhotoEmpty(sav, i)) return decodePhoto(sav, i);
  }
  return null;
}
function renderToCanvas(ctx, pixels, palette, scale = 1) {
  const w = PHOTO_WIDTH * scale;
  const h = PHOTO_HEIGHT * scale;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  const rgb = palette.colors.map(hexToRgb);
  for (let y = 0; y < PHOTO_HEIGHT; y++) {
    for (let x = 0; x < PHOTO_WIDTH; x++) {
      const [r, g, b] = rgb[pixels[y * PHOTO_WIDTH + x]];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * w + (x * scale + dx)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
const BASE_PALETTES = {
  // ── GB Hardware ─────────────────────────────────────────────────────────────
  dmg: {
    id: "dmg",
    name: "DMG Green",
    group: "hardware",
    colors: ["#9BBC0F", "#8BAC0F", "#306230", "#0F380F"]
  },
  pocket: {
    id: "pocket",
    name: "GB Pocket",
    group: "hardware",
    colors: ["#C4CFA1", "#8B956D", "#4D533C", "#1F1F1F"]
  },
  light: {
    id: "light",
    name: "GB Light",
    group: "hardware",
    colors: ["#FFFFFF", "#B8D0C8", "#6B9080", "#1A2E2A"]
  },
  printer: {
    id: "printer",
    name: "GB Printer",
    group: "hardware",
    colors: ["#F8F8E8", "#C0C0A8", "#606060", "#101010"]
  },
  gbcam_gold: {
    id: "gbcam_gold",
    name: "Pocket Camera (JP)",
    group: "hardware",
    colors: ["#FFFFFF", "#FFCE00", "#9C6300", "#000000"]
  },
  gbcam_red: {
    id: "gbcam_red",
    name: "Game Boy Camera Gold (US)",
    group: "hardware",
    colors: ["#FFFFFF", "#FF8484", "#943A3A", "#000000"]
  },
  // ── GBC Official (Nintendo bootstrap ROM, BG palette) ──────────────────────
  // Button combo reference: hold at GBC startup while the logo displays.
  gbc_up: {
    id: "gbc_up",
    name: "GBC Brown (↑)",
    group: "gbc",
    colors: ["#FFFFFF", "#FFAD63", "#843100", "#000000"]
  },
  gbc_a_up: {
    id: "gbc_a_up",
    name: "GBC Red (A+↑)",
    group: "gbc",
    colors: ["#FFFFFF", "#FF8484", "#943A3A", "#000000"]
  },
  gbc_b_up: {
    id: "gbc_b_up",
    name: "GBC Tan (B+↑)",
    group: "gbc",
    colors: ["#FFE6C5", "#CE9C84", "#846B29", "#5A3108"]
  },
  gbc_left: {
    id: "gbc_left",
    name: "GBC Blue (←)",
    group: "gbc",
    colors: ["#FFFFFF", "#63A5FF", "#0000FF", "#000000"]
  },
  gbc_a_left: {
    id: "gbc_a_left",
    name: "GBC Indigo (A+←)",
    group: "gbc",
    colors: ["#FFFFFF", "#8C8CDE", "#52528C", "#000000"]
  },
  gbc_b_left: {
    id: "gbc_b_left",
    name: "GBC Gray (B+←)",
    group: "gbc",
    colors: ["#FFFFFF", "#A5A5A5", "#525252", "#000000"]
  },
  gbc_down: {
    id: "gbc_down",
    name: "GBC Pastel (↓)",
    group: "gbc",
    colors: ["#FFFFA5", "#FF9494", "#9494FF", "#000000"]
  },
  gbc_a_down: {
    id: "gbc_a_down",
    name: "GBC Fire (A+↓)",
    group: "gbc",
    colors: ["#FFFFFF", "#FFFF00", "#FF0000", "#000000"]
  },
  gbc_b_down: {
    id: "gbc_b_down",
    name: "GBC Gold (B+↓)",
    group: "gbc",
    colors: ["#FFFFFF", "#FFFF00", "#7B4A00", "#000000"]
  },
  gbc_right: {
    id: "gbc_right",
    name: "GBC Neon (→)",
    group: "gbc",
    colors: ["#FFFFFF", "#52FF00", "#FF4200", "#000000"]
  },
  gbc_a_right: {
    id: "gbc_a_right",
    name: "GBC Teal (A+→)",
    group: "gbc",
    colors: ["#FFFFFF", "#7BFF31", "#0063C5", "#000000"]
  },
  gbc_b_right: {
    id: "gbc_b_right",
    name: "GBC Dark (B+→)",
    group: "gbc",
    colors: ["#000000", "#008484", "#FFDE00", "#FFFFFF"]
  },
  // ── Community (lospec.com — verified hex values from API) ──────────────────
  // Colors sorted lightest → darkest (perceived luminance).
  // Credit: individual palette authors on lospec.com
  kirokaze: {
    id: "kirokaze",
    name: "Kirokaze Gameboy",
    group: "community",
    credit: "Kirokaze",
    creditUrl: "https://lospec.com/palette-list/kirokaze-gameboy",
    colors: ["#e2f3e4", "#94e344", "#46878f", "#332c50"]
  },
  ice_cream: {
    id: "ice_cream",
    name: "Ice Cream GB",
    group: "community",
    credit: "Kerrie Lake",
    creditUrl: "https://lospec.com/palette-list/ice-cream-gb",
    colors: ["#fff6d3", "#f9a875", "#eb6b6f", "#7c3f58"]
  },
  mist_gb: {
    id: "mist_gb",
    name: "Mist GB",
    group: "community",
    credit: "Kerrie Lake",
    creditUrl: "https://lospec.com/palette-list/mist-gb",
    colors: ["#c4f0c2", "#5ab9a8", "#1e606e", "#2d1b00"]
  },
  hollow: {
    id: "hollow",
    name: "Hollow",
    group: "community",
    credit: "Poltergasm",
    creditUrl: "https://lospec.com/palette-list/hollow",
    colors: ["#fafbf6", "#c6b7be", "#565a75", "#0f0f1b"]
  },
  nostalgia: {
    id: "nostalgia",
    name: "Nostalgia",
    group: "community",
    credit: "WildLeoKnight",
    creditUrl: "https://lospec.com/palette-list/nostalgia",
    colors: ["#d0d058", "#a0a840", "#708028", "#405010"]
  },
  spacehaze: {
    id: "spacehaze",
    name: "Spacehaze",
    group: "community",
    credit: "WildLeoKnight",
    creditUrl: "https://lospec.com/palette-list/spacehaze",
    colors: ["#f8e3c4", "#cc3495", "#6b1fb1", "#0b0630"]
  },
  velvet_cherry: {
    id: "velvet_cherry",
    name: "Velvet Cherry",
    group: "community",
    credit: "Klafooty",
    creditUrl: "https://lospec.com/palette-list/velvet-cherry-gb",
    colors: ["#9775a6", "#683a68", "#412752", "#2d162c"]
  },
  rustic_gb: {
    id: "rustic_gb",
    name: "Rustic GB",
    group: "community",
    credit: "Kerrie Lake",
    creditUrl: "https://lospec.com/palette-list/rustic-gb",
    colors: ["#edb4a1", "#a96868", "#764462", "#2c2137"]
  },
  demichrome: {
    id: "demichrome",
    name: "2bit Demichrome",
    group: "community",
    credit: "Space Sandwich",
    creditUrl: "https://lospec.com/palette-list/2bit-demichrome",
    colors: ["#e9efec", "#a0a08b", "#555568", "#211e20"]
  },
  crimson: {
    id: "crimson",
    name: "Crimson",
    group: "community",
    credit: "WildLeoKnight",
    creditUrl: "https://lospec.com/palette-list/crimson",
    colors: ["#eff9d6", "#ba5044", "#7a1c4b", "#1b0326"]
  },
  links_awakening: {
    id: "links_awakening",
    name: "Link's Awakening SGB",
    group: "community",
    credit: "Lospec",
    creditUrl: "https://lospec.com/palette-list/links-awakening-sgb",
    colors: ["#ffffb5", "#7bc67b", "#6b8c42", "#5a3921"]
  },
  pokemon_sgb: {
    id: "pokemon_sgb",
    name: "Pokémon SGB",
    group: "community",
    credit: "Lospec",
    creditUrl: "https://lospec.com/palette-list/pokemon-sgb",
    colors: ["#ffefff", "#f7b58c", "#84739c", "#181010"]
  },
  blk_aqu4: {
    id: "blk_aqu4",
    name: "BLK AQU4",
    group: "community",
    credit: "BurakoIRL",
    creditUrl: "https://lospec.com/palette-list/blk-aqu4",
    colors: ["#9ff4e5", "#00b9be", "#005f8c", "#002b59"]
  },
  // ── Artistic ────────────────────────────────────────────────────────────────
  grayscale: {
    id: "grayscale",
    name: "Grayscale",
    group: "artistic",
    colors: ["#FFFFFF", "#AAAAAA", "#555555", "#000000"]
  },
  inverted: {
    id: "inverted",
    name: "Inverted",
    group: "artistic",
    colors: ["#000000", "#555555", "#AAAAAA", "#FFFFFF"]
  },
  sepia: {
    id: "sepia",
    name: "Sepia",
    group: "artistic",
    colors: ["#F5E6C8", "#C8A878", "#7D5A3C", "#3B2507"]
  },
  cyber: {
    id: "cyber",
    name: "Cyber",
    group: "artistic",
    colors: ["#E0FFE0", "#00FF00", "#007700", "#001100"]
  }
};
const EXTENDED_PALETTES = {
  // ── GBC Game Palettes ─────────────────────────────────────
  gbc_game_alleyway_world: { id: "gbc_game_alleyway_world", name: "Alleyway (World)", group: "gbc_game", colors: ["#ffff00", "#a59cff", "#006300", "#000000"] },
  gbc_game_arcade_classic_no_1_asteroids_missile_command_usa_europe: { id: "gbc_game_arcade_classic_no_1_asteroids_missile_command_usa_europe", name: "Arcade Classic No. 1 - Asteroids _ Missile Command (USA, Europe)", group: "gbc_game", colors: ["#ffffff", "#7bff31", "#008400", "#000000"] },
  gbc_game_balloon_kid_usa_europe: { id: "gbc_game_balloon_kid_usa_europe", name: "Balloon Kid (USA, Europe)", group: "gbc_game", colors: ["#ffffff", "#ff9c00", "#ff0000", "#000000"] },
  gbc_game_baseball_world: { id: "gbc_game_baseball_world", name: "Baseball (World)", group: "gbc_game", colors: ["#ffffff", "#ffff00", "#52de00", "#ff8400"] },
  gbc_game_donkey_kong_land_usa_europe: { id: "gbc_game_donkey_kong_land_usa_europe", name: "Donkey Kong Land (USA, Europe)", group: "gbc_game", colors: ["#ffff9c", "#94b5ff", "#639473", "#003a3a"] },
  gbc_game_game_boy_gallery_japan: { id: "gbc_game_game_boy_gallery_japan", name: "Game Boy Gallery (Japan)", group: "gbc_game", colors: ["#ffffff", "#7bff00", "#b57300", "#000000"] },
  gbc_game_game_boy_wars_japan: { id: "gbc_game_game_boy_wars_japan", name: "Game Boy Wars (Japan)", group: "gbc_game", colors: ["#ffffff", "#adad84", "#42737b", "#000000"] },
  gbc_game_soccer_europe_en_fr_de: { id: "gbc_game_soccer_europe_en_fr_de", name: "Soccer (Europe) (En,Fr,De)", group: "gbc_game", colors: ["#ffffff", "#6bff00", "#ff524a", "#000000"] },
  gbc_game_super_mario_land_world_rev_a: { id: "gbc_game_super_mario_land_world_rev_a", name: "Super Mario Land (World) (Rev A)", group: "gbc_game", colors: ["#ffff94", "#b5b5ff", "#ad5a42", "#000000"] },
  gbc_game_super_mario_land_2_6_golden_coins_usa_europe_rev_a: { id: "gbc_game_super_mario_land_2_6_golden_coins_usa_europe_rev_a", name: "Super Mario Land 2 - 6 Golden Coins (USA, Europe) (Rev A)", group: "gbc_game", colors: ["#ffffce", "#63efef", "#9c8431", "#5a5a5a"] },
  // ── Community Gallery ─────────────────────────────────────
  gallery_artistic_caffeinated_lactose: { id: "gallery_artistic_caffeinated_lactose", name: "Artistic Caffeinated Lactose", group: "gallery", colors: ["#fdfef5", "#dea963", "#9e754f", "#241606"] },
  gallery_audi_quattro_pikes_peak: { id: "gallery_audi_quattro_pikes_peak", name: "Audi Quattro Pikes Peak", group: "gallery", colors: ["#ebeee7", "#868779", "#fa2b25", "#2a201e"] },
  gallery_azure_clouds: { id: "gallery_azure_clouds", name: "Azure Clouds", group: "gallery", colors: ["#47ff99", "#32b66d", "#124127", "#000000"] },
  gallery_bgb_emulator: { id: "gallery_bgb_emulator", name: "BGB Emulator", group: "gallery", colors: ["#e0f8d0", "#88c070", "#346856", "#081820"] },
  gallery_black_zero: { id: "gallery_black_zero", name: "Black Zero", group: "gallery", colors: ["#7e8416", "#577b46", "#385d49", "#2e463d"] },
  gallery_cga_palette_crush_1: { id: "gallery_cga_palette_crush_1", name: "CGA Palette Crush 1", group: "gallery", colors: ["#ffffff", "#55ffff", "#ff55ff", "#000000"] },
  gallery_cga_palette_crush_2: { id: "gallery_cga_palette_crush_2", name: "CGA Palette Crush 2", group: "gallery", colors: ["#ffffff", "#55ffff", "#ff5555", "#000000"] },
  gallery_cmykeystone: { id: "gallery_cmykeystone", name: "CMYKeystone", group: "gallery", colors: ["#ffff00", "#0be8fd", "#fb00fa", "#373737"] },
  gallery_candy_cotton_tower_raid: { id: "gallery_candy_cotton_tower_raid", name: "Candy Cotton Tower Raid", group: "gallery", colors: ["#e6aec4", "#e65790", "#8f0039", "#380016"] },
  gallery_caramel_fudge_paranoia: { id: "gallery_caramel_fudge_paranoia", name: "Caramel Fudge Paranoia", group: "gallery", colors: ["#cf9255", "#cf7163", "#b01553", "#3f1711"] },
  gallery_cyanide_blues: { id: "gallery_cyanide_blues", name: "Cyanide Blues", group: "gallery", colors: ["#9efbe3", "#21aff5", "#1e4793", "#0e1e3d"] },
  gallery_deep_haze_green: { id: "gallery_deep_haze_green", name: "Deep Haze Green", group: "gallery", colors: ["#a1d909", "#467818", "#27421f", "#000000"] },
  gallery_dies_ist_meine_wassermelone: { id: "gallery_dies_ist_meine_wassermelone", name: "Dies ist meine Wassermelone", group: "gallery", colors: ["#ffdbcb", "#f27d7a", "#558429", "#222903"] },
  gallery_drowning_at_night: { id: "gallery_drowning_at_night", name: "Drowning at Night", group: "gallery", colors: ["#a9b0b3", "#586164", "#20293f", "#030c22"] },
  gallery_dune_2000_remastered: { id: "gallery_dune_2000_remastered", name: "Dune 2000 Remastered", group: "gallery", colors: ["#fbf1cd", "#c09e7d", "#725441", "#000000"] },
  gallery_flowerfeldstrasse: { id: "gallery_flowerfeldstrasse", name: "Flowerfeldstrasse", group: "gallery", colors: ["#e9d9cc", "#c5c5ce", "#75868f", "#171f62"] },
  gallery_floyd_steinberg_in_love: { id: "gallery_floyd_steinberg_in_love", name: "Floyd Steinberg in Love", group: "gallery", colors: ["#eaf5fa", "#5fb1f5", "#d23c4e", "#4c1c2d"] },
  gallery_game_boy_light: { id: "gallery_game_boy_light", name: "Game Boy Light", group: "gallery", colors: ["#1ddece", "#19c7b3", "#16a596", "#0b7a6d"] },
  gallery_glowing_mountains: { id: "gallery_glowing_mountains", name: "Glowing Mountains", group: "gallery", colors: ["#ffbf98", "#a1a8b8", "#514f6c", "#2f1c35"] },
  gallery_golden_elephant_curry: { id: "gallery_golden_elephant_curry", name: "Golden Elephant Curry", group: "gallery", colors: ["#ff9c00", "#c27600", "#4f3000", "#000000"] },
  gallery_grafixkid_gray: { id: "gallery_grafixkid_gray", name: "Grafixkid Gray", group: "gallery", colors: ["#e0dbcd", "#a89f94", "#706b66", "#2b2b26"] },
  gallery_grafixkid_green: { id: "gallery_grafixkid_green", name: "Grafixkid Green", group: "gallery", colors: ["#dbf4b4", "#abc396", "#7b9278", "#4c625a"] },
  gallery_knee_deep_in_the_wood: { id: "gallery_knee_deep_in_the_wood", name: "Knee-Deep in the Wood", group: "gallery", colors: ["#fffe6e", "#d5690f", "#3c3ca9", "#2c2410"] },
  gallery_metroid_aran_remixed: { id: "gallery_metroid_aran_remixed", name: "Metroid Aran Remixed", group: "gallery", colors: ["#aedf1e", "#b62558", "#047e60", "#2c1700"] },
  gallery_my_friend_from_bavaria: { id: "gallery_my_friend_from_bavaria", name: "My Friend from Bavaria", group: "gallery", colors: ["#feda1b", "#df7925", "#b60077", "#382977"] },
  gallery_nortorious_comadante: { id: "gallery_nortorious_comadante", name: "Nortorious Comadante", group: "gallery", colors: ["#fcfe54", "#54fefc", "#04aaac", "#0402ac"] },
  gallery_original_game_boy: { id: "gallery_original_game_boy", name: "Original Game Boy", group: "gallery", colors: ["#9bbc0f", "#77a112", "#306230", "#0f380f"] },
  gallery_purple_rain: { id: "gallery_purple_rain", name: "Purple Rain", group: "gallery", colors: ["#adfffc", "#8570b2", "#ff0084", "#68006a"] },
  gallery_romeros_garden: { id: "gallery_romeros_garden", name: "Romeros Garden", group: "gallery", colors: ["#ebc4ab", "#649a57", "#574431", "#323727"] },
  gallery_starlit_memories: { id: "gallery_starlit_memories", name: "Starlit Memories", group: "gallery", colors: ["#869ad9", "#6d53bd", "#6f2096", "#4f133f"] },
  gallery_sunflower_holidays: { id: "gallery_sunflower_holidays", name: "Sunflower Holidays", group: "gallery", colors: ["#ffff55", "#ff5555", "#881400", "#000000"] },
  gallery_super_hyper_mega_gameboy: { id: "gallery_super_hyper_mega_gameboy", name: "Super Hyper Mega Gameboy", group: "gallery", colors: ["#f7e7c6", "#d68e49", "#a63725", "#331e50"] },
  gallery_the_death_of_yung_columbus: { id: "gallery_the_death_of_yung_columbus", name: "The death of Yung Columbus", group: "gallery", colors: ["#b5ff32", "#ff2261", "#462917", "#1d1414"] },
  gallery_the_starry_knight: { id: "gallery_the_starry_knight", name: "The starry knight", group: "gallery", colors: ["#f5db37", "#37cae5", "#0f86b6", "#123f77"] },
  gallery_there_is_always_money: { id: "gallery_there_is_always_money", name: "There is Always Money", group: "gallery", colors: ["#fdfe0a", "#fed638", "#977b25", "#221a09"] },
  gallery_tramonto_al_parco_degli_acquedotti: { id: "gallery_tramonto_al_parco_degli_acquedotti", name: "Tramonto al Parco degli Acquedotti", group: "gallery", colors: ["#f3c677", "#e64a4e", "#912978", "#0c0a3e"] },
  gallery_virtual_boy_1985: { id: "gallery_virtual_boy_1985", name: "Virtual Boy 1985", group: "gallery", colors: ["#ff0000", "#db0000", "#520000", "#000000"] },
  gallery_waterfront_plaza: { id: "gallery_waterfront_plaza", name: "Waterfront Plaza", group: "gallery", colors: ["#cecece", "#6f9edf", "#42678e", "#102533"] },
  gallery_youth_ikarus_reloaded: { id: "gallery_youth_ikarus_reloaded", name: "Youth Ikarus reloaded", group: "gallery", colors: ["#cef7f7", "#f78e50", "#9e0000", "#1e0000"] },
  // ── Super Game Boy ────────────────────────────────────────
  sgb_1_a_default_balloon_kid: { id: "sgb_1_a_default_balloon_kid", name: "1-A (Default) (Balloon Kid)", group: "sgb", colors: ["#ffefce", "#de944a", "#ad2921", "#311852"] },
  sgb_1_b_wario_land: { id: "sgb_1_b_wario_land", name: "1-B (Wario Land)", group: "sgb", colors: ["#dedec6", "#ceb573", "#b55210", "#000000"] },
  sgb_1_c_kirby_s_pinball_land: { id: "sgb_1_c_kirby_s_pinball_land", name: "1-C (Kirby's Pinball Land)", group: "sgb", colors: ["#ffc6ff", "#ef9c52", "#9c3963", "#39399c"] },
  sgb_1_d_yoshi_s_cookie_yoshi_no_cooki: { id: "sgb_1_d_yoshi_s_cookie_yoshi_no_cooki", name: "1-D (Yoshi's Cookie) (Yoshi no Cooki)", group: "sgb", colors: ["#ffffad", "#c6844a", "#ff0000", "#521800"] },
  sgb_1_e_zelda_link_s_awakening: { id: "sgb_1_e_zelda_link_s_awakening", name: "1-E (Zelda Link's Awakening)", group: "sgb", colors: ["#ffdeb5", "#7bc67b", "#6b8c42", "#5a3921"] },
  sgb_1_f_super_mario_land: { id: "sgb_1_f_super_mario_land", name: "1-F (Super Mario Land)", group: "sgb", colors: ["#deefff", "#e78c52", "#ad0000", "#004210"] },
  sgb_1_g_solar_striker: { id: "sgb_1_g_solar_striker", name: "1-G (Solar Striker)", group: "sgb", colors: ["#ffff5a", "#00a5ef", "#7b7b00", "#000052"] },
  sgb_1_h: { id: "sgb_1_h", name: "1-H", group: "sgb", colors: ["#ffefe7", "#ffbd8c", "#844200", "#311800"] },
  sgb_2_a_kaeru_no_tamei: { id: "sgb_2_a_kaeru_no_tamei", name: "2-A (Kaeru no Tamei)", group: "sgb", colors: ["#f7cea5", "#c68c4a", "#297b00", "#000000"] },
  sgb_2_b: { id: "sgb_2_b", name: "2-B", group: "sgb", colors: ["#ffffff", "#ffef52", "#ff3100", "#52005a"] },
  sgb_2_c_kirby_s_dreal_land_hoshino_kirbi_bi: { id: "sgb_2_c_kirby_s_dreal_land_hoshino_kirbi_bi", name: "2-C (Kirby's Dreal Land) (Hoshino Kirbi Bi)", group: "sgb", colors: ["#ffc6ff", "#ef8c8c", "#7b31ef", "#29299c"] },
  sgb_2_d_yoshi_mario_yoshi_yoshi_no_tamago: { id: "sgb_2_d_yoshi_mario_yoshi_yoshi_no_tamago", name: "2-D (Yoshi, Mario & Yoshi) (Yoshi no Tamago)", group: "sgb", colors: ["#ffffa5", "#00ff00", "#ff3100", "#000052"] },
  sgb_2_e: { id: "sgb_2_e", name: "2-E", group: "sgb", colors: ["#ffce84", "#94b5e7", "#291063", "#100810"] },
  sgb_2_f_kid_icarus_of_myths_and_monsters: { id: "sgb_2_f_kid_icarus_of_myths_and_monsters", name: "2-F (Kid Icarus of Myths and Monsters)", group: "sgb", colors: ["#d6ffff", "#ff9452", "#a50000", "#180000"] },
  sgb_2_g_baseball: { id: "sgb_2_g_baseball", name: "2-G (Baseball)", group: "sgb", colors: ["#e7bd84", "#6bbd39", "#e75242", "#001800"] },
  sgb_2_h: { id: "sgb_2_h", name: "2-H", group: "sgb", colors: ["#ffffff", "#bdbdbd", "#737373", "#000000"] },
  sgb_3_a_tetris: { id: "sgb_3_a_tetris", name: "3-A (Tetris)", group: "sgb", colors: ["#ffd69c", "#73c6c6", "#ff6329", "#314a63"] },
  sgb_3_b_dr_mario: { id: "sgb_3_b_dr_mario", name: "3-B (Dr. Mario)", group: "sgb", colors: ["#dedec6", "#e78421", "#005200", "#001010"] },
  sgb_3_c_yakyuuman: { id: "sgb_3_c_yakyuuman", name: "3-C (Yakyuuman)", group: "sgb", colors: ["#ffff7b", "#e7adce", "#00bdff", "#21215a"] },
  sgb_3_d_super_mario_land_2: { id: "sgb_3_d_super_mario_land_2", name: "3-D (Super Mario Land 2)", group: "sgb", colors: ["#f7ffbd", "#e7ad7b", "#08ce00", "#000000"] },
  sgb_3_e_game_boy_wars: { id: "sgb_3_e_game_boy_wars", name: "3-E (Game Boy Wars)", group: "sgb", colors: ["#ffffc6", "#e7b56b", "#b57b21", "#524a73"] },
  sgb_3_f_alleyway: { id: "sgb_3_f_alleyway", name: "3-F (Alleyway)", group: "sgb", colors: ["#ffd600", "#ff6bff", "#7b7bce", "#424242"] },
  sgb_3_g_tennis: { id: "sgb_3_g_tennis", name: "3-G (Tennis)", group: "sgb", colors: ["#ffffff", "#63de52", "#ce3139", "#390000"] },
  sgb_3_h_golf: { id: "sgb_3_h_golf", name: "3-H (Golf)", group: "sgb", colors: ["#e7ffa5", "#7bce39", "#4a8c18", "#081800"] },
  sgb_4_a_qix: { id: "sgb_4_a_qix", name: "4-A (Qix)", group: "sgb", colors: ["#f7ad6b", "#7badff", "#d600d6", "#00007b"] },
  sgb_4_b: { id: "sgb_4_b", name: "4-B", group: "sgb", colors: ["#f7eff7", "#efa563", "#427b39", "#180808"] },
  sgb_4_c: { id: "sgb_4_c", name: "4-C", group: "sgb", colors: ["#ffe7e7", "#dea5d6", "#9ca5e7", "#080000"] },
  sgb_4_d_x: { id: "sgb_4_d_x", name: "4-D (X)", group: "sgb", colors: ["#ffffbd", "#94cece", "#4a6b7b", "#08214a"] },
  sgb_4_e: { id: "sgb_4_e", name: "4-E", group: "sgb", colors: ["#ffdead", "#e7ad7b", "#7b5a8c", "#002131"] },
  sgb_4_f_f_1_race: { id: "sgb_4_f_f_1_race", name: "4-F (F-1 Race)", group: "sgb", colors: ["#bdd6d6", "#de84de", "#8400a5", "#390000"] },
  sgb_4_g_metroid_ii_return_of_samus: { id: "sgb_4_g_metroid_ii_return_of_samus", name: "4-G (Metroid II Return of Samus)", group: "sgb", colors: ["#b5e718", "#008463", "#bd215a", "#291000"] },
  sgb_4_h: { id: "sgb_4_h", name: "4-H", group: "sgb", colors: ["#ffffce", "#bdc65a", "#848c42", "#425229"] },
  // ── SGB Vaporwave ─────────────────────────────────────────
  sgb2_sgb2ve_1_a_sunset: { id: "sgb2_sgb2ve_1_a_sunset", name: "SGB2VE 1-A Sunset", group: "sgb2", colors: ["#f7f794", "#f7a552", "#ef2994", "#1039ad"] },
  sgb2_sgb2ve_1_b_kimochi_wario: { id: "sgb2_sgb2ve_1_b_kimochi_wario", name: "SGB2VE 1-B Kimochi Wario", group: "sgb2", colors: ["#f7efbd", "#f7a56b", "#bd63a5", "#4a3973"] },
  sgb2_sgb2ve_1_c_pachinko: { id: "sgb2_sgb2ve_1_c_pachinko", name: "SGB2VE 1-C Pachinko", group: "sgb2", colors: ["#f7deef", "#f7947b", "#9c42ef", "#42427b"] },
  sgb2_sgb2ve_1_d_cotton_candy: { id: "sgb2_sgb2ve_1_d_cotton_candy", name: "SGB2VE 1-D Cotton Candy", group: "sgb2", colors: ["#f7f7f7", "#84e7ef", "#ffa5ff", "#1039ad"] },
  sgb2_sgb2ve_1_e_absynthe: { id: "sgb2_sgb2ve_1_e_absynthe", name: "SGB2VE 1-E Absynthe", group: "sgb2", colors: ["#ffff8c", "#adff5a", "#a5b5ff", "#7b4aad"] },
  sgb2_sgb2ve_1_f_arizona: { id: "sgb2_sgb2ve_1_f_arizona", name: "SGB2VE 1-F Arizona", group: "sgb2", colors: ["#defff7", "#ffcece", "#ff4273", "#52529c"] },
  sgb2_sgb2ve_1_g_hot_vibes: { id: "sgb2_sgb2ve_1_g_hot_vibes", name: "SGB2VE 1-G Hot Vibes", group: "sgb2", colors: ["#f7ce18", "#f78c18", "#f72973", "#8c18f7"] },
  sgb2_sgb2ve_1_h_sorbet_whip: { id: "sgb2_sgb2ve_1_h_sorbet_whip", name: "SGB2VE 1-H Sorbet Whip", group: "sgb2", colors: ["#f7ffc6", "#ffc684", "#ff6b8c", "#63184a"] },
  sgb2_sgb2ve_2_a_bufotoxin: { id: "sgb2_sgb2ve_2_a_bufotoxin", name: "SGB2VE 2-A Bufotoxin", group: "sgb2", colors: ["#f7de9c", "#ef8c84", "#009c84", "#104a63"] },
  sgb2_sgb2ve_2_b_dank: { id: "sgb2_sgb2ve_2_b_dank", name: "SGB2VE 2-B Dank", group: "sgb2", colors: ["#f7f794", "#63b5bd", "#635284", "#4a1842"] },
  sgb2_sgb2ve_2_c_creampuff: { id: "sgb2_sgb2ve_2_c_creampuff", name: "SGB2VE 2-C Creampuff", group: "sgb2", colors: ["#ffdef7", "#f79cad", "#a573f7", "#632963"] },
  sgb2_sgb2ve_2_d_modern_computing: { id: "sgb2_sgb2ve_2_d_modern_computing", name: "SGB2VE 2-D Modern Computing", group: "sgb2", colors: ["#f7f7f7", "#6bffbd", "#ff849c", "#101018"] },
  sgb2_sgb2ve_2_e_uranium_glass: { id: "sgb2_sgb2ve_2_e_uranium_glass", name: "SGB2VE 2-E Uranium Glass", group: "sgb2", colors: ["#d6ff9c", "#00dede", "#9c42ef", "#4a08ef"] },
  sgb2_sgb2ve_2_f_tenshi: { id: "sgb2_sgb2ve_2_f_tenshi", name: "SGB2VE 2-F. Tenshi", group: "sgb2", colors: ["#adf7c6", "#efadce", "#de5ace", "#2142e7"] },
  sgb2_sgb2ve_2_g_87_ninjas: { id: "sgb2_sgb2ve_2_g_87_ninjas", name: "SGB2VE 2-G 87 Ninjas", group: "sgb2", colors: ["#c6f7de", "#bdb5f7", "#d63994", "#42427b"] },
  sgb2_sgb2ve_2_h_floral: { id: "sgb2_sgb2ve_2_h_floral", name: "SGB2VE 2-H Floral", group: "sgb2", colors: ["#efe7e7", "#ff849c", "#52b59c", "#081018"] },
  sgb2_sgb2ve_3_a_mind_game: { id: "sgb2_sgb2ve_3_a_mind_game", name: "SGB2VE 3-A Mind Game", group: "sgb2", colors: ["#f7f7f7", "#f784f7", "#00b5f7", "#4200f7"] },
  sgb2_sgb2ve_3_b_sewer_magic: { id: "sgb2_sgb2ve_3_b_sewer_magic", name: "SGB2VE 3-B Sewer Magic", group: "sgb2", colors: ["#f7f794", "#84f7c6", "#8c7be7", "#5a0084"] },
  sgb2_sgb2ve_3_c_galactic_rabbit_trip: { id: "sgb2_sgb2ve_3_c_galactic_rabbit_trip", name: "SGB2VE 3-C Galactic Rabbit Trip", group: "sgb2", colors: ["#f7f7ef", "#bdceef", "#52a5ce", "#4a5273"] },
  sgb2_sgb2ve_3_d_frenemy: { id: "sgb2_sgb2ve_3_d_frenemy", name: "SGB2VE 3-D Frenemy", group: "sgb2", colors: ["#bdffe7", "#ffd6b5", "#42d6d6", "#1039ad"] },
  sgb2_sgb2ve_3_e_agent_orange: { id: "sgb2_sgb2ve_3_e_agent_orange", name: "SGB2VE 3-E Agent Orange", group: "sgb2", colors: ["#ffe742", "#f7a56b", "#e76b84", "#632963"] },
  sgb2_sgb2ve_3_f_backstreet: { id: "sgb2_sgb2ve_3_f_backstreet", name: "SGB2VE 3-F Backstreet", group: "sgb2", colors: ["#dedeff", "#ffceb5", "#ff8cbd", "#294a8c"] },
  sgb2_sgb2ve_3_g_eccojam: { id: "sgb2_sgb2ve_3_g_eccojam", name: "SGB2VE 3-G Eccojam", group: "sgb2", colors: ["#9cefff", "#ad7be7", "#946cff", "#8c42a5"] },
  sgb2_sgb2ve_3_h_sakura: { id: "sgb2_sgb2ve_3_h_sakura", name: "SGB2VE 3-H Sakura", group: "sgb2", colors: ["#f7efb5", "#efb5bd", "#ef73d6", "#4a39b5"] },
  sgb2_sgb2ve_4_a_vector: { id: "sgb2_sgb2ve_4_a_vector", name: "SGB2VE 4-A Vector", group: "sgb2", colors: ["#f7d684", "#00b5f7", "#9400f7", "#1039ad"] },
  sgb2_sgb2ve_4_b_slumber: { id: "sgb2_sgb2ve_4_b_slumber", name: "SGB2VE 4-B Slumber", group: "sgb2", colors: ["#d6ffff", "#94ceff", "#8c8cf7", "#944ab5"] },
  sgb2_sgb2ve_4_c_lingonberry_butter: { id: "sgb2_sgb2ve_4_c_lingonberry_butter", name: "SGB2VE 4-C Lingonberry Butter", group: "sgb2", colors: ["#fff7de", "#ffadce", "#7b84e7", "#21529c"] },
  sgb2_sgb2ve_4_d_zangetsu: { id: "sgb2_sgb2ve_4_d_zangetsu", name: "SGB2VE 4-D Zangetsu", group: "sgb2", colors: ["#f7efbd", "#84e7ef", "#31a5c6", "#104a63"] },
  sgb2_sgb2ve_4_e_icy_hot: { id: "sgb2_sgb2ve_4_e_icy_hot", name: "SGB2VE 4-E Icy Hot", group: "sgb2", colors: ["#bdfff7", "#d6c6ff", "#ff39ce", "#8c00ff"] },
  sgb2_sgb2ve_4_f_night_driver: { id: "sgb2_sgb2ve_4_f_night_driver", name: "SGB2VE 4-F Night Driver", group: "sgb2", colors: ["#ff31ef", "#214aff", "#6b00c6", "#10006b"] },
  sgb2_sgb2ve_4_g_bug_hunt: { id: "sgb2_sgb2ve_4_g_bug_hunt", name: "SGB2VE 4-G Bug Hunt", group: "sgb2", colors: ["#f7e7ad", "#f7738c", "#3952bd", "#083963"] },
  sgb2_sgb2ve_4_h_mgb_101: { id: "sgb2_sgb2ve_4_h_mgb_101", name: "SGB2VE 4-H MGB-101", group: "sgb2", colors: ["#21ffde", "#00bdc6", "#107ba5", "#004a84"] },
  // ── BGB Emulator ──────────────────────────────────────────
  bgb_bgb_v0_3: { id: "bgb_bgb_v0_3", name: "BGB_v0.3", group: "bgb", colors: ["#ecfccc", "#acd494", "#548c74", "#142c3c"] },
  bgb_blue: { id: "bgb_blue", name: "Blue", group: "bgb", colors: ["#c0c0ff", "#5f5fff", "#0000c0", "#000060"] },
  bgb_game_boy_kiosk: { id: "bgb_game_boy_kiosk", name: "Game_Boy_Kiosk", group: "bgb", colors: ["#ececb4", "#bcbc1c", "#6c6c04", "#143404"] },
  bgb_game_boy_light: { id: "bgb_game_boy_light", name: "Game_Boy_Light", group: "bgb", colors: ["#00b581", "#009a71", "#00694a", "#004f3b"] },
  bgb_grey: { id: "bgb_grey", name: "Grey", group: "bgb", colors: ["#ececec", "#a4a4a4", "#5c5c5c", "#141414"] },
  bgb_greys_high_contrast: { id: "bgb_greys_high_contrast", name: "Greys_High_Contrast", group: "bgb", colors: ["#ffffff", "#b0b0b0", "#686868", "#000000"] },
  bgb_kigb_green_inverted: { id: "bgb_kigb_green_inverted", name: "KiGB_Green - Inverted", group: "bgb", colors: ["#50d050", "#40a040", "#307030", "#204020"] },
  bgb_lcd_green_inverted: { id: "bgb_lcd_green_inverted", name: "LCD_Green - Inverted", group: "bgb", colors: ["#e4fcd4", "#8cc474", "#346c54", "#0c1c24"] },
  bgb_red_inverted: { id: "bgb_red_inverted", name: "Red - Inverted", group: "bgb", colors: ["#ffc0c0", "#ff6060", "#c00000", "#600000"] },
  bgb_yellow_inverted: { id: "bgb_yellow_inverted", name: "Yellow - Inverted", group: "bgb", colors: ["#f8f078", "#b0a848", "#686830", "#202010"] },
  bgb_yellow_bgb_inverted: { id: "bgb_yellow_bgb_inverted", name: "Yellow_BGB- Inverted", group: "bgb", colors: ["#f4ebbf", "#d2cf4d", "#93a73b", "#556f35"] },
  bgb_no_gmb_brown_inverted: { id: "bgb_no_gmb_brown_inverted", name: "no$gmb_Brown - Inverted", group: "bgb", colors: ["#f8e088", "#d8b058", "#987838", "#483818"] },
  // ── SameBoy Emulator ──────────────────────────────────────
  sameboy_desert: { id: "sameboy_desert", name: "Desert", group: "sameboy", colors: ["#d2d0b1", "#a49b83", "#746657", "#3e2f30"] },
  sameboy_evening: { id: "sameboy_evening", name: "Evening", group: "sameboy", colors: ["#aee4a6", "#539889", "#185569", "#012636"] },
  sameboy_fake_crystal: { id: "sameboy_fake_crystal", name: "Fake Crystal", group: "sameboy", colors: ["#9ce7f7", "#4a73bd", "#29317b", "#212931"] },
  sameboy_fog: { id: "sameboy_fog", name: "Fog", group: "sameboy", colors: ["#bfd2c3", "#86a39d", "#567273", "#343c37"] },
  sameboy_magic_eggplant: { id: "sameboy_magic_eggplant", name: "Magic Eggplant", group: "sameboy", colors: ["#b0e4f1", "#9d69c7", "#842e94", "#36213c"] },
  sameboy_radioactive_pea: { id: "sameboy_radioactive_pea", name: "Radioactive Pea", group: "sameboy", colors: ["#b8ce03", "#349e16", "#06731f", "#005221"] },
  sameboy_seaweed: { id: "sameboy_seaweed", name: "Seaweed", group: "sameboy", colors: ["#dfe095", "#78a758", "#326542", "#15003f"] },
  sameboy_twilight: { id: "sameboy_twilight", name: "Twilight", group: "sameboy", colors: ["#e9d397", "#bd5462", "#861246", "#15003f"] },
  // ── R.A.Helllord ──────────────────────────────────────────
  helllord_classic_blue_le_inverted: { id: "helllord_classic_blue_le_inverted", name: "Limited Edition Pockets Inverted · Classic Blue LE - inverted", group: "helllord", colors: ["#5775af", "#1b559e", "#023274", "#000000"] },
  helllord_classic_green_le_inverted: { id: "helllord_classic_green_le_inverted", name: "Limited Edition Pockets Inverted · Classic Green LE - inverted", group: "helllord", colors: ["#549d80", "#0b8a68", "#01633f", "#000000"] },
  helllord_classic_indigo_le_inverted: { id: "helllord_classic_indigo_le_inverted", name: "Limited Edition Pockets Inverted · Classic Indigo LE - inverted", group: "helllord", colors: ["#7b80b4", "#5457a4", "#263172", "#000000"] },
  helllord_classic_pink_le_inverted: { id: "helllord_classic_pink_le_inverted", name: "Limited Edition Pockets Inverted · Classic Pink LE - inverted", group: "helllord", colors: ["#efa1bf", "#eb8cb3", "#d8648b", "#000000"] },
  helllord_classic_red_le_inverted: { id: "helllord_classic_red_le_inverted", name: "Limited Edition Pockets Inverted · Classic Red LE - inverted", group: "helllord", colors: ["#cb5d5b", "#bc2b2b", "#95030d", "#000000"] },
  helllord_classic_silver_le_inverted: { id: "helllord_classic_silver_le_inverted", name: "Limited Edition Pockets Inverted · Classic Silver LE - inverted", group: "helllord", colors: ["#e0dfde", "#cecece", "#908a85", "#000000"] },
  helllord_classic_spice_orange_le_inverted: { id: "helllord_classic_spice_orange_le_inverted", name: "Limited Edition Pockets Inverted · Classic Spice Orange LE - inverted", group: "helllord", colors: ["#e8a36c", "#e38f48", "#c96722", "#000000"] },
  helllord_classic_yellow_le_inverted: { id: "helllord_classic_yellow_le_inverted", name: "Limited Edition Pockets Inverted · Classic Yellow LE - inverted", group: "helllord", colors: ["#e8be63", "#d2921d", "#cf8b08", "#000000"] },
  helllord_glow_in_the_dark_le_inverted: { id: "helllord_glow_in_the_dark_le_inverted", name: "Limited Edition Pockets Inverted · Glow in the Dark LE - inverted", group: "helllord", colors: ["#8cf68a", "#4dcc80", "#05a56d", "#000000"] },
  helllord_transparent_blue_le_inverted: { id: "helllord_transparent_blue_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Blue LE - inverted", group: "helllord", colors: ["#646dcb", "#361aa6", "#1e124f", "#000000"] },
  helllord_transparent_clear_le_inverted: { id: "helllord_transparent_clear_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Clear LE - inverted", group: "helllord", colors: ["#9c9a99", "#595959", "#3e3b39", "#000000"] },
  helllord_transparent_green_le_inverted: { id: "helllord_transparent_green_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Green LE - inverted", group: "helllord", colors: ["#03ce09", "#00b100", "#003c06", "#000000"] },
  helllord_transparent_orange_le_inverted: { id: "helllord_transparent_orange_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Orange LE - inverted", group: "helllord", colors: ["#e56400", "#ad2d01", "#3c1405", "#000000"] },
  helllord_transparent_purple_le_inverted: { id: "helllord_transparent_purple_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Purple LE - inverted", group: "helllord", colors: ["#a986bb", "#8d6ea7", "#3c2e49", "#000000"] },
  helllord_transparent_red_le_inverted: { id: "helllord_transparent_red_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Red LE - inverted", group: "helllord", colors: ["#c51d21", "#991019", "#6d1a1a", "#000000"] },
  helllord_transparent_smoke_le_inverted: { id: "helllord_transparent_smoke_le_inverted", name: "Limited Edition Pockets Inverted · Transparent Smoke LE - inverted", group: "helllord", colors: ["#686464", "#363333", "#282421", "#000000"] },
  helllord_pipboy_amber: { id: "helllord_pipboy_amber", name: "Pipboy · Pipboy - Amber", group: "helllord", colors: ["#ffb13b", "#8c6121", "#604317", "#2d1f0b"] },
  helllord_pipboy_blue: { id: "helllord_pipboy_blue", name: "Pipboy · Pipboy - Blue", group: "helllord", colors: ["#28ccff", "#16708c", "#0f4b5e", "#07242d"] },
  helllord_pipboy_green: { id: "helllord_pipboy_green", name: "Pipboy · Pipboy - Green", group: "helllord", colors: ["#00ee00", "#008e00", "#005f00", "#002f00"] },
  helllord_pipboy_white: { id: "helllord_pipboy_white", name: "Pipboy · Pipboy - White", group: "helllord", colors: ["#c1ffff", "#6a8c8c", "#496060", "#202b2b"] },
  // ── Trashuncle ────────────────────────────────────────────
  trashuncle_tu_paisley_park: { id: "trashuncle_tu_paisley_park", name: "Artistic · TU Paisley Park", group: "trashuncle", colors: ["#ec89ff", "#d442f0", "#b722d4", "#9200ae"] },
  trashuncle_tu_quicksilver: { id: "trashuncle_tu_quicksilver", name: "Artistic · TU Quicksilver", group: "trashuncle", colors: ["#bbbce1", "#a4a5c3", "#717286", "#555555"] },
  trashuncle_tu_blueberry_crush: { id: "trashuncle_tu_blueberry_crush", name: "Crush · TU Blueberry Crush", group: "trashuncle", colors: ["#ffffff", "#4dffff", "#2811ff", "#000000"] },
  trashuncle_tu_grape_crush: { id: "trashuncle_tu_grape_crush", name: "Crush · TU Grape Crush", group: "trashuncle", colors: ["#ffffff", "#0083eb", "#3d43cb", "#000000"] },
  trashuncle_tu_kiwi_crush: { id: "trashuncle_tu_kiwi_crush", name: "Crush · TU Kiwi Crush", group: "trashuncle", colors: ["#ffffff", "#2eef7a", "#059e32", "#000000"] },
  trashuncle_tu_lavender_crush: { id: "trashuncle_tu_lavender_crush", name: "Crush · TU Lavender Crush", group: "trashuncle", colors: ["#ffffff", "#ab6a9b", "#812482", "#000000"] },
  trashuncle_tu_orange_crush: { id: "trashuncle_tu_orange_crush", name: "Crush · TU Orange Crush", group: "trashuncle", colors: ["#ffffff", "#ff632c", "#c23615", "#000000"] },
  trashuncle_tu_pineapple_crush: { id: "trashuncle_tu_pineapple_crush", name: "Crush · TU Pineapple Crush", group: "trashuncle", colors: ["#ffffff", "#ffff80", "#ffff00", "#000000"] },
  trashuncle_tu_strawberry_crush: { id: "trashuncle_tu_strawberry_crush", name: "Crush · TU Strawberry Crush", group: "trashuncle", colors: ["#ffffff", "#ff5250", "#ea1211", "#000000"] },
  trashuncle_tu_dmg_bright: { id: "trashuncle_tu_dmg_bright", name: "DMG · TU DMG Bright", group: "trashuncle", colors: ["#919707", "#4c7b2b", "#2a6141", "#0c3a1d"] },
  trashuncle_tu_dmg_clean: { id: "trashuncle_tu_dmg_clean", name: "DMG · TU DMG Clean", group: "trashuncle", colors: ["#788603", "#496503", "#2b5402", "#174902"] },
  trashuncle_tu_dmg_weak_alt: { id: "trashuncle_tu_dmg_weak_alt", name: "DMG · TU DMG Weak Alt", group: "trashuncle", colors: ["#677f31", "#597730", "#54733c", "#2c4d20"] },
  trashuncle_tu_dmg_weak: { id: "trashuncle_tu_dmg_weak", name: "DMG · TU DMG Weak", group: "trashuncle", colors: ["#6d833d", "#5e7a40", "#577240", "#364e1a"] },
  trashuncle_tu_gbp_bright: { id: "trashuncle_tu_gbp_bright", name: "GBP · TU GBP Bright", group: "trashuncle", colors: ["#ffffff", "#abb8a7", "#879481", "#5b5d5a"] },
  trashuncle_tu_gbp_clean: { id: "trashuncle_tu_gbp_clean", name: "GBP · TU GBP Clean", group: "trashuncle", colors: ["#edfff4", "#adbfac", "#98a291", "#3d493b"] },
  trashuncle_tu_gbp_weak_alt: { id: "trashuncle_tu_gbp_weak_alt", name: "GBP · TU GBP Weak Alt", group: "trashuncle", colors: ["#848459", "#757952", "#70734e", "#4c4b31"] },
  trashuncle_tu_gbp_weak: { id: "trashuncle_tu_gbp_weak", name: "GBP · TU GBP Weak", group: "trashuncle", colors: ["#667159", "#535f49", "#535a42", "#434738"] },
  trashuncle_tu_light_bright: { id: "trashuncle_tu_light_bright", name: "Light · TU Light Bright", group: "trashuncle", colors: ["#00e3f3", "#00daea", "#00a1b1", "#006374"] },
  trashuncle_tu_light_clean: { id: "trashuncle_tu_light_clean", name: "Light · TU Light Clean", group: "trashuncle", colors: ["#01b4b9", "#00aeaf", "#019fa0", "#007577"] },
  trashuncle_tu_light_dark: { id: "trashuncle_tu_light_dark", name: "Light · TU Light Dark", group: "trashuncle", colors: ["#00a5f2", "#0098c5", "#0092d1", "#0076a8"] },
  trashuncle_tu_light_idealized: { id: "trashuncle_tu_light_idealized", name: "Light · TU Light Idealized", group: "trashuncle", colors: ["#00ccd5", "#00a6cc", "#0093c5", "#006e9d"] },
  // ── TheWolfBunny64 ────────────────────────────────────────
  wolfbunny_absorbent_and_yellow: { id: "wolfbunny_absorbent_and_yellow", name: "American Pop Culture Pack · Absorbent and Yellow", group: "wolfbunny", colors: ["#fff752", "#aec600", "#687600", "#343b00"] },
  wolfbunny_bmo_ver: { id: "wolfbunny_bmo_ver", name: "American Pop Culture Pack · BMO Ver.", group: "wolfbunny", colors: ["#c0ffcc", "#99cca3", "#607f66", "#394c3d"] },
  wolfbunny_barbie_pink: { id: "wolfbunny_barbie_pink", name: "American Pop Culture Pack · Barbie Pink", group: "wolfbunny", colors: ["#f200a1", "#c10080", "#790050", "#480030"] },
  wolfbunny_bedrock_caveman_vision: { id: "wolfbunny_bedrock_caveman_vision", name: "American Pop Culture Pack · Bedrock Caveman Vision", group: "wolfbunny", colors: ["#ff7f00", "#009eb8", "#005e6e", "#002f37"] },
  wolfbunny_bikini_bottom_ver: { id: "wolfbunny_bikini_bottom_ver", name: "American Pop Culture Pack · Bikini Bottom Ver.", group: "wolfbunny", colors: ["#f8f880", "#48f8e0", "#2098f0", "#606000"] },
  wolfbunny_blossom_pink: { id: "wolfbunny_blossom_pink", name: "American Pop Culture Pack · Blossom Pink", group: "wolfbunny", colors: ["#f59bb2", "#c47c8e", "#7a4d59", "#492e35"] },
  wolfbunny_bubbles_blue: { id: "wolfbunny_bubbles_blue", name: "American Pop Culture Pack · Bubbles Blue", group: "wolfbunny", colors: ["#64c4e9", "#509cba", "#326274", "#1e3a45"] },
  wolfbunny_buttercup_green: { id: "wolfbunny_buttercup_green", name: "American Pop Culture Pack · Buttercup Green", group: "wolfbunny", colors: ["#bedc8d", "#98b070", "#5f6e46", "#39422a"] },
  wolfbunny_danny_phantom_silver: { id: "wolfbunny_danny_phantom_silver", name: "American Pop Culture Pack · Danny Phantom Silver", group: "wolfbunny", colors: ["#abbbcc", "#8895a3", "#555d66", "#33383d"] },
  wolfbunny_fairly_oddpalette: { id: "wolfbunny_fairly_oddpalette", name: "American Pop Culture Pack · Fairly OddPalette", group: "wolfbunny", colors: ["#7bb850", "#ce5a99", "#7b365b", "#3d1b2d"] },
  wolfbunny_garfield_vision: { id: "wolfbunny_garfield_vision", name: "American Pop Culture Pack · Garfield Vision", group: "wolfbunny", colors: ["#f5ea8b", "#e59436", "#964220", "#2d1309"] },
  wolfbunny_hogwarts_goldius: { id: "wolfbunny_hogwarts_goldius", name: "American Pop Culture Pack · Hogwarts Goldius", group: "wolfbunny", colors: ["#b6a571", "#91845a", "#5b5238", "#363121"] },
  wolfbunny_invincible_yellow_and_blue: { id: "wolfbunny_invincible_yellow_and_blue", name: "American Pop Culture Pack · Invincible Yellow and Blue", group: "wolfbunny", colors: ["#fee566", "#39c9eb", "#22788d", "#113c46"] },
  wolfbunny_nick_orange: { id: "wolfbunny_nick_orange", name: "American Pop Culture Pack · Nick Orange", group: "wolfbunny", colors: ["#ff6700", "#cc5200", "#7f3300", "#4c1e00"] },
  wolfbunny_ninja_turtle_green: { id: "wolfbunny_ninja_turtle_green", name: "American Pop Culture Pack · Ninja Turtle Green", group: "wolfbunny", colors: ["#86bc25", "#6b961d", "#435e12", "#28380b"] },
  wolfbunny_optimus_prime_palette: { id: "wolfbunny_optimus_prime_palette", name: "American Pop Culture Pack · Optimus Prime Palette", group: "wolfbunny", colors: ["#d3d3d3", "#d92121", "#0047ab", "#001533"] },
  wolfbunny_patrick_star_pink: { id: "wolfbunny_patrick_star_pink", name: "American Pop Culture Pack · Patrick Star Pink", group: "wolfbunny", colors: ["#ff808b", "#cc666f", "#7f4045", "#4c2629"] },
  wolfbunny_retro_bogeda: { id: "wolfbunny_retro_bogeda", name: "American Pop Culture Pack · Retro Bogeda", group: "wolfbunny", colors: ["#fbfd1b", "#ff6cff", "#6408ff", "#000000"] },
  wolfbunny_rocket_portable_power: { id: "wolfbunny_rocket_portable_power", name: "American Pop Culture Pack · Rocket Portable Power", group: "wolfbunny", colors: ["#fee998", "#bdd539", "#213f99", "#09122d"] },
  wolfbunny_rugrats_playtime_palette: { id: "wolfbunny_rugrats_playtime_palette", name: "American Pop Culture Pack · Rugrats Playtime Palette", group: "wolfbunny", colors: ["#ffffff", "#ffde17", "#ed1c24", "#662d91"] },
  wolfbunny_sailor_spinach_green: { id: "wolfbunny_sailor_spinach_green", name: "American Pop Culture Pack · Sailor Spinach Green", group: "wolfbunny", colors: ["#7bb03c", "#628c30", "#3d581e", "#243412"] },
  wolfbunny_scooby_doo_mystery_ver: { id: "wolfbunny_scooby_doo_mystery_ver", name: "American Pop Culture Pack · Scooby-Doo Mystery Ver.", group: "wolfbunny", colors: ["#c6de31", "#f79321", "#8f59a5", "#2a1a31"] },
  wolfbunny_smurfy_blue: { id: "wolfbunny_smurfy_blue", name: "American Pop Culture Pack · Smurfy Blue", group: "wolfbunny", colors: ["#2cb9ef", "#2394bf", "#165c77", "#0d3747"] },
  wolfbunny_spongebob_yellow: { id: "wolfbunny_spongebob_yellow", name: "American Pop Culture Pack · SpongeBob Yellow", group: "wolfbunny", colors: ["#f7e948", "#c5ba39", "#7b7424", "#4a4515"] },
  wolfbunny_squidward_sea_foam_green: { id: "wolfbunny_squidward_sea_foam_green", name: "American Pop Culture Pack · Squidward Sea Foam Green", group: "wolfbunny", colors: ["#b9d7cd", "#94aca4", "#5c6b66", "#37403d"] },
  wolfbunny_swampy_ogre_green: { id: "wolfbunny_swampy_ogre_green", name: "American Pop Culture Pack · Swampy Ogre Green", group: "wolfbunny", colors: ["#c1d62e", "#9aab24", "#606b17", "#39400d"] },
  wolfbunny_timmy_turner_pink: { id: "wolfbunny_timmy_turner_pink", name: "American Pop Culture Pack · Timmy Turner Pink", group: "wolfbunny", colors: ["#bc486d", "#963957", "#5e2436", "#381520"] },
  wolfbunny_universal_studios_blue: { id: "wolfbunny_universal_studios_blue", name: "American Pop Culture Pack · Universal Studios Blue", group: "wolfbunny", colors: ["#036ce2", "#0256b4", "#013671", "#002043"] },
  wolfbunny_animax_blue: { id: "wolfbunny_animax_blue", name: "Anime and Manga Pack · ANIMAX BLUE", group: "wolfbunny", colors: ["#3499e8", "#297ab9", "#1a4c74", "#0f2d45"] },
  wolfbunny_all_might_hero_palette: { id: "wolfbunny_all_might_hero_palette", name: "Anime and Manga Pack · All Might Hero Palette", group: "wolfbunny", colors: ["#eff0f0", "#f3db43", "#d12021", "#212f79"] },
  wolfbunny_anime_digivice_ver: { id: "wolfbunny_anime_digivice_ver", name: "Anime and Manga Pack · Anime Digivice Ver.", group: "wolfbunny", colors: ["#5b7b63", "#48624f", "#2d3d31", "#1b241d"] },
  wolfbunny_anime_expo_red: { id: "wolfbunny_anime_expo_red", name: "Anime and Manga Pack · Anime Expo Red", group: "wolfbunny", colors: ["#ee3b33", "#be2f28", "#771d19", "#47110f"] },
  wolfbunny_anime_expo_ver: { id: "wolfbunny_anime_expo_ver", name: "Anime and Manga Pack · Anime Expo Ver.", group: "wolfbunny", colors: ["#e5eaeb", "#9ba3a6", "#656e72", "#242a2d"] },
  wolfbunny_berserk_blood: { id: "wolfbunny_berserk_blood", name: "Anime and Manga Pack · Berserk Blood", group: "wolfbunny", colors: ["#bb1414", "#951010", "#5d0a0a", "#380606"] },
  wolfbunny_blue_stripes_ver: { id: "wolfbunny_blue_stripes_ver", name: "Anime and Manga Pack · Blue Stripes Ver.", group: "wolfbunny", colors: ["#8bd3e1", "#999b9c", "#5b5d5d", "#2d2e2e"] },
  wolfbunny_cardcaptor_pink: { id: "wolfbunny_cardcaptor_pink", name: "Anime and Manga Pack · Cardcaptor Pink", group: "wolfbunny", colors: ["#f2f4f7", "#eac3d6", "#e10e82", "#430427"] },
  wolfbunny_colorful_horizons: { id: "wolfbunny_colorful_horizons", name: "Anime and Manga Pack · Colorful Horizons", group: "wolfbunny", colors: ["#f6cf72", "#60bdc7", "#d15252", "#373939"] },
  wolfbunny_crunchyroll_orange: { id: "wolfbunny_crunchyroll_orange", name: "Anime and Manga Pack · Crunchyroll Orange", group: "wolfbunny", colors: ["#f47522", "#c35d1b", "#7a3a11", "#49230a"] },
  wolfbunny_deku_alpha_emerald: { id: "wolfbunny_deku_alpha_emerald", name: "Anime and Manga Pack · Deku Alpha Emerald", group: "wolfbunny", colors: ["#39ad9e", "#2d8a7e", "#1c564f", "#11332f"] },
  wolfbunny_deku_gamma_palette: { id: "wolfbunny_deku_gamma_palette", name: "Anime and Manga Pack · Deku Gamma Palette", group: "wolfbunny", colors: ["#f0e8d6", "#b6bec8", "#166668", "#24262b"] },
  wolfbunny_deku_vigilante_palette: { id: "wolfbunny_deku_vigilante_palette", name: "Anime and Manga Pack · Deku Vigilante Palette", group: "wolfbunny", colors: ["#ada89a", "#878b92", "#38534e", "#131315"] },
  wolfbunny_demon_slayer_gold: { id: "wolfbunny_demon_slayer_gold", name: "Anime and Manga Pack · Demon Slayer Gold", group: "wolfbunny", colors: ["#baaf56", "#948c44", "#5d572b", "#373419"] },
  wolfbunny_doraemon_tricolor: { id: "wolfbunny_doraemon_tricolor", name: "Anime and Manga Pack · Doraemon Tricolor", group: "wolfbunny", colors: ["#ffe800", "#00a8f4", "#e60000", "#450000"] },
  wolfbunny_dragon_ball_orange: { id: "wolfbunny_dragon_ball_orange", name: "Anime and Manga Pack · Dragon Ball Orange", group: "wolfbunny", colors: ["#f0831d", "#c06817", "#78410e", "#482708"] },
  wolfbunny_dynamight_hero_palette: { id: "wolfbunny_dynamight_hero_palette", name: "Anime and Manga Pack · Dynamight Hero Palette", group: "wolfbunny", colors: ["#d1d0cc", "#c84a31", "#29463d", "#161616"] },
  wolfbunny_eva_01: { id: "wolfbunny_eva_01", name: "Anime and Manga Pack · EVA-01", group: "wolfbunny", colors: ["#f99b22", "#54cf54", "#765898", "#303345"] },
  wolfbunny_eden_academy_uniform: { id: "wolfbunny_eden_academy_uniform", name: "Anime and Manga Pack · Eden Academy Uniform", group: "wolfbunny", colors: ["#f7f8f5", "#dcbc76", "#cc4c47", "#483e39"] },
  wolfbunny_forger_pretense_palette: { id: "wolfbunny_forger_pretense_palette", name: "Anime and Manga Pack · Forger Pretense Palette", group: "wolfbunny", colors: ["#8ea99b", "#697d73", "#8d0000", "#000000"] },
  wolfbunny_good_smile_vision: { id: "wolfbunny_good_smile_vision", name: "Anime and Manga Pack · GOOD SMILE VISION", group: "wolfbunny", colors: ["#9fa0a0", "#ee7700", "#8e4700", "#472300"] },
  wolfbunny_gear_5_fever: { id: "wolfbunny_gear_5_fever", name: "Anime and Manga Pack · Gear 5 Fever", group: "wolfbunny", colors: ["#f7f7f7", "#c5cedf", "#a662cd", "#311d3d"] },
  wolfbunny_goku_gt_gi: { id: "wolfbunny_goku_gt_gi", name: "Anime and Manga Pack · Goku GT Gi", group: "wolfbunny", colors: ["#dbe3e6", "#f0ac18", "#3d6ea5", "#122131"] },
  wolfbunny_goku_gi: { id: "wolfbunny_goku_gi", name: "Anime and Manga Pack · Goku Gi", group: "wolfbunny", colors: ["#f9f0e1", "#e7612c", "#173f72", "#061222"] },
  wolfbunny_grand_ivory: { id: "wolfbunny_grand_ivory", name: "Anime and Manga Pack · Grand Ivory", group: "wolfbunny", colors: ["#d9d6be", "#adab98", "#6c6b5f", "#414039"] },
  wolfbunny_grand_zeno_coat: { id: "wolfbunny_grand_zeno_coat", name: "Anime and Manga Pack · Grand Zeno Coat", group: "wolfbunny", colors: ["#fbfbfa", "#fce72d", "#ce26a9", "#3d0b32"] },
  wolfbunny_hokage_orange: { id: "wolfbunny_hokage_orange", name: "Anime and Manga Pack · Hokage Orange", group: "wolfbunny", colors: ["#ea8352", "#bb6841", "#754129", "#462718"] },
  wolfbunny_konosuba_sherbet: { id: "wolfbunny_konosuba_sherbet", name: "Anime and Manga Pack · KonoSuba Sherbet", group: "wolfbunny", colors: ["#f08200", "#e5006e", "#890042", "#440021"] },
  wolfbunny_kuwabara_blue: { id: "wolfbunny_kuwabara_blue", name: "Anime and Manga Pack · Kuwabara Blue", group: "wolfbunny", colors: ["#0088c5", "#006c9d", "#004462", "#00283b"] },
  wolfbunny_legendary_super_saiyan: { id: "wolfbunny_legendary_super_saiyan", name: "Anime and Manga Pack · Legendary Super Saiyan", group: "wolfbunny", colors: ["#a6da5b", "#84ae48", "#536d2d", "#31411b"] },
  wolfbunny_lisani_orange: { id: "wolfbunny_lisani_orange", name: "Anime and Manga Pack · LisAni Orange!", group: "wolfbunny", colors: ["#eb5e01", "#bc4b00", "#752f00", "#461c00"] },
  wolfbunny_perfect_majin_emperor: { id: "wolfbunny_perfect_majin_emperor", name: "Anime and Manga Pack · Perfect Majin Emperor", group: "wolfbunny", colors: ["#fdc1bf", "#a3b453", "#8550a9", "#271832"] },
  wolfbunny_perfected_ultra_instinct: { id: "wolfbunny_perfected_ultra_instinct", name: "Anime and Manga Pack · Perfected Ultra Instinct", group: "wolfbunny", colors: ["#c0c8d8", "#99a0ac", "#60646c", "#393c40"] },
  wolfbunny_precure_marble_raspberry: { id: "wolfbunny_precure_marble_raspberry", name: "Anime and Manga Pack · Precure Marble Raspberry", group: "wolfbunny", colors: ["#d6225c", "#ab1b49", "#6b112e", "#400a1b"] },
  wolfbunny_pretty_guardian_gold: { id: "wolfbunny_pretty_guardian_gold", name: "Anime and Manga Pack · Pretty Guardian Gold", group: "wolfbunny", colors: ["#b4aa82", "#908868", "#5a5541", "#363327"] },
  wolfbunny_saiyan_beast_silver: { id: "wolfbunny_saiyan_beast_silver", name: "Anime and Manga Pack · Saiyan Beast Silver", group: "wolfbunny", colors: ["#969baf", "#787c8c", "#4b4d57", "#2d2e34"] },
  wolfbunny_shenron_green: { id: "wolfbunny_shenron_green", name: "Anime and Manga Pack · Shenron Green", group: "wolfbunny", colors: ["#5ac34a", "#489c3b", "#2d6125", "#1b3a16"] },
  wolfbunny_straw_hat_red: { id: "wolfbunny_straw_hat_red", name: "Anime and Manga Pack · Straw Hat Red", group: "wolfbunny", colors: ["#f8523c", "#c64130", "#7c291e", "#4a1812"] },
  wolfbunny_super_saiyan_3: { id: "wolfbunny_super_saiyan_3", name: "Anime and Manga Pack · Super Saiyan 3", group: "wolfbunny", colors: ["#f8c838", "#c6a02c", "#7c641c", "#4a3c10"] },
  wolfbunny_super_saiyan_blue_evolved: { id: "wolfbunny_super_saiyan_blue_evolved", name: "Anime and Manga Pack · Super Saiyan Blue Evolved", group: "wolfbunny", colors: ["#1b97d1", "#1578a7", "#0d4b68", "#082d3e"] },
  wolfbunny_super_saiyan_blue: { id: "wolfbunny_super_saiyan_blue", name: "Anime and Manga Pack · Super Saiyan Blue", group: "wolfbunny", colors: ["#05bccc", "#0496a3", "#025d66", "#01383d"] },
  wolfbunny_super_saiyan_god: { id: "wolfbunny_super_saiyan_god", name: "Anime and Manga Pack · Super Saiyan God", group: "wolfbunny", colors: ["#d70362", "#ac024e", "#6b0131", "#40001d"] },
  wolfbunny_super_saiyan_rose: { id: "wolfbunny_super_saiyan_rose", name: "Anime and Manga Pack · Super Saiyan Rose", group: "wolfbunny", colors: ["#f7afb3", "#c58c8f", "#7b5759", "#4a3435"] },
  wolfbunny_super_saiyan: { id: "wolfbunny_super_saiyan", name: "Anime and Manga Pack · Super Saiyan", group: "wolfbunny", colors: ["#fefcc1", "#cbc99a", "#7f7e60", "#4c4b39"] },
  wolfbunny_survey_corps_uniform: { id: "wolfbunny_survey_corps_uniform", name: "Anime and Manga Pack · Survey Corps Uniform", group: "wolfbunny", colors: ["#acaba9", "#ac7c59", "#593d34", "#321d1a"] },
  wolfbunny_sword_art_cyan: { id: "wolfbunny_sword_art_cyan", name: "Anime and Manga Pack · Sword Art Cyan", group: "wolfbunny", colors: ["#59c3e2", "#479cb4", "#2c6171", "#1a3a43"] },
  wolfbunny_team_rocket_uniform: { id: "wolfbunny_team_rocket_uniform", name: "Anime and Manga Pack · Team Rocket Uniform", group: "wolfbunny", colors: ["#eeefeb", "#e94e60", "#755e88", "#474f4d"] },
  wolfbunny_tri_digivice_ver: { id: "wolfbunny_tri_digivice_ver", name: "Anime and Manga Pack · Tri Digivice Ver.", group: "wolfbunny", colors: ["#848f79", "#697260", "#42473c", "#272a24"] },
  wolfbunny_u_a_high_school_uniform: { id: "wolfbunny_u_a_high_school_uniform", name: "Anime and Manga Pack · U.A. High School Uniform", group: "wolfbunny", colors: ["#ededed", "#a4aaaf", "#a02929", "#0c4856"] },
  wolfbunny_uta_vision: { id: "wolfbunny_uta_vision", name: "Anime and Manga Pack · UTA VISION", group: "wolfbunny", colors: ["#f4f4f4", "#f1a7b5", "#e24465", "#262c48"] },
  wolfbunny_ultra_instinct_sign: { id: "wolfbunny_ultra_instinct_sign", name: "Anime and Manga Pack · Ultra Instinct Sign", group: "wolfbunny", colors: ["#5a686f", "#485358", "#2d3437", "#1b1f21"] },
  wolfbunny_urameshi_green: { id: "wolfbunny_urameshi_green", name: "Anime and Manga Pack · Urameshi Green", group: "wolfbunny", colors: ["#4dae88", "#3d8b6c", "#265744", "#173428"] },
  wolfbunny_vegeta_armor: { id: "wolfbunny_vegeta_armor", name: "Anime and Manga Pack · Vegeta Armor", group: "wolfbunny", colors: ["#efefef", "#e3c56c", "#1554a9", "#061932"] },
  wolfbunny_animate_vision: { id: "wolfbunny_animate_vision", name: "Anime and Manga Pack · animate vision", group: "wolfbunny", colors: ["#ffffff", "#f9be00", "#385eaa", "#231815"] },
  wolfbunny_holoblue: { id: "wolfbunny_holoblue", name: "Anime and Manga Pack · holoblue", group: "wolfbunny", colors: ["#b0edfa", "#49c4f2", "#3368d3", "#063f5c"] },
  wolfbunny_1st_vision_pastel: { id: "wolfbunny_1st_vision_pastel", name: "Bandai Namco Pack · 1st Vision Pastel", group: "wolfbunny", colors: ["#ea7cb1", "#7faf5a", "#385ead", "#101c33"] },
  wolfbunny_765_production_ver: { id: "wolfbunny_765_production_ver", name: "Bandai Namco Pack · 765 Production Ver.", group: "wolfbunny", colors: ["#bbc4e4", "#959cb6", "#5d6272", "#383a44"] },
  wolfbunny_765pro_pink: { id: "wolfbunny_765pro_pink", name: "Bandai Namco Pack · 765PRO Pink", group: "wolfbunny", colors: ["#f34f6d", "#c23f57", "#792736", "#481720"] },
  wolfbunny_765pro_tricolor: { id: "wolfbunny_765pro_tricolor", name: "Bandai Namco Pack · 765PRO TRICOLOR", group: "wolfbunny", colors: ["#b4e04b", "#e22b30", "#2743d2", "#0b143f"] },
  wolfbunny_a_rise_blue: { id: "wolfbunny_a_rise_blue", name: "Bandai Namco Pack · A-RISE BLUE", group: "wolfbunny", colors: ["#30559c", "#26447c", "#182a4e", "#0e192e"] },
  wolfbunny_aqours_blue: { id: "wolfbunny_aqours_blue", name: "Bandai Namco Pack · Aqours Blue", group: "wolfbunny", colors: ["#00a0e9", "#0080ba", "#005074", "#003045"] },
  wolfbunny_bandai_namco_tricolor: { id: "wolfbunny_bandai_namco_tricolor", name: "Bandai Namco Pack · Bandai Namco Tricolor", group: "wolfbunny", colors: ["#f6b700", "#df4f61", "#0069b1", "#001f35"] },
  wolfbunny_cinderella_blue: { id: "wolfbunny_cinderella_blue", name: "Bandai Namco Pack · CINDERELLA Blue", group: "wolfbunny", colors: ["#2681c8", "#1e67a0", "#134064", "#0b263c"] },
  wolfbunny_idol_world_tricolor: { id: "wolfbunny_idol_world_tricolor", name: "Bandai Namco Pack · IDOL WORLD TRICOLOR!!!", group: "wolfbunny", colors: ["#ffc30b", "#f34f6d", "#2681c8", "#0b263c"] },
  wolfbunny_liella_purple: { id: "wolfbunny_liella_purple", name: "Bandai Namco Pack · Liella Purple!", group: "wolfbunny", colors: ["#a5469b", "#84387c", "#52234d", "#31152e"] },
  wolfbunny_million_live_gold: { id: "wolfbunny_million_live_gold", name: "Bandai Namco Pack · MILLION LIVE GOLD!", group: "wolfbunny", colors: ["#cdb261", "#a48e4d", "#665930", "#3d351d"] },
  wolfbunny_million_yellow: { id: "wolfbunny_million_yellow", name: "Bandai Namco Pack · MILLION Yellow!", group: "wolfbunny", colors: ["#ffc30b", "#cc9c08", "#7f6105", "#4c3a03"] },
  wolfbunny_moonlight_vision: { id: "wolfbunny_moonlight_vision", name: "Bandai Namco Pack · Moonlight Vision", group: "wolfbunny", colors: ["#f8d868", "#3890e8", "#305078", "#101010"] },
  wolfbunny_muse_pink: { id: "wolfbunny_muse_pink", name: "Bandai Namco Pack · Muse Pink", group: "wolfbunny", colors: ["#e4007f", "#b60065", "#72003f", "#440026"] },
  wolfbunny_namco_idol_pink: { id: "wolfbunny_namco_idol_pink", name: "Bandai Namco Pack · Namco Idol Pink", group: "wolfbunny", colors: ["#ff74b8", "#cc5c93", "#7f3a5c", "#4c2237"] },
  wolfbunny_nijigasaki_orange: { id: "wolfbunny_nijigasaki_orange", name: "Bandai Namco Pack · Nijigasaki Orange", group: "wolfbunny", colors: ["#f39800", "#c27900", "#794c00", "#482d00"] },
  wolfbunny_pac_palette: { id: "wolfbunny_pac_palette", name: "Bandai Namco Pack · PAC-PALETTE", group: "wolfbunny", colors: ["#ffd800", "#ff8c00", "#dc0000", "#420000"] },
  wolfbunny_pac_man_vision: { id: "wolfbunny_pac_man_vision", name: "Bandai Namco Pack · Pac-Man Vision", group: "wolfbunny", colors: ["#ffff00", "#ffb897", "#3732ff", "#000000"] },
  wolfbunny_pac_man_yellow: { id: "wolfbunny_pac_man_yellow", name: "Bandai Namco Pack · Pac-Man Yellow", group: "wolfbunny", colors: ["#ffe300", "#ccb500", "#7f7100", "#4c4400"] },
  wolfbunny_radiant_smile_ramp: { id: "wolfbunny_radiant_smile_ramp", name: "Bandai Namco Pack · RADIANT SMILE RAMP", group: "wolfbunny", colors: ["#fff89b", "#01b3c4", "#e6016b", "#1b1c81"] },
  wolfbunny_rx_78_2_gundam_mode: { id: "wolfbunny_rx_78_2_gundam_mode", name: "Bandai Namco Pack · RX-78-2 Gundam Mode", group: "wolfbunny", colors: ["#dbdcd5", "#dbad40", "#a73736", "#333f3f"] },
  wolfbunny_ryuuguu_sunset: { id: "wolfbunny_ryuuguu_sunset", name: "Bandai Namco Pack · Ryuuguu Sunset", group: "wolfbunny", colors: ["#ffe43f", "#fd99e1", "#9238be", "#2b1039"] },
  wolfbunny_shiny_sky_blue: { id: "wolfbunny_shiny_sky_blue", name: "Bandai Namco Pack · SHINY Sky Blue", group: "wolfbunny", colors: ["#8dbbff", "#7095cc", "#465d7f", "#2a384c"] },
  wolfbunny_saint_snow_red: { id: "wolfbunny_saint_snow_red", name: "Bandai Namco Pack · Saint Snow Red", group: "wolfbunny", colors: ["#bf3936", "#982d2b", "#5f1c1b", "#391110"] },
  wolfbunny_school_idol_blue: { id: "wolfbunny_school_idol_blue", name: "Bandai Namco Pack · School Idol Blue", group: "wolfbunny", colors: ["#f9f9f8", "#87adf5", "#3960d7", "#283066"] },
  wolfbunny_school_idol_mix: { id: "wolfbunny_school_idol_mix", name: "Bandai Namco Pack · School Idol Mix", group: "wolfbunny", colors: ["#f39800", "#00a0e9", "#a5469b", "#31152e"] },
  wolfbunny_sidem_green: { id: "wolfbunny_sidem_green", name: "Bandai Namco Pack · SideM Green", group: "wolfbunny", colors: ["#0fbe94", "#0c9876", "#075f4a", "#04392c"] },
  wolfbunny_sunny_passion_paradise: { id: "wolfbunny_sunny_passion_paradise", name: "Bandai Namco Pack · Sunny Passion Paradise", group: "wolfbunny", colors: ["#f0ba40", "#e06846", "#1e6cae", "#092034"] },
  wolfbunny_sylvarant_rose_pink: { id: "wolfbunny_sylvarant_rose_pink", name: "Bandai Namco Pack · Sylvarant Rose Pink", group: "wolfbunny", colors: ["#e88486", "#b9696b", "#744243", "#452728"] },
  wolfbunny_tarnished_gold: { id: "wolfbunny_tarnished_gold", name: "Bandai Namco Pack · Tarnished Gold", group: "wolfbunny", colors: ["#c19d53", "#9a7d42", "#604e29", "#392f18"] },
  wolfbunny_vulnerable_blue: { id: "wolfbunny_vulnerable_blue", name: "Bandai Namco Pack · Vulnerable Blue", group: "wolfbunny", colors: ["#ffb897", "#cc9378", "#7f5c4b", "#3732ff"] },
  wolfbunny_wind_ring_emerald: { id: "wolfbunny_wind_ring_emerald", name: "Bandai Namco Pack · Wind Ring Emerald", group: "wolfbunny", colors: ["#28b585", "#20906a", "#145a42", "#0c3627"] },
  wolfbunny_amazon_vision: { id: "wolfbunny_amazon_vision", name: "Company Pack · Amazon Vision", group: "wolfbunny", colors: ["#ffffff", "#ff9900", "#008296", "#252f3e"] },
  wolfbunny_android_green: { id: "wolfbunny_android_green", name: "Company Pack · Android Green", group: "wolfbunny", colors: ["#3ddc84", "#30b069", "#1e6e42", "#124227"] },
  wolfbunny_apple_silver: { id: "wolfbunny_apple_silver", name: "Company Pack · Apple Silver", group: "wolfbunny", colors: ["#a2aaad", "#81888a", "#515556", "#303333"] },
  wolfbunny_duolingo_green: { id: "wolfbunny_duolingo_green", name: "Company Pack · Duolingo Green", group: "wolfbunny", colors: ["#58cc02", "#46a301", "#2c6601", "#1a3d00"] },
  wolfbunny_duracell_copper: { id: "wolfbunny_duracell_copper", name: "Company Pack · Duracell Copper", group: "wolfbunny", colors: ["#c8895d", "#a06d4a", "#64442e", "#3c291b"] },
  wolfbunny_google_blue: { id: "wolfbunny_google_blue", name: "Company Pack · Google Blue", group: "wolfbunny", colors: ["#4285f4", "#346ac3", "#21427a", "#132749"] },
  wolfbunny_google_green: { id: "wolfbunny_google_green", name: "Company Pack · Google Green", group: "wolfbunny", colors: ["#34a853", "#298642", "#1a5429", "#0f3218"] },
  wolfbunny_google_red: { id: "wolfbunny_google_red", name: "Company Pack · Google Red", group: "wolfbunny", colors: ["#ea4335", "#bb352a", "#75211a", "#46140f"] },
  wolfbunny_google_yellow: { id: "wolfbunny_google_yellow", name: "Company Pack · Google Yellow", group: "wolfbunny", colors: ["#fbbc05", "#c89604", "#7d5e02", "#4b3801"] },
  wolfbunny_spotify_green: { id: "wolfbunny_spotify_green", name: "Company Pack · Spotify Green", group: "wolfbunny", colors: ["#1ed760", "#18ac4c", "#0f6b30", "#09401c"] },
  wolfbunny_7_eleven_color_combo: { id: "wolfbunny_7_eleven_color_combo", name: "Food and Drink Pack · 7-Eleven Color Combo", group: "wolfbunny", colors: ["#ff6c00", "#eb0f2a", "#147350", "#062218"] },
  wolfbunny_baja_blast_beach: { id: "wolfbunny_baja_blast_beach", name: "Food and Drink Pack · Baja Blast Beach", group: "wolfbunny", colors: ["#dbe441", "#83ccc5", "#4e7a76", "#273d3b"] },
  wolfbunny_baja_blast_storm: { id: "wolfbunny_baja_blast_storm", name: "Food and Drink Pack · Baja Blast Storm", group: "wolfbunny", colors: ["#68c2a4", "#539b83", "#346152", "#1f3a31"] },
  wolfbunny_baskin_robbins_sundae: { id: "wolfbunny_baskin_robbins_sundae", name: "Food and Drink Pack · Baskin-Robbins Sundae", group: "wolfbunny", colors: ["#f05097", "#c04078", "#78284b", "#402021"] },
  wolfbunny_burger_king_color_combo: { id: "wolfbunny_burger_king_color_combo", name: "Food and Drink Pack · Burger King Color Combo", group: "wolfbunny", colors: ["#f5ebdc", "#ff8732", "#d62300", "#502314"] },
  wolfbunny_cheeto_orange: { id: "wolfbunny_cheeto_orange", name: "Food and Drink Pack · Cheeto Orange", group: "wolfbunny", colors: ["#e57600", "#b75e00", "#723b00", "#442300"] },
  wolfbunny_circle_k_color_combo: { id: "wolfbunny_circle_k_color_combo", name: "Food and Drink Pack · Circle K Color Combo", group: "wolfbunny", colors: ["#f99b2a", "#ec2e24", "#8d1b15", "#460d0a"] },
  wolfbunny_coca_cola_vision: { id: "wolfbunny_coca_cola_vision", name: "Food and Drink Pack · Coca-Cola Vision", group: "wolfbunny", colors: ["#ffffff", "#d7d7d7", "#f40009", "#000000"] },
  wolfbunny_dew_green: { id: "wolfbunny_dew_green", name: "Food and Drink Pack · Dew Green", group: "wolfbunny", colors: ["#97d700", "#78ac00", "#4b6b00", "#2d4000"] },
  wolfbunny_domino_s_pizza_vision: { id: "wolfbunny_domino_s_pizza_vision", name: "Food and Drink Pack · Domino's Pizza Vision", group: "wolfbunny", colors: ["#ffffff", "#e31837", "#006491", "#000000"] },
  wolfbunny_dr_pepper_red: { id: "wolfbunny_dr_pepper_red", name: "Food and Drink Pack · Dr Pepper Red", group: "wolfbunny", colors: ["#8a2231", "#6e1b27", "#451118", "#290a0e"] },
  wolfbunny_dunkin_vision: { id: "wolfbunny_dunkin_vision", name: "Food and Drink Pack · Dunkin' Vision", group: "wolfbunny", colors: ["#ff6e0c", "#f20c90", "#910756", "#48032b"] },
  wolfbunny_kentucky_fried_red: { id: "wolfbunny_kentucky_fried_red", name: "Food and Drink Pack · Kentucky Fried Red", group: "wolfbunny", colors: ["#ab182f", "#881325", "#550c17", "#33070e"] },
  wolfbunny_krispy_kreme_vision: { id: "wolfbunny_krispy_kreme_vision", name: "Food and Drink Pack · Krispy Kreme Vision", group: "wolfbunny", colors: ["#ffffff", "#cf152d", "#166938", "#000000"] },
  wolfbunny_lemon_lime_green: { id: "wolfbunny_lemon_lime_green", name: "Food and Drink Pack · Lemon-Lime Green", group: "wolfbunny", colors: ["#f1c545", "#51a631", "#30631d", "#18310e"] },
  wolfbunny_mountain_dew_ver: { id: "wolfbunny_mountain_dew_ver", name: "Food and Drink Pack · Mountain Dew Ver.", group: "wolfbunny", colors: ["#ffffff", "#a1d23f", "#d82a34", "#29673c"] },
  wolfbunny_pocari_sweat_blue: { id: "wolfbunny_pocari_sweat_blue", name: "Food and Drink Pack · POCARI SWEAT BLUE", group: "wolfbunny", colors: ["#015db2", "#004a8e", "#002e59", "#001b35"] },
  wolfbunny_pepsi_vision: { id: "wolfbunny_pepsi_vision", name: "Food and Drink Pack · Pepsi Vision", group: "wolfbunny", colors: ["#ffffff", "#ff1400", "#1414c8", "#000000"] },
  wolfbunny_pizza_hut_red: { id: "wolfbunny_pizza_hut_red", name: "Food and Drink Pack · Pizza Hut Red", group: "wolfbunny", colors: ["#e3383e", "#b52c31", "#711c1f", "#441012"] },
  wolfbunny_sprite_green: { id: "wolfbunny_sprite_green", name: "Food and Drink Pack · Sprite Green", group: "wolfbunny", colors: ["#009b4e", "#007c3e", "#004d27", "#002e17"] },
  wolfbunny_avgn_raging_volcano: { id: "wolfbunny_avgn_raging_volcano", name: "Gaming Pack · AVGN Raging Volcano", group: "wolfbunny", colors: ["#f8b800", "#f83800", "#a81000", "#1c0000"] },
  wolfbunny_blue_bomber_vision: { id: "wolfbunny_blue_bomber_vision", name: "Gaming Pack · Blue Bomber Vision", group: "wolfbunny", colors: ["#e2cda7", "#639afc", "#0d4dc4", "#000000"] },
  wolfbunny_bobblun_blue: { id: "wolfbunny_bobblun_blue", name: "Gaming Pack · Bobblun Blue", group: "wolfbunny", colors: ["#1fd1fd", "#18a7ca", "#0f687e", "#093e4b"] },
  wolfbunny_bubblun_green: { id: "wolfbunny_bubblun_green", name: "Gaming Pack · Bubblun Green", group: "wolfbunny", colors: ["#6adc31", "#54b027", "#356e18", "#1f420e"] },
  wolfbunny_chaos_emerald_green: { id: "wolfbunny_chaos_emerald_green", name: "Gaming Pack · Chaos Emerald Green", group: "wolfbunny", colors: ["#a0e000", "#80c800", "#409800", "#208000"] },
  wolfbunny_classic_blurple: { id: "wolfbunny_classic_blurple", name: "Gaming Pack · Classic Blurple", group: "wolfbunny", colors: ["#7289da", "#5b6dae", "#38446d", "#222941"] },
  wolfbunny_dmg_pea_green: { id: "wolfbunny_dmg_pea_green", name: "Gaming Pack · DMG Pea Green", group: "wolfbunny", colors: ["#d7e894", "#aec440", "#527f39", "#204631"] },
  wolfbunny_ebott_prolouge: { id: "wolfbunny_ebott_prolouge", name: "Gaming Pack · Ebott Prolouge", group: "wolfbunny", colors: ["#c08226", "#854a1d", "#4a290b", "#2c1708"] },
  wolfbunny_game_grump_orange: { id: "wolfbunny_game_grump_orange", name: "Gaming Pack · Game Grump Orange", group: "wolfbunny", colors: ["#e9762f", "#ba5e25", "#743b17", "#45230e"] },
  wolfbunny_giga_kiwi_dmg: { id: "wolfbunny_giga_kiwi_dmg", name: "Gaming Pack · Giga Kiwi DMG", group: "wolfbunny", colors: ["#d0e040", "#a0a830", "#607028", "#384828"] },
  wolfbunny_investigation_yellow: { id: "wolfbunny_investigation_yellow", name: "Gaming Pack · Investigation Yellow", group: "wolfbunny", colors: ["#fff919", "#ccc714", "#7f7c0c", "#4c4a07"] },
  wolfbunny_phantom_red: { id: "wolfbunny_phantom_red", name: "Gaming Pack · Phantom Red", group: "wolfbunny", colors: ["#fd2639", "#ca1e2d", "#7e131c", "#4b0b11"] },
  wolfbunny_puyo_puyo_green: { id: "wolfbunny_puyo_puyo_green", name: "Gaming Pack · Puyo Puyo Green", group: "wolfbunny", colors: ["#48e236", "#39b42b", "#24771b", "#154310"] },
  wolfbunny_s_e_e_s_blue: { id: "wolfbunny_s_e_e_s_blue", name: "Gaming Pack · S.E.E.S. Blue", group: "wolfbunny", colors: ["#19d1ff", "#14a7cc", "#0c687f", "#073e4c"] },
  wolfbunny_sega_tokyo_blue: { id: "wolfbunny_sega_tokyo_blue", name: "Gaming Pack · SEGA Tokyo Blue", group: "wolfbunny", colors: ["#0082d4", "#0068a9", "#00416a", "#00273f"] },
  wolfbunny_scarlett_green: { id: "wolfbunny_scarlett_green", name: "Gaming Pack · Scarlett Green", group: "wolfbunny", colors: ["#9bf00b", "#7cc008", "#4d7805", "#2e4803"] },
  wolfbunny_slime_blue: { id: "wolfbunny_slime_blue", name: "Gaming Pack · Slime Blue", group: "wolfbunny", colors: ["#2f8ccc", "#2570a3", "#174666", "#0e2a3d"] },
  wolfbunny_sonic_mega_blue: { id: "wolfbunny_sonic_mega_blue", name: "Gaming Pack · Sonic Mega Blue", group: "wolfbunny", colors: ["#4084d9", "#3369ad", "#20426c", "#132741"] },
  wolfbunny_steam_gray: { id: "wolfbunny_steam_gray", name: "Gaming Pack · Steam Gray", group: "wolfbunny", colors: ["#c5c3c0", "#9d9c99", "#626160", "#3b3a39"] },
  wolfbunny_teyvat_brown: { id: "wolfbunny_teyvat_brown", name: "Gaming Pack · Teyvat Brown", group: "wolfbunny", colors: ["#b89469", "#937654", "#5c4a34", "#372c1f"] },
  wolfbunny_tropical_cyber_space: { id: "wolfbunny_tropical_cyber_space", name: "Gaming Pack · Tropical Cyber Space", group: "wolfbunny", colors: ["#63fdfb", "#ef58f7", "#4344c1", "#141439"] },
  wolfbunny_xbox_green: { id: "wolfbunny_xbox_green", name: "Gaming Pack · Xbox Green", group: "wolfbunny", colors: ["#92c83e", "#74a031", "#49641f", "#2b3c12"] },
  wolfbunny_christmas_gold: { id: "wolfbunny_christmas_gold", name: "Holiday Pack · Christmas Gold", group: "wolfbunny", colors: ["#c0a94b", "#99873c", "#605425", "#393216"] },
  wolfbunny_christmas_silver: { id: "wolfbunny_christmas_silver", name: "Holiday Pack · Christmas Silver", group: "wolfbunny", colors: ["#95a8b2", "#77868e", "#4a5459", "#2c3235"] },
  wolfbunny_christmas_ver: { id: "wolfbunny_christmas_ver", name: "Holiday Pack · Christmas Ver.", group: "wolfbunny", colors: ["#cbb96a", "#20a465", "#a03232", "#300f0f"] },
  wolfbunny_classy_christmas: { id: "wolfbunny_classy_christmas", name: "Holiday Pack · Classy Christmas", group: "wolfbunny", colors: ["#e8e7df", "#8bab95", "#9e5c5e", "#534d57"] },
  wolfbunny_clover_green: { id: "wolfbunny_clover_green", name: "Holiday Pack · Clover Green", group: "wolfbunny", colors: ["#39b54a", "#2d903b", "#1c5a25", "#113616"] },
  wolfbunny_cupid_s_love_palette: { id: "wolfbunny_cupid_s_love_palette", name: "Holiday Pack · Cupid's Love Palette", group: "wolfbunny", colors: ["#e4cdd3", "#e48397", "#b51a3a", "#5e081e"] },
  wolfbunny_festive_christmas: { id: "wolfbunny_festive_christmas", name: "Holiday Pack · Festive Christmas", group: "wolfbunny", colors: ["#bb9b60", "#cc1902", "#224b21", "#0a1609"] },
  wolfbunny_glacial_winter_blue: { id: "wolfbunny_glacial_winter_blue", name: "Holiday Pack · Glacial Winter Blue", group: "wolfbunny", colors: ["#87c1e2", "#6c9ab4", "#436071", "#283943"] },
  wolfbunny_grinchy_green: { id: "wolfbunny_grinchy_green", name: "Holiday Pack · Grinchy Green", group: "wolfbunny", colors: ["#b7be1c", "#929816", "#5b5f0e", "#363908"] },
  wolfbunny_halloween_ver: { id: "wolfbunny_halloween_ver", name: "Holiday Pack · Halloween Ver.", group: "wolfbunny", colors: ["#ffcc00", "#f68c00", "#9540a5", "#2c1331"] },
  wolfbunny_haunted_halloween: { id: "wolfbunny_haunted_halloween", name: "Holiday Pack · Haunted Halloween", group: "wolfbunny", colors: ["#caff37", "#ffa52e", "#9e1fff", "#2f094c"] },
  wolfbunny_independence_boy: { id: "wolfbunny_independence_boy", name: "Holiday Pack · Independence Boy", group: "wolfbunny", colors: ["#ffffff", "#b31942", "#0a3161", "#000000"] },
  wolfbunny_irish_green: { id: "wolfbunny_irish_green", name: "Holiday Pack · Irish Green", group: "wolfbunny", colors: ["#45be76", "#37985e", "#225f3b", "#143923"] },
  wolfbunny_spooky_purple: { id: "wolfbunny_spooky_purple", name: "Holiday Pack · Spooky Purple", group: "wolfbunny", colors: ["#9e7cd2", "#7e63a8", "#4f3e69", "#2f253f"] },
  wolfbunny_winter_christmas: { id: "wolfbunny_winter_christmas", name: "Holiday Pack · Winter Christmas", group: "wolfbunny", colors: ["#dddddd", "#65b08f", "#ae3b40", "#341113"] },
  wolfbunny_akb48_pink: { id: "wolfbunny_akb48_pink", name: "J-Pop Pack · AKB48 Pink", group: "wolfbunny", colors: ["#f676a6", "#c45e84", "#7b3b53", "#492331"] },
  wolfbunny_atarashi_gakko_paretto: { id: "wolfbunny_atarashi_gakko_paretto", name: "J-Pop Pack · ATARASHI GAKKO PARETTO", group: "wolfbunny", colors: ["#f4a7eb", "#c375bc", "#7a5375", "#030a5b"] },
  wolfbunny_babymetal_kitsune_red: { id: "wolfbunny_babymetal_kitsune_red", name: "J-Pop Pack · BABYMETAL KITSUNE RED", group: "wolfbunny", colors: ["#95000c", "#770009", "#4a0006", "#2c0003"] },
  wolfbunny_hinatazaka46_blue: { id: "wolfbunny_hinatazaka46_blue", name: "J-Pop Pack · Hinatazaka46 Blue", group: "wolfbunny", colors: ["#5bbee5", "#4898b7", "#2d5f72", "#1b3944"] },
  wolfbunny_j_pop_idol_sherbet: { id: "wolfbunny_j_pop_idol_sherbet", name: "J-Pop Pack · J-Pop Idol Sherbet", group: "wolfbunny", colors: ["#f19db5", "#5bbee5", "#812990", "#260c2b"] },
  wolfbunny_miku_blue: { id: "wolfbunny_miku_blue", name: "J-Pop Pack · Miku Blue", group: "wolfbunny", colors: ["#11add5", "#0d8aaa", "#08566a", "#05333f"] },
  wolfbunny_niziu_preplay_palette: { id: "wolfbunny_niziu_preplay_palette", name: "J-Pop Pack · NiziU PrePlay Palette", group: "wolfbunny", colors: ["#fff200", "#00b8b0", "#ef3f35", "#47120f"] },
  wolfbunny_nogizaka46_purple: { id: "wolfbunny_nogizaka46_purple", name: "J-Pop Pack · Nogizaka46 Purple", group: "wolfbunny", colors: ["#812990", "#672073", "#401448", "#260c2b"] },
  wolfbunny_one_ok_rock_red: { id: "wolfbunny_one_ok_rock_red", name: "J-Pop Pack · ONE OK ROCK RED", group: "wolfbunny", colors: ["#b93429", "#942920", "#5c1a14", "#370f0c"] },
  wolfbunny_yoasobi_amaranth: { id: "wolfbunny_yoasobi_amaranth", name: "J-Pop Pack · YOASOBI AMARANTH", group: "wolfbunny", colors: ["#f2285a", "#c12048", "#79142d", "#480c1b"] },
  wolfbunny_ana_flight_blue: { id: "wolfbunny_ana_flight_blue", name: "Japanese Company Pack · ANA Flight Blue", group: "wolfbunny", colors: ["#00b3f0", "#3b8bc0", "#223f9a", "#00146e"] },
  wolfbunny_familymart_vision: { id: "wolfbunny_familymart_vision", name: "Japanese Company Pack · FamilyMart Vision", group: "wolfbunny", colors: ["#008cd6", "#00a040", "#006026", "#003013"] },
  wolfbunny_lawson_blue: { id: "wolfbunny_lawson_blue", name: "Japanese Company Pack · LAWSON BLUE", group: "wolfbunny", colors: ["#0068b7", "#005392", "#00345b", "#001f36"] },
  wolfbunny_nhk_silver_gray: { id: "wolfbunny_nhk_silver_gray", name: "Japanese Company Pack · NHK Silver Gray", group: "wolfbunny", colors: ["#808080", "#666666", "#404040", "#262626"] },
  wolfbunny_saitama_super_blue: { id: "wolfbunny_saitama_super_blue", name: "Japanese Company Pack · SAITAMA SUPER BLUE", group: "wolfbunny", colors: ["#277abc", "#1f6196", "#133d5e", "#0b2438"] },
  wolfbunny_saitama_super_green: { id: "wolfbunny_saitama_super_green", name: "Japanese Company Pack · SAITAMA SUPER GREEN", group: "wolfbunny", colors: ["#16ae85", "#118b6a", "#0b5742", "#063427"] },
  wolfbunny_seiko_timely_vision: { id: "wolfbunny_seiko_timely_vision", name: "Japanese Company Pack · SEIKO Timely Vision", group: "wolfbunny", colors: ["#ffbf00", "#4393e6", "#0050a5", "#202121"] },
  wolfbunny_shibuya109_pastel: { id: "wolfbunny_shibuya109_pastel", name: "Japanese Company Pack · SHIBUYA109 PASTEL", group: "wolfbunny", colors: ["#f2d53f", "#fd87b2", "#3dacb8", "#5503a6"] },
  wolfbunny_sanrio_pink: { id: "wolfbunny_sanrio_pink", name: "Japanese Company Pack · Sanrio Pink", group: "wolfbunny", colors: ["#f9c2d0", "#f485a1", "#e74b5a", "#83534d"] },
  wolfbunny_tokyo_skytree_cloudy_blue: { id: "wolfbunny_tokyo_skytree_cloudy_blue", name: "Japanese Company Pack · TOKYO SKYTREE CLOUDY BLUE", group: "wolfbunny", colors: ["#82b5c7", "#68909f", "#415a63", "#27363b"] },
  wolfbunny_niconico_sea_green: { id: "wolfbunny_niconico_sea_green", name: "Japanese Company Pack · niconico sea green", group: "wolfbunny", colors: ["#19c3a4", "#149c83", "#0c6152", "#073a31"] },
  wolfbunny_bangtan_army_purple: { id: "wolfbunny_bangtan_army_purple", name: "K-Pop Pack · BANGTAN ARMY PURPLE", group: "wolfbunny", colors: ["#8048d8", "#6639ac", "#40246c", "#261540"] },
  wolfbunny_blackpink_blink_pink: { id: "wolfbunny_blackpink_blink_pink", name: "K-Pop Pack · BLACKPINK BLINK PINK", group: "wolfbunny", colors: ["#f4a7ba", "#c38594", "#7a535d", "#493237"] },
  wolfbunny_exo_eri_cosmic_latte: { id: "wolfbunny_exo_eri_cosmic_latte", name: "K-Pop Pack · EXO ERI COSMIC LATTE", group: "wolfbunny", colors: ["#fff8e7", "#ccc6b8", "#7f7c73", "#4c4a45"] },
  wolfbunny_le_sserafim_fearless_blue: { id: "wolfbunny_le_sserafim_fearless_blue", name: "K-Pop Pack · LE SSERAFIM FEARLESS BLUE", group: "wolfbunny", colors: ["#81a5f9", "#6784c7", "#40527c", "#26314a"] },
  wolfbunny_nct_ntczen_yellow: { id: "wolfbunny_nct_ntczen_yellow", name: "K-Pop Pack · NCT NTCZEN YELLOW", group: "wolfbunny", colors: ["#e2e766", "#b4b851", "#717333", "#43451e"] },
  wolfbunny_seventeen_cool_carat: { id: "wolfbunny_seventeen_cool_carat", name: "K-Pop Pack · SEVENTEEN COOL CARAT", group: "wolfbunny", colors: ["#f7cac9", "#92a8d1", "#57647d", "#2b323e"] },
  wolfbunny_shinee_shawol_green: { id: "wolfbunny_shinee_shawol_green", name: "K-Pop Pack · SHINee SHAWOL GREEN", group: "wolfbunny", colors: ["#73dbd0", "#5cafa6", "#396d68", "#22413e"] },
  wolfbunny_snsd_so_won_pink: { id: "wolfbunny_snsd_so_won_pink", name: "K-Pop Pack · SNSD SO-WON PINK", group: "wolfbunny", colors: ["#f24f7c", "#c13f63", "#79273e", "#481725"] },
  wolfbunny_stray_kids_stay_pink: { id: "wolfbunny_stray_kids_stay_pink", name: "K-Pop Pack · STRAY KIDS STAY PINK", group: "wolfbunny", colors: ["#ff4499", "#cc367a", "#7f224c", "#4c142d"] },
  wolfbunny_tropical_twice_apricot: { id: "wolfbunny_tropical_twice_apricot", name: "K-Pop Pack · TROPICAL TWICE APRICOT", group: "wolfbunny", colors: ["#fcc89b", "#ff5fa2", "#993961", "#4c1c30"] },
  wolfbunny_3ds_virtual_console_green: { id: "wolfbunny_3ds_virtual_console_green", name: "Legacy Palette Pack · 3DS Virtual Console Green", group: "wolfbunny", colors: ["#bdff21", "#9cef29", "#5a8c42", "#4a4a4a"] },
  wolfbunny_3ds_virtual_console_ver: { id: "wolfbunny_3ds_virtual_console_ver", name: "Legacy Palette Pack · 3DS Virtual Console Ver.", group: "wolfbunny", colors: ["#cecead", "#a5a58c", "#6b6b52", "#292918"] },
  wolfbunny_bill_s_pc_screen: { id: "wolfbunny_bill_s_pc_screen", name: "Legacy Palette Pack · Bill's PC Screen", group: "wolfbunny", colors: ["#f87800", "#b86000", "#783800", "#000000"] },
  wolfbunny_dmg_ver: { id: "wolfbunny_dmg_ver", name: "Legacy Palette Pack · DMG Ver.", group: "wolfbunny", colors: ["#7f860f", "#577c44", "#365d48", "#2a453b"] },
  wolfbunny_digivice_ver: { id: "wolfbunny_digivice_ver", name: "Legacy Palette Pack · Digivice Ver.", group: "wolfbunny", colors: ["#8c8c73", "#70705c", "#464639", "#2a2a22"] },
  wolfbunny_gamate_ver: { id: "wolfbunny_gamate_ver", name: "Legacy Palette Pack · Gamate Ver.", group: "wolfbunny", colors: ["#6ba64a", "#437a63", "#255955", "#12424c"] },
  wolfbunny_game_and_watch_lcd: { id: "wolfbunny_game_and_watch_lcd", name: "Legacy Palette Pack · Game and Watch LCD", group: "wolfbunny", colors: ["#c6cbad", "#9ea28a", "#636556", "#3b3c33"] },
  wolfbunny_gameking_ver: { id: "wolfbunny_gameking_ver", name: "Legacy Palette Pack · GameKing Ver.", group: "wolfbunny", colors: ["#8cce94", "#6b9c63", "#405d3b", "#184421"] },
  wolfbunny_gamebuino_classic_ver: { id: "wolfbunny_gamebuino_classic_ver", name: "Legacy Palette Pack · Gamebuino Classic Ver.", group: "wolfbunny", colors: ["#81a17e", "#678064", "#40503f", "#263025"] },
  wolfbunny_hartung_game_master_ver: { id: "wolfbunny_hartung_game_master_ver", name: "Legacy Palette Pack · Hartung Game Master Ver.", group: "wolfbunny", colors: ["#829fa6", "#687f84", "#414f53", "#2d2d2b"] },
  wolfbunny_link_s_awakening_dx_ver: { id: "wolfbunny_link_s_awakening_dx_ver", name: "Legacy Palette Pack · Link's Awakening DX Ver.", group: "wolfbunny", colors: ["#f8f8b0", "#78c078", "#688840", "#583820"] },
  wolfbunny_mb_microvision_ver: { id: "wolfbunny_mb_microvision_ver", name: "Legacy Palette Pack · MB Microvision Ver.", group: "wolfbunny", colors: ["#a0a0a0", "#808080", "#505050", "#303030"] },
  wolfbunny_mega_man_v_ver: { id: "wolfbunny_mega_man_v_ver", name: "Legacy Palette Pack · Mega Man V Ver.", group: "wolfbunny", colors: ["#d0d0d0", "#70a0e0", "#406890", "#082030"] },
  wolfbunny_neo_geo_pocket_ver: { id: "wolfbunny_neo_geo_pocket_ver", name: "Legacy Palette Pack · Neo Geo Pocket Ver.", group: "wolfbunny", colors: ["#f0f0f0", "#b0b0b0", "#707070", "#101010"] },
  wolfbunny_nokia_3310_ver: { id: "wolfbunny_nokia_3310_ver", name: "Legacy Palette Pack · Nokia 3310 Ver.", group: "wolfbunny", colors: ["#73a684", "#5c8469", "#395342", "#223127"] },
  wolfbunny_pocket_tales_ver: { id: "wolfbunny_pocket_tales_ver", name: "Legacy Palette Pack · Pocket Tales Ver.", group: "wolfbunny", colors: ["#d0d860", "#88a000", "#385000", "#000000"] },
  wolfbunny_pocketstation_ver: { id: "wolfbunny_pocketstation_ver", name: "Legacy Palette Pack · PocketStation Ver.", group: "wolfbunny", colors: ["#969687", "#78786c", "#4b4b43", "#2d2d28"] },
  wolfbunny_pokemon_pinball_ver: { id: "wolfbunny_pokemon_pinball_ver", name: "Legacy Palette Pack · Pokemon Pinball Ver.", group: "wolfbunny", colors: ["#e8f8b8", "#a0b050", "#786030", "#181820"] },
  wolfbunny_pokemon_ver: { id: "wolfbunny_pokemon_ver", name: "Legacy Palette Pack · Pokemon Ver.", group: "wolfbunny", colors: ["#f8e8f8", "#f0b088", "#807098", "#181010"] },
  wolfbunny_pokemon_mini_ver: { id: "wolfbunny_pokemon_mini_ver", name: "Legacy Palette Pack · Pokemon mini Ver.", group: "wolfbunny", colors: ["#a5b9a5", "#849484", "#525c52", "#1b2d1b"] },
  wolfbunny_poketch_ver: { id: "wolfbunny_poketch_ver", name: "Legacy Palette Pack · Poketch Ver.", group: "wolfbunny", colors: ["#70b070", "#508050", "#385030", "#102818"] },
  wolfbunny_rocky_valley_holiday: { id: "wolfbunny_rocky_valley_holiday", name: "Legacy Palette Pack · Rocky-Valley Holiday", group: "wolfbunny", colors: ["#c0f0f8", "#d89078", "#805850", "#204008"] },
  wolfbunny_ti_83_ver: { id: "wolfbunny_ti_83_ver", name: "Legacy Palette Pack · TI-83 Ver.", group: "wolfbunny", colors: ["#9caa8c", "#7c8870", "#4e5546", "#2e332a"] },
  wolfbunny_tamagotchi_ver: { id: "wolfbunny_tamagotchi_ver", name: "Legacy Palette Pack · Tamagotchi Ver.", group: "wolfbunny", colors: ["#f1f0f9", "#c0c0c7", "#78787c", "#3c3838"] },
  wolfbunny_tiger_game_com_ver: { id: "wolfbunny_tiger_game_com_ver", name: "Legacy Palette Pack · Tiger Game.com Ver.", group: "wolfbunny", colors: ["#dfff8f", "#6f8f4f", "#0f4f2f", "#000000"] },
  wolfbunny_timing_hero_ver: { id: "wolfbunny_timing_hero_ver", name: "Legacy Palette Pack · Timing Hero Ver.", group: "wolfbunny", colors: ["#cccc99", "#8c994c", "#4c6718", "#202e00"] },
  wolfbunny_travel_wood: { id: "wolfbunny_travel_wood", name: "Legacy Palette Pack · Travel Wood", group: "wolfbunny", colors: ["#f8d8b0", "#a08058", "#705030", "#482810"] },
  wolfbunny_vmu_ver: { id: "wolfbunny_vmu_ver", name: "Legacy Palette Pack · VMU Ver.", group: "wolfbunny", colors: ["#88cca8", "#6ca386", "#446654", "#081480"] },
  wolfbunny_virtual_boy_ver: { id: "wolfbunny_virtual_boy_ver", name: "Legacy Palette Pack · Virtual Boy Ver.", group: "wolfbunny", colors: ["#ff0000", "#aa0000", "#550000", "#000000"] },
  wolfbunny_watara_supervision_ver: { id: "wolfbunny_watara_supervision_ver", name: "Legacy Palette Pack · Watara Supervision Ver.", group: "wolfbunny", colors: ["#7cc67c", "#54a68c", "#2c6264", "#0c322c"] },
  wolfbunny_wonderswan_ver: { id: "wolfbunny_wonderswan_ver", name: "Legacy Palette Pack · WonderSwan Ver.", group: "wolfbunny", colors: ["#fefefe", "#c0c0c0", "#686868", "#2c2c2c"] },
  wolfbunny_camouflage_ver: { id: "wolfbunny_camouflage_ver", name: "Misc. Palette Pack · Camouflage Ver.", group: "wolfbunny", colors: ["#bcab90", "#ac7e54", "#79533d", "#373538"] },
  wolfbunny_cherry_blossom_pink: { id: "wolfbunny_cherry_blossom_pink", name: "Misc. Palette Pack · Cherry Blossom Pink", group: "wolfbunny", colors: ["#f07eb0", "#c0648c", "#783f58", "#482534"] },
  wolfbunny_emerald_green: { id: "wolfbunny_emerald_green", name: "Misc. Palette Pack · Emerald Green", group: "wolfbunny", colors: ["#50c878", "#40a060", "#28643c", "#183c24"] },
  wolfbunny_fool_s_gold_and_silver: { id: "wolfbunny_fool_s_gold_and_silver", name: "Misc. Palette Pack · Fool's Gold and Silver", group: "wolfbunny", colors: ["#c5c66d", "#97a1b0", "#5a6069", "#2d3034"] },
  wolfbunny_glitchy_blue: { id: "wolfbunny_glitchy_blue", name: "Misc. Palette Pack · Glitchy Blue", group: "wolfbunny", colors: ["#337efb", "#2864c8", "#193f7d", "#0f254b"] },
  wolfbunny_gold_silver_and_bronze: { id: "wolfbunny_gold_silver_and_bronze", name: "Misc. Palette Pack · Gold, Silver, and Bronze", group: "wolfbunny", colors: ["#beb049", "#86949a", "#996843", "#2d1f14"] },
  wolfbunny_golden_trophy: { id: "wolfbunny_golden_trophy", name: "Misc. Palette Pack · Golden Trophy", group: "wolfbunny", colors: ["#e8d018", "#b9a613", "#74680c", "#453e07"] },
  wolfbunny_greenscale_ver: { id: "wolfbunny_greenscale_ver", name: "Misc. Palette Pack · Greenscale Ver.", group: "wolfbunny", colors: ["#9cbe0c", "#6e870a", "#2c6234", "#0c360c"] },
  wolfbunny_leprechaun_green: { id: "wolfbunny_leprechaun_green", name: "Misc. Palette Pack · Leprechaun Green", group: "wolfbunny", colors: ["#378861", "#2c6c4d", "#1b4430", "#10281d"] },
  wolfbunny_nightvision_green: { id: "wolfbunny_nightvision_green", name: "Misc. Palette Pack · Nightvision Green", group: "wolfbunny", colors: ["#66bf2f", "#519825", "#335f17", "#1e390e"] },
  wolfbunny_rising_sun_red: { id: "wolfbunny_rising_sun_red", name: "Misc. Palette Pack · Rising Sun Red", group: "wolfbunny", colors: ["#bc002d", "#960024", "#5d0016", "#38000d"] },
  wolfbunny_treasure_gold: { id: "wolfbunny_treasure_gold", name: "Misc. Palette Pack · Treasure Gold", group: "wolfbunny", colors: ["#cbb524", "#a2901c", "#655a12", "#3c360a"] },
  wolfbunny_wild_west_vision: { id: "wolfbunny_wild_west_vision", name: "Misc. Palette Pack · Wild West Vision", group: "wolfbunny", colors: ["#d9d7c7", "#c3976a", "#924a36", "#3a160e"] },
  wolfbunny_advanced_indigo: { id: "wolfbunny_advanced_indigo", name: "Advanced Indigo", group: "wolfbunny", colors: ["#796aba", "#605494", "#3c355d", "#241f37"] },
  wolfbunny_aegis_cherry: { id: "wolfbunny_aegis_cherry", name: "Aegis Cherry", group: "wolfbunny", colors: ["#dd3b64", "#b02f50", "#6e1d32", "#42111e"] },
  wolfbunny_ancient_hisuian_brown: { id: "wolfbunny_ancient_hisuian_brown", name: "Ancient Hisuian Brown", group: "wolfbunny", colors: ["#b39f90", "#8f7f73", "#594f48", "#352f2b"] },
  wolfbunny_animal_crossing_green: { id: "wolfbunny_animal_crossing_green", name: "Animal Crossing Green", group: "wolfbunny", colors: ["#009b7e", "#007c64", "#004d3f", "#002e25"] },
  wolfbunny_brilliant_diamond_blue: { id: "wolfbunny_brilliant_diamond_blue", name: "Brilliant Diamond Blue", group: "wolfbunny", colors: ["#7fbbe1", "#6595b4", "#3f5d70", "#263843"] },
  wolfbunny_collection_of_saga_ver: { id: "wolfbunny_collection_of_saga_ver", name: "COLLECTION of SaGa Ver.", group: "wolfbunny", colors: ["#b2c0a8", "#769a67", "#345d51", "#041820"] },
  wolfbunny_champion_s_tunic: { id: "wolfbunny_champion_s_tunic", name: "Champion's Tunic", group: "wolfbunny", colors: ["#e2dcb1", "#009edd", "#875b40", "#281b13"] },
  wolfbunny_chozo_blue: { id: "wolfbunny_chozo_blue", name: "Chozo Blue", group: "wolfbunny", colors: ["#4eb3e1", "#3e8fb4", "#275970", "#173543"] },
  wolfbunny_dk_arcade_blue: { id: "wolfbunny_dk_arcade_blue", name: "DK Arcade Blue", group: "wolfbunny", colors: ["#47a2de", "#3881b1", "#23516f", "#153042"] },
  wolfbunny_dk_barrel_brown: { id: "wolfbunny_dk_barrel_brown", name: "DK Barrel Brown", group: "wolfbunny", colors: ["#c3742f", "#9c5c25", "#613a17", "#3a220e"] },
  wolfbunny_dmg_099: { id: "wolfbunny_dmg_099", name: "DMG-099", group: "wolfbunny", colors: ["#84b510", "#6bad19", "#3f642f", "#313231"] },
  wolfbunny_dmg_gold: { id: "wolfbunny_dmg_gold", name: "DMG-GOLD", group: "wolfbunny", colors: ["#a1b560", "#80904c", "#505a30", "#30361c"] },
  wolfbunny_dmg_switch: { id: "wolfbunny_dmg_switch", name: "DMG-SWITCH", group: "wolfbunny", colors: ["#8cad28", "#6c9421", "#426b29", "#214231"] },
  wolfbunny_dream_land_gb_ver: { id: "wolfbunny_dream_land_gb_ver", name: "Dream Land GB Ver.", group: "wolfbunny", colors: ["#f6ff70", "#b9d03a", "#788b1d", "#48530e"] },
  wolfbunny_eevee_brown: { id: "wolfbunny_eevee_brown", name: "Eevee Brown", group: "wolfbunny", colors: ["#c88d32", "#a07028", "#644619", "#3c2a0f"] },
  wolfbunny_famicom_disk_yellow: { id: "wolfbunny_famicom_disk_yellow", name: "Famicom Disk Yellow", group: "wolfbunny", colors: ["#f3c200", "#c29b00", "#796100", "#483a00"] },
  wolfbunny_famicom_frenzy: { id: "wolfbunny_famicom_frenzy", name: "Famicom Frenzy", group: "wolfbunny", colors: ["#efecda", "#d9be72", "#a32135", "#231916"] },
  wolfbunny_frog_coin_green: { id: "wolfbunny_frog_coin_green", name: "Frog Coin Green", group: "wolfbunny", colors: ["#fff7de", "#00ef00", "#398400", "#003900"] },
  wolfbunny_fury_blue: { id: "wolfbunny_fury_blue", name: "Fury Blue", group: "wolfbunny", colors: ["#2b5f98", "#224c79", "#152f4c", "#0c1c2d"] },
  wolfbunny_gamecube_glimmer: { id: "wolfbunny_gamecube_glimmer", name: "GameCube Glimmer", group: "wolfbunny", colors: ["#b6bed3", "#11a396", "#cf4151", "#3e1318"] },
  wolfbunny_golden_wild: { id: "wolfbunny_golden_wild", name: "Golden Wild", group: "wolfbunny", colors: ["#b99f65", "#947f50", "#5c4f32", "#372f1e"] },
  wolfbunny_goomba_brown: { id: "wolfbunny_goomba_brown", name: "Goomba Brown", group: "wolfbunny", colors: ["#aa593b", "#88472f", "#552c1d", "#331a11"] },
  wolfbunny_green_awakening: { id: "wolfbunny_green_awakening", name: "Green Awakening", group: "wolfbunny", colors: ["#f1ffdd", "#98db75", "#367058", "#000b16"] },
  wolfbunny_green_banana: { id: "wolfbunny_green_banana", name: "Green Banana", group: "wolfbunny", colors: ["#63df08", "#4a9e00", "#396939", "#214900"] },
  wolfbunny_inkling_tricolor: { id: "wolfbunny_inkling_tricolor", name: "Inkling Tricolor", group: "wolfbunny", colors: ["#eaff3d", "#ff505e", "#603bff", "#1c114c"] },
  wolfbunny_lcd_clock_green: { id: "wolfbunny_lcd_clock_green", name: "LCD Clock Green", group: "wolfbunny", colors: ["#50b580", "#409066", "#285a40", "#183626"] },
  wolfbunny_labo_fawn: { id: "wolfbunny_labo_fawn", name: "Labo Fawn", group: "wolfbunny", colors: ["#d7aa73", "#ac885c", "#6b5539", "#403322"] },
  wolfbunny_mario_red: { id: "wolfbunny_mario_red", name: "Mario Red", group: "wolfbunny", colors: ["#e10f00", "#b40c00", "#700700", "#430400"] },
  wolfbunny_metallic_paldea_brass: { id: "wolfbunny_metallic_paldea_brass", name: "Metallic Paldea Brass", group: "wolfbunny", colors: ["#a29834", "#817929", "#514c1a", "#302d0f"] },
  wolfbunny_neon_blue: { id: "wolfbunny_neon_blue", name: "Neon Blue", group: "wolfbunny", colors: ["#0ab9e6", "#0894b8", "#055c73", "#033745"] },
  wolfbunny_neon_green: { id: "wolfbunny_neon_green", name: "Neon Green", group: "wolfbunny", colors: ["#1edc00", "#18b000", "#0f6e00", "#094200"] },
  wolfbunny_neon_orange: { id: "wolfbunny_neon_orange", name: "Neon Orange", group: "wolfbunny", colors: ["#faa005", "#c88004", "#7d5002", "#4b3001"] },
  wolfbunny_neon_pink: { id: "wolfbunny_neon_pink", name: "Neon Pink", group: "wolfbunny", colors: ["#ff3278", "#cc2860", "#7f193c", "#4c0f24"] },
  wolfbunny_neon_purple: { id: "wolfbunny_neon_purple", name: "Neon Purple", group: "wolfbunny", colors: ["#b400e6", "#9000b8", "#5a0073", "#360045"] },
  wolfbunny_neon_red: { id: "wolfbunny_neon_red", name: "Neon Red", group: "wolfbunny", colors: ["#ff3c28", "#cc3020", "#7f1e14", "#4c120c"] },
  wolfbunny_neon_yellow: { id: "wolfbunny_neon_yellow", name: "Neon Yellow", group: "wolfbunny", colors: ["#e6ff00", "#b8cc00", "#737f00", "#454c00"] },
  wolfbunny_odyssey_boy: { id: "wolfbunny_odyssey_boy", name: "Odyssey Boy", group: "wolfbunny", colors: ["#acbe8c", "#7e8e67", "#505445", "#222421"] },
  wolfbunny_odyssey_gold: { id: "wolfbunny_odyssey_gold", name: "Odyssey Gold", group: "wolfbunny", colors: ["#c2a000", "#9b8000", "#615000", "#3a3000"] },
  wolfbunny_pocket_switch: { id: "wolfbunny_pocket_switch", name: "POCKET SWITCH", group: "wolfbunny", colors: ["#b5c69c", "#8d9c7b", "#637251", "#303820"] },
  wolfbunny_pikachu_yellow: { id: "wolfbunny_pikachu_yellow", name: "Pikachu Yellow", group: "wolfbunny", colors: ["#ffdc00", "#ccb000", "#7f6e00", "#4c4200"] },
  wolfbunny_pokedex_red: { id: "wolfbunny_pokedex_red", name: "Pokedex Red", group: "wolfbunny", colors: ["#ea5450", "#bb4340", "#752a28", "#461918"] },
  wolfbunny_royal_blue: { id: "wolfbunny_royal_blue", name: "Royal Blue", group: "wolfbunny", colors: ["#4655f5", "#3844c4", "#232a7a", "#151949"] },
  wolfbunny_shining_pearl_pink: { id: "wolfbunny_shining_pearl_pink", name: "Shining Pearl Pink", group: "wolfbunny", colors: ["#d28ea0", "#a87180", "#694750", "#3f2a30"] },
  wolfbunny_sky_pop_ivory: { id: "wolfbunny_sky_pop_ivory", name: "Sky Pop Ivory", group: "wolfbunny", colors: ["#e5e0b8", "#bebb95", "#86825c", "#525025"] },
  wolfbunny_super_famicom_supreme: { id: "wolfbunny_super_famicom_supreme", name: "Super Famicom Supreme", group: "wolfbunny", colors: ["#feda5a", "#44ac71", "#d94040", "#0846ba"] },
  wolfbunny_super_mushroom_vision: { id: "wolfbunny_super_mushroom_vision", name: "Super Mushroom Vision", group: "wolfbunny", colors: ["#f7cec3", "#cc9e22", "#923404", "#000000"] },
  wolfbunny_super_star_pink: { id: "wolfbunny_super_star_pink", name: "Super Star Pink", group: "wolfbunny", colors: ["#e52c77", "#b7235f", "#72163b", "#440d23"] },
  wolfbunny_superball_ivory: { id: "wolfbunny_superball_ivory", name: "Superball Ivory", group: "wolfbunny", colors: ["#eef0bc", "#bcbc8a", "#828250", "#646432"] },
  wolfbunny_timeless_gold_and_red: { id: "wolfbunny_timeless_gold_and_red", name: "Timeless Gold and Red", group: "wolfbunny", colors: ["#c8aa50", "#b91e23", "#6f1215", "#37090a"] },
  wolfbunny_ultra_black: { id: "wolfbunny_ultra_black", name: "Ultra Black", group: "wolfbunny", colors: ["#4d5263", "#3d414f", "#262931", "#17181d"] },
  wolfbunny_warioware_microblue: { id: "wolfbunny_warioware_microblue", name: "WarioWare MicroBlue", group: "wolfbunny", colors: ["#1189ca", "#0d6da1", "#084465", "#05293c"] },
  wolfbunny_wonder_purple: { id: "wolfbunny_wonder_purple", name: "Wonder Purple", group: "wolfbunny", colors: ["#e658df", "#b846b2", "#732c6f", "#451a42"] },
  wolfbunny_yellow_banana: { id: "wolfbunny_yellow_banana", name: "Yellow Banana", group: "wolfbunny", colors: ["#ffdf08", "#de9e00", "#ad6939", "#734900"] },
  wolfbunny_yoshi_egg_green: { id: "wolfbunny_yoshi_egg_green", name: "Yoshi Egg Green", group: "wolfbunny", colors: ["#66c430", "#519c26", "#336218", "#1e3a0e"] },
  wolfbunny_mlb_vision: { id: "wolfbunny_mlb_vision", name: "Sports Pack · MLB Vision", group: "wolfbunny", colors: ["#ffffff", "#057aff", "#bf0d3e", "#041e42"] },
  wolfbunny_nascar_ver: { id: "wolfbunny_nascar_ver", name: "Sports Pack · NASCAR Ver.", group: "wolfbunny", colors: ["#ffd659", "#007ac2", "#e4002b", "#000000"] },
  wolfbunny_nba_vision: { id: "wolfbunny_nba_vision", name: "Sports Pack · NBA Vision", group: "wolfbunny", colors: ["#ffffff", "#c8102e", "#253b73", "#000000"] },
  wolfbunny_ncaa_blue: { id: "wolfbunny_ncaa_blue", name: "Sports Pack · NCAA Blue", group: "wolfbunny", colors: ["#009cde", "#007cb1", "#004e6f", "#002e42"] },
  wolfbunny_nfl_vision: { id: "wolfbunny_nfl_vision", name: "Sports Pack · NFL Vision", group: "wolfbunny", colors: ["#ffffff", "#d50a0a", "#013369", "#000000"] },
  wolfbunny_olympic_bronze: { id: "wolfbunny_olympic_bronze", name: "Sports Pack · Olympic Bronze", group: "wolfbunny", colors: ["#cd8152", "#a46741", "#664029", "#3d2618"] },
  wolfbunny_olympic_gold: { id: "wolfbunny_olympic_gold", name: "Sports Pack · Olympic Gold", group: "wolfbunny", colors: ["#d5b624", "#aa911c", "#6a5b12", "#3f360a"] },
  wolfbunny_olympic_silver: { id: "wolfbunny_olympic_silver", name: "Sports Pack · Olympic Silver", group: "wolfbunny", colors: ["#9ea59c", "#7e847c", "#4f524e", "#2f312e"] },
  wolfbunny_pga_tour_vision: { id: "wolfbunny_pga_tour_vision", name: "Sports Pack · PGA Tour Vision", group: "wolfbunny", colors: ["#ffffff", "#f1373d", "#003c80", "#000000"] },
  wolfbunny_wwe_white_and_red: { id: "wolfbunny_wwe_white_and_red", name: "Sports Pack · WWE White and Red", group: "wolfbunny", colors: ["#ffffff", "#d7182a", "#810e19", "#40070c"] },
  wolfbunny_aquatic_iro: { id: "wolfbunny_aquatic_iro", name: "Traditional JPN Colors Pack · Aquatic Iro", group: "wolfbunny", colors: ["#a0d8ef", "#2ca9e1", "#3e62ad", "#192f60"] },
  wolfbunny_fruity_orange: { id: "wolfbunny_fruity_orange", name: "Traditional JPN Colors Pack · Fruity Orange", group: "wolfbunny", colors: ["#f3bf88", "#f08300", "#9f563a", "#241a08"] },
  wolfbunny_ghostly_aoi: { id: "wolfbunny_ghostly_aoi", name: "Traditional JPN Colors Pack · Ghostly Aoi", group: "wolfbunny", colors: ["#84a2d4", "#5a79ba", "#19448e", "#0f2350"] },
  wolfbunny_golden_kiiro: { id: "wolfbunny_golden_kiiro", name: "Traditional JPN Colors Pack · Golden Kiiro", group: "wolfbunny", colors: ["#f8e58c", "#dccb18", "#a69425", "#6a5d21"] },
  wolfbunny_lime_midori: { id: "wolfbunny_lime_midori", name: "Traditional JPN Colors Pack · Lime Midori", group: "wolfbunny", colors: ["#e0ebaf", "#aacf53", "#7b8d42", "#475950"] },
  wolfbunny_oni_aka: { id: "wolfbunny_oni_aka", name: "Traditional JPN Colors Pack · Oni Aka", group: "wolfbunny", colors: ["#ec6d71", "#d9333f", "#a22041", "#640125"] },
  wolfbunny_sakura_pink: { id: "wolfbunny_sakura_pink", name: "Traditional JPN Colors Pack · Sakura Pink", group: "wolfbunny", colors: ["#fdeff2", "#eebbcb", "#e7609e", "#a25768"] },
  wolfbunny_silver_shiro: { id: "wolfbunny_silver_shiro", name: "Traditional JPN Colors Pack · Silver Shiro", group: "wolfbunny", colors: ["#dcdddd", "#afafb0", "#727171", "#383c3c"] },
  wolfbunny_tea_midori: { id: "wolfbunny_tea_midori", name: "Traditional JPN Colors Pack · Tea Midori", group: "wolfbunny", colors: ["#d6e9ca", "#88cb7f", "#028760", "#333631"] },
  wolfbunny_wisteria_murasaki: { id: "wolfbunny_wisteria_murasaki", name: "Traditional JPN Colors Pack · Wisteria Murasaki", group: "wolfbunny", colors: ["#dbd0e6", "#a59aca", "#7058a3", "#2e2930"] }
};
const PALETTES = { ...BASE_PALETTES, ...EXTENDED_PALETTES };
const FILTER_DEFS = [
  {
    id: "crt",
    label: "CRT Scanlines",
    params: [
      {
        type: "seg",
        key: "variant",
        label: "Scanlines",
        def: "medium",
        stateKey: "filterVariant",
        opts: [
          ["fine", "Fine"],
          ["medium", "Medium"],
          ["thick", "Thick"],
          ["wide", "Wide"]
        ]
      },
      {
        type: "seg",
        key: "curve",
        label: "Screen shape",
        def: "none",
        opts: [
          ["none", "Flat"],
          ["mild", "Mild"],
          ["strong", "Strong"]
        ]
      },
      {
        type: "range",
        key: "mix",
        label: "Mix",
        def: 100,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "lcd",
    label: "LCD",
    params: [
      {
        type: "range",
        key: "subpixel",
        label: "Sub-pixel tint",
        def: 30,
        min: 0,
        max: 80,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "bleed",
        label: "Backlight bleed",
        def: 0,
        min: 0,
        max: 80,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "glow",
    label: "Phosphor Glow",
    params: [
      {
        type: "range",
        key: "intensity",
        label: "Intensity",
        def: 80,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "blur",
        label: "Bloom radius",
        def: 110,
        min: 0,
        max: 300,
        step: 5,
        fmt: (v) => `${v}%`
      },
      {
        type: "seg",
        key: "phosphor",
        label: "Phosphor colour",
        def: "none",
        opts: [
          ["none", "None"],
          ["green", "Green"],
          ["amber", "Amber"],
          ["blue", "Blue"]
        ]
      }
    ]
  },
  {
    id: "vignette",
    label: "Vignette",
    params: [
      {
        type: "range",
        key: "falloff",
        label: "Intensity",
        def: 50,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "shape",
        label: "Shape",
        def: 0,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => v <= 5 ? "Round" : v >= 95 ? "Square" : `${v}%`
      }
    ]
  },
  {
    id: "halftone",
    label: "Halftone",
    params: [
      {
        type: "range",
        key: "radius",
        label: "Dot size",
        def: 38,
        min: 10,
        max: 70,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "darkness",
        label: "Darkness",
        def: 35,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "seg",
        key: "shape",
        label: "Dot shape",
        def: "circle",
        opts: [
          ["circle", "Round"],
          ["square", "Square"],
          ["diamond", "Diamond"]
        ]
      }
    ]
  },
  {
    id: "dot",
    label: "Dot Matrix",
    params: [
      {
        type: "range",
        key: "radius",
        label: "Dot size",
        def: 44,
        min: 20,
        max: 80,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "halation",
        label: "Halation",
        def: 0,
        min: 0,
        max: 80,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "chroma",
    label: "Chromatic Aberration",
    params: [
      {
        type: "range",
        key: "shiftH",
        label: "Horizontal shift",
        def: 75,
        min: 0,
        max: 500,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "shiftV",
        label: "Vertical shift",
        def: 0,
        min: 0,
        max: 500,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "shiftR",
        label: "Radial shift",
        def: 0,
        min: -500,
        max: 500,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "grid",
    label: "Pixel Grid",
    params: [
      {
        type: "range",
        key: "opacity",
        label: "Grid opacity",
        def: 30,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "weight",
        label: "Line weight",
        def: 1,
        min: 1,
        max: 5,
        step: 0.5,
        fmt: (v) => `${v}px`
      }
    ]
  },
  {
    id: "jitter",
    label: "Scanline Jitter",
    params: [
      {
        type: "range",
        key: "amount",
        label: "Jitter amount",
        def: 40,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "frequency",
        label: "Frequency",
        def: 50,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "noise",
    label: "Noise / Static",
    params: [
      {
        type: "range",
        key: "amount",
        label: "Amount",
        def: 40,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "seg",
        key: "type",
        label: "Type",
        def: "film",
        opts: [
          ["film", "Film"],
          ["static", "Static"],
          ["bands", "Bands"]
        ]
      }
    ]
  },
  {
    id: "ghosting",
    label: "VHS Ghosting",
    params: [
      {
        type: "range",
        key: "offset",
        label: "Echo offset",
        def: 60,
        min: 1,
        max: 150,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "fade",
        label: "Echo fade",
        def: 70,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "pixsort",
    label: "Pixel Sort",
    params: [
      {
        type: "range",
        key: "threshold",
        label: "Threshold",
        def: 50,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "seg",
        key: "direction",
        label: "Direction",
        def: "down",
        opts: [
          ["down", "Down"],
          ["up", "Up"],
          ["right", "Right"],
          ["left", "Left"]
        ]
      }
    ]
  },
  {
    id: "blkglitch",
    label: "Block Glitch",
    params: [
      {
        type: "range",
        key: "shift",
        label: "Shift amount",
        def: 40,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "density",
        label: "Block count",
        def: 30,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "size",
        label: "Block height",
        def: 20,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "maxheight",
        label: "Max height",
        def: 30,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "wavewarp",
    label: "Wave Warp",
    params: [
      {
        type: "range",
        key: "amplitude",
        label: "Amplitude",
        def: 30,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "frequency",
        label: "Frequency",
        def: 40,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "zoomblur",
    label: "Zoom Blur",
    params: [
      {
        type: "range",
        key: "amount",
        label: "Amount",
        def: 30,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "bayer",
    label: "Bayer Dithering",
    params: [
      {
        type: "range",
        key: "levels",
        label: "Color levels",
        def: 4,
        min: 2,
        max: 8,
        step: 1,
        fmt: (v) => `${v}`
      }
    ]
  },
  {
    id: "floyd",
    label: "Floyd-Steinberg",
    params: [
      {
        type: "range",
        key: "levels",
        label: "Levels",
        def: 2,
        min: 2,
        max: 8,
        step: 1,
        fmt: (v) => `${v}`
      }
    ]
  },
  {
    id: "interlace",
    label: "Interlace",
    params: [
      {
        type: "range",
        key: "intensity",
        label: "Intensity",
        def: 60,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "chswap",
    label: "Channel Swap",
    params: [
      {
        type: "seg",
        key: "mode",
        label: "Mode",
        def: "rgb",
        opts: [
          ["rgb", "RGB"],
          ["rbg", "RBG"],
          ["grb", "GRB"],
          ["gbr", "GBR"],
          ["brg", "BRG"],
          ["bgr", "BGR"]
        ]
      }
    ]
  },
  {
    id: "rgbplanes",
    label: "RGB Planes",
    params: [
      {
        type: "range",
        key: "shift",
        label: "Channel split",
        def: 50,
        min: 1,
        max: 300,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "scatter",
        label: "Row scatter",
        def: 40,
        min: 0,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  },
  {
    id: "colcorrupt",
    label: "Color Corrupt",
    params: [
      {
        type: "range",
        key: "density",
        label: "Density",
        def: 35,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      },
      {
        type: "range",
        key: "strength",
        label: "Strength",
        def: 65,
        min: 1,
        max: 100,
        step: 1,
        fmt: (v) => `${v}%`
      }
    ]
  }
];
const FX_GROUP_ORDER = ["crisp", "retro", "glitch"];
const FX_GROUP_LABELS = {
  crisp: "Pixel-perfect",
  retro: "Retro display",
  glitch: "Glitch & corrupt"
};
const FX_FILTER_GROUP = {
  grid: "crisp",
  dot: "crisp",
  halftone: "crisp",
  bayer: "crisp",
  floyd: "crisp",
  chswap: "crisp",
  crt: "retro",
  lcd: "retro",
  glow: "retro",
  vignette: "retro",
  interlace: "retro",
  chroma: "glitch",
  noise: "glitch",
  ghosting: "glitch",
  jitter: "glitch",
  zoomblur: "glitch",
  pixsort: "glitch",
  blkglitch: "glitch",
  wavewarp: "glitch",
  rgbplanes: "glitch",
  colcorrupt: "glitch"
};
function buildDefaultFilterParams() {
  const out = {};
  for (const fd of FILTER_DEFS) {
    out[fd.id] = {};
    for (const p of fd.params) {
      if (p.stateKey) continue;
      out[fd.id][p.key] = p.def;
    }
  }
  return out;
}
const state = {
  sav: null,
  // raw Uint8Array of the loaded .sav
  photos: [],
  // parsed photo objects from parseSav
  activeCount: 0,
  filename: null,
  filePath: null,
  selectedIndex: null,
  // currently selected photo index (0–29)
  palette: PALETTES.dmg,
  exportScale: 20,
  exportFormat: "png",
  // 'png' | 'gif'
  exportFilter: "none",
  // legacy single-filter field; kept for backwards compat with old .gbcp files
  filterIntensity: 1,
  // 0.0–1.0
  filterVariant: "medium",
  // crt only: 'fine'|'medium'|'thick'|'wide'
  filterParams: buildDefaultFilterParams(),
  // per-filter granular parameters (see FILTER_DEFS)
  photoTransforms: {},
  // { photoIndex: { rotate: 0, flipH: false, flipV: false } }
  presentationMode: false,
  // fullscreen presentation overlay active
  gifMode: false,
  // are we in GIF selection mode?
  gifSelection: /* @__PURE__ */ new Set(),
  // photo indices in the sequence (for O(1) grid highlight)
  gifFrameOrder: [],
  // [{photoIndex, paletteId}] — ordered frame list
  gifPaletteScope: null,
  // null=global; number=frame order index being re-palettted
  gifDelay: 250,
  // ms per frame
  gifLoop: "infinite",
  // 'infinite' | 'once' | 'bounce'
  activeFilters: /* @__PURE__ */ new Set(),
  // active filter names for stackable effects
  sectionEnabled: { exposure: false, splitTone: false, effects: false },
  // per-section on/off (off by default)
  effectsPreviewMode: false,
  // toggle before/after for effects; false = effects visible (normal rendering)
  filterOrder: [
    "crt",
    "lcd",
    "grid",
    "vignette",
    "halftone",
    "dot",
    "glow",
    "chroma",
    "jitter",
    "noise",
    "ghosting",
    "pixsort",
    "blkglitch",
    "wavewarp",
    "zoomblur",
    "bayer",
    "floyd",
    "interlace",
    "chswap",
    "rgbplanes",
    "colcorrupt"
  ],
  gifPreviewTimer: null,
  // setInterval handle for live GIF preview
  viewMode: "grid",
  // 'grid' | 'solo'
  applyScope: "all",
  // 'all' | 'photo' — whether controls write to global or this photo
  photoSettings: {},
  // { [photoIndex]: { paletteId?, exportFilter?, filterIntensity?, filterVariant?, filterParams?, brightness?, contrast?, toneIntensity?, shadowColor?, highlightColor?, toneBalance? } }
  // Tone adjustments
  brightness: 0,
  // -100 to +100
  contrast: 0,
  // -100 to +100
  toneIntensity: 0,
  // 0–100 (split toning strength)
  shadowColor: "#0033aa",
  highlightColor: "#ff8800",
  toneBalance: 0,
  // -100 (more shadow) to +100 (more highlight)
  selectedPhotos: /* @__PURE__ */ new Set(),
  // indices of currently selected photos (multi)
  lastSelectedIndex: null,
  // last clicked photo index, for shift-range
  focusedFilter: null,
  // which filter's param panel is open
  effectClipboard: null,
  // copied effect settings for paste
  borderId: "int-frame-0",
  // global border frame id
  borderEnabled: false,
  // global border on/off
  filterScope: "full"
  // 'full' = filters apply to border+photo; 'photo' = photo area only
};
const MAGIC = [77, 97, 103, 105, 99];
const MAGIC_ECHO_OFFSET = 4306;
const MAGIC_PRIMARY_GAP = 254;
function hasMagicAt(buf, p) {
  for (let i = 0; i < MAGIC.length; i++) if (buf[p + i] !== MAGIC[i]) return false;
  return true;
}
function coerceGbCamSave(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (buf.length === SRAM_SIZE) return buf;
  for (let i = MAGIC_ECHO_OFFSET; i + MAGIC_PRIMARY_GAP + MAGIC.length <= buf.length; i++) {
    if (hasMagicAt(buf, i) && hasMagicAt(buf, i + MAGIC_PRIMARY_GAP)) {
      const base = i - MAGIC_ECHO_OFFSET;
      const out = new Uint8Array(SRAM_SIZE).fill(255);
      out.set(buf.subarray(base, Math.min(buf.length, base + SRAM_SIZE)), 0);
      return out;
    }
  }
  return null;
}
const dom = {
  app: document.getElementById("app"),
  welcome: document.getElementById("welcome"),
  main: document.getElementById("main"),
  photoGrid: document.getElementById("photo-grid"),
  gridPanel: document.getElementById("grid-panel"),
  detailEmpty: document.getElementById("detail-empty"),
  exportControls: document.getElementById("export-controls"),
  gifPreviewWrap: document.getElementById("gif-preview-wrap"),
  gifPreviewCanvas: document.getElementById("gif-preview-canvas"),
  gifPreviewInfo: document.getElementById("gif-preview-info"),
  soloView: document.getElementById("solo-view"),
  soloCanvas: document.getElementById("solo-canvas"),
  soloLabel: document.getElementById("solo-label"),
  soloMeta: document.getElementById("solo-meta"),
  gifToolbar: document.getElementById("gif-toolbar"),
  gifFrameStrip: document.getElementById("gif-frame-strip"),
  gifFrameList: document.getElementById("gif-frame-list"),
  gifFrameEmpty: document.getElementById("gif-frame-empty"),
  gifCount: document.getElementById("gif-count"),
  gifDelay: document.getElementById("gif-delay"),
  gifDelayVal: document.getElementById("gif-delay-val"),
  statusText: document.getElementById("status-text"),
  statusDot: document.getElementById("status-dot"),
  pocketModal: document.getElementById("pocket-modal"),
  pocketSaveList: document.getElementById("pocket-save-list"),
  pocketConfirm: document.getElementById("pocket-confirm"),
  toast: document.getElementById("toast"),
  dropOverlay: document.getElementById("drop-overlay"),
  presentationOverlay: document.getElementById("presentation-overlay"),
  presCanvas: document.getElementById("pres-canvas"),
  presLabel: document.getElementById("pres-label"),
  presClose: document.getElementById("pres-close"),
  presPrev: document.getElementById("pres-prev"),
  presNext: document.getElementById("pres-next")
};
let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("visible"), 2500);
}
function setStatus(text, active = false) {
  dom.statusText.textContent = text;
  dom.statusDot.className = "status-dot" + (active ? " green" : "");
}
function getEffectiveSettings(index) {
  const ps = state.photoSettings[index];
  if (!ps) {
    return {
      palette: state.palette,
      exportFilter: state.exportFilter,
      filterIntensity: state.filterIntensity,
      filterVariant: state.filterVariant,
      filterParams: state.filterParams,
      activeFilters: new Set(state.activeFilters),
      brightness: state.brightness,
      contrast: state.contrast,
      toneIntensity: state.toneIntensity,
      shadowColor: state.shadowColor,
      highlightColor: state.highlightColor,
      toneBalance: state.toneBalance,
      borderId: state.borderId,
      borderEnabled: state.borderEnabled,
      filterScope: state.filterScope
    };
  }
  return {
    palette: ps.paletteId ? PALETTES[ps.paletteId] || state.palette : state.palette,
    exportFilter: ps.exportFilter ?? state.exportFilter,
    filterIntensity: ps.filterIntensity ?? state.filterIntensity,
    filterVariant: ps.filterVariant ?? state.filterVariant,
    filterParams: ps.filterParams ?? state.filterParams,
    activeFilters: ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters),
    brightness: ps.brightness ?? state.brightness,
    contrast: ps.contrast ?? state.contrast,
    toneIntensity: ps.toneIntensity ?? state.toneIntensity,
    shadowColor: ps.shadowColor ?? state.shadowColor,
    highlightColor: ps.highlightColor ?? state.highlightColor,
    toneBalance: ps.toneBalance ?? state.toneBalance,
    borderId: ps.borderId ?? state.borderId,
    borderEnabled: ps.borderEnabled ?? state.borderEnabled,
    filterScope: state.filterScope
    // always global (not per-photo)
  };
}
function setScopedSetting(key, value) {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      state.photoSettings[idx][key] = value;
    }
  } else {
    state[key] = value;
  }
}
function getWritableFilterParams(filter) {
  const idx = state.selectedPhotos.size > 0 ? [...state.selectedPhotos][0] : state.selectedIndex;
  if (idx !== null && idx !== void 0) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    if (!state.photoSettings[idx].filterParams) {
      state.photoSettings[idx].filterParams = JSON.parse(JSON.stringify(state.filterParams));
    }
    const fp = state.photoSettings[idx].filterParams;
    if (!fp[filter]) fp[filter] = {};
    return fp[filter];
  }
  if (!state.filterParams[filter]) state.filterParams[filter] = {};
  return state.filterParams[filter];
}
function hasPhotoOverride(index) {
  const ps = state.photoSettings[index];
  if (!ps) return false;
  return Object.keys(ps).some(
    (k) => ps[k] !== void 0 && (k !== "filterParams" || Object.keys(ps[k]).length > 0)
  );
}
function getDisplayPaletteId() {
  if (state.selectedIndex !== null) {
    return getEffectiveSettings(state.selectedIndex).palette?.id || state.palette.id;
  }
  return state.palette.id;
}
function getCollapsedFxGroups() {
  return new Set(readJson(STORAGE_KEYS.effectGroupsCollapsed, ["retro", "glitch"]));
}
function setFxGroupCollapsed(g, collapsed) {
  const set = getCollapsedFxGroups();
  if (collapsed) set.add(g);
  else set.delete(g);
  writeJson(STORAGE_KEYS.effectGroupsCollapsed, [...set]);
}
function makeFxGroupHeader(g, collapsed) {
  const h = document.createElement("div");
  h.className = "fi-group-header" + (collapsed ? " collapsed" : "");
  h.dataset.group = g;
  const chevron = document.createElement("span");
  chevron.className = "fi-group-chevron";
  chevron.textContent = "▾";
  const label = document.createElement("span");
  label.className = "fi-group-label";
  label.textContent = FX_GROUP_LABELS[g] || g;
  const dot = document.createElement("span");
  dot.className = "fi-group-dot";
  dot.title = "An effect in this group is active";
  h.appendChild(chevron);
  h.appendChild(label);
  h.appendChild(dot);
  h.addEventListener("click", () => {
    const nowCollapsed = !h.classList.contains("collapsed");
    h.classList.toggle("collapsed", nowCollapsed);
    setFxGroupCollapsed(g, nowCollapsed);
    document.querySelectorAll(`#filter-accordion .fi-item[data-group="${g}"]`).forEach((it2) => {
      it2.style.display = nowCollapsed ? "none" : "";
    });
  });
  return h;
}
function syncFilterAccordion(eff) {
  const af = eff ? eff.activeFilters : state.activeFilters;
  const fp = eff ? eff.filterParams : state.filterParams;
  const fv = eff ? eff.filterVariant : state.filterVariant;
  document.querySelectorAll(".fi-item").forEach((item) => {
    const filterId = item.dataset.filter;
    const active = af.has(filterId);
    const cb = item.querySelector(".fi-check");
    if (cb) cb.checked = active;
    item.classList.toggle("fi-active", active);
    if (active) item.classList.add("fi-open");
    const fp_f = fp && fp[filterId] || {};
    item.querySelectorAll("[data-fi-key]").forEach((el) => {
      const key = el.dataset.fiKey;
      const stateKey = el.dataset.fiStatekey;
      const curVal = stateKey ? fv : fp_f[key] ?? el._fiDef;
      if (el.tagName === "INPUT" && el.type === "range") {
        el.value = curVal;
        const valEl = el.previousElementSibling?.querySelector(".fi-val") || el.parentElement?.querySelector(".fi-val");
        if (valEl && el._fiFmt) valEl.textContent = el._fiFmt(Number(curVal));
      } else if (el.classList.contains("seg-control")) {
        el.querySelectorAll(".seg-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.val === String(curVal));
        });
      }
    });
  });
  const _fxActiveGroups = /* @__PURE__ */ new Set();
  document.querySelectorAll("#filter-accordion .fi-item.fi-active").forEach((it2) => {
    if (it2.dataset.group) _fxActiveGroups.add(it2.dataset.group);
  });
  document.querySelectorAll("#filter-accordion .fi-group-header").forEach((h) => {
    h.classList.toggle("has-active", _fxActiveGroups.has(h.dataset.group));
  });
}
function setupFilterAccordion() {
  const container = document.getElementById("filter-accordion");
  if (!container) return;
  container.innerHTML = "";
  const collapsedFx = getCollapsedFxGroups();
  const _fxGroupItems = {};
  for (const fd of FILTER_DEFS) {
    const item = document.createElement("div");
    item.className = "fi-item";
    item.dataset.filter = fd.id;
    const header = document.createElement("div");
    header.className = "fi-header";
    const chevron = document.createElement("span");
    chevron.className = "fi-chevron section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    const dragHandle = document.createElement("span");
    dragHandle.className = "fi-drag-handle";
    dragHandle.setAttribute("aria-hidden", "true");
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "Drag to reorder";
    const lbl = document.createElement("span");
    lbl.className = "fi-label";
    lbl.textContent = fd.label;
    const checkWrap = document.createElement("label");
    checkWrap.className = "section-check-wrap fi-check-wrap";
    checkWrap.title = `Enable ${fd.label}`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "fi-check";
    cb.dataset.filter = fd.id;
    checkWrap.appendChild(cb);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn-ghost btn-xs btn-icon fi-reset";
    resetBtn.title = `Reset ${fd.label} to defaults`;
    resetBtn.textContent = "↺";
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pushUndo();
      const defaults = buildDefaultFilterParams()[fd.id] || {};
      const fp = getWritableFilterParams(fd.id);
      Object.assign(fp, defaults);
      item.querySelectorAll('input[type="range"][data-fi-key]').forEach((slider) => {
        const key = slider.dataset.fiKey;
        if (key in defaults) {
          slider.value = defaults[key];
          const valEl = slider.closest(".range-wrap")?.querySelector(".fi-val");
          if (valEl && slider._fiFmt) valEl.textContent = slider._fiFmt(defaults[key]);
        }
      });
      item.querySelectorAll(".seg-control[data-fi-key]").forEach((seg) => {
        const key = seg.dataset.fiKey;
        if (key in defaults) {
          seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.val === String(defaults[key])));
        }
      });
      repaintInteractive();
    });
    header.appendChild(dragHandle);
    header.appendChild(chevron);
    header.appendChild(lbl);
    header.appendChild(resetBtn);
    header.appendChild(checkWrap);
    item.draggable = false;
    header.addEventListener("mousedown", () => {
      item.draggable = true;
    });
    item.addEventListener("dragend", () => {
      item.draggable = false;
      item.classList.remove("fi-dragging");
      document.querySelectorAll(".fi-item").forEach((el) => el.classList.remove("fi-drag-over"));
      updateFilterOrder(true);
    });
    document.addEventListener(
      "mouseup",
      () => {
        item.draggable = false;
      },
      { passive: true }
    );
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/html", item.innerHTML);
      item.classList.add("fi-dragging");
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const dragging = document.querySelector(".fi-item.fi-dragging");
      if (dragging && dragging !== item) {
        item.classList.add("fi-drag-over");
        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          item.parentNode.insertBefore(dragging, item);
        } else {
          item.parentNode.insertBefore(dragging, item.nextSibling);
        }
        updateFilterOrder();
      }
    });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("fi-drag-over");
    });
    item.appendChild(header);
    const outer = document.createElement("div");
    outer.className = "fi-body-outer";
    const inner = document.createElement("div");
    inner.className = "fi-body-inner";
    const content = document.createElement("div");
    content.className = "fi-body-content";
    inner.appendChild(content);
    for (const p of fd.params) {
      if (p.type === "range") {
        const wrap = document.createElement("div");
        wrap.className = "range-wrap fp-row";
        const hdr2 = document.createElement("div");
        hdr2.className = "range-header";
        const pLbl = document.createElement("span");
        pLbl.className = "ctrl-label";
        pLbl.textContent = p.label;
        const pVal = document.createElement("span");
        pVal.className = "range-val fi-val";
        pVal.textContent = p.fmt(p.def);
        hdr2.appendChild(pLbl);
        hdr2.appendChild(pVal);
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = p.min;
        slider.max = p.max;
        slider.step = p.step;
        slider.value = p.def;
        slider.dataset.fiKey = p.key;
        if (p.stateKey) slider.dataset.fiStatekey = p.stateKey;
        slider._fiDef = p.def;
        slider._fiFmt = p.fmt;
        slider.addEventListener("pointerdown", () => {
          pushUndo();
          if (!cb.checked) enableFilter(fd.id);
        });
        slider.addEventListener("input", () => {
          const v = parseFloat(slider.value);
          pVal.textContent = p.fmt(v);
          if (p.stateKey) {
            setScopedSetting(p.stateKey, slider.value);
          } else {
            const fp = getWritableFilterParams(fd.id);
            fp[p.key] = v;
          }
          repaintInteractive();
        });
        wrap.appendChild(hdr2);
        wrap.appendChild(slider);
        content.appendChild(wrap);
      } else if (p.type === "seg") {
        const wrap = document.createElement("div");
        wrap.className = "fp-row";
        const pLbl = document.createElement("div");
        pLbl.className = "ctrl-label";
        pLbl.style.marginBottom = "4px";
        pLbl.textContent = p.label;
        const seg = document.createElement("div");
        seg.className = "seg-control";
        seg.dataset.fiKey = p.key;
        if (p.stateKey) seg.dataset.fiStatekey = p.stateKey;
        seg._fiDef = p.def;
        for (const [optVal, optLabel] of p.opts) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "seg-btn" + (optVal === p.def ? " active" : "");
          btn.textContent = optLabel;
          btn.dataset.val = optVal;
          btn.addEventListener("click", () => {
            pushUndo();
            if (!cb.checked) enableFilter(fd.id);
            seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
            if (p.stateKey) {
              setScopedSetting(p.stateKey, optVal);
            } else {
              const fp = getWritableFilterParams(fd.id);
              fp[p.key] = optVal;
            }
            repaintInteractive();
          });
          seg.appendChild(btn);
        }
        wrap.appendChild(pLbl);
        wrap.appendChild(seg);
        content.appendChild(wrap);
      }
    }
    outer.appendChild(inner);
    item.appendChild(outer);
    cb.addEventListener("change", () => {
      toggleFilter(fd.id);
      if (cb.checked) item.classList.add("fi-open");
    });
    header.addEventListener("click", (e) => {
      if (e.target.closest(".fi-check-wrap")) return;
      item.classList.toggle("fi-open");
    });
    const _g = FX_FILTER_GROUP[fd.id] || "glitch";
    item.dataset.group = _g;
    if (collapsedFx.has(_g)) item.style.display = "none";
    (_fxGroupItems[_g] = _fxGroupItems[_g] || []).push(item);
  }
  for (const g of FX_GROUP_ORDER) {
    const items = _fxGroupItems[g];
    if (!items || !items.length) continue;
    container.appendChild(makeFxGroupHeader(g, collapsedFx.has(g)));
    for (const it2 of items) container.appendChild(it2);
  }
}
const BORDER_FRAMES = [
  { id: "int-frame-0", label: "1" },
  { id: "int-frame-1", label: "2" },
  { id: "int-frame-2", label: "3" },
  { id: "int-frame-3", label: "4" },
  { id: "int-frame-4", label: "5" },
  { id: "int-frame-5", label: "6" },
  { id: "int-frame-6", label: "7" },
  { id: "int-frame-7", label: "8" },
  { id: "int-frame-8", label: "9" },
  { id: "int-frame-9", label: "10" },
  { id: "int-frame-10", label: "11" },
  { id: "int-frame-11", label: "12" },
  { id: "int-frame-12", label: "13" },
  { id: "int-frame-13", label: "14" },
  { id: "int-frame-14", label: "15" },
  { id: "int-frame-15", label: "16" },
  { id: "int-frame-16", label: "17" },
  { id: "int-frame-17", label: "18" },
  { id: "jp-frame-0", label: "JP 1" },
  { id: "jp-frame-1", label: "JP 2" },
  { id: "jp-frame-6", label: "JP 3" }
];
function apply$k({ ec, width, height, s, params, variant }) {
  const cfgs = {
    fine: { gap: 0.22, alpha: 0.45 },
    // subtle gap, light darkening
    medium: { gap: 0.4, alpha: 0.7 },
    // classic CRT look
    thick: { gap: 0.58, alpha: 0.84 },
    // heavy scanlines
    wide: { gap: 0.76, alpha: 0.94 }
    // almost half the row is dark
  };
  const cfg = cfgs[variant] || cfgs.medium;
  const crtMix = (params.mix ?? 100) / 100;
  const rowH = Math.max(1, s);
  const gapH = Math.min(Math.max(1, Math.round(rowH * cfg.gap)), rowH - 1);
  const brightH = Math.max(1, rowH - gapH);
  const numCrtRows = Math.ceil(height / rowH);
  for (let row = 0; row < numCrtRows; row++) {
    const rowTop = row * rowH;
    ec.fillStyle = `rgba(0,0,0,${cfg.alpha * crtMix})`;
    ec.fillRect(0, rowTop + brightH, width, gapH);
  }
  const curve = params.curve ?? "none";
  if (curve !== "none") {
    const cx = width / 2, cy = height / 2;
    const isStrong = curve === "strong";
    const edgeDark = isStrong ? 0.62 : 0.34;
    const innerR = Math.min(width, height) * (isStrong ? 0.15 : 0.28);
    const outerR = Math.max(width, height) * 0.88;
    const edgeGrad = ec.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(1, `rgba(0,0,0,${edgeDark})`);
    ec.fillStyle = edgeGrad;
    ec.fillRect(0, 0, width, height);
    const specA = isStrong ? 0.14 : 0.07;
    const specGrad = ec.createRadialGradient(cx, height * 0.07, 0, cx, height * 0.28, width * 0.55);
    specGrad.addColorStop(0, `rgba(255,255,255,${specA})`);
    specGrad.addColorStop(1, "rgba(255,255,255,0)");
    ec.fillStyle = specGrad;
    ec.fillRect(0, 0, width, height);
  }
}
function apply$j({ ec, width, height, s, params }) {
  const spStr = (params.subpixel ?? 30) / 100;
  const lcdBleed = (params.bleed ?? 0) / 100;
  const sepH = Math.max(1, Math.round(s * 0.15));
  const sepW = Math.max(1, Math.round(s * 0.12));
  for (let y = s - sepH; y < height; y += s) {
    ec.fillStyle = "rgba(0,0,0,0.38)";
    ec.fillRect(0, y, width, sepH);
  }
  for (let x = s; x < width; x += s) {
    ec.fillStyle = "rgba(0,0,0,0.22)";
    ec.fillRect(x - sepW, 0, sepW, height);
  }
  if (s >= 4 && spStr > 0) {
    const cw = Math.max(1, Math.round(s / 3));
    for (let x = 0; x < width; x += s) {
      ec.fillStyle = `rgba(255,80,80,${spStr})`;
      ec.fillRect(x, 0, cw, height);
      ec.fillStyle = `rgba(80,255,80,${spStr})`;
      ec.fillRect(x + cw, 0, cw, height);
      ec.fillStyle = `rgba(80,80,255,${spStr})`;
      ec.fillRect(x + cw * 2, 0, cw, height);
    }
  }
  if (lcdBleed > 0) {
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height]
    ];
    const bleedR = Math.max(width, height) * 0.6;
    for (const [cx2, cy2] of corners) {
      const bg = ec.createRadialGradient(cx2, cy2, 0, cx2, cy2, bleedR);
      bg.addColorStop(0, `rgba(255,255,255,${lcdBleed * 0.18})`);
      bg.addColorStop(1, "rgba(255,255,255,0)");
      ec.fillStyle = bg;
      ec.fillRect(0, 0, width, height);
    }
  }
}
function apply$i({ ec, width, height, s, params }) {
  const gridOpacity = (params.opacity ?? 30) / 100;
  const lineWBase = params.weight ?? 1;
  const lineW = Math.max(1, Math.round(lineWBase * s / 4));
  if (s >= 2) {
    ec.strokeStyle = `rgba(0,0,0,${gridOpacity})`;
    ec.lineWidth = lineW;
    const numGridCols = Math.ceil(width / s);
    for (let col = 1; col <= numGridCols; col++) {
      const x = col * s - lineW / 2;
      ec.beginPath();
      ec.moveTo(x, 0);
      ec.lineTo(x, height);
      ec.stroke();
    }
    const numGridRows = Math.ceil(height / s);
    for (let row = 1; row <= numGridRows; row++) {
      const y = row * s - lineW / 2;
      ec.beginPath();
      ec.moveTo(0, y);
      ec.lineTo(width, y);
      ec.stroke();
    }
  }
}
function apply$h({ ec, width, height, params }) {
  const _fv = params.falloff ?? 50;
  const _shape = (params.shape ?? 0) / 100;
  const _t = (typeof _fv === "string" ? { soft: 20, medium: 50, hard: 80 }[_fv] ?? 50 : _fv) / 100;
  const cx = width / 2, cy = height / 2;
  const innerMult = 0.2 - _t * 0.18;
  const outerMult = 0.75 - _t * 0.15;
  const darkMax = 0.3 + _t * 0.68;
  if (_shape > 0.05) {
    ec.save();
    ec.translate(cx, cy);
    ec.scale(1, width / height * (1 - _shape * 0.4) + _shape * (height / width * 1.4));
    ec.translate(-cx, -cy);
    const squishR = Math.min(width, height) * Math.max(0, innerMult + _shape * 0.05);
    const squishOuter = Math.max(width, height) * (outerMult + _shape * 0.05);
    const gSq = ec.createRadialGradient(cx, cy, squishR, cx, cy, squishOuter);
    gSq.addColorStop(0, "rgba(0,0,0,0)");
    gSq.addColorStop(0.5, `rgba(0,0,0,${(darkMax * 0.3).toFixed(2)})`);
    gSq.addColorStop(1, `rgba(0,0,0,${darkMax})`);
    ec.fillStyle = gSq;
    ec.fillRect(-width, -height, width * 3, height * 3);
    ec.restore();
  } else {
    const inner = Math.min(width, height) * Math.max(0, innerMult);
    const outer = Math.max(width, height) * outerMult;
    const grad = ec.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, `rgba(0,0,0,${(darkMax * 0.25).toFixed(2)})`);
    grad.addColorStop(1, `rgba(0,0,0,${darkMax})`);
    ec.fillStyle = grad;
    ec.fillRect(0, 0, width, height);
  }
}
function apply$g({ ec, width, height, s, params }) {
  const htRad = (params.radius ?? 38) / 100;
  const htDarkness = (params.darkness ?? 35) / 100;
  const htShape = params.shape ?? "circle";
  const r = Math.max(1, Math.round(s * htRad));
  ec.fillStyle = `rgba(0,0,0,${htDarkness.toFixed(2)})`;
  for (let y = Math.round(s * 0.5); y < height; y += s) {
    for (let x = Math.round(s * 0.5); x < width; x += s) {
      ec.beginPath();
      if (htShape === "circle") {
        ec.arc(x, y, r, 0, Math.PI * 2);
      } else if (htShape === "square") {
        ec.rect(x - r, y - r, r * 2, r * 2);
      } else if (htShape === "diamond") {
        ec.moveTo(x, y - r);
        ec.lineTo(x + r, y);
        ec.lineTo(x, y + r);
        ec.lineTo(x - r, y);
        ec.closePath();
      }
      ec.fill();
    }
  }
}
function apply$f({ ec, width, height, s, params }) {
  ec.fillStyle = "rgba(0,0,0,0.88)";
  ec.fillRect(0, 0, width, height);
  ec.globalCompositeOperation = "destination-out";
  const dotRadPct = (params.radius ?? 44) / 100;
  const halationPct = (params.halation ?? 0) / 100;
  const dotR = Math.max(1, Math.round(s * dotRadPct));
  const dotRows = Math.ceil(height / s);
  const dotCols = Math.ceil(width / s);
  for (let py = 0; py < dotRows; py++) {
    for (let px = 0; px < dotCols; px++) {
      const cx = Math.round(px * s + s * 0.5);
      const cy = Math.round(py * s + s * 0.5);
      ec.beginPath();
      ec.arc(cx, cy, dotR, 0, Math.PI * 2);
      ec.fill();
    }
  }
  ec.globalCompositeOperation = "source-over";
  if (halationPct > 0) {
    for (let py = 0; py < dotRows; py++) {
      for (let px = 0; px < dotCols; px++) {
        const cx2 = Math.round(px * s + s * 0.5);
        const cy2 = Math.round(py * s + s * 0.5);
        const gR = dotR + Math.round(s * halationPct * 0.8);
        const hGrad = ec.createRadialGradient(cx2, cy2, dotR * 0.8, cx2, cy2, gR);
        hGrad.addColorStop(0, `rgba(255,255,255,${halationPct * 0.3})`);
        hGrad.addColorStop(1, "rgba(255,255,255,0)");
        ec.fillStyle = hGrad;
        ec.beginPath();
        ec.arc(cx2, cy2, gR, 0, Math.PI * 2);
        ec.fill();
      }
    }
  }
}
function apply$e({ ctx, width, height, s, params }) {
  const glowBlurPct = (params.blur ?? 110) / 100;
  const glowIntensity = (params.intensity ?? 80) / 100;
  const ph = params.phosphor ?? "none";
  if (glowIntensity <= 0 && ph === "none") return;
  const phColors = {
    green: "rgba(0,255,80,0.40)",
    amber: "rgba(255,170,0,0.42)",
    blue: "rgba(80,160,255,0.40)"
  };
  const bloomSrc = Object.assign(document.createElement("canvas"), { width, height });
  const bsc = bloomSrc.getContext("2d");
  bsc.drawImage(ctx.canvas, 0, 0);
  if (ph !== "none" && phColors[ph]) {
    bsc.globalCompositeOperation = "source-atop";
    bsc.fillStyle = phColors[ph];
    bsc.fillRect(0, 0, width, height);
    bsc.globalCompositeOperation = "source-over";
  }
  const blurPx = Math.round(s * 3.5 * glowBlurPct);
  const bloom = Object.assign(document.createElement("canvas"), { width, height });
  const bc = bloom.getContext("2d");
  if (blurPx > 0) {
    bc.filter = `blur(${blurPx}px)`;
  }
  bc.drawImage(bloomSrc, 0, 0);
  bc.filter = "none";
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, glowIntensity));
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(bloom, 0, 0);
  ctx.restore();
}
function seededRand(seed1, seed2) {
  let h = seed1 * 1664525 + seed2 * 1013904223 + 2654435769 | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function blendIntensity(out, src, intensity) {
  const t = Math.min(1, Math.max(0, intensity));
  if (t >= 1) return;
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round(src[i] * (1 - t) + out[i] * t);
    out[i + 1] = Math.round(src[i + 1] * (1 - t) + out[i + 1] * t);
    out[i + 2] = Math.round(src[i + 2] * (1 - t) + out[i + 2] * t);
  }
}
function apply$d({ ctx, width, height, s, params, intensity }) {
  const cp = params;
  const hpx = Math.round(s * (cp.shiftH ?? 75) / 100);
  const vpx = Math.round(s * (cp.shiftV ?? 0) / 100);
  const rpx = Math.round(s * (cp.shiftR ?? 0) / 100);
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data, o = dst.data;
  const cx2 = width / 2, cy2 = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let nx = 0, ny = 0;
      if (rpx !== 0) {
        const dx = x - cx2, dy = y - cy2;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = dx / dist;
        ny = dy / dist;
      }
      const rx = Math.min(width - 1, Math.max(0, Math.round(x + hpx + nx * rpx)));
      const ry = Math.min(height - 1, Math.max(0, Math.round(y + vpx + ny * rpx)));
      const bx = Math.min(width - 1, Math.max(0, Math.round(x - hpx - nx * rpx)));
      const by = Math.min(height - 1, Math.max(0, Math.round(y - vpx - ny * rpx)));
      const ri = (ry * width + rx) * 4;
      const bi = (by * width + bx) * 4;
      o[i] = d[ri];
      o[i + 1] = d[i + 1];
      o[i + 2] = d[bi + 2];
      o[i + 3] = 255;
    }
  }
  blendIntensity(o, d, intensity);
  ctx.putImageData(dst, 0, 0);
}
function apply$c({ ctx, width, height, s, params, intensity }) {
  const jitterPct = (params.amount ?? 40) / 100;
  const jitterFreq = (params.frequency ?? 50) / 100;
  const maxShift = Math.max(1, Math.round(s * jitterPct * 3));
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data, o = dst.data;
  const tileH = Math.max(1, s);
  for (let y = 0; y < height; y++) {
    const tileY = Math.floor(y / tileH);
    const frac = Math.sin(tileY * 43758.5453123) * 43758.5453123 % 1;
    const norm = frac < 0 ? frac + 1 : frac;
    const shouldJitter = norm > 1 - jitterFreq;
    const shift = shouldJitter ? Math.round((norm * 2 - 1) * maxShift) : 0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + shift));
      const i = (y * width + x) * 4;
      const si = (y * width + sx) * 4;
      o[i] = d[si];
      o[i + 1] = d[si + 1];
      o[i + 2] = d[si + 2];
      o[i + 3] = 255;
    }
  }
  blendIntensity(o, d, intensity);
  ctx.putImageData(dst, 0, 0);
}
function apply$b({ ctx, width, height, params, intensity, photoSeed }) {
  const noiseAmt = (params.amount ?? 40) / 100;
  const noiseType = params.type ?? "film";
  const orig = ctx.getImageData(0, 0, width, height);
  const d = orig.data;
  const src = new Uint8ClampedArray(d);
  if (noiseType === "film") {
    for (let i = 0; i < d.length; i += 4) {
      const g = (seededRand(photoSeed, i) - 0.5) * noiseAmt * 200;
      d[i] = Math.min(255, Math.max(0, d[i] + g));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + g));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + g));
    }
  } else if (noiseType === "static") {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, d[i] + (seededRand(photoSeed, i) - 0.5) * noiseAmt * 200));
      d[i + 1] = Math.min(
        255,
        Math.max(0, d[i + 1] + (seededRand(photoSeed, i + 1) - 0.5) * noiseAmt * 200)
      );
      d[i + 2] = Math.min(
        255,
        Math.max(0, d[i + 2] + (seededRand(photoSeed, i + 2) - 0.5) * noiseAmt * 200)
      );
    }
  } else if (noiseType === "bands") {
    for (let y = 0; y < height; y++) {
      const rowNoise = (seededRand(photoSeed, y) - 0.5) * noiseAmt * 180;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        d[i] = Math.min(255, Math.max(0, d[i] + rowNoise));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + rowNoise));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + rowNoise));
      }
    }
  }
  blendIntensity(d, src, intensity);
  ctx.putImageData(orig, 0, 0);
}
function apply$a({ ctx, width, height, s, params, intensity }) {
  const ghostOffset = (params.offset ?? 60) / 100;
  const ghostFade = (params.fade ?? 70) / 100;
  const shift2 = Math.max(2, Math.round(s * ghostOffset));
  const orig = ctx.getImageData(0, 0, width, height);
  const dst = new ImageData(width, height);
  const d = orig.data, o = dst.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g1x = Math.max(0, x - shift2);
      const g1i = (y * width + g1x) * 4;
      const g2x = Math.max(0, x - shift2 * 2);
      const g2i = (y * width + g2x) * 4;
      const a1 = (1 - ghostFade) * 0.8;
      const a2 = (1 - ghostFade) * 0.35;
      o[i] = Math.min(255, d[i] + d[g1i] * a1 + d[g2i] * a2);
      o[i + 1] = Math.min(255, d[i + 1] + d[g1i + 1] * a1 + d[g2i + 1] * a2);
      o[i + 2] = Math.min(255, d[i + 2] + d[g1i + 2] * a1 + d[g2i + 2] * a2);
      o[i + 3] = 255;
    }
  }
  blendIntensity(o, d, intensity);
  ctx.putImageData(dst, 0, 0);
}
function apply$9({ ctx, width, height, params, intensity }) {
  const threshPct = (params.threshold ?? 50) / 100;
  const dir = params.direction ?? "down";
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);
  const lum = (i) => (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255;
  const sortRun = (pixels, ascending) => {
    const run = pixels.map((i) => [lum(i), sd[i], sd[i + 1], sd[i + 2], sd[i + 3]]);
    run.sort((a, b) => ascending ? a[0] - b[0] : b[0] - a[0]);
    for (let j = 0; j < run.length; j++) {
      const ri = pixels[j];
      out[ri] = run[j][1];
      out[ri + 1] = run[j][2];
      out[ri + 2] = run[j][3];
      out[ri + 3] = run[j][4];
    }
  };
  if (dir === "down" || dir === "vertical") {
    for (let x = 0; x < width; x++) {
      let run = [];
      for (let y = 0; y <= height; y++) {
        const i = (y * width + x) * 4;
        const l = y < height ? lum(i) : -1;
        if (l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, true);
          run = [];
        }
      }
    }
  } else if (dir === "up") {
    for (let x = 0; x < width; x++) {
      let run = [];
      for (let y = height - 1; y >= -1; y--) {
        const i = (Math.max(0, y) * width + x) * 4;
        const l = y >= 0 ? lum(i) : -1;
        if (y >= 0 && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, false);
          run = [];
        }
      }
    }
  } else if (dir === "right" || dir === "horizontal") {
    for (let y = 0; y < height; y++) {
      let run = [];
      for (let x = 0; x <= width; x++) {
        const i = (y * width + x) * 4;
        const l = x < width ? lum(i) : -1;
        if (x < width && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, true);
          run = [];
        }
      }
    }
  } else if (dir === "left") {
    for (let y = 0; y < height; y++) {
      let run = [];
      for (let x = width - 1; x >= -1; x--) {
        const i = (y * width + Math.max(0, x)) * 4;
        const l = x >= 0 ? lum(i) : -1;
        if (x >= 0 && l >= threshPct) {
          run.push(i);
        } else if (run.length > 0) {
          sortRun(run, false);
          run = [];
        }
      }
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
function apply$8({ ctx, width, height, params, intensity, photoSeed }) {
  const shiftPct = (params.shift ?? 40) / 100;
  const densityPct = (params.density ?? 30) / 100;
  const sizePct = (params.size ?? 20) / 100;
  const maxHeightPct = (params.maxheight ?? 30) / 100;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);
  const maxShift = Math.max(1, Math.round(width * shiftPct * 0.5));
  const maxBlockH = Math.max(1, Math.round(height * maxHeightPct * sizePct));
  const numBlocks = Math.max(1, Math.round(densityPct * 25));
  let _rngBg = photoSeed * 1664525 + 1013904223 | 0;
  const _randBg = () => {
    _rngBg = _rngBg * 1664525 + 1013904223 | 0;
    return (_rngBg >>> 0) / 4294967296;
  };
  for (let b = 0; b < numBlocks; b++) {
    const y0 = Math.floor(_randBg() * height);
    const bh = Math.max(1, Math.ceil(_randBg() * maxBlockH));
    const dxs = Math.round((_randBg() - 0.5) * 2 * maxShift);
    for (let y = y0; y < Math.min(height, y0 + bh); y++) {
      for (let x = 0; x < width; x++) {
        const srcX = ((x - dxs) % width + width) % width;
        const di = (y * width + x) * 4;
        const si = (y * width + srcX) * 4;
        out[di] = sd[si];
        out[di + 1] = sd[si + 1];
        out[di + 2] = sd[si + 2];
        out[di + 3] = sd[si + 3];
      }
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
function apply$7({ ctx, width, height, params, intensity }) {
  const ampPct = (params.amplitude ?? 30) / 100;
  const freqPct = (params.frequency ?? 40) / 100;
  const amplitude = Math.max(1, Math.round(width * ampPct * 0.25));
  const cycles = 1 + freqPct * 7;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd.length);
  for (let y = 0; y < height; y++) {
    const offsetX = Math.round(Math.sin(y / height * cycles * Math.PI * 2) * amplitude);
    for (let x = 0; x < width; x++) {
      const srcX = ((x - offsetX) % width + width) % width;
      const di = (y * width + x) * 4;
      const si = (y * width + srcX) * 4;
      out[di] = sd[si];
      out[di + 1] = sd[si + 1];
      out[di + 2] = sd[si + 2];
      out[di + 3] = sd[si + 3];
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
function apply$6({ ctx, width, height, params, intensity }) {
  const zoomAmt = (params.amount ?? 30) / 100;
  const steps = 12;
  const maxExpand = 0.6;
  const tmp = Object.assign(document.createElement("canvas"), { width, height });
  tmp.getContext("2d").drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tmp, 0, 0);
  const blendAlpha = Math.min(0.9, zoomAmt) / steps * Math.min(1, Math.max(0, intensity));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sc = 1 + t * zoomAmt * maxExpand;
    const dx = (width - width * sc) / 2;
    const dy = (height - height * sc) / 2;
    ctx.globalAlpha = blendAlpha * (1 - t * 0.4);
    ctx.drawImage(tmp, dx, dy, width * sc, height * sc);
  }
  ctx.globalAlpha = 1;
}
function apply$5({ ctx, width, height, params, intensity }) {
  const levels = params.levels ?? 4;
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const step = Math.floor(256 / levels);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const bayerOrig = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const row = Math.floor(pixelIndex / width) % 4;
    const col = pixelIndex % width % 4;
    const threshold = bayerMatrix[row][col] / 16 * 255;
    for (let c = 0; c < 3; c++) {
      const quantized = Math.floor(data[i + c] / step) * step;
      data[i + c] = data[i + c] > quantized + threshold ? quantized + step : quantized;
    }
  }
  blendIntensity(data, bayerOrig, intensity);
  ctx.putImageData(imageData, 0, 0);
}
function apply$4({ ctx, width, height, params, intensity }) {
  const levels = params.levels ?? 2;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const floydOrig = new Uint8ClampedArray(data);
  const lums = new Float32Array(width * height);
  const errors = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    lums[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }
  const step = 255 / (levels - 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = Math.max(0, Math.min(255, lums[idx] + errors[idx]));
      const quantized = Math.round(val / step) * step;
      const err = val - quantized;
      lums[idx] = quantized;
      if (x + 1 < width) errors[idx + 1] += err * 7 / 16;
      if (y + 1 < height) {
        if (x - 1 >= 0) errors[idx + width - 1] += err * 3 / 16;
        errors[idx + width] += err * 5 / 16;
        if (x + 1 < width) errors[idx + width + 1] += err * 1 / 16;
      }
    }
  }
  for (let i = 0; i < width * height; i++) {
    const v = Math.round(lums[i]);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
  blendIntensity(data, floydOrig, intensity);
  ctx.putImageData(imageData, 0, 0);
}
function apply$3({ ctx, width, height, s, params, intensity }) {
  const amt = (params.intensity ?? 60) / 100;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);
  const fieldOffset = Math.round(amt * s * 2);
  const darken = 1 - amt * 0.65;
  for (let y = 0; y < height; y++) {
    const isOdd = y % 2 === 1;
    const dx = isOdd ? fieldOffset : 0;
    const dark = isOdd ? darken : 1;
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(width - 1, Math.max(0, x - dx));
      const di = (y * width + x) * 4;
      const si = (y * width + srcX) * 4;
      out[di] = sd[si] * dark;
      out[di + 1] = sd[si + 1] * dark;
      out[di + 2] = sd[si + 2] * dark;
      out[di + 3] = sd[si + 3];
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
function apply$2({ ctx, width, height, params, intensity }) {
  const mode = params.mode ?? "rgb";
  const channelMap = {
    rgb: [0, 1, 2],
    rbg: [0, 2, 1],
    grb: [1, 0, 2],
    gbr: [1, 2, 0],
    brg: [2, 0, 1],
    bgr: [2, 1, 0]
  };
  const map = channelMap[mode] || [0, 1, 2];
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const tmp = new Uint8ClampedArray(data);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = tmp[i + map[0]];
    data[i + 1] = tmp[i + map[1]];
    data[i + 2] = tmp[i + map[2]];
  }
  blendIntensity(data, tmp, intensity);
  ctx.putImageData(imageData, 0, 0);
}
function apply$1({ ctx, width, height, params, intensity, photoSeed }) {
  const shiftPct = (params.shift ?? 50) / 100;
  const scatterPct = (params.scatter ?? 40) / 100;
  const maxShift = Math.max(1, Math.round(width * shiftPct * 0.28));
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd.length);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  for (let y = 0; y < height; y++) {
    const rowNoise = seededRand(photoSeed, y * 1337 + 7) - 0.5;
    const rOff = Math.round((0.35 + rowNoise * scatterPct) * maxShift);
    const gOff = Math.round(rowNoise * scatterPct * maxShift * 0.25);
    const bOff = Math.round((0.35 - rowNoise * scatterPct) * maxShift);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rx = Math.min(width - 1, Math.max(0, x - rOff));
      const gx = Math.min(width - 1, Math.max(0, x - gOff));
      const bx = Math.min(width - 1, Math.max(0, x + bOff));
      out[i] = sd[(y * width + rx) * 4];
      out[i + 1] = sd[(y * width + gx) * 4 + 1];
      out[i + 2] = sd[(y * width + bx) * 4 + 2];
      out[i + 3] = 255;
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
function apply({ ctx, width, height, s, params, intensity, photoSeed }) {
  const densityPct = (params.density ?? 35) / 100;
  const strengthPct = (params.strength ?? 65) / 100;
  const src = ctx.getImageData(0, 0, width, height);
  const sd = src.data;
  const out = new Uint8ClampedArray(sd);
  let _rngCC = photoSeed * 1664525 + 1013904223 | 0;
  const _randCC = () => {
    _rngCC = _rngCC * 1664525 + 1013904223 | 0;
    return (_rngCC >>> 0) / 4294967296;
  };
  const gbH = PHOTO_HEIGHT;
  const rowTypes = new Array(gbH);
  for (let row = 0; row < gbH; row++) {
    rowTypes[row] = _randCC() < densityPct ? Math.floor(_randCC() * 4) : -1;
  }
  for (let y = 0; y < height; y++) {
    const gbRow = Math.min(gbH - 1, Math.floor(y / Math.max(1, s)));
    const type = rowTypes[gbRow];
    if (type < 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = sd[i], g = sd[i + 1], b = sd[i + 2];
      let nr = r, ng = g, nb = b;
      if (type === 0) {
        nr = Math.round(r * (1 - strengthPct) + b * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + r * strengthPct);
      } else if (type === 1) {
        nr = Math.round(r * (1 - strengthPct) + (255 - r) * strengthPct);
        ng = Math.round(g * (1 - strengthPct) + (255 - g) * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + (255 - b) * strengthPct);
      } else if (type === 2) {
        const grey = (r + g + b) / 3;
        nr = Math.min(255, Math.max(0, Math.round(r + (r - grey) * strengthPct * 2.5)));
        ng = Math.min(255, Math.max(0, Math.round(g + (g - grey) * strengthPct * 2.5)));
        nb = Math.min(255, Math.max(0, Math.round(b + (b - grey) * strengthPct * 2.5)));
      } else {
        nr = Math.round(r * (1 - strengthPct) + g * strengthPct);
        ng = Math.round(g * (1 - strengthPct) + b * strengthPct);
        nb = Math.round(b * (1 - strengthPct) + r * strengthPct);
      }
      out[i] = nr;
      out[i + 1] = ng;
      out[i + 2] = nb;
    }
  }
  blendIntensity(out, sd, intensity);
  ctx.putImageData(new ImageData(out, width, height), 0, 0);
}
const EFFECTS = {
  crt: { apply: apply$k, overlay: true },
  lcd: { apply: apply$j, overlay: true },
  grid: { apply: apply$i, overlay: true },
  vignette: { apply: apply$h, overlay: true },
  halftone: { apply: apply$g, overlay: true },
  dot: { apply: apply$f, overlay: true },
  glow: { apply: apply$e, overlay: false },
  chroma: { apply: apply$d, overlay: false },
  jitter: { apply: apply$c, overlay: false },
  noise: { apply: apply$b, overlay: false },
  ghosting: { apply: apply$a, overlay: false },
  pixsort: { apply: apply$9, overlay: false },
  blkglitch: { apply: apply$8, overlay: false },
  wavewarp: { apply: apply$7, overlay: false },
  zoomblur: { apply: apply$6, overlay: false },
  bayer: { apply: apply$5, overlay: false },
  floyd: { apply: apply$4, overlay: false },
  interlace: { apply: apply$3, overlay: false },
  chswap: { apply: apply$2, overlay: false },
  rgbplanes: { apply: apply$1, overlay: false },
  colcorrupt: { apply, overlay: false }
};
function applyExportFilter(ctx, width, height, scale, filter, intensity = 1, variant = "medium", filterParams, photoSeed = 0) {
  const effect = EFFECTS[filter];
  if (!effect || intensity <= 0) return;
  const allParams = filterParams || state.filterParams;
  const env = {
    ctx,
    width,
    height,
    s: Math.max(1, Math.round(scale)),
    params: allParams[filter] || {},
    intensity,
    variant,
    photoSeed
  };
  if (!effect.overlay) {
    effect.apply(env);
    return;
  }
  const overlay = Object.assign(document.createElement("canvas"), { width, height });
  env.ec = overlay.getContext("2d");
  effect.apply(env);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, intensity));
  ctx.drawImage(overlay, 0, 0);
  ctx.restore();
}
function applyActiveEffects(ctx, width, height, scale, filterIntensity, filterVariant, filterParams, activeFilters, forExport = false, photoSeed = 0) {
  if (!forExport && state.effectsPreviewMode) return;
  if (state.sectionEnabled?.effects === false) return;
  const af = activeFilters || state.activeFilters;
  if (af.size === 0) return;
  const baseOrder = state.filterOrder || [];
  const known = new Set(baseOrder);
  const order = [...baseOrder, ...[...af].filter((id) => !known.has(id))];
  for (const id of order) {
    if (af.has(id)) {
      applyExportFilter(
        ctx,
        width,
        height,
        scale,
        id,
        filterIntensity,
        filterVariant,
        filterParams,
        photoSeed
      );
    }
  }
}
function applyToneAdjustments(ctx, width, height, settings, forExport = false) {
  if (!forExport && state.effectsPreviewMode) return;
  const s = settings || state;
  const brightness = state.sectionEnabled?.exposure ?? true ? s.brightness ?? 0 : 0;
  const contrast = state.sectionEnabled?.exposure ?? true ? s.contrast ?? 0 : 0;
  const toneIntensity = state.sectionEnabled?.splitTone ?? true ? s.toneIntensity ?? 0 : 0;
  const { shadowColor, highlightColor, toneBalance } = s;
  if (brightness === 0 && contrast === 0 && toneIntensity === 0) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const contrastFactor = contrast !== 0 ? 259 * (contrast + 255) / (255 * (259 - contrast)) : 1;
  const sr = parseInt(shadowColor.slice(1, 3), 16);
  const sg = parseInt(shadowColor.slice(3, 5), 16);
  const sb = parseInt(shadowColor.slice(5, 7), 16);
  const hr = parseInt(highlightColor.slice(1, 3), 16);
  const hg = parseInt(highlightColor.slice(3, 5), 16);
  const hb = parseInt(highlightColor.slice(5, 7), 16);
  const toneStr = toneIntensity / 100;
  const mid = (toneBalance + 100) / 200;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (brightness !== 0) {
      r = Math.min(255, Math.max(0, r + brightness));
      g = Math.min(255, Math.max(0, g + brightness));
      b = Math.min(255, Math.max(0, b + brightness));
    }
    if (contrast !== 0) {
      r = Math.min(255, Math.max(0, Math.round(contrastFactor * (r - 128) + 128)));
      g = Math.min(255, Math.max(0, Math.round(contrastFactor * (g - 128) + 128)));
      b = Math.min(255, Math.max(0, Math.round(contrastFactor * (b - 128) + 128)));
    }
    if (toneIntensity > 0) {
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sw = mid > 0 ? Math.max(0, 1 - lum / mid) : 0;
      const hw = mid < 1 ? Math.max(0, (lum - mid) / (1 - mid)) : 0;
      r = Math.min(255, Math.max(0, Math.round(r + toneStr * (sw * (sr - r) + hw * (hr - r)))));
      g = Math.min(255, Math.max(0, Math.round(g + toneStr * (sw * (sg - g) + hw * (hg - g)))));
      b = Math.min(255, Math.max(0, Math.round(b + toneStr * (sw * (sb - b) + hw * (hb - b)))));
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}
function getTransform(idx) {
  if (!state.photoTransforms[idx]) {
    state.photoTransforms[idx] = { rotate: 0, flipH: false, flipV: false };
  }
  return state.photoTransforms[idx];
}
function renderPhotoWithTransform(ctx, photo, palette, scale, idx) {
  const t = getTransform(idx);
  const sw = PHOTO_WIDTH * scale;
  const sh = PHOTO_HEIGHT * scale;
  if (!t.rotate && !t.flipH && !t.flipV) {
    ctx.canvas.width = sw;
    ctx.canvas.height = sh;
    renderToCanvas(ctx, photo.pixels, palette, scale);
    return;
  }
  const rotated = t.rotate === 90 || t.rotate === 270;
  const dw = rotated ? sh : sw;
  const dh = rotated ? sw : sh;
  const tmp = Object.assign(document.createElement("canvas"), { width: sw, height: sh });
  renderToCanvas(tmp.getContext("2d"), photo.pixels, palette, scale);
  ctx.canvas.width = dw;
  ctx.canvas.height = dh;
  ctx.save();
  ctx.translate(dw / 2, dh / 2);
  if (t.flipH) ctx.scale(-1, 1);
  if (t.flipV) ctx.scale(1, -1);
  ctx.rotate(t.rotate * Math.PI / 180);
  ctx.drawImage(tmp, -sw / 2, -sh / 2);
  ctx.restore();
}
function applyTransformAction(idx, action) {
  const t = getTransform(idx);
  if (action === "rotate-cw") {
    t.rotate = (t.rotate + 90) % 360;
  }
  if (action === "rotate-ccw") {
    t.rotate = (t.rotate + 270) % 360;
  }
  if (action === "flip-h") {
    t.flipH = !t.flipH;
  }
  if (action === "flip-v") {
    t.flipV = !t.flipV;
  }
  if (action === "reset-transform") {
    t.rotate = 0;
    t.flipH = false;
    t.flipV = false;
  }
}
const _borderImageCache = {};
function preloadBorderImages() {
  BORDER_FRAMES.forEach(({ id }) => {
    const img = new Image();
    img.onload = () => {
      _borderImageCache[id] = img;
    };
    img.onerror = () => console.warn(`Border frame not found: ${id}`);
    img.src = `frames/${id}.png`;
  });
}
function getColorizedBorderCanvas(borderId, palette) {
  const img = _borderImageCache[borderId];
  if (!img) return null;
  const raw = document.createElement("canvas");
  raw.width = 160;
  raw.height = 144;
  const rawCtx = raw.getContext("2d", { willReadFrequently: true });
  rawCtx.drawImage(img, 0, 0);
  const imageData = rawCtx.getImageData(0, 0, 160, 144);
  const d = imageData.data;
  const rgb = paletteToRGB(palette);
  const PX1 = 16, PX2 = 143, PY1 = 16, PY2 = 127;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      const pidx = i / 4;
      const px = pidx % 160;
      const py = Math.floor(pidx / 160);
      if (px >= PX1 && px <= PX2 && py >= PY1 && py <= PY2) {
        continue;
      }
      const [pr2, pg2, pb2] = rgb[3];
      d[i] = pr2;
      d[i + 1] = pg2;
      d[i + 2] = pb2;
      d[i + 3] = 255;
      continue;
    }
    const R = d[i];
    const gbIdx = Math.min(3, Math.max(0, Math.round((255 - R) * 3 / 255)));
    const [pr, pg, pb] = rgb[gbIdx];
    d[i] = pr;
    d[i + 1] = pg;
    d[i + 2] = pb;
    d[i + 3] = 255;
  }
  rawCtx.putImageData(imageData, 0, 0);
  return raw;
}
function renderPhotoWithBorder(ctx, photo, eff, scale, idx) {
  const borderEnabled = eff.borderEnabled && eff.borderId;
  const borderId = borderEnabled ? eff.borderId : "none";
  if (borderId === "none") {
    renderPhotoWithTransform(ctx, photo, eff.palette, scale, idx);
    return;
  }
  const BW = 160 * scale;
  const BH = 144 * scale;
  const OX = 16 * scale;
  const OY = 16 * scale;
  ctx.canvas.width = BW;
  ctx.canvas.height = BH;
  ctx.clearRect(0, 0, BW, BH);
  const tmpPhoto = document.createElement("canvas");
  const tmpCtx = tmpPhoto.getContext("2d");
  renderPhotoWithTransform(tmpCtx, photo, eff.palette, scale, idx);
  ctx.drawImage(tmpPhoto, OX, OY);
  const borderBase = getColorizedBorderCanvas(borderId, eff.palette);
  if (borderBase) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(borderBase, 0, 0, BW, BH);
  }
}
function renderPhotoComplete(ctx, photo, eff, scale, idx, opts = {}) {
  const { forExport = false } = opts;
  const borderEnabled = eff.borderEnabled && eff.borderId;
  const photoScopeOnly = eff.filterScope === "photo" && borderEnabled;
  const filtersToApply = eff.activeFilters;
  if (photoScopeOnly) {
    const BW = 160 * scale;
    const BH = 144 * scale;
    ctx.canvas.width = BW;
    ctx.canvas.height = BH;
    ctx.clearRect(0, 0, BW, BH);
    const tmpPhoto = document.createElement("canvas");
    const tmpCtx = tmpPhoto.getContext("2d", { willReadFrequently: true });
    renderPhotoWithTransform(tmpCtx, photo, eff.palette, scale, idx);
    const PW = tmpPhoto.width;
    const PH = tmpPhoto.height;
    if (filtersToApply.size > 0) {
      applyActiveEffects(
        tmpCtx,
        PW,
        PH,
        scale,
        eff.filterIntensity,
        eff.filterVariant,
        eff.filterParams,
        filtersToApply,
        forExport,
        idx
      );
    }
    applyToneAdjustments(tmpCtx, PW, PH, eff, forExport);
    ctx.drawImage(tmpPhoto, 16 * scale, 16 * scale);
    const borderBase = getColorizedBorderCanvas(eff.borderId, eff.palette);
    if (borderBase) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(borderBase, 0, 0, BW, BH);
    }
  } else {
    renderPhotoWithBorder(ctx, photo, eff, scale, idx);
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    if (filtersToApply.size > 0) {
      applyActiveEffects(
        ctx,
        W,
        H,
        scale,
        eff.filterIntensity,
        eff.filterVariant,
        eff.filterParams,
        filtersToApply,
        forExport,
        idx
      );
    }
    applyToneAdjustments(ctx, W, H, eff, forExport);
  }
}
const THUMB_SCALE = 4;
var X = { trailer: 59 };
function F(t = 256) {
  let e = 0, s = new Uint8Array(t);
  return { get buffer() {
    return s.buffer;
  }, reset() {
    e = 0;
  }, bytesView() {
    return s.subarray(0, e);
  }, bytes() {
    return s.slice(0, e);
  }, writeByte(r) {
    n(e + 1), s[e] = r, e++;
  }, writeBytes(r, o = 0, i = r.length) {
    n(e + i);
    for (let c = 0; c < i; c++) s[e++] = r[c + o];
  }, writeBytesView(r, o = 0, i = r.byteLength) {
    n(e + i), s.set(r.subarray(o, o + i), e), e += i;
  } };
  function n(r) {
    var o = s.length;
    if (o >= r) return;
    var i = 1024 * 1024;
    r = Math.max(r, o * (o < i ? 2 : 1.125) >>> 0), o != 0 && (r = Math.max(r, 256));
    let c = s;
    s = new Uint8Array(r), e > 0 && s.set(c.subarray(0, e), 0);
  }
}
var O = 12, J = 5003, lt = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535];
function at(t, e, s, n, r = F(512), o = new Uint8Array(256), i = new Int32Array(J), c = new Int32Array(J)) {
  let x = i.length, a = Math.max(2, n);
  o.fill(0), c.fill(0), i.fill(-1);
  let l = 0, f = 0, g = a + 1, h = g, b = false, w = h, _ = (1 << w) - 1, u = 1 << g - 1, k = u + 1, B = u + 2, p = 0, A = s[0], z = 0;
  for (let y = x; y < 65536; y *= 2) ++z;
  z = 8 - z, r.writeByte(a), I(u);
  let d = s.length;
  for (let y = 1; y < d; y++) {
    t: {
      let m = s[y], v = (m << O) + A, M = m << z ^ A;
      if (i[M] === v) {
        A = c[M];
        break t;
      }
      let V = M === 0 ? 1 : x - M;
      for (; i[M] >= 0; ) if (M -= V, M < 0 && (M += x), i[M] === v) {
        A = c[M];
        break t;
      }
      I(A), A = m, B < 1 << O ? (c[M] = B++, i[M] = v) : (i.fill(-1), B = u + 2, b = true, I(u));
    }
  }
  return I(A), I(k), r.writeByte(0), r.bytesView();
  function I(y) {
    for (l &= lt[f], f > 0 ? l |= y << f : l = y, f += w; f >= 8; ) o[p++] = l & 255, p >= 254 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0), l >>= 8, f -= 8;
    if ((B > _ || b) && (b ? (w = h, _ = (1 << w) - 1, b = false) : (++w, _ = w === O ? 1 << w : (1 << w) - 1)), y == k) {
      for (; f > 0; ) o[p++] = l & 255, p >= 254 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0), l >>= 8, f -= 8;
      p > 0 && (r.writeByte(p), r.writeBytesView(o, 0, p), p = 0);
    }
  }
}
var $ = at;
function ct(t = {}) {
  let { initialCapacity: e = 4096, auto: s = true } = t, n = F(e), r = 5003, o = new Uint8Array(256), i = new Int32Array(r), c = new Int32Array(r), x = false;
  return { reset() {
    n.reset(), x = false;
  }, finish() {
    n.writeByte(X.trailer);
  }, bytes() {
    return n.bytes();
  }, bytesView() {
    return n.bytesView();
  }, get buffer() {
    return n.buffer;
  }, get stream() {
    return n;
  }, writeHeader: a, writeFrame(l, f, g, h = {}) {
    let { transparent: b = false, transparentIndex: w = 0, delay: _ = 0, palette: u = null, repeat: k = 0, colorDepth: B = 8, dispose: p = -1 } = h, A = false;
    if (s ? x || (A = true, a(), x = true) : A = Boolean(h.first), f = Math.max(0, Math.floor(f)), g = Math.max(0, Math.floor(g)), A) {
      if (!u) throw new Error("First frame must include a { palette } option");
      pt(n, f, g, u, B), it(n, u), k >= 0 && dt(n, k);
    }
    let z = Math.round(_ / 10);
    wt(n, p, z, b, w);
    let d = Boolean(u) && !A;
    ht(n, f, g, d ? u : null), d && it(n, u), yt(n, l, f, g, B, o, i, c);
  } };
  function a() {
    ft(n, "GIF89a");
  }
}
function wt(t, e, s, n, r) {
  t.writeByte(33), t.writeByte(249), t.writeByte(4), r < 0 && (r = 0, n = false);
  var o, i;
  n ? (o = 1, i = 2) : (o = 0, i = 0), e >= 0 && (i = e & 7), i <<= 2;
  let c = 0;
  t.writeByte(0 | i | c | o), S(t, s), t.writeByte(r || 0), t.writeByte(0);
}
function pt(t, e, s, n, r = 8) {
  let o = 1, i = 0, c = Z(n.length) - 1, x = o << 7 | r - 1 << 4 | i << 3 | c, a = 0, l = 0;
  S(t, e), S(t, s), t.writeBytes([x, a, l]);
}
function dt(t, e) {
  t.writeByte(33), t.writeByte(255), t.writeByte(11), ft(t, "NETSCAPE2.0"), t.writeByte(3), t.writeByte(1), S(t, e), t.writeByte(0);
}
function it(t, e) {
  let s = 1 << Z(e.length);
  for (let n = 0; n < s; n++) {
    let r = [0, 0, 0];
    n < e.length && (r = e[n]), t.writeByte(r[0]), t.writeByte(r[1]), t.writeByte(r[2]);
  }
}
function ht(t, e, s, n) {
  if (t.writeByte(44), S(t, 0), S(t, 0), S(t, e), S(t, s), n) {
    let r = 0, o = 0, i = Z(n.length) - 1;
    t.writeByte(128 | r | o | 0 | i);
  } else t.writeByte(0);
}
function yt(t, e, s, n, r = 8, o, i, c) {
  $(s, n, e, r, t, o, i, c);
}
function S(t, e) {
  t.writeByte(e & 255), t.writeByte(e >> 8 & 255);
}
function ft(t, e) {
  for (var s = 0; s < e.length; s++) t.writeByte(e.charCodeAt(s));
}
function Z(t) {
  return Math.max(Math.ceil(Math.log2(t)), 1);
}
var Bt = ct;
const GIFEncoder = ct ?? Bt.GIFEncoder;
function scaleIndices(indices, width, height, scale) {
  if (scale === 1) return indices;
  const sw = width * scale;
  const out = new Uint8Array(sw * height * scale);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x];
      for (let dy = 0; dy < scale; dy++) {
        const row = (y * scale + dy) * sw + x * scale;
        for (let dx = 0; dx < scale; dx++) out[row + dx] = v;
      }
    }
  }
  return out;
}
function bounceSequence(frames) {
  if (frames.length <= 2) return frames;
  const mid = [...frames].reverse().slice(1, frames.length - 1);
  return [...frames, ...mid];
}
function encodeGif(frames, { delay, scale, loop }) {
  if (!frames.length) throw new Error("No frames to encode");
  const w = frames[0].width * scale;
  const h = frames[0].height * scale;
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const scaled = scaleIndices(new Uint8Array(frame.indices), frame.width, frame.height, scale);
    const opts = { palette: frame.palette, delay };
    if (i === 0) opts.repeat = loop === "once" ? -1 : 0;
    gif.writeFrame(scaled, w, h, opts);
  });
  gif.finish();
  return gif.bytes();
}
function enterGifMode() {
  state.gifMode = true;
  dom.photoGrid.classList.add("gif-mode");
  dom.gifToolbar.classList.add("visible");
  if (dom.gifFrameStrip) dom.gifFrameStrip.classList.add("visible");
  updateGifCount();
  renderGifFrameStrip();
}
function exitGifMode() {
  if (state.gifPreviewTimer) {
    clearInterval(state.gifPreviewTimer);
    state.gifPreviewTimer = null;
  }
  state.gifMode = false;
  state.gifSelection.clear();
  state.gifFrameOrder = [];
  state.gifPaletteScope = null;
  dom.photoGrid.classList.remove("gif-mode");
  dom.gifToolbar.classList.remove("visible");
  if (dom.gifFrameStrip) dom.gifFrameStrip.classList.remove("visible");
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => {
    el.classList.remove("selected-for-gif");
    el.removeAttribute("data-gif-frame");
  });
  if (dom.gifPreviewWrap) dom.gifPreviewWrap.classList.remove("visible");
  hideGifPreviewInfo();
  updateSidebarPreview();
}
function toggleGifSelection(index, slotEl) {
  state.gifFrameOrder.push({ photoIndex: index, paletteId: null });
  state.gifSelection.add(index);
  slotEl.classList.add("selected-for-gif");
  updateGifCount();
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}
function updateGifCount() {
  const n = state.gifFrameOrder.length;
  dom.gifCount.textContent = `${n} frame${n !== 1 ? "s" : ""}`;
}
const GIF_THUMB_W = 96;
const GIF_THUMB_H = 84;
function renderGifFrameStrip() {
  if (!dom.gifFrameList) return;
  dom.gifFrameList.innerHTML = "";
  const empty = state.gifFrameOrder.length === 0;
  if (dom.gifFrameEmpty) dom.gifFrameEmpty.style.display = empty ? "" : "none";
  state.gifFrameOrder.forEach((frame, orderIdx) => {
    const photo = state.photos[frame.photoIndex];
    if (!photo) return;
    const chip = document.createElement("div");
    chip.className = "gif-chip";
    chip.draggable = true;
    chip.dataset.orderIdx = orderIdx;
    const num = document.createElement("div");
    num.className = "gif-chip-num";
    num.textContent = orderIdx + 1;
    const canvas = document.createElement("canvas");
    canvas.width = GIF_THUMB_W;
    canvas.height = GIF_THUMB_H;
    canvas.className = "gif-chip-canvas";
    const eff = getEffectiveSettings(frame.photoIndex);
    const pal = frame.paletteId ? PALETTES[frame.paletteId] : eff.palette;
    if (pal) {
      const tmp = Object.assign(document.createElement("canvas"), {
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT
      });
      const tctx = tmp.getContext("2d");
      renderToCanvas(tctx, photo.pixels, pal, 1);
      applyToneAdjustments(tctx, PHOTO_WIDTH, PHOTO_HEIGHT, eff);
      if (eff.activeFilters.size > 0) {
        applyActiveEffects(
          tctx,
          PHOTO_WIDTH,
          PHOTO_HEIGHT,
          1,
          eff.filterIntensity,
          eff.filterVariant,
          eff.filterParams,
          eff.activeFilters,
          false,
          frame.photoIndex
        );
      }
      canvas.getContext("2d").drawImage(tmp, 0, 0, GIF_THUMB_W, GIF_THUMB_H);
    }
    const palBtn = document.createElement("button");
    palBtn.className = "gif-chip-pal";
    palBtn.title = `Palette: ${pal ? pal.name : "global"} — click to change`;
    if (frame.paletteId) palBtn.classList.add("overridden");
    const swatch = document.createElement("div");
    swatch.className = "palette-swatch gif-chip-swatch";
    pal.colors.forEach((color) => {
      const sp = document.createElement("span");
      sp.style.background = color;
      swatch.appendChild(sp);
    });
    palBtn.appendChild(swatch);
    palBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFramePalettePicker(orderIdx, palBtn);
    });
    const dup = document.createElement("button");
    dup.className = "gif-chip-dup";
    dup.textContent = "+";
    dup.title = "Duplicate frame";
    dup.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateGifFrame(orderIdx);
    });
    const rm = document.createElement("button");
    rm.className = "gif-chip-remove";
    rm.textContent = "×";
    rm.title = "Remove frame";
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      removeGifFrame(orderIdx);
    });
    chip.appendChild(num);
    chip.appendChild(canvas);
    chip.appendChild(palBtn);
    chip.appendChild(dup);
    chip.appendChild(rm);
    dom.gifFrameList.appendChild(chip);
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(orderIdx));
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    chip.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      chip.classList.add("drag-over");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("drag-over"));
    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      chip.classList.remove("drag-over");
      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
      const toIdx = orderIdx;
      if (fromIdx === toIdx) return;
      const [moved] = state.gifFrameOrder.splice(fromIdx, 1);
      state.gifFrameOrder.splice(toIdx, 0, moved);
      updateGifFrameNumbers();
      renderGifFrameStrip();
      updateGifPreview();
    });
  });
}
function removeGifFrame(orderIdx) {
  const frame = state.gifFrameOrder[orderIdx];
  if (!frame) return;
  state.gifFrameOrder.splice(orderIdx, 1);
  if (!state.gifFrameOrder.some((f) => f.photoIndex === frame.photoIndex)) {
    state.gifSelection.delete(frame.photoIndex);
    const slot = dom.photoGrid.querySelector(`[data-index="${frame.photoIndex}"]`);
    if (slot) {
      slot.classList.remove("selected-for-gif");
      slot.removeAttribute("data-gif-frame");
    }
  }
  updateGifCount();
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}
let _framePalettePopover = null;
function openFramePalettePicker(orderIdx, anchorEl) {
  if (_framePalettePopover) {
    _framePalettePopover.remove();
    _framePalettePopover = null;
  }
  const popover = document.createElement("div");
  popover.className = "frame-pal-popover";
  _framePalettePopover = popover;
  const globalOpt = document.createElement("button");
  globalOpt.className = "frame-pal-opt" + (!state.gifFrameOrder[orderIdx]?.paletteId ? " active" : "");
  globalOpt.textContent = "Global palette";
  globalOpt.addEventListener("click", () => {
    state.gifFrameOrder[orderIdx].paletteId = null;
    popover.remove();
    _framePalettePopover = null;
    renderGifFrameStrip();
    updateGifPreview();
  });
  popover.appendChild(globalOpt);
  const sep = document.createElement("div");
  sep.className = "frame-pal-sep";
  popover.appendChild(sep);
  const currentId = state.gifFrameOrder[orderIdx]?.paletteId;
  for (const [id, pal] of Object.entries(PALETTES)) {
    const opt = document.createElement("button");
    opt.className = "frame-pal-opt" + (currentId === id ? " active" : "");
    const sw = document.createElement("div");
    sw.className = "palette-swatch frame-pal-swatch";
    pal.colors.forEach((c) => {
      const s = document.createElement("span");
      s.style.background = c;
      sw.appendChild(s);
    });
    const nm = document.createElement("span");
    nm.textContent = pal.name;
    nm.className = "frame-pal-name";
    opt.appendChild(sw);
    opt.appendChild(nm);
    opt.addEventListener("click", () => {
      state.gifFrameOrder[orderIdx].paletteId = id;
      popover.remove();
      _framePalettePopover = null;
      renderGifFrameStrip();
      updateGifPreview();
    });
    popover.appendChild(opt);
  }
  document.body.appendChild(popover);
  const rect = anchorEl.getBoundingClientRect();
  const ph = popover.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  popover.style.left = `${rect.left}px`;
  popover.style.top = spaceBelow > ph + 8 ? `${rect.bottom + 4}px` : `${rect.top - ph - 4}px`;
  const close = (e) => {
    if (!popover.contains(e.target) && e.target !== anchorEl) {
      popover.remove();
      _framePalettePopover = null;
      document.removeEventListener("mousedown", close);
    }
  };
  setTimeout(() => document.addEventListener("mousedown", close), 0);
}
function setGifLoop(mode) {
  state.gifLoop = mode;
  document.querySelectorAll(".gif-loop-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.loop === mode);
  });
  if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
}
function updateGifFrameNumbers() {
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => {
    el.removeAttribute("data-gif-frame");
  });
  state.gifFrameOrder.forEach((frame, i) => {
    const slot = dom.photoGrid.querySelector(`[data-index="${frame.photoIndex}"]`);
    if (slot) slot.dataset.gifFrame = String(i + 1);
  });
}
function updateGifPreview() {
  if (state.gifPreviewTimer) {
    clearInterval(state.gifPreviewTimer);
    state.gifPreviewTimer = null;
  }
  const baseFrames = state.gifFrameOrder;
  if (!state.gifMode || baseFrames.length === 0) {
    if (dom.gifPreviewWrap) dom.gifPreviewWrap.classList.remove("visible");
    return;
  }
  const frames = state.gifLoop === "bounce" ? bounceSequence(baseFrames) : baseFrames;
  const sharedCanvas = document.getElementById("sidebar-preview-canvas");
  const infoEl = document.getElementById("gif-preview-info");
  const emptyEl = document.getElementById("sidebar-preview-empty");
  if (emptyEl) emptyEl.style.display = "none";
  if (infoEl) infoEl.style.display = "";
  const PREVIEW_SCALE = 2;
  let frameIdx = 0;
  const loopLabel = state.gifLoop === "bounce" ? " · ↔ bounce" : state.gifLoop === "once" ? " · once" : "";
  function showFrame() {
    const n = frameIdx % frames.length;
    const frameObj = frames[n];
    const photo = state.photos[frameObj.photoIndex];
    if (!photo || photo.isEmpty) {
      frameIdx++;
      return;
    }
    const canvas = sharedCanvas;
    canvas.width = PHOTO_WIDTH * PREVIEW_SCALE;
    canvas.height = PHOTO_HEIGHT * PREVIEW_SCALE;
    const frameCtx = canvas.getContext("2d", { willReadFrequently: true });
    const effGif = getEffectiveSettings(frameObj.photoIndex);
    const pal = frameObj.paletteId ? PALETTES[frameObj.paletteId] : effGif.palette;
    renderToCanvas(frameCtx, photo.pixels, pal, PREVIEW_SCALE);
    if (effGif.activeFilters.size > 0) {
      applyActiveEffects(
        frameCtx,
        canvas.width,
        canvas.height,
        PREVIEW_SCALE,
        effGif.filterIntensity,
        effGif.filterVariant,
        effGif.filterParams,
        effGif.activeFilters,
        false,
        frameObj.photoIndex
      );
    }
    applyToneAdjustments(frameCtx, canvas.width, canvas.height, effGif);
    const palLabel = frameObj.paletteId ? ` · ${pal?.name}` : "";
    if (infoEl) {
      infoEl.textContent = `Frame ${n + 1}/${frames.length} · Photo ${frameObj.photoIndex + 1}${palLabel}${loopLabel}`;
    }
    frameIdx++;
  }
  showFrame();
  if (frames.length > 1) {
    state.gifPreviewTimer = setInterval(showFrame, state.gifDelay);
  }
}
function hideGifPreviewInfo() {
  const infoEl = document.getElementById("gif-preview-info");
  if (infoEl) infoEl.style.display = "none";
}
function duplicateGifFrame(orderIdx) {
  const frame = state.gifFrameOrder[orderIdx];
  if (!frame) return;
  state.gifFrameOrder.splice(orderIdx + 1, 0, { ...frame });
  updateGifCount();
  updateGifFrameNumbers();
  renderGifFrameStrip();
  updateGifPreview();
}
function clearGifFrames() {
  if (state.gifFrameOrder.length === 0) return;
  state.gifFrameOrder = [];
  state.gifSelection.clear();
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => {
    el.classList.remove("selected-for-gif");
    el.removeAttribute("data-gif-frame");
  });
  updateGifCount();
  renderGifFrameStrip();
  updateGifPreview();
  showToast("Frames cleared");
}
function updateSidebarPreview() {
  const canvas = document.getElementById("sidebar-preview-canvas");
  const emptyEl = document.getElementById("sidebar-preview-empty");
  const idx = state.selectedIndex;
  const photo = idx !== null ? state.photos[idx] : null;
  if (!canvas || !photo || photo.isEmpty) {
    if (emptyEl) emptyEl.style.display = "block";
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";
  hideGifPreviewInfo();
  const SCALE = 4;
  const eff = getEffectiveSettings(idx);
  const hasBorderPrev = eff.borderEnabled && eff.borderId;
  const W = (hasBorderPrev ? 160 : PHOTO_WIDTH) * SCALE;
  const H = (hasBorderPrev ? 144 : PHOTO_HEIGHT) * SCALE;
  canvas.width = W;
  canvas.height = H;
  const previewWrap = document.getElementById("sidebar-preview-wrap");
  if (previewWrap) previewWrap.style.aspectRatio = hasBorderPrev ? "160/144" : "8/7";
  const tmp = document.createElement("canvas");
  const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
  renderPhotoComplete(tmpCtx, photo, eff, SCALE, idx);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}
function setupPreviewPanel() {
  const previewPinBtn = document.getElementById("preview-pin-btn");
  const previewGroup = document.getElementById("preview-group");
  function applyPreviewPin(pinned) {
    if (!previewGroup) return;
    previewGroup.classList.toggle("preview-pinned", pinned);
    if (previewPinBtn) previewPinBtn.classList.toggle("active", pinned);
  }
  if (previewPinBtn && previewGroup) {
    const storedPin = readString(STORAGE_KEYS.previewPinned);
    const savedPin = storedPin === null ? true : storedPin === "true";
    applyPreviewPin(savedPin);
    previewPinBtn.addEventListener("click", () => {
      const nowPinned = !previewGroup.classList.contains("preview-pinned");
      applyPreviewPin(nowPinned);
      writeString(STORAGE_KEYS.previewPinned, nowPinned);
    });
  }
  const previewWrapEl = document.getElementById("sidebar-preview-wrap");
  const sizeDecBtn = document.getElementById("preview-size-dec");
  const sizeIncBtn = document.getElementById("preview-size-inc");
  const sizeLabelEl = document.getElementById("preview-size-label");
  let previewScale = parseInt(readString(STORAGE_KEYS.previewScale, "2"), 10);
  if (!(previewScale >= 1 && previewScale <= 6)) previewScale = 2;
  function applyPreviewScale(n) {
    previewScale = Math.min(6, Math.max(1, n));
    if (previewWrapEl) previewWrapEl.style.maxWidth = previewScale * 128 + "px";
    if (sizeLabelEl) sizeLabelEl.textContent = previewScale + "×";
    writeString(STORAGE_KEYS.previewScale, previewScale);
  }
  applyPreviewScale(previewScale);
  sizeDecBtn?.addEventListener("click", () => applyPreviewScale(previewScale - 1));
  sizeIncBtn?.addEventListener("click", () => applyPreviewScale(previewScale + 1));
}
let _colorPickerPanel = null;
function openColorPicker(anchorEl, initialHex, onChange) {
  if (_colorPickerPanel) {
    _colorPickerPanel.remove();
    _colorPickerPanel = null;
  }
  let [h, s, l] = hexToHsl(initialHex || "#888888");
  const panel = document.createElement("div");
  panel.className = "color-picker-panel";
  _colorPickerPanel = panel;
  const preview = document.createElement("div");
  preview.className = "cp-preview";
  preview.style.background = initialHex;
  panel.appendChild(preview);
  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "cp-hex-input";
  hexInput.value = initialHex.toUpperCase();
  hexInput.maxLength = 7;
  function update() {
    const hex = hslToHex(h, s, l);
    preview.style.background = hex;
    hexInput.value = hex.toUpperCase();
    onChange(hex);
  }
  function makeRow(labelTxt, val, min, max, onSliderChange) {
    const row = document.createElement("div");
    row.className = "cp-slider-row";
    const lbl = document.createElement("span");
    lbl.className = "cp-slider-label";
    lbl.textContent = labelTxt;
    const sl = document.createElement("input");
    sl.type = "range";
    sl.min = min;
    sl.max = max;
    sl.step = 1;
    sl.value = val;
    const valEl = document.createElement("span");
    valEl.className = "cp-slider-val";
    valEl.textContent = Math.round(val);
    sl.addEventListener("input", () => {
      valEl.textContent = sl.value;
      onSliderChange(parseFloat(sl.value));
    });
    row.appendChild(lbl);
    row.appendChild(sl);
    row.appendChild(valEl);
    return row;
  }
  panel.appendChild(
    makeRow("H", h, 0, 360, (v) => {
      h = v;
      update();
    })
  );
  panel.appendChild(
    makeRow("S", s, 0, 100, (v) => {
      s = v;
      update();
    })
  );
  panel.appendChild(
    makeRow("L", l, 0, 100, (v) => {
      l = v;
      update();
    })
  );
  hexInput.addEventListener("change", () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      [h, s, l] = hexToHsl(v);
      update();
    }
  });
  panel.appendChild(hexInput);
  document.body.appendChild(panel);
  const rect = anchorEl.getBoundingClientRect();
  panel.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
  panel.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 250)}px`;
  setTimeout(() => {
    function closeHandler(e) {
      if (!panel.contains(e.target) && e.target !== anchorEl) {
        panel.remove();
        if (_colorPickerPanel === panel) _colorPickerPanel = null;
        document.removeEventListener("mousedown", closeHandler);
      }
    }
    document.addEventListener("mousedown", closeHandler);
  }, 0);
}
function attachColorPickerToInput(input, swatchClass = "color-swatch-btn") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = swatchClass;
  btn.style.background = input.value;
  input.parentNode.insertBefore(btn, input);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openColorPicker(btn, input.value, (hex) => {
      btn.style.background = hex;
      input.value = hex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  Object.defineProperty(input, "_cpBtn", { value: btn, writable: true });
  return btn;
}
function syncColorSwatchBtn(input, hex) {
  if (input._cpBtn) input._cpBtn.style.background = hex;
}
function loadCustomPalettes() {
  return readJson(STORAGE_KEYS.customPalettes, []);
}
function saveCustomPalettesToStorage(palettes) {
  writeJson(STORAGE_KEYS.customPalettes, palettes);
}
function refreshCustomPalettes() {
  for (const key of Object.keys(PALETTES)) {
    if (PALETTES[key].custom) delete PALETTES[key];
  }
  for (const pal of loadCustomPalettes()) {
    PALETTES[pal.id] = { ...pal, custom: true };
  }
}
const MAX_RECENT_PALETTES = 6;
function loadRecentPalettes() {
  return readJson(STORAGE_KEYS.recentPalettes, []);
}
function saveRecentPalettes(ids) {
  writeJson(STORAGE_KEYS.recentPalettes, ids);
}
function addRecentPalette(id) {
  let recents = loadRecentPalettes().filter((r) => r !== id);
  recents.unshift(id);
  recents = recents.slice(0, MAX_RECENT_PALETTES);
  saveRecentPalettes(recents);
}
const PAL_GROUP_ORDER = [
  "hardware",
  "gbc",
  "gbc_game",
  "gbc_unused",
  "sgb",
  "sgb2",
  "community",
  "gallery",
  "helllord",
  "trashuncle",
  "wolfbunny",
  "bgb",
  "sameboy",
  "artistic"
];
const PAL_GROUP_LABELS = {
  hardware: "GB Hardware",
  gbc: "GBC Official",
  gbc_game: "GBC Game Palettes",
  gbc_unused: "GBC Unused",
  sgb: "Super Game Boy",
  sgb2: "SGB Vaporwave",
  community: "Community (Lospec)",
  gallery: "Community Gallery",
  helllord: "R.A.Helllord",
  trashuncle: "Trashuncle",
  wolfbunny: "TheWolfBunny64",
  bgb: "BGB Emulator",
  sameboy: "SameBoy Emulator",
  artistic: "Artistic"
};
function getExportDimensions() {
  if (state.exportScale === "custom") {
    const w = parseInt(document.getElementById("custom-width")?.value) || 512;
    const h = Math.round(w * (PHOTO_HEIGHT / PHOTO_WIDTH));
    return { width: w, height: h };
  }
  return {
    width: PHOTO_WIDTH * state.exportScale,
    height: PHOTO_HEIGHT * state.exportScale
  };
}
function setExportScale(scale) {
  state.exportScale = scale;
  const isCustom = scale === "custom";
  document.querySelectorAll(".scale-btn").forEach((btn) => {
    const val = btn.dataset.scale === "custom" ? "custom" : parseInt(btn.dataset.scale);
    btn.classList.toggle("active", val === scale);
  });
  const wrap = document.getElementById("custom-size-wrap");
  if (wrap) wrap.style.display = isCustom ? "block" : "none";
  if (isCustom) {
    updateCustomSizeDisplay();
  }
}
function updateCustomSizeDisplay() {
  const input = document.getElementById("custom-width");
  const display = document.getElementById("custom-size-display");
  if (!input || !display) return;
  const w = parseInt(input.value) || 512;
  const h = Math.round(w * (PHOTO_HEIGHT / PHOTO_WIDTH));
  display.textContent = `${w}×${h}`;
}
function setExportFormat(fmt) {
  state.exportFormat = fmt;
  document.querySelectorAll(".fmt-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.fmt === fmt);
  });
  if (fmt === "gif") {
    enterGifMode();
  } else {
    exitGifMode();
  }
}
function setupFavCarouselResponsive() {
  const container = document.getElementById("fav-palettes");
  const btnMenu = document.getElementById("btn-fav-menu");
  if (!container || !btnMenu) return;
  const FAV_CHIP_PX = 55;
  const NAV_ARROW_PX = 46;
  let _lastCount = -1;
  let _rafId = null;
  function update() {
    _rafId = null;
    const favs = loadFavPalettes().filter((id) => PALETTES[id]);
    const total = favs.length;
    const menuWasVisible = btnMenu.style.display !== "none";
    btnMenu.style.display = "none";
    const available = container.clientWidth;
    if (menuWasVisible) btnMenu.style.display = "";
    let count = Math.floor(available / FAV_CHIP_PX);
    if (total > count && count > 0) {
      count = Math.max(0, Math.floor((available - NAV_ARROW_PX) / FAV_CHIP_PX));
    }
    count = Math.min(count, FAV_PAGE_SIZE);
    const showMenu = count === 0 && total > 0;
    btnMenu.style.display = showMenu ? "inline-flex" : "none";
    if (count !== _lastCount) {
      _lastCount = count;
      _favVisibleCount = Math.max(0, count);
      renderFavPalettes();
    }
  }
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (_rafId) return;
      _rafId = requestAnimationFrame(update);
    }).observe(container);
  }
  requestAnimationFrame(update);
}
const MAX_FAV_PALETTES = 64;
const FAV_PAGE_SIZE = 16;
let favOffset = 0;
let _favVisibleCount = 16;
function loadFavPalettes() {
  return readJson(STORAGE_KEYS.favPalettes, []);
}
function saveFavPalettes(ids) {
  writeJson(STORAGE_KEYS.favPalettes, ids);
}
function isFavPalette(id) {
  return loadFavPalettes().includes(id);
}
function shiftFavOffset(delta) {
  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  if (favs.length <= _favVisibleCount) return;
  favOffset = ((favOffset + delta) % favs.length + favs.length) % favs.length;
  renderFavPalettes();
}
function toggleFavPalette(id) {
  let favs = loadFavPalettes();
  if (favs.includes(id)) {
    favs = favs.filter((f) => f !== id);
    const newLen = favs.filter((f) => PALETTES[f]).length;
    if (newLen <= _favVisibleCount) favOffset = 0;
    else favOffset = Math.min(favOffset, newLen - 1);
  } else {
    if (favs.length >= MAX_FAV_PALETTES) {
      showToast(`Favourites full (${MAX_FAV_PALETTES} max) — remove one first ★`);
      return;
    }
    favs.push(id);
  }
  saveFavPalettes(favs);
  renderFavPalettes();
  document.querySelectorAll(`.pal-item-star[data-palette="${id}"]`).forEach((btn) => {
    btn.classList.toggle("starred", isFavPalette(id));
    btn.title = isFavPalette(id) ? "Remove from favourites" : "Add to favourites";
  });
  document.querySelectorAll(`.pgrid-star[data-palette="${id}"]`).forEach((btn) => {
    btn.classList.toggle("starred", isFavPalette(id));
  });
}
function renderFavPalettes() {
  const container = document.getElementById("fav-palettes");
  if (!container) return;
  container.innerHTML = "";
  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  const total = favs.length;
  const visible = Math.min(_favVisibleCount, FAV_PAGE_SIZE);
  const hasWheel = total > visible && visible > 0;
  if (hasWheel) {
    const left = document.createElement("button");
    left.className = "fav-nav-btn";
    left.title = "Previous favourites (-)";
    left.textContent = "‹";
    left.addEventListener("click", () => shiftFavOffset(-1));
    container.appendChild(left);
  }
  const count = Math.min(visible, total);
  for (let i = 0; i < count; i++) {
    const id = favs[(favOffset + i) % total];
    const pal = PALETTES[id];
    const btn = document.createElement("button");
    btn.className = "fav-pal-btn" + (getDisplayPaletteId() === id ? " active" : "");
    btn.title = pal.name;
    const swatch = document.createElement("div");
    swatch.className = "fav-pal-swatch";
    for (const color of pal.colors) {
      const span = document.createElement("span");
      span.style.background = color;
      swatch.appendChild(span);
    }
    btn.appendChild(swatch);
    btn.addEventListener("click", () => {
      setPalette(id);
      renderFavPalettes();
    });
    container.appendChild(btn);
  }
  if (hasWheel) {
    const right = document.createElement("button");
    right.className = "fav-nav-btn";
    right.title = "Next favourites (+)";
    right.textContent = "›";
    right.addEventListener("click", () => shiftFavOffset(1));
    container.appendChild(right);
  }
  renderFavDropdown();
}
function renderFavDropdown() {
  const dd = document.getElementById("fav-dropdown");
  if (!dd) return;
  const favs = loadFavPalettes().filter((id) => PALETTES[id]);
  dd.innerHTML = "";
  if (favs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "overflow-item";
    empty.style.cssText = "opacity:0.45;cursor:default;pointer-events:none;";
    empty.textContent = "No favourites yet";
    dd.appendChild(empty);
    return;
  }
  for (const id of favs) {
    const pal = PALETTES[id];
    const item = document.createElement("button");
    item.className = "overflow-item";
    const swatch = document.createElement("span");
    swatch.className = "overflow-pal-swatch";
    for (const color of pal.colors) {
      const sq = document.createElement("span");
      sq.style.background = color;
      swatch.appendChild(sq);
    }
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(pal.name));
    item.addEventListener("click", () => {
      dd.classList.add("hidden");
      setPalette(id);
    });
    dd.appendChild(item);
  }
}
function readRgbQuad(u8, offset = 0) {
  const colors = [];
  for (let i = 0; i < 4; i++) {
    const o = offset + i * 3;
    colors.push(rgbToHex([u8[o], u8[o + 1], u8[o + 2]]));
  }
  return colors;
}
function writeRgbQuad(buf, offset, colors) {
  colors.forEach((hex, i) => buf.set(hexToRgb(hex), offset + i * 3));
}
function parseGbpFile(buffer) {
  if (buffer.byteLength < 12) return null;
  return readRgbQuad(new Uint8Array(buffer));
}
function parsePalFile(buffer) {
  if (buffer.byteLength < 12) return null;
  return readRgbQuad(new Uint8Array(buffer)).reverse();
}
function encodeGbpFile(colors) {
  const buf = new Uint8Array(16);
  writeRgbQuad(buf, 0, colors);
  return buf;
}
function encodePalFile(colors) {
  const buf = new Uint8Array(56);
  const rev = [...colors].reverse();
  writeRgbQuad(buf, 0, rev);
  writeRgbQuad(buf, 12, rev);
  writeRgbQuad(buf, 24, rev);
  writeRgbQuad(buf, 36, rev);
  buf.set(hexToRgb(colors[0]), 48);
  buf[51] = 129;
  buf.set([65, 80, 71, 66], 52);
  return buf;
}
async function batchImportPaletteFiles(files) {
  const customs = loadCustomPalettes();
  let added = 0, skipped = 0;
  for (const file of files) {
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext === "json") {
      try {
        const text = await file.text();
        const incoming = JSON.parse(text);
        if (!Array.isArray(incoming)) continue;
        for (const p of incoming) {
          if (typeof p.name !== "string") continue;
          if (!Array.isArray(p.colors) || p.colors.length !== 4) continue;
          if (!p.colors.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) continue;
          customs.push({
            id: "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2),
            name: p.name,
            colors: p.colors,
            custom: true
          });
          added++;
        }
      } catch (_) {
        skipped++;
      }
    } else if (ext === "pal" || ext === "gbp") {
      try {
        const buf = await file.arrayBuffer();
        const colors = ext === "gbp" ? parseGbpFile(buf) : parsePalFile(buf);
        if (!colors || colors.length < 4) {
          skipped++;
          continue;
        }
        const name = file.name.replace(/\.(pal|gbp)$/i, "");
        customs.push({
          id: "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2),
          name,
          colors: sortByBrightness(colors),
          custom: true
        });
        added++;
      } catch (_) {
        skipped++;
      }
    }
  }
  if (added === 0) {
    showToast("No valid palettes found");
    return;
  }
  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  rebuildPalettePickerList();
  showToast(
    `Imported ${added} palette${added !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped)` : ""}`
  );
}
function exportPalettesJson() {
  const customs = loadCustomPalettes();
  if (customs.length === 0) {
    showToast("No custom palettes to export");
    return;
  }
  const json = JSON.stringify(
    customs.map(({ id, name, colors }) => ({ id, name, colors })),
    null,
    2
  );
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gbcam-palettes.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${customs.length} palette${customs.length !== 1 ? "s" : ""}`);
}
function importPalettesJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const incoming = JSON.parse(e.target.result);
      if (!Array.isArray(incoming)) throw new Error("Expected an array");
      const validated = incoming.filter(
        (p) => typeof p.name === "string" && Array.isArray(p.colors) && p.colors.length === 4 && p.colors.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))
      ).map((p) => ({
        id: "custom_" + Date.now() + "_" + Math.random().toString(36).slice(2),
        name: p.name,
        colors: p.colors,
        custom: true
      }));
      if (validated.length === 0) {
        showToast("No valid palettes found in file");
        return;
      }
      const existing = loadCustomPalettes();
      saveCustomPalettesToStorage([...existing, ...validated]);
      refreshCustomPalettes();
      rebuildPalettePickerList();
      showToast(`Imported ${validated.length} palette${validated.length !== 1 ? "s" : ""}`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}
let editingPaletteId = null;
const SHADE_LABELS = ["Lightest (0)", "Light (1)", "Dark (2)", "Darkest (3)"];
function applyColorsToEditor(colors) {
  const rows = document.querySelectorAll("#palette-color-pickers .pal-editor-row");
  colors.forEach((hex, i) => {
    if (!rows[i]) return;
    const picker = rows[i].querySelector("input[type=color]");
    const hexIn = rows[i].querySelector("input[type=text]");
    const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
    if (picker) picker.value = safe.toLowerCase();
    if (hexIn) hexIn.value = safe.toUpperCase();
  });
  updatePalettePreview();
}
function openPaletteEditor(existingPalette = null) {
  editingPaletteId = existingPalette ? existingPalette.id : null;
  document.getElementById("palette-modal-title").textContent = existingPalette ? `Edit: ${existingPalette.name}` : "New Palette";
  const lospecStatus = document.getElementById("lospec-status");
  if (lospecStatus) lospecStatus.textContent = "";
  const lospecUrl = document.getElementById("palette-lospec-url");
  if (lospecUrl) lospecUrl.value = "";
  document.getElementById("palette-name-input").value = existingPalette ? existingPalette.name : "";
  const container = document.getElementById("palette-color-pickers");
  container.innerHTML = "";
  const colors = existingPalette ? existingPalette.colors : ["#FFFFFF", "#AAAAAA", "#555555", "#000000"];
  colors.forEach((color, i) => {
    const row = document.createElement("div");
    row.className = "pal-editor-row";
    row.style.cssText = "display:flex; align-items:center; gap:10px;";
    const label = document.createElement("span");
    label.style.cssText = "font-size:11px; color:var(--text-2); width:82px; flex-shrink:0;";
    label.textContent = SHADE_LABELS[i];
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = color.toLowerCase();
    picker.dataset.shade = i;
    picker.style.display = "none";
    const swatchBtn = document.createElement("button");
    swatchBtn.type = "button";
    swatchBtn.className = "pal-color-swatch-btn";
    swatchBtn.style.background = color.toLowerCase();
    swatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openColorPicker(swatchBtn, picker.value, (hex) => {
        picker.value = hex;
        swatchBtn.style.background = hex;
        hexInput.value = hex.toUpperCase();
        updatePalettePreview();
      });
    });
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.value = color.toUpperCase();
    hexInput.maxLength = 7;
    hexInput.placeholder = "#RRGGBB";
    hexInput.style.cssText = "width:80px; padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:12px; font-family:var(--font-mono); outline:none; -webkit-user-select:text; user-select:text;";
    hexInput.addEventListener("input", () => {
      const v = hexInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v.toLowerCase();
        swatchBtn.style.background = v.toLowerCase();
        updatePalettePreview();
      }
    });
    row.appendChild(label);
    row.appendChild(picker);
    row.appendChild(swatchBtn);
    row.appendChild(hexInput);
    container.appendChild(row);
  });
  const deleteBtn = document.getElementById("palette-modal-delete");
  deleteBtn.style.display = existingPalette && existingPalette.custom ? "inline-flex" : "none";
  document.getElementById("palette-modal").classList.remove("hidden");
  updatePalettePreview();
  document.getElementById("palette-name-input").focus();
}
function closePaletteEditor() {
  document.getElementById("palette-modal").classList.add("hidden");
  editingPaletteId = null;
}
function getCurrentEditorColors() {
  return Array.from(document.querySelectorAll("#palette-color-pickers input[type=color]")).map(
    (p) => p.value
  );
}
function updatePalettePreview() {
  const canvas = document.getElementById("palette-preview-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const colors = getCurrentEditorColors();
  const previewPalette = { colors };
  const idx = state.selectedIndex !== null ? state.selectedIndex : state.photos.findIndex((p) => !p.isEmpty);
  if (idx >= 0 && state.photos[idx] && !state.photos[idx].isEmpty) {
    renderToCanvas(ctx, state.photos[idx].pixels, previewPalette, 2);
  } else {
    ctx.fillStyle = colors[0] || "#FFFFFF";
    ctx.fillRect(0, 0, 256, 224);
  }
}
function downloadBinary(uint8, filename) {
  const blob = new Blob([uint8], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2e3);
}
function safeFilename(name) {
  return (name || "palette").replace(/[^a-z0-9_\-. ]/gi, "_").trim() || "palette";
}
function exportEditorAsPal() {
  const colors = getCurrentEditorColors();
  const name = safeFilename(document.getElementById("palette-name-input")?.value);
  downloadBinary(encodePalFile(colors), `${name}.pal`);
}
function exportEditorAsGbp() {
  const colors = getCurrentEditorColors();
  const name = safeFilename(document.getElementById("palette-name-input")?.value);
  downloadBinary(encodeGbpFile(colors), `${name}.gbp`);
}
function handlePalFileImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const ext = file.name.toLowerCase().split(".").pop();
    let colors;
    if (ext === "gbp") {
      colors = parseGbpFile(e.target.result);
    } else if (ext === "pal") {
      colors = parsePalFile(e.target.result);
    }
    if (!colors || colors.length < 4) {
      showToast("Could not parse palette file");
      return;
    }
    const nameInput = document.getElementById("palette-name-input");
    if (nameInput && !nameInput.value.trim()) {
      nameInput.value = file.name.replace(/\.(pal|gbp)$/i, "");
    }
    applyColorsToEditor(sortByBrightness(colors));
    const statusEl = document.getElementById("lospec-status");
    if (statusEl) {
      statusEl.textContent = `Loaded: ${file.name}`;
      statusEl.style.color = "var(--accent)";
    }
  };
  reader.readAsArrayBuffer(file);
}
async function importFromText(text) {
  const raw = text.trim();
  if (!raw) return;
  const statusEl = document.getElementById("lospec-status");
  function setStatus2(msg, color = "var(--text-3)") {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color;
    }
  }
  const hexMatches = [...raw.matchAll(/(?:#|%23)?([0-9a-fA-F]{6})(?:[^0-9a-fA-F]|$)/g)].map((m) => "#" + m[1]).filter((c, i, a) => a.indexOf(c) === i);
  if (hexMatches.length >= 2 && !raw.toLowerCase().includes("lospec.com")) {
    const colors = sortByBrightness(hexMatches.slice(0, 4));
    applyColorsToEditor(colors);
    const src = raw.includes("coolors.co") ? "coolors.co" : raw.includes("http") ? new URL(raw).hostname : "hex values";
    setStatus2(`${colors.length} colors imported from ${src}`, "var(--accent)");
    return;
  }
  let slug = raw;
  const lospecMatch = raw.match(/lospec\.com\/palette-list\/([^/?#\s]+)/i);
  if (lospecMatch) slug = lospecMatch[1];
  slug = slug.replace(/\/+$/, "").replace(/\.json$/, "");
  setStatus2("Fetching from Lospec…", "var(--text-3)");
  try {
    if (!api.fetchJson) throw new Error("fetchJson not available");
    const data = await api.fetchJson(`https://lospec.com/palette-list/${slug}.json`);
    if (!Array.isArray(data.colors) || data.colors.length < 4) {
      setStatus2(`Need 4 colors — palette only has ${data.colors?.length ?? 0}`, "var(--yellow)");
      return;
    }
    const colors = sortByBrightness(
      data.colors.slice(0, 4).map((c) => c.startsWith("#") ? c : "#" + c)
    );
    const nameInput = document.getElementById("palette-name-input");
    if (nameInput && !nameInput.value.trim() && data.name) nameInput.value = data.name;
    applyColorsToEditor(colors);
    setStatus2(
      `"${data.name}" imported${data.colors.length > 4 ? ` (first 4 of ${data.colors.length})` : ""}`,
      "var(--accent)"
    );
  } catch (e) {
    setStatus2(`Failed: ${e.message}`, "#ff453a");
  }
}
function savePaletteEditor() {
  const name = document.getElementById("palette-name-input").value.trim() || "Custom";
  const colors = getCurrentEditorColors();
  const customs = loadCustomPalettes();
  if (editingPaletteId) {
    const i = customs.findIndex((p) => p.id === editingPaletteId);
    if (i >= 0) {
      customs[i] = { id: editingPaletteId, name, colors, custom: true };
    }
  } else {
    const id = "custom_" + Date.now();
    customs.push({ id, name, colors, custom: true });
    editingPaletteId = id;
  }
  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  const savedId = editingPaletteId;
  closePaletteEditor();
  rebuildPalettePickerList();
  setPalette(savedId);
  showToast(`Palette "${name}" saved`);
}
function deletePaletteFromEditor() {
  if (!editingPaletteId) return;
  const customs = loadCustomPalettes().filter((p) => p.id !== editingPaletteId);
  saveCustomPalettesToStorage(customs);
  refreshCustomPalettes();
  closePaletteEditor();
  rebuildPalettePickerList();
  if (state.palette.id === editingPaletteId) setPalette("dmg");
  showToast("Palette deleted");
}
function setupPaletteEditor() {
  document.getElementById("btn-new-palette").addEventListener("click", () => {
    closePalettePicker();
    openPaletteEditor();
  });
  document.getElementById("palette-modal-close").addEventListener("click", closePaletteEditor);
  document.getElementById("palette-modal-cancel").addEventListener("click", closePaletteEditor);
  document.getElementById("palette-modal-save").addEventListener("click", savePaletteEditor);
  document.getElementById("palette-modal-delete").addEventListener("click", deletePaletteFromEditor);
  const lospecBtn = document.getElementById("btn-lospec-import");
  const lospecInput = document.getElementById("palette-lospec-url");
  if (lospecBtn && lospecInput) {
    lospecBtn.addEventListener("click", () => importFromText(lospecInput.value));
    lospecInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") importFromText(lospecInput.value);
    });
  }
  const palFileInput = document.getElementById("palette-pal-input");
  const loadPalBtn = document.getElementById("btn-load-pal-file");
  if (loadPalBtn && palFileInput) {
    loadPalBtn.addEventListener("click", () => palFileInput.click());
    palFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handlePalFileImport(file);
      e.target.value = "";
    });
  }
  document.getElementById("palette-modal-export-pal")?.addEventListener("click", exportEditorAsPal);
  document.getElementById("palette-modal-export-gbp")?.addEventListener("click", exportEditorAsGbp);
  document.getElementById("btn-export-palettes").addEventListener("click", exportPalettesJson);
  document.getElementById("btn-import-palettes").addEventListener("click", () => {
    document.getElementById("palette-import-input").click();
  });
  document.getElementById("palette-import-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    const allJson = files.every((f) => f.name.toLowerCase().endsWith(".json"));
    if (allJson && files.length === 1) {
      importPalettesJson(files[0]);
    } else {
      await batchImportPaletteFiles(files);
    }
    e.target.value = "";
  });
  document.getElementById("palette-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("palette-modal")) closePaletteEditor();
  });
}
function openPaletteGrid() {
  const modal = document.getElementById("palette-grid-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const searchEl = document.getElementById("palette-grid-search");
  if (searchEl) {
    searchEl.value = "";
    searchEl.oninput = () => filterPaletteGrid(searchEl.value);
  }
  const sizeSlider = document.getElementById("palette-grid-size");
  if (sizeSlider) {
    const savedSize = readString(STORAGE_KEYS.paletteGridSize);
    if (savedSize) sizeSlider.value = savedSize;
    updatePaletteGridSize(parseInt(sizeSlider.value));
    sizeSlider.oninput = () => {
      updatePaletteGridSize(parseInt(sizeSlider.value));
      writeString(STORAGE_KEYS.paletteGridSize, sizeSlider.value);
    };
  }
  buildPaletteGrid();
}
function updatePaletteGridSize(px) {
  const list = document.getElementById("palette-grid-list");
  if (list) list.style.gridTemplateColumns = `repeat(auto-fill, minmax(min(${px}px, 48%), 1fr))`;
}
function closePaletteGrid() {
  const modal = document.getElementById("palette-grid-modal");
  if (modal) modal.classList.add("hidden");
}
function getCollapsedPgridGroups() {
  return new Set(readJson(STORAGE_KEYS.paletteGridCollapsed, []));
}
function setPgridGroupCollapsed(group, collapsed) {
  const set = getCollapsedPgridGroups();
  if (collapsed) set.add(group);
  else set.delete(group);
  writeJson(STORAGE_KEYS.paletteGridCollapsed, [...set]);
}
async function buildPaletteGrid() {
  const list = document.getElementById("palette-grid-list");
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-3);font-size:12px;padding:8px;">Rendering…</p>';
  const photoIdx = state.selectedIndex !== null ? state.selectedIndex : state.photos.findIndex((p) => !p.isEmpty);
  const photo = photoIdx >= 0 && !state.photos[photoIdx]?.isEmpty ? state.photos[photoIdx] : null;
  await new Promise((r) => requestAnimationFrame(r));
  list.innerHTML = "";
  const renderQueue = [];
  const collapsedGroups = getCollapsedPgridGroups();
  function makePaletteCell(id, pal, groupKey) {
    const cell = document.createElement("div");
    cell.className = "pgrid-cell" + (state.palette.id === id ? " active" : "");
    cell.dataset.paletteId = id;
    cell.dataset.group = groupKey;
    if (collapsedGroups.has(groupKey)) cell.style.display = "none";
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;
    const namEl = document.createElement("div");
    namEl.className = "pgrid-name";
    namEl.textContent = pal.name;
    const swatchRow = document.createElement("div");
    swatchRow.className = "pgrid-swatches";
    for (const color of pal.colors) {
      const block = document.createElement("span");
      block.style.background = color;
      swatchRow.appendChild(block);
    }
    const gridStar = document.createElement("button");
    gridStar.className = "pgrid-star" + (isFavPalette(id) ? " starred" : "");
    gridStar.dataset.palette = id;
    gridStar.textContent = "★";
    gridStar.title = isFavPalette(id) ? "Remove from favourites" : "Add to favourites";
    gridStar.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavPalette(id);
      gridStar.classList.toggle("starred", isFavPalette(id));
    });
    cell.appendChild(canvas);
    cell.appendChild(namEl);
    cell.appendChild(swatchRow);
    cell.appendChild(gridStar);
    cell.addEventListener("click", () => {
      setPalette(id);
      closePaletteGrid();
    });
    renderQueue.push({ canvas, pal, photo });
    return cell;
  }
  function addGridSectionHeader(text, groupKey) {
    const h = document.createElement("div");
    h.className = "pgrid-section-header";
    h.dataset.group = groupKey;
    if (collapsedGroups.has(groupKey)) h.classList.add("collapsed");
    const chevron = document.createElement("span");
    chevron.className = "pgrid-chevron";
    chevron.textContent = "▾";
    const label = document.createElement("span");
    label.textContent = text;
    h.appendChild(chevron);
    h.appendChild(label);
    h.addEventListener("click", () => {
      const nowCollapsed = !h.classList.contains("collapsed");
      h.classList.toggle("collapsed", nowCollapsed);
      if (nowCollapsed) collapsedGroups.add(groupKey);
      else collapsedGroups.delete(groupKey);
      setPgridGroupCollapsed(groupKey, nowCollapsed);
      list.querySelectorAll(`.pgrid-cell[data-group="${groupKey}"]`).forEach((cell) => {
        cell.style.display = nowCollapsed ? "none" : "";
      });
    });
    list.appendChild(h);
  }
  const grouped = {};
  for (const [id, pal] of Object.entries(PALETTES)) {
    if (pal.custom) continue;
    const g = pal.group || "other";
    (grouped[g] = grouped[g] || []).push([id, pal]);
  }
  const orderedGroups = [
    ...PAL_GROUP_ORDER,
    ...Object.keys(grouped).filter((g) => !PAL_GROUP_ORDER.includes(g))
  ];
  for (const g of orderedGroups) {
    if (!grouped[g] || grouped[g].length === 0) continue;
    addGridSectionHeader(PAL_GROUP_LABELS[g] || g, g);
    for (const [id, pal] of grouped[g]) list.appendChild(makePaletteCell(id, pal, g));
  }
  const customs = Object.entries(PALETTES).filter(([, p]) => p.custom);
  if (customs.length > 0) {
    addGridSectionHeader("Custom", "custom");
    for (const [id, pal] of customs) list.appendChild(makePaletteCell(id, pal, "custom"));
  }
  const activeCell = list.querySelector(".pgrid-cell.active");
  if (activeCell) activeCell.scrollIntoView({ block: "center", behavior: "instant" });
  const BATCH = 30;
  for (let i = 0; i < renderQueue.length; i += BATCH) {
    await new Promise((r) => requestAnimationFrame(r));
    const batch = renderQueue.slice(i, i + BATCH);
    for (const { canvas, pal, photo: ph } of batch) {
      const ctx = canvas.getContext("2d");
      if (ph) {
        renderToCanvas(ctx, ph.pixels, pal, 1);
      } else {
        ctx.fillStyle = pal.colors[0] || "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }
}
function filterPaletteGrid(query) {
  const q = query.toLowerCase().trim();
  const list = document.getElementById("palette-grid-list");
  if (!list) return;
  const collapsed = getCollapsedPgridGroups();
  list.querySelectorAll(".pgrid-cell").forEach((cell) => {
    const name = (cell.querySelector(".pgrid-name")?.textContent || "").toLowerCase();
    const matches = !q || name.includes(q);
    const hidden = q ? !matches : !matches || collapsed.has(cell.dataset.group);
    cell.style.display = hidden ? "none" : "";
  });
  list.querySelectorAll(".pgrid-section-header").forEach((header) => {
    if (!q) {
      header.style.display = "";
      return;
    }
    let next = header.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains("pgrid-section-header")) {
      if (next.classList.contains("pgrid-cell") && next.style.display !== "none") {
        anyVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    header.style.display = anyVisible ? "" : "none";
  });
}
function setPalette(id) {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    targets.forEach((i) => {
      if (!state.photoSettings[i]) state.photoSettings[i] = {};
      state.photoSettings[i].paletteId = id;
    });
  } else {
    state.palette = PALETTES[id];
  }
  addRecentPalette(id);
  const displayId = getDisplayPaletteId();
  updatePalettePickerBtn(PALETTES[displayId] || state.palette);
  renderFavPalettes();
  document.querySelectorAll(".pal-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.palette === displayId);
    if (item.dataset.palette === displayId) {
      item.querySelector(".pal-item-name").style.color = "";
    }
  });
  repaintGrid();
  if (state.viewMode === "solo" && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}
function updatePalettePickerBtn(pal) {
  pal = pal || state.palette;
  const swatch = document.getElementById("palette-picker-swatch");
  const nameEl = document.getElementById("palette-picker-name");
  function fillSwatch(el) {
    el.innerHTML = "";
    for (const color of pal.colors) {
      const span = document.createElement("span");
      span.style.background = color;
      el.appendChild(span);
    }
  }
  if (swatch) fillSwatch(swatch);
  if (nameEl) nameEl.textContent = pal.name;
}
function buildPaletteBar() {
  buildPalettePickerUI();
  renderFavPalettes();
  buildBrowseButtonIcon();
}
function buildPalettePickerUI() {
  updatePalettePickerBtn();
  rebuildPalettePickerList();
  const btn = document.getElementById("palette-picker-btn");
  const dropdown = document.getElementById("palette-picker-dropdown");
  const search = document.getElementById("palette-picker-search");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains("hidden");
      if (isOpen) {
        closePalettePicker();
      } else {
        dropdown.classList.remove("hidden");
        btn.classList.add("open");
        updateCurrentPalettePin();
        if (search) {
          search.value = "";
          filterPaletteList("");
          search.focus();
        }
      }
    });
  }
  if (search) {
    search.addEventListener("input", () => filterPaletteList(search.value));
    search.addEventListener("click", (e) => e.stopPropagation());
  }
  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("palette-picker-wrap");
    if (wrap && !wrap.contains(e.target)) closePalettePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.viewMode === "solo") {
        enterGridMode();
        return;
      }
      if (state.gifMode) {
        setExportFormat("png");
        document.querySelectorAll(".fmt-btn").forEach((btn2) => {
          btn2.classList.toggle("active", btn2.dataset.fmt === "png");
        });
      }
      closePalettePicker();
      closePaletteGrid();
    }
  });
}
function closePalettePicker() {
  const dropdown = document.getElementById("palette-picker-dropdown");
  const btn = document.getElementById("palette-picker-btn");
  if (dropdown) dropdown.classList.add("hidden");
  if (btn) btn.classList.remove("open");
}
function rebuildPalettePickerList() {
  const list = document.getElementById("palette-picker-list");
  if (!list) return;
  list.innerHTML = "";
  refreshCustomPalettes();
  const grouped = {};
  for (const [id, pal] of Object.entries(PALETTES)) {
    if (pal.custom) continue;
    const g = pal.group || "other";
    (grouped[g] = grouped[g] || []).push([id, pal]);
  }
  const orderedGroups = [
    ...PAL_GROUP_ORDER,
    ...Object.keys(grouped).filter((g) => !PAL_GROUP_ORDER.includes(g))
  ];
  for (const g of orderedGroups) {
    if (!grouped[g] || grouped[g].length === 0) continue;
    const header = document.createElement("div");
    header.className = "pal-section-header";
    header.textContent = PAL_GROUP_LABELS[g] || g;
    list.appendChild(header);
    for (const [id, pal] of grouped[g]) {
      list.appendChild(makePalItem(id, pal));
    }
  }
  const customs = Object.entries(PALETTES).filter(([, p]) => p.custom);
  if (customs.length > 0) {
    const customHeader = document.createElement("div");
    customHeader.className = "pal-section-header";
    customHeader.textContent = "Custom";
    list.appendChild(customHeader);
    for (const [id, pal] of customs) {
      list.appendChild(makePalItem(id, pal));
    }
  }
}
function makePalItem(id, pal) {
  const item = document.createElement("div");
  item.className = "pal-item" + (state.palette.id === id ? " active" : "");
  item.dataset.palette = id;
  const swatch = document.createElement("div");
  swatch.className = "palette-swatch";
  for (const color of pal.colors) {
    const span = document.createElement("span");
    span.style.background = color;
    swatch.appendChild(span);
  }
  const name = document.createElement("span");
  name.className = "pal-item-name";
  name.textContent = pal.name;
  item.appendChild(swatch);
  item.appendChild(name);
  if (pal.credit) {
    const credit = document.createElement("a");
    credit.className = "pal-item-credit";
    credit.textContent = pal.credit;
    if (pal.creditUrl) {
      credit.href = pal.creditUrl;
      credit.target = "_blank";
      credit.rel = "noopener";
      credit.addEventListener("click", (e) => e.stopPropagation());
    }
    item.appendChild(credit);
  }
  if (pal.custom) {
    const editBtn = document.createElement("button");
    editBtn.className = "pal-item-edit";
    editBtn.textContent = "Edit";
    editBtn.title = "Edit palette";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePalettePicker();
      openPaletteEditor(pal);
    });
    item.appendChild(editBtn);
  }
  const starBtn = document.createElement("button");
  starBtn.className = "pal-item-star" + (isFavPalette(id) ? " starred" : "");
  starBtn.dataset.palette = id;
  starBtn.textContent = "★";
  starBtn.title = isFavPalette(id) ? "Remove from favourites" : "Add to favourites";
  starBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavPalette(id);
  });
  item.appendChild(starBtn);
  item.addEventListener("click", () => {
    setPalette(id);
    closePalettePicker();
  });
  return item;
}
function filterPaletteList(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll("#palette-picker-list .pal-item");
  items.forEach((item) => {
    const n = (item.querySelector(".pal-item-name")?.textContent || "").toLowerCase();
    item.style.display = !q || n.includes(q) ? "" : "none";
  });
  document.querySelectorAll("#palette-picker-list .pal-section-header").forEach((header) => {
    let next = header.nextElementSibling;
    let allHidden = true;
    while (next && !next.classList.contains("pal-section-header")) {
      if (next.style.display !== "none") {
        allHidden = false;
        break;
      }
      next = next.nextElementSibling;
    }
    header.style.display = allHidden ? "none" : "";
  });
}
function buildBrowseButtonIcon() {
  const btn = document.getElementById("btn-palette-grid");
  if (!btn) return;
  const ids = ["dmg", "gbcam_gold", "gbc_a_up"];
  const cw = 5, ch = 5, gap = 1;
  const cols = 4, rows = ids.length;
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * ch + (rows - 1) * gap;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("pgrid-icon");
  ids.forEach((id, row) => {
    const pal = PALETTES[id];
    if (!pal) return;
    pal.colors.slice(0, 4).forEach((color, col) => {
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", col * (cw + gap));
      rect.setAttribute("y", row * (ch + gap));
      rect.setAttribute("width", cw);
      rect.setAttribute("height", ch);
      rect.setAttribute("fill", color);
      svg.appendChild(rect);
    });
  });
  btn.innerHTML = "";
  btn.appendChild(svg);
  const span = document.createElement("span");
  span.textContent = "All Palettes";
  btn.appendChild(span);
}
function updateCurrentPalettePin() {
  const pin = document.getElementById("pal-current-pin");
  if (!pin) return;
  pin.innerHTML = "";
  const id = state.palette?.id;
  if (!id) return;
  const pal = state.palette;
  const label = document.createElement("div");
  label.className = "pal-pin-label";
  label.textContent = "Active palette";
  const item = document.createElement("div");
  item.className = "pal-pin-item";
  const swatch = document.createElement("div");
  swatch.className = "palette-swatch";
  pal.colors.forEach((c) => {
    const s = document.createElement("span");
    s.style.background = c;
    swatch.appendChild(s);
  });
  const name = document.createElement("span");
  name.className = "pal-pin-name";
  name.textContent = pal.name;
  const star = document.createElement("button");
  const isFaved = isFavPalette(id);
  star.className = "pal-pin-star" + (isFaved ? " starred" : "");
  star.textContent = "★";
  star.title = isFaved ? "Remove from favourites" : "Add to favourites";
  star.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavPalette(id);
    const nowFaved = isFavPalette(id);
    star.classList.toggle("starred", nowFaved);
    star.title = nowFaved ? "Remove from favourites" : "Add to favourites";
  });
  item.appendChild(swatch);
  item.appendChild(name);
  item.appendChild(star);
  item.addEventListener("click", () => {
    setPalette(id);
    closePalettePicker();
  });
  pin.appendChild(label);
  pin.appendChild(item);
}
function syncControlsToEffectiveSettings(index) {
  if (index === null || index === void 0) return;
  const eff = getEffectiveSettings(index);
  updatePalettePickerBtn(eff.palette);
  const effPalId = eff.palette?.id;
  document.querySelectorAll(".pal-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.palette === effPalId);
  });
  updateCurrentPalettePin();
  syncFilterAccordion(eff);
  const bEl = document.getElementById("tone-brightness");
  const bVal = document.getElementById("tone-brightness-val");
  if (bEl) bEl.value = eff.brightness;
  if (bVal) bVal.textContent = eff.brightness > 0 ? `+${eff.brightness}` : String(eff.brightness);
  const cEl = document.getElementById("tone-contrast");
  const cVal = document.getElementById("tone-contrast-val");
  if (cEl) cEl.value = eff.contrast;
  if (cVal) cVal.textContent = eff.contrast > 0 ? `+${eff.contrast}` : String(eff.contrast);
  const tiEl = document.getElementById("tone-intensity");
  const tiVal = document.getElementById("tone-intensity-val");
  if (tiEl) tiEl.value = eff.toneIntensity;
  if (tiVal) tiVal.textContent = `${eff.toneIntensity}%`;
  const scEl = document.getElementById("tone-shadow-color");
  if (scEl) {
    scEl.value = eff.shadowColor;
    syncColorSwatchBtn(scEl, eff.shadowColor);
  }
  const hcEl = document.getElementById("tone-highlight-color");
  if (hcEl) {
    hcEl.value = eff.highlightColor;
    syncColorSwatchBtn(hcEl, eff.highlightColor);
  }
  const balEl = document.getElementById("tone-balance");
  const balVal = document.getElementById("tone-balance-val");
  if (balEl) balEl.value = eff.toneBalance;
  if (balVal)
    balVal.textContent = eff.toneBalance > 0 ? `+${eff.toneBalance}` : String(eff.toneBalance);
  const borderCb = document.getElementById("border-enabled-check");
  if (borderCb) borderCb.checked = eff.borderEnabled ?? false;
  document.querySelectorAll(".border-frame-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.frameId === eff.borderId);
  });
}
function setupToneControls() {
  function redrawDetail() {
    repaintInteractive();
  }
  const brightnessEl = document.getElementById("tone-brightness");
  const brightnessVal = document.getElementById("tone-brightness-val");
  const contrastEl = document.getElementById("tone-contrast");
  const contrastVal = document.getElementById("tone-contrast-val");
  const intensityEl = document.getElementById("tone-intensity");
  const intensityVal = document.getElementById("tone-intensity-val");
  const shadowColorEl = document.getElementById("tone-shadow-color");
  const highlightColorEl = document.getElementById("tone-highlight-color");
  const balanceEl = document.getElementById("tone-balance");
  const balanceVal = document.getElementById("tone-balance-val");
  const resetBtn = document.getElementById("exposure-reset");
  if (!brightnessEl) return;
  if (shadowColorEl) attachColorPickerToInput(shadowColorEl);
  if (highlightColorEl) attachColorPickerToInput(highlightColorEl);
  brightnessEl.addEventListener("input", () => {
    setScopedSetting("brightness", parseInt(brightnessEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.brightness ?? state.brightness;
    brightnessVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });
  contrastEl.addEventListener("input", () => {
    setScopedSetting("contrast", parseInt(contrastEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.contrast ?? state.contrast;
    contrastVal.textContent = v > 0 ? `+${v}` : String(v);
    redrawDetail();
  });
  intensityEl.addEventListener("input", () => {
    setScopedSetting("toneIntensity", parseInt(intensityEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneIntensity ?? state.toneIntensity;
    intensityVal.textContent = `${v}%`;
    redrawDetail();
  });
  shadowColorEl.addEventListener("input", () => {
    setScopedSetting("shadowColor", shadowColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });
  highlightColorEl.addEventListener("input", () => {
    setScopedSetting("highlightColor", highlightColorEl.value);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });
  balanceEl.addEventListener("input", () => {
    setScopedSetting("toneBalance", parseInt(balanceEl.value));
    const v = getEffectiveSettings(state.selectedIndex)?.toneBalance ?? state.toneBalance;
    balanceVal.textContent = v > 0 ? `+${v}` : String(v);
    const eff = getEffectiveSettings(state.selectedIndex);
    if ((eff?.toneIntensity ?? state.toneIntensity) > 0) redrawDetail();
  });
  resetBtn?.addEventListener("click", () => {
    pushUndo();
    const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : state.selectedIndex !== null ? [state.selectedIndex] : null;
    if (targets) {
      for (const idx of targets) {
        if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
        const ps = state.photoSettings[idx];
        ps.brightness = 0;
        ps.contrast = 0;
      }
    } else {
      state.brightness = 0;
      state.contrast = 0;
    }
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    setSectionEnabled("exposure", false);
    showToast("Exposure reset");
  });
  document.getElementById("split-tone-reset")?.addEventListener("click", () => {
    pushUndo();
    const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : state.selectedIndex !== null ? [state.selectedIndex] : null;
    if (targets) {
      for (const idx of targets) {
        if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
        const ps = state.photoSettings[idx];
        ps.toneIntensity = 0;
        ps.toneBalance = 0;
        ps.shadowColor = "#0033aa";
        ps.highlightColor = "#ff8800";
      }
    } else {
      state.toneIntensity = 0;
      state.toneBalance = 0;
      state.shadowColor = "#0033aa";
      state.highlightColor = "#ff8800";
    }
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    setSectionEnabled("splitTone", false);
    showToast("Split tone reset");
  });
}
function enterSoloMode() {
  state.viewMode = "solo";
  dom.gridPanel.classList.add("solo-mode");
  document.getElementById("btn-view-grid")?.classList.remove("active");
  document.getElementById("btn-view-solo")?.classList.add("active");
  if (state.selectedIndex === null) {
    const first = state.photos.findIndex((p) => !p.isEmpty);
    if (first >= 0) {
      state.selectedIndex = first;
      dom.photoGrid.querySelector(`[data-index="${first}"]`)?.classList.add("selected");
    }
  }
  if (state.selectedIndex !== null) renderSoloView(state.selectedIndex);
}
function enterGridMode() {
  state.viewMode = "grid";
  dom.gridPanel.classList.remove("solo-mode");
  document.getElementById("btn-view-grid")?.classList.add("active");
  document.getElementById("btn-view-solo")?.classList.remove("active");
  if (state.selectedIndex !== null) {
    dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
function renderSoloView(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  const wrap = dom.soloCanvas?.parentElement;
  if (!wrap || !dom.soloCanvas) return;
  const availW = wrap.clientWidth - 8;
  const availH = wrap.clientHeight - 8;
  const effSolo = getEffectiveSettings(index);
  const hasBorderSolo = effSolo.borderEnabled && effSolo.borderId;
  const soloDisplayW = hasBorderSolo ? 160 : PHOTO_WIDTH;
  const soloDisplayH = hasBorderSolo ? 144 : PHOTO_HEIGHT;
  const scaleW = Math.max(1, Math.floor(availW / soloDisplayW));
  const scaleH = Math.max(1, Math.floor(availH / soloDisplayH));
  const SOLO_SCALE = Math.max(1, Math.min(scaleW, scaleH));
  const ctx = dom.soloCanvas.getContext("2d");
  renderPhotoComplete(ctx, photo, effSolo, SOLO_SCALE, index);
  if (dom.soloLabel) dom.soloLabel.textContent = `Photo ${index + 1}`;
  if (dom.soloMeta) {
    const t = getTransform(index);
    const rotLabel = t.rotate ? ` · ${t.rotate}°` : "";
    const flipLabel = t.flipH || t.flipV ? ` · flipped` : "";
    dom.soloMeta.textContent = `${PHOTO_WIDTH}×${PHOTO_HEIGHT}px · slot ${index + 1}/30${rotLabel}${flipLabel}`;
  }
  document.querySelectorAll("#solo-transforms .transform-btn").forEach((btn) => {
    const t2 = getTransform(index);
    if (btn.dataset.action === "flip-h") btn.classList.toggle("active", t2.flipH);
    if (btn.dataset.action === "flip-v") btn.classList.toggle("active", t2.flipV);
  });
  updateSidebarPreview();
}
function soloStep(dir) {
  const photos = state.photos;
  let idx = state.selectedIndex ?? 0;
  let tries = 0;
  while (tries < 30) {
    idx = (idx + dir + photos.length) % photos.length;
    if (!photos[idx]?.isEmpty) break;
    tries++;
  }
  if (photos[idx]?.isEmpty) return;
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => el.classList.remove("selected"));
  dom.photoGrid.querySelector(`[data-index="${idx}"]`)?.classList.add("selected");
  state.selectedIndex = idx;
  state.selectedPhotos = /* @__PURE__ */ new Set([idx]);
  syncControlsToEffectiveSettings(idx);
  renderSoloView(idx);
}
function setSectionEnabled(section, on) {
  state.sectionEnabled[section] = on;
  const cb = document.querySelector(`.section-check[data-section="${section}"]`);
  if (cb) cb.checked = on;
  repaintGrid();
  if (state.viewMode === "solo" && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}
function resetEffects() {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : state.selectedIndex !== null ? [state.selectedIndex] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      ps.activeFilters = [];
      ps.filterParams = buildDefaultFilterParams();
      ps.filterIntensity = 1;
      ps.filterVariant = "medium";
    }
  } else {
    state.activeFilters.clear();
    state.filterParams = buildDefaultFilterParams();
    state.filterIntensity = 1;
    state.filterVariant = "medium";
  }
  updateFilterUI();
  setSectionEnabled("effects", false);
  showToast("Effects reset");
}
function updateFilterOrder(repaint = false) {
  const items = document.querySelectorAll(".fi-item");
  const newOrder = Array.from(items).map((item) => item.dataset.filter);
  state.filterOrder = newOrder;
  if (repaint) {
    repaintGrid();
    if (state.viewMode === "solo" && state.selectedIndex !== null)
      renderSoloView(state.selectedIndex);
    updateSidebarPreview();
  }
}
function updateFilterUI() {
  const _uiTgt = state.selectedPhotos.size > 0 ? [...state.selectedPhotos][0] : state.selectedIndex;
  const eff = _uiTgt !== null && _uiTgt !== void 0 ? getEffectiveSettings(_uiTgt) : null;
  syncFilterAccordion(eff);
}
function toggleFilter(filterName) {
  pushUndo();
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    const firstPs = state.photoSettings[targets[0]];
    const firstAf = firstPs?.activeFilters ? new Set(firstPs.activeFilters) : new Set(state.activeFilters);
    const adding = !firstAf.has(filterName);
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      if (adding) cur.add(filterName);
      else cur.delete(filterName);
      ps.activeFilters = [...cur];
    }
    if (adding) {
      state.focusedFilter = filterName;
      autoEnableEffectsSection();
    } else if (state.focusedFilter === filterName) {
      const remaining = new Set(state.photoSettings[targets[0]]?.activeFilters || []);
      state.focusedFilter = [...remaining].pop() || null;
    }
  } else {
    if (state.activeFilters.has(filterName)) {
      state.activeFilters.delete(filterName);
      if (state.focusedFilter === filterName) {
        state.focusedFilter = [...state.activeFilters].pop() || null;
      }
    } else {
      state.activeFilters.add(filterName);
      state.focusedFilter = filterName;
      autoEnableEffectsSection();
    }
  }
  updateFilterUI();
  repaintGrid();
  updateSidebarPreview();
}
function autoEnableEffectsSection() {
  if (!state.sectionEnabled.effects) {
    state.sectionEnabled.effects = true;
    const cb = document.querySelector('.section-check[data-section="effects"]');
    if (cb) cb.checked = true;
  }
}
function enableFilter(filterName) {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (targets) {
    for (const idx of targets) {
      if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
      const ps = state.photoSettings[idx];
      const cur = ps.activeFilters ? new Set(ps.activeFilters) : new Set(state.activeFilters);
      cur.add(filterName);
      ps.activeFilters = [...cur];
    }
  } else {
    state.activeFilters.add(filterName);
  }
  state.focusedFilter = filterName;
  autoEnableEffectsSection();
  updateFilterUI();
}
const MAX_UNDO = 30;
const undoStack = [];
function captureState() {
  return {
    activeFilters: new Set(state.activeFilters),
    filterParams: JSON.parse(JSON.stringify(state.filterParams)),
    filterIntensity: state.filterIntensity,
    filterVariant: state.filterVariant,
    palette: state.palette ? { ...state.palette } : null,
    brightness: state.brightness,
    contrast: state.contrast,
    toneIntensity: state.toneIntensity,
    shadowColor: state.shadowColor,
    highlightColor: state.highlightColor,
    toneBalance: state.toneBalance,
    photoSettings: JSON.parse(JSON.stringify(state.photoSettings)),
    photoTransforms: JSON.parse(JSON.stringify(state.photoTransforms)),
    sectionEnabled: JSON.parse(JSON.stringify(state.sectionEnabled || {})),
    borderId: state.borderId,
    borderEnabled: state.borderEnabled
  };
}
function pushUndo() {
  undoStack.push(captureState());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}
function performUndo() {
  if (undoStack.length === 0) {
    showToast("Nothing to undo");
    return;
  }
  const snap = undoStack.pop();
  state.activeFilters = snap.activeFilters;
  state.filterParams = snap.filterParams;
  state.filterIntensity = snap.filterIntensity;
  state.filterVariant = snap.filterVariant;
  state.palette = snap.palette;
  state.brightness = snap.brightness ?? state.brightness;
  state.contrast = snap.contrast ?? state.contrast;
  state.toneIntensity = snap.toneIntensity ?? state.toneIntensity;
  state.shadowColor = snap.shadowColor ?? state.shadowColor;
  state.highlightColor = snap.highlightColor ?? state.highlightColor;
  state.toneBalance = snap.toneBalance ?? state.toneBalance;
  if (snap.photoSettings) state.photoSettings = snap.photoSettings;
  if (snap.photoTransforms) state.photoTransforms = snap.photoTransforms;
  if (snap.sectionEnabled) state.sectionEnabled = snap.sectionEnabled;
  if (snap.borderId != null) state.borderId = snap.borderId;
  if (snap.borderEnabled != null) state.borderEnabled = snap.borderEnabled;
  updateFilterUI();
  syncControlsToEffectiveSettings(state.selectedIndex);
  repaintGrid();
  updateSidebarPreview();
  showToast("Undo");
}
function deselectAll() {
  state.selectedPhotos.clear();
  state.selectedIndex = null;
  state.lastSelectedIndex = null;
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => {
    el.classList.remove("selected", "multi-selected");
  });
  updateSidebarPreview();
}
function clearEdits() {
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : null;
  if (!targets) {
    showToast("Select a photo first");
    return;
  }
  pushUndo();
  for (const idx of targets) {
    const savedPaletteId = state.photoSettings[idx]?.paletteId;
    delete state.photoSettings[idx];
    if (savedPaletteId) {
      state.photoSettings[idx] = { paletteId: savedPaletteId };
    }
    delete state.photoTransforms[idx];
    repaintGridSlot(idx);
  }
  if (state.viewMode === "solo" && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
  updateFilterUI();
  const n = targets.length;
  showToast(`Cleared edits on ${n} photo${n > 1 ? "s" : ""}`);
  updateSidebarPreview();
}
function renderGrid() {
  dom.photoGrid.innerHTML = "";
  for (const photo of state.photos) {
    const slot = document.createElement("div");
    slot.className = "photo-slot" + (photo.isEmpty ? " empty" : "");
    slot.dataset.index = photo.index;
    const num = document.createElement("span");
    num.className = "slot-num";
    num.textContent = String(photo.index + 1).padStart(2, "0");
    slot.appendChild(num);
    if (photo.isEmpty) {
      const placeholder = document.createElement("div");
      placeholder.className = "empty-placeholder";
      placeholder.textContent = "—";
      slot.appendChild(placeholder);
    } else {
      const canvas = document.createElement("canvas");
      const effThumb = getEffectiveSettings(photo.index);
      const hasBorderThumb = effThumb.borderEnabled && effThumb.borderId;
      canvas.width = (hasBorderThumb ? 160 : PHOTO_WIDTH) * THUMB_SCALE;
      canvas.height = (hasBorderThumb ? 144 : PHOTO_HEIGHT) * THUMB_SCALE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      renderPhotoComplete(ctx, photo, effThumb, THUMB_SCALE, photo.index);
      slot.appendChild(canvas);
      const check = document.createElement("div");
      check.className = "gif-check";
      check.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleGifSelection(photo.index, slot);
      });
      slot.appendChild(check);
      slot.addEventListener("click", (e) => selectPhoto(photo.index, e));
      slot.addEventListener("dblclick", (e) => {
        selectPhoto(photo.index, e);
        enterSoloMode();
      });
    }
    dom.photoGrid.appendChild(slot);
  }
  if (state.selectedIndex !== null) {
    const el = dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`);
    if (el) el.classList.add("selected");
  }
  for (const idx of state.selectedPhotos) {
    if (state.selectedPhotos.size > 1) {
      const el = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
      if (el) el.classList.add("multi-selected");
    }
  }
  for (const idx of state.gifSelection) {
    const el = dom.photoGrid.querySelector(`[data-index="${idx}"]`);
    if (el) el.classList.add("selected-for-gif");
  }
  updateGifFrameNumbers();
}
function repaintDetailOnly() {
  if (state.viewMode === "solo" && state.selectedIndex !== null) {
    renderSoloView(state.selectedIndex);
  }
  updateSidebarPreview();
}
function repaintGrid() {
  const slots = dom.photoGrid.querySelectorAll(".photo-slot:not(.empty)");
  for (const slot of slots) repaintGridSlot(parseInt(slot.dataset.index));
  if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
  if (state.viewMode === "solo" && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  updateSidebarPreview();
}
let _gridDebounceTimer = null;
function scheduleGridRepaint() {
  clearTimeout(_gridDebounceTimer);
  _gridDebounceTimer = setTimeout(() => {
    _gridDebounceTimer = null;
    const slots = dom.photoGrid.querySelectorAll(".photo-slot:not(.empty)");
    for (const slot of slots) repaintGridSlot(parseInt(slot.dataset.index));
    if (state.gifMode && state.gifSelection.size > 0) updateGifPreview();
  }, 200);
}
let _interactiveRAF = null;
function repaintInteractive() {
  if (_interactiveRAF !== null) return;
  _interactiveRAF = requestAnimationFrame(() => {
    _interactiveRAF = null;
    repaintDetailOnly();
    if (state.selectedPhotos.size > 0) {
      for (const idx of state.selectedPhotos) repaintGridSlot(idx);
    } else {
      scheduleGridRepaint();
    }
  });
}
function repaintGridSlot(index) {
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
  if (!slot) return;
  const canvas = slot.querySelector("canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const eff = getEffectiveSettings(index);
  const hasBorderSlot = eff.borderEnabled && eff.borderId;
  const expW = (hasBorderSlot ? 160 : PHOTO_WIDTH) * THUMB_SCALE;
  const expH = (hasBorderSlot ? 144 : PHOTO_HEIGHT) * THUMB_SCALE;
  if (canvas.width !== expW || canvas.height !== expH) {
    canvas.width = expW;
    canvas.height = expH;
  }
  renderPhotoComplete(ctx, photo, eff, THUMB_SCALE, index);
  slot.classList.toggle("has-photo-settings", hasPhotoOverride(index));
}
function updateExportSelectedBtn() {
  const btn = document.getElementById("btn-export-single");
  if (!btn) return;
  const hasPhoto = state.selectedIndex !== null && state.photos[state.selectedIndex] && !state.photos[state.selectedIndex].isEmpty;
  btn.disabled = !hasPhoto;
  btn.style.opacity = hasPhoto ? "" : "0.4";
}
function selectPhoto(index, event) {
  if (state.gifMode) {
    const slot = dom.photoGrid.querySelector(`[data-index="${index}"]`);
    if (slot && !slot.classList.contains("empty")) toggleGifSelection(index, slot);
    return;
  }
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  if (event?.shiftKey && state.lastSelectedIndex !== null) {
    const lo = Math.min(state.lastSelectedIndex, index);
    const hi = Math.max(state.lastSelectedIndex, index);
    for (let i = lo; i <= hi; i++) {
      if (state.photos[i] && !state.photos[i].isEmpty) state.selectedPhotos.add(i);
    }
    state.selectedIndex = index;
  } else if (event?.metaKey || event?.ctrlKey) {
    if (state.selectedPhotos.has(index)) {
      state.selectedPhotos.delete(index);
    } else {
      state.selectedPhotos.add(index);
    }
    state.selectedIndex = index;
    state.lastSelectedIndex = index;
  } else {
    state.selectedPhotos.clear();
    state.selectedPhotos.add(index);
    state.selectedIndex = index;
    state.lastSelectedIndex = index;
  }
  dom.photoGrid.querySelectorAll(".photo-slot").forEach((el) => {
    const i = parseInt(el.dataset.index);
    const inSet = state.selectedPhotos.has(i);
    el.classList.toggle("selected", i === state.selectedIndex);
    el.classList.toggle("multi-selected", inSet && state.selectedPhotos.size > 1);
  });
  if (state.viewMode === "solo") renderSoloView(index);
  syncControlsToEffectiveSettings(index);
  updateExportSelectedBtn();
  updateSidebarPreview();
}
function setThumbnailSize(px) {
  dom.photoGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(min(${px}px, 48%), 1fr))`;
}
function _repaintAfterTransform(index) {
  repaintGridSlot(index);
  if (state.viewMode === "solo") renderSoloView(index);
}
function showMainView() {
  dom.welcome.classList.add("hidden");
  dom.main.style.display = "flex";
  dom.app.classList.add("has-file");
}
function resetToWelcome() {
  state.sav = null;
  state.photos = [];
  state.activeCount = 0;
  state.filename = null;
  state.filePath = null;
  state.selectedIndex = null;
  state.photoSettings = {};
  state.gifMode = false;
  state.gifSelection = /* @__PURE__ */ new Set();
  state.gifFrameOrder = [];
  state.viewMode = "grid";
  dom.main.style.display = "none";
  dom.welcome.classList.remove("hidden");
  dom.app.classList.remove("has-file");
  if (dom.photoGrid) dom.photoGrid.innerHTML = "";
}
async function loadSavFile(result) {
  if (!result || result.error) {
    if (result?.error) showToast(`⚠ ${result.error}`);
    return;
  }
  const { buffer, name, path: filePath } = result;
  const camBuf = coerceGbCamSave(buffer);
  if (!camBuf) {
    showToast(
      `⚠ Unexpected file (${buffer.byteLength} bytes): expected a 131072-byte GB Camera save, or a savestate (.sta) containing one.`
    );
    return;
  }
  const { photos, activeCount, sav } = parseSav(camBuf);
  state.sav = sav;
  state.photos = photos;
  state.activeCount = activeCount;
  state.filename = name;
  state.filePath = filePath || null;
  state.selectedIndex = null;
  state.gifMode = false;
  state.gifSelection.clear();
  state.photoTransforms = {};
  state.photoSettings = {};
  if (filePath) saveLastSavPath(filePath);
  renderGrid();
  showMainView();
  updateExportSelectedBtn();
  setStatus(`${name} — ${activeCount} photo${activeCount !== 1 ? "s" : ""} found`, true);
}
function setupDragDrop() {
  const overlay = dom.dropOverlay;
  document.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    overlay?.classList.remove("hidden");
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) overlay?.classList.add("hidden");
  });
  document.addEventListener("drop", async (e) => {
    e.preventDefault();
    overlay?.classList.add("hidden");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await loadSavFile({ buffer, name: file.name, path: api.getPathForFile(file) });
  });
}
function saveLastSavPath(filePath) {
  if (filePath) writeString(STORAGE_KEYS.lastSavPath, filePath);
}
async function reloadSav() {
  const p = state.filePath || readString(STORAGE_KEYS.lastSavPath);
  if (!p) {
    showToast("No file to reload");
    return;
  }
  await loadSavFile(await api.readFile(p));
}
function albumFolderName(name, used) {
  const stem = String(name).replace(/\.[^.]+$/, "");
  const m = stem.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_ ]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  const base = m ? `${m[1]}-${m[2]}-${m[3]}_${m[4]}-${m[5]}-${m[6]}` : stem.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "album";
  let folder = base, n = 2;
  while (used.has(folder)) folder = `${base}_${n++}`;
  used.add(folder);
  return folder;
}
function savestateFileDate(name) {
  const m = String(name).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function dateBound(s, high) {
  const m = String(s).trim().replace(/[/.]/g, "-").match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const mo = m[2] ? m[2].padStart(2, "0") : high ? "12" : "01";
  const d = m[3] ? m[3].padStart(2, "0") : high ? "31" : "01";
  return `${m[1]}-${mo}-${d}`;
}
function dateQueryMatches(name, query) {
  const q = (query || "").trim();
  if (!q) return true;
  const fd = savestateFileDate(name);
  if (!fd) return false;
  const parts = q.split(/\s*\.\.\s*/);
  const lo = dateBound(parts[0], false);
  const hi = dateBound(parts.length === 2 ? parts[1] : parts[0], true);
  if (!lo || !hi) return false;
  return fd >= lo && fd <= hi;
}
async function exportSinglePng() {
  const index = state.selectedIndex;
  if (index === null) return;
  const photo = state.photos[index];
  if (!photo || photo.isEmpty) return;
  const scale = state.exportScale === "custom" ? Math.max(
    1,
    Math.round(
      (parseInt(document.getElementById("custom-width")?.value) || 512) / PHOTO_WIDTH
    )
  ) : state.exportScale;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const effExp = getEffectiveSettings(index);
  renderPhotoComplete(ctx, photo, effExp, scale, index, { forExport: true });
  const dataUrl = canvas.toDataURL("image/png");
  const filterTag = effExp.activeFilters.size > 0 ? `_${[...effExp.activeFilters].join("+")}` : "";
  const scaleTag = state.exportScale === "custom" ? `${getExportDimensions().width}px` : `${state.exportScale}x`;
  const defaultName = `gbcam_${String(index + 1).padStart(2, "0")}_${effExp.palette.id}_${scaleTag}${filterTag}.png`;
  const saved = await api.savePng(dataUrl, defaultName);
  if (saved) showToast(`Saved: ${typeof saved === "string" ? saved.split("/").pop() : saved}`);
}
async function exportBatchPng() {
  const photos = state.photos.filter((p) => !p.isEmpty);
  if (photos.length === 0) {
    showToast("No photos to export");
    return;
  }
  const { width } = getExportDimensions();
  const scaleTag = state.exportScale === "custom" ? `${width}px` : `${state.exportScale}x`;
  const batch = [];
  const batchScale = state.exportScale === "custom" ? Math.max(1, Math.round(width / PHOTO_WIDTH)) : state.exportScale;
  for (const photo of photos) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const effBatch = getEffectiveSettings(photo.index);
    renderPhotoComplete(ctx, photo, effBatch, batchScale, photo.index, { forExport: true });
    const dataUrl = canvas.toDataURL("image/png");
    const batchFilterTag = effBatch.activeFilters.size > 0 ? `_${[...effBatch.activeFilters].join("+")}` : "";
    const name = `gbcam_${String(photo.index + 1).padStart(2, "0")}_${effBatch.palette.id}_${scaleTag}${batchFilterTag}.png`;
    batch.push({ dataUrl, name });
  }
  const result = await api.savePngBatch(batch);
  if (result) showToast(`Exported ${result.count} photos`);
}
async function exportSavestateAlbums() {
  const all = await pickSaveFiles();
  if (!all.length) return;
  const query = (document.getElementById("album-date-filter")?.value || "").trim();
  const files = query ? all.filter((f) => dateQueryMatches(f.name, query)) : all;
  if (query && !files.length) {
    showToast(`No savestates match "${query}"`);
    return;
  }
  const eff = getEffectiveSettings(-1);
  const { width } = getExportDimensions();
  const scale = state.exportScale === "custom" ? Math.max(1, Math.round(width / PHOTO_WIDTH)) : state.exportScale;
  showToast(`Developing ${files.length} file${files.length !== 1 ? "s" : ""}…`);
  await new Promise((r) => setTimeout(r, 0));
  const used = /* @__PURE__ */ new Set();
  const batch = [];
  let albums = 0, skipped = 0;
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
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      renderPhotoComplete(ctx, photo, eff, scale, photo.index, { forExport: true });
      batch.push({
        dataUrl: canvas.toDataURL("image/png"),
        name: `${folder}/${folder}_${String(i + 1).padStart(2, "0")}.png`
      });
    });
  }
  if (!batch.length) {
    showToast("No Game Boy Camera photos found in those files");
    return;
  }
  const result = await api.savePngBatch(batch, "mugdump-albums.zip");
  if (result) {
    showToast(
      `${batch.length} photo${batch.length !== 1 ? "s" : ""} in ${albums} dated album${albums !== 1 ? "s" : ""}` + (skipped ? ` (${skipped} skipped)` : "")
    );
  }
}
async function exportGif() {
  if (state.gifFrameOrder.length === 0) {
    showToast("Add frames first");
    return;
  }
  try {
    const scale = state.exportScale === "custom" ? Math.max(
      1,
      Math.round(
        (parseInt(document.getElementById("custom-width")?.value) || 512) / PHOTO_WIDTH
      )
    ) : state.exportScale;
    const sequence = state.gifLoop === "bounce" ? bounceSequence(state.gifFrameOrder) : state.gifFrameOrder;
    const frames = [];
    for (const frame of sequence) {
      const photo = state.photos[frame.photoIndex];
      if (!photo || photo.isEmpty) continue;
      const eff = getEffectiveSettings(frame.photoIndex);
      const pal = frame.paletteId && PALETTES[frame.paletteId] || eff.palette;
      frames.push({
        indices: Array.from(photo.pixels),
        palette: paletteToRGB(pal),
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT
      });
    }
    if (frames.length === 0) {
      showToast("No valid frames");
      return;
    }
    const loopTag = state.gifLoop !== "infinite" ? `_${state.gifLoop}` : "";
    const defaultName = `mugdump_anim_${scale}x${loopTag}.gif`;
    const bytes = encodeGif(frames, { delay: state.gifDelay, scale, loop: state.gifLoop });
    const result = await api.saveGif({ bytes, defaultName });
    if (!result) return;
    if (result.error) {
      showToast(`GIF error: ${result.error}`);
      return;
    }
    const fLabel = `${frames.length} frame${frames.length !== 1 ? "s" : ""}`;
    const lLabel = state.gifLoop === "once" ? "· once" : state.gifLoop === "bounce" ? "· bounce" : "";
    showToast(`GIF saved (${fLabel}${lLabel ? " " + lLabel : ""})`);
  } catch (e) {
    console.error("[exportGif]", e);
    showToast(`Export failed: ${e.message}`);
  }
}
async function exportSav() {
  if (!state.sav) return;
  const defaultName = state.filename || "GBCAMERA.sav";
  const result = await api.exportSav(state.sav.buffer, defaultName);
  if (result) showToast(`Saved: ${result}`);
}
async function exportContactSheet() {
  const filled = state.photos.filter((p) => !p.isEmpty);
  if (filled.length === 0) {
    showToast("No photos to export");
    return;
  }
  const SHEET_SCALE = 4;
  const cols = Math.min(filled.length, 5);
  const rows = Math.ceil(filled.length / cols);
  const CELL = 160 * SHEET_SCALE;
  const CELLH = 144 * SHEET_SCALE;
  const GAP = 8;
  const PAD = 16;
  const LABEL = 18;
  const sheetW = PAD * 2 + cols * CELL + (cols - 1) * GAP;
  const sheetH = PAD * 2 + rows * (CELLH + LABEL + GAP) - GAP;
  const sheet = document.createElement("canvas");
  sheet.width = sheetW;
  sheet.height = sheetH;
  const sc = sheet.getContext("2d");
  sc.fillStyle = "#111113";
  sc.fillRect(0, 0, sheetW, sheetH);
  for (let i = 0; i < filled.length; i++) {
    const photo = filled[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL + GAP);
    const y = PAD + row * (CELLH + LABEL + GAP);
    const tmp = document.createElement("canvas");
    const tctx = tmp.getContext("2d");
    const effSheet = getEffectiveSettings(photo.index);
    renderPhotoComplete(tctx, photo, effSheet, SHEET_SCALE, photo.index, { forExport: true });
    sc.fillStyle = "#000";
    sc.fillRect(x, y, CELL, CELLH);
    const offX = Math.floor((CELL - tmp.width) / 2);
    const offY = Math.floor((CELLH - tmp.height) / 2);
    sc.drawImage(tmp, x + offX, y + offY);
    sc.fillStyle = "rgba(255,255,255,0.45)";
    sc.font = "11px ui-monospace, monospace";
    sc.textAlign = "center";
    sc.fillText(`${photo.index + 1}`, x + CELL / 2, y + CELLH + 13);
  }
  const dataUrl = sheet.toDataURL("image/png");
  const name = `gbcam_contact_${state.palette.id}.png`;
  if (api.savePng) {
    const saved = await api.savePng(dataUrl, name);
    if (saved) showToast(`Contact sheet saved`);
  } else {
    const a = Object.assign(document.createElement("a"), { href: dataUrl, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Contact sheet downloaded");
  }
}
let _borderPreviewEl = null;
function _getBorderPreviewEl() {
  if (_borderPreviewEl) return _borderPreviewEl;
  const el = document.createElement("div");
  el.className = "border-preview-popover";
  el.style.display = "none";
  el.appendChild(document.createElement("canvas"));
  document.body.appendChild(el);
  _borderPreviewEl = el;
  return el;
}
function showBorderPreview(borderId, anchorEl) {
  const S2 = 2, W = 160, H = 144;
  const el = _getBorderPreviewEl();
  const cv = el.querySelector("canvas");
  cv.width = W * S2;
  cv.height = H * S2;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const palette = (state.selectedIndex != null ? getEffectiveSettings(state.selectedIndex)?.palette : null) || state.palette;
  ctx.fillStyle = palette.colors && palette.colors[0] || "#9bbc0f";
  ctx.fillRect(0, 0, cv.width, cv.height);
  let photo = null;
  if (state.photos && state.photos.length) {
    const sel = state.selectedIndex;
    const idx = sel != null && state.photos[sel] && !state.photos[sel].isEmpty ? sel : state.photos.findIndex((p) => !p.isEmpty);
    if (idx >= 0 && state.photos[idx] && !state.photos[idx].isEmpty) photo = state.photos[idx];
  }
  if (photo && photo.pixels) {
    const pc = document.createElement("canvas");
    pc.width = PHOTO_WIDTH;
    pc.height = PHOTO_HEIGHT;
    renderToCanvas(pc.getContext("2d"), photo.pixels, palette, 1);
    ctx.drawImage(pc, 16 * S2, 16 * S2, PHOTO_WIDTH * S2, PHOTO_HEIGHT * S2);
  }
  const fc = getColorizedBorderCanvas(borderId, palette);
  if (fc) ctx.drawImage(fc, 0, 0, cv.width, cv.height);
  else if (_borderImageCache[borderId])
    ctx.drawImage(_borderImageCache[borderId], 0, 0, cv.width, cv.height);
  el.style.display = "block";
  const pr = el.getBoundingClientRect();
  const ar = anchorEl.getBoundingClientRect();
  let left = ar.left - pr.width - 12;
  if (left < 8) left = Math.min(ar.right + 12, window.innerWidth - pr.width - 8);
  let top = ar.top + ar.height / 2 - pr.height / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - pr.height - 8));
  el.style.left = Math.max(8, left) + "px";
  el.style.top = top + "px";
}
function hideBorderPreview() {
  if (_borderPreviewEl) _borderPreviewEl.style.display = "none";
}
function setupBorderPicker() {
  const grid = document.getElementById("border-frame-grid");
  if (!grid) return;
  BORDER_FRAMES.forEach(({ id, label }) => {
    const btn = document.createElement("button");
    btn.className = "border-frame-btn";
    btn.dataset.frameId = id;
    btn.title = `Frame ${label}`;
    const img = document.createElement("img");
    img.src = `frames/${id}.png`;
    img.alt = label;
    img.draggable = false;
    btn.appendChild(img);
    const lbl = document.createElement("span");
    lbl.textContent = label;
    btn.appendChild(lbl);
    btn.addEventListener("click", () => {
      pushUndo();
      setScopedSetting("borderId", id);
      setScopedSetting("borderEnabled", true);
      const enableCb = document.getElementById("border-enabled-check");
      if (enableCb) enableCb.checked = true;
      document.querySelectorAll(".border-frame-btn").forEach((b) => b.classList.toggle("active", b.dataset.frameId === id));
      repaintGrid();
      updateSidebarPreview();
    });
    btn.addEventListener("mouseenter", () => showBorderPreview(id, btn));
    btn.addEventListener("mouseleave", hideBorderPreview);
    grid.appendChild(btn);
  });
  const currentId = state.borderId;
  grid.querySelectorAll(".border-frame-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.frameId === currentId);
  });
}
function setupCollapsibleSections() {
  const sectionStates = readJson(STORAGE_KEYS.sectionStates, {});
  function saveState(sectionId, isCollapsed) {
    sectionStates[sectionId] = isCollapsed;
    writeJson(STORAGE_KEYS.sectionStates, sectionStates);
  }
  document.querySelectorAll("#export-controls .ctrl-group.collapsible").forEach((group) => {
    const clickTarget = group.querySelector(":scope > .tone-header") || group.querySelector(":scope > .ctrl-header-row") || group.querySelector(":scope > .ctrl-label");
    if (!clickTarget) return;
    const labelEl = clickTarget.classList.contains("ctrl-label") ? clickTarget : clickTarget.querySelector(".section-label, .ctrl-label");
    const sectionId = labelEl ? labelEl.textContent.trim() : group.id || "section";
    group.dataset.sectionId = sectionId;
    if (labelEl) {
      const chevron = document.createElement("span");
      chevron.className = "section-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▾";
      labelEl.prepend(chevron);
    }
    const allChildren = [...group.children];
    const headerIdx = allChildren.indexOf(clickTarget);
    const bodyChildren = allChildren.slice(headerIdx + 1);
    if (bodyChildren.length === 0) return;
    const outer = document.createElement("div");
    outer.className = "section-body-outer";
    const inner = document.createElement("div");
    inner.className = "section-body-inner";
    bodyChildren.forEach((c) => inner.appendChild(c));
    outer.appendChild(inner);
    group.appendChild(outer);
    const defaultCollapsed = group.getAttribute("data-default-collapsed") === "true";
    const isCollapsed = sectionId in sectionStates ? sectionStates[sectionId] : defaultCollapsed;
    if (isCollapsed) group.classList.add("collapsed");
    clickTarget.style.cursor = "pointer";
    clickTarget.addEventListener("click", (e) => {
      if (e.target.closest("button, input, .section-check-wrap")) return;
      if (e.target !== clickTarget && e.target !== labelEl && !e.target.classList.contains("section-chevron"))
        return;
      const nowCollapsed = group.classList.toggle("collapsed");
      saveState(sectionId, nowCollapsed);
    });
  });
}
function copyEffects() {
  const _cpTgt = state.selectedIndex;
  const _cpEff = _cpTgt !== null ? getEffectiveSettings(_cpTgt) : null;
  const src = _cpEff || state;
  const cpPaletteId = _cpTgt !== null && state.photoSettings[_cpTgt]?.paletteId ? state.photoSettings[_cpTgt].paletteId : state.palette?.id ?? null;
  state.effectClipboard = {
    // Palette
    paletteId: cpPaletteId,
    // Filters
    activeFilters: _cpEff ? [..._cpEff.activeFilters] : [...state.activeFilters],
    filterIntensity: src.filterIntensity ?? state.filterIntensity,
    filterVariant: src.filterVariant ?? state.filterVariant,
    filterParams: JSON.parse(JSON.stringify(src.filterParams ?? state.filterParams)),
    // Tone / exposure
    brightness: src.brightness ?? state.brightness,
    contrast: src.contrast ?? state.contrast,
    toneIntensity: src.toneIntensity ?? state.toneIntensity,
    shadowColor: src.shadowColor ?? state.shadowColor,
    highlightColor: src.highlightColor ?? state.highlightColor,
    toneBalance: src.toneBalance ?? state.toneBalance
  };
  document.querySelectorAll(".btn-paste-effects").forEach((b) => b.disabled = false);
  showToast("All settings copied");
}
function pasteEffects() {
  if (!state.effectClipboard) return;
  pushUndo();
  const cb = state.effectClipboard;
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : state.selectedIndex !== null ? [state.selectedIndex] : [];
  if (targets.length === 0) {
    showToast("Select a photo to paste to");
    return;
  }
  for (const idx of targets) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    const ps = state.photoSettings[idx];
    if (cb.paletteId) ps.paletteId = cb.paletteId;
    ps.filterIntensity = cb.filterIntensity;
    ps.filterVariant = cb.filterVariant;
    ps.filterParams = JSON.parse(JSON.stringify(cb.filterParams));
    ps.activeFilters = [...cb.activeFilters];
    ps.brightness = cb.brightness;
    ps.contrast = cb.contrast;
    ps.toneIntensity = cb.toneIntensity;
    ps.shadowColor = cb.shadowColor;
    ps.highlightColor = cb.highlightColor;
    ps.toneBalance = cb.toneBalance;
  }
  updateFilterUI();
  syncControlsToEffectiveSettings(state.selectedIndex);
  repaintGrid();
  showToast(`Settings pasted to ${targets.length} photo${targets.length > 1 ? "s" : ""}`);
}
let _presIndex = null;
function openPresentation(index) {
  const filled = state.photos.map((p, i) => ({ p, i })).filter((x) => !x.p.isEmpty);
  if (filled.length === 0) return;
  _presIndex = filled.find((x) => x.i === index)?.i ?? filled[0].i;
  state.presentationMode = true;
  dom.presentationOverlay?.classList.remove("hidden");
  renderPresentation();
}
function closePresentation() {
  state.presentationMode = false;
  dom.presentationOverlay?.classList.add("hidden");
  _presIndex = null;
}
function presentationStep(dir) {
  const filled = state.photos.map((p, i) => i).filter((i) => !state.photos[i].isEmpty);
  if (filled.length === 0) return;
  const cur = filled.indexOf(_presIndex);
  const next = (cur + dir + filled.length) % filled.length;
  _presIndex = filled[next];
  renderPresentation();
}
function renderPresentation() {
  if (_presIndex === null || !dom.presCanvas) return;
  const photo = state.photos[_presIndex];
  if (!photo || photo.isEmpty) return;
  const vw = window.innerWidth - 160;
  const vh = window.innerHeight - 120;
  const t = getTransform(_presIndex);
  const rotated = t.rotate === 90 || t.rotate === 270;
  const srcW = rotated ? PHOTO_HEIGHT : PHOTO_WIDTH;
  const srcH = rotated ? PHOTO_WIDTH : PHOTO_HEIGHT;
  const scale = Math.max(1, Math.floor(Math.min(vw / srcW, vh / srcH)));
  const ctx = dom.presCanvas.getContext("2d");
  const effPres = getEffectiveSettings(_presIndex);
  renderPhotoComplete(ctx, photo, effPres, scale, _presIndex);
  const filled = state.photos.filter((p) => !p.isEmpty).length;
  const pos = state.photos.slice(0, _presIndex + 1).filter((p) => !p.isEmpty).length;
  if (dom.presLabel) dom.presLabel.textContent = `Photo ${_presIndex + 1}  ·  ${pos} / ${filled}`;
}
function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      performUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      e.preventDefault();
      copyEffects();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "v") {
      e.preventDefault();
      pasteEffects();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      e.preventDefault();
      document.getElementById("btn-select-all")?.click();
      return;
    }
    if (e.key === "p" || e.key === "P") {
      const previewCb = document.getElementById("effects-preview-check");
      if (previewCb) {
        previewCb.checked = !previewCb.checked;
        previewCb.dispatchEvent(new Event("change"));
      }
      return;
    }
    if (e.key === "Escape") {
      if (state.presentationMode) {
        closePresentation();
        return;
      }
      if (document.querySelector("#palette-grid-modal:not(.hidden)")) {
        document.getElementById("palette-grid-close")?.click();
        return;
      }
      if (state.gifMode) {
        exitGifMode();
        return;
      }
      if (state.viewMode === "solo") {
        enterGridMode();
        return;
      }
      if (state.selectedPhotos.size > 0 || state.selectedIndex !== null) {
        deselectAll();
        return;
      }
      return;
    }
    if (e.key === "f" || e.key === "F") {
      if (state.presentationMode) {
        closePresentation();
        return;
      }
      if (state.selectedIndex !== null) {
        openPresentation(state.selectedIndex);
        return;
      }
    }
    if (e.key === "g" || e.key === "G") {
      if (state.photos.length > 0 && state.viewMode !== "grid") {
        enterGridMode();
        return;
      }
    }
    if (e.key === "s" || e.key === "S") {
      if (state.photos.length > 0 && state.selectedIndex !== null && state.viewMode !== "solo") {
        enterSoloMode();
        return;
      }
    }
    if (state.presentationMode) {
      if (e.key === "ArrowLeft") {
        presentationStep(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        presentationStep(1);
        return;
      }
      return;
    }
    if (state.viewMode === "solo") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        soloStep(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        soloStep(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        soloStep(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        soloStep(1);
        return;
      }
    }
    if (state.photos.length === 0) return;
    if (state.viewMode === "grid" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const filled = state.photos.map((p, i) => i).filter((i) => !state.photos[i].isEmpty);
      if (filled.length === 0) return;
      const cur = state.selectedIndex ?? -1;
      const idx = filled.indexOf(cur);
      let next;
      if (e.key === "ArrowLeft") {
        next = idx <= 0 ? filled[filled.length - 1] : filled[idx - 1];
      } else {
        next = idx === filled.length - 1 ? filled[0] : filled[idx + 1];
      }
      selectPhoto(next);
      dom.photoGrid.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (state.viewMode === "grid" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const all = state.photos.map((p, i) => i).filter((i) => !state.photos[i].isEmpty);
      if (all.length === 0) return;
      const cur = state.selectedIndex ?? all[0];
      const curPos = all.indexOf(cur);
      const cols = Math.max(
        1,
        Math.round(
          dom.photoGrid.offsetWidth / (dom.photoGrid.querySelector(".photo-slot")?.offsetWidth || 140)
        )
      );
      const step = e.key === "ArrowUp" ? -cols : cols;
      const next = all[Math.max(0, Math.min(all.length - 1, curPos + step))];
      selectPhoto(next);
      dom.photoGrid.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      if (!state.gifMode) return;
      if (state.selectedIndex === null) return;
      const slot = dom.photoGrid.querySelector(`[data-index="${state.selectedIndex}"]`);
      if (slot && !slot.classList.contains("empty")) {
        toggleGifSelection(state.selectedIndex, slot);
      }
      return;
    }
    if (state.selectedIndex === null) return;
    const photo = state.photos[state.selectedIndex];
    if (!photo || photo.isEmpty) return;
    if (e.key === "r" && !e.shiftKey) {
      applyTransformAction(state.selectedIndex, "rotate-cw");
      _repaintAfterTransform(state.selectedIndex);
    }
    if (e.key === "l") {
      applyTransformAction(state.selectedIndex, "rotate-ccw");
      _repaintAfterTransform(state.selectedIndex);
    }
    if (e.key === "r" && e.shiftKey) {
      applyTransformAction(state.selectedIndex, "rotate-ccw");
      _repaintAfterTransform(state.selectedIndex);
    }
    if (e.key === "h") {
      applyTransformAction(state.selectedIndex, "flip-h");
      _repaintAfterTransform(state.selectedIndex);
    }
    if (e.key === "v") {
      applyTransformAction(state.selectedIndex, "flip-v");
      _repaintAfterTransform(state.selectedIndex);
    }
  });
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "-" || e.key === "_") {
      shiftFavOffset(-1);
      return;
    }
    if (e.key === "+" || e.key === "=") {
      shiftFavOffset(1);
      return;
    }
  });
}
function setupSidebarToggle() {
  const toggleBtn = document.getElementById("btn-sidebar-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  const app = document.getElementById("app");
  if (!toggleBtn || !backdrop || !app) return;
  const open = () => {
    app.classList.add("sidebar-open");
    toggleBtn.textContent = "‹";
    toggleBtn.title = "Close editing panel";
  };
  const close = () => {
    app.classList.remove("sidebar-open");
    toggleBtn.textContent = "›";
    toggleBtn.title = "Show editing panel";
  };
  toggleBtn.addEventListener("click", () => {
    app.classList.contains("sidebar-open") ? close() : open();
  });
  backdrop.addEventListener("click", close);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) close();
  });
}
function setupSidebarCollapse() {
  const btn = document.getElementById("sidebar-collapse-btn");
  const panel = document.getElementById("detail-panel");
  const handle = document.getElementById("panel-resize-handle");
  const app = document.getElementById("app");
  if (!btn || !panel || !app) return;
  const isDesktop = () => window.innerWidth > 1024;
  function doCollapse(save = true) {
    panel.style.width = "";
    panel.style.flex = "";
    app.classList.add("sidebar-collapsed");
    btn.textContent = "›";
    btn.title = "Expand sidebar";
    if (handle) handle.style.cursor = "default";
    if (save) writeString(STORAGE_KEYS.sidebarCollapsed, "1");
    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
  }
  function doExpand(save = true) {
    panel.style.width = "";
    panel.style.flex = "";
    app.classList.remove("sidebar-collapsed");
    btn.textContent = "‹";
    btn.title = "Collapse sidebar";
    if (handle) handle.style.cursor = "";
    if (save) writeString(STORAGE_KEYS.sidebarCollapsed, "0");
    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
  }
  if (isDesktop() && readString(STORAGE_KEYS.sidebarCollapsed) === "1") doCollapse(false);
  let _wasDesktop = isDesktop();
  window.addEventListener("resize", () => {
    const nowDesktop = isDesktop();
    if (nowDesktop === _wasDesktop) return;
    _wasDesktop = nowDesktop;
    if (!nowDesktop) {
      app.classList.remove("sidebar-collapsed");
    } else {
      if (readString(STORAGE_KEYS.sidebarCollapsed) === "1") doCollapse(false);
    }
  });
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  btn.addEventListener("click", () => {
    app.classList.contains("sidebar-collapsed") ? doExpand() : doCollapse();
  });
}
function setupPanelResize() {
  const handle = document.getElementById("panel-resize-handle");
  const detailPanel = document.getElementById("detail-panel");
  if (!handle || !detailPanel) return;
  let startX, startWidth;
  handle.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    startWidth = detailPanel.offsetWidth;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    function onMove(e2) {
      const dx = startX - e2.clientX;
      const newWidth = Math.max(260, Math.min(600, startWidth + dx));
      detailPanel.style.width = `${newWidth}px`;
      detailPanel.style.flex = "none";
    }
    function onUp() {
      handle.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}
function setupOverflowMenus() {
  const allDropdowns = () => document.querySelectorAll(".overflow-dropdown");
  function closeAll() {
    allDropdowns().forEach((d) => d.classList.add("hidden"));
  }
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
  function bindToggle(btnId, ddId) {
    const btn = document.getElementById(btnId);
    const dd = document.getElementById(ddId);
    if (!btn || !dd) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = dd.classList.contains("hidden");
      closeAll();
      if (opening) dd.classList.remove("hidden");
    });
  }
  function wireItems(ddId) {
    const dd = document.getElementById(ddId);
    if (!dd) return;
    dd.querySelectorAll(".overflow-item[data-for]").forEach((item) => {
      const target = document.getElementById(item.dataset.for);
      if (!target) return;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAll();
        target.click();
      });
      if (target.hasAttribute("disabled") || target.disabled) item.disabled = true;
      new MutationObserver(() => {
        item.disabled = target.disabled;
      }).observe(target, { attributes: true, attributeFilter: ["disabled"] });
    });
  }
  bindToggle("btn-tools-menu", "tools-dropdown");
  wireItems("tools-dropdown");
  bindToggle("btn-grid-actions", "grid-actions-dropdown");
  wireItems("grid-actions-dropdown");
  const gridHeader = document.getElementById("grid-header");
  const gridPanel = document.getElementById("grid-panel");
  if (gridHeader && gridPanel && window.ResizeObserver) {
    let _ghRaf = null;
    const checkGridOverflow = () => {
      _ghRaf = null;
      gridHeader.classList.remove("overflow-active");
      void gridHeader.offsetHeight;
      const headerRight = gridHeader.getBoundingClientRect().right;
      let isOverflowing = false;
      for (const item of gridHeader.querySelectorAll(".grid-action-item")) {
        if (item.offsetParent === null) continue;
        if (item.getBoundingClientRect().right > headerRight + 1) {
          isOverflowing = true;
          break;
        }
      }
      gridHeader.classList.toggle("overflow-active", isOverflowing);
    };
    const scheduleGhCheck = () => {
      if (_ghRaf) return;
      _ghRaf = requestAnimationFrame(checkGridOverflow);
    };
    new ResizeObserver(scheduleGhCheck).observe(gridPanel);
    new MutationObserver(scheduleGhCheck).observe(dom.app, {
      attributes: true,
      attributeFilter: ["class"]
    });
    new MutationObserver(scheduleGhCheck).observe(gridPanel, {
      attributes: true,
      attributeFilter: ["class"]
    });
    scheduleGhCheck();
  }
  bindToggle("btn-fav-menu", "fav-dropdown");
}
let selectedPocketSave = null;
async function openPocketModal() {
  dom.pocketModal.classList.remove("hidden");
  dom.pocketSaveList.innerHTML = '<div class="loading-state"><div class="spinner"></div><div class="loading-text">Scanning for your Analogue Pocket SD card…</div><div class="loading-sub">This can take up to a minute on large cards.</div></div>';
  dom.pocketConfirm.disabled = true;
  selectedPocketSave = null;
  const { saves, unsupported } = await api.detectPocket();
  dom.pocketSaveList.innerHTML = "";
  if (unsupported) {
    dom.pocketSaveList.innerHTML = `<p style="color:var(--text-3);font-size:12px;line-height:1.5;">Your browser can't read the SD card directly. Reading and deleting Analogue Pocket saves needs <strong>Chrome</strong> or <strong>Edge</strong> on desktop (the File System Access API). On Firefox or Safari, drag a <code>.sav</code> / <code>.srm</code> file onto the window instead, or use the desktop app.</p>`;
    return;
  }
  if (saves.length === 0) {
    dom.pocketSaveList.innerHTML = '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">No camera saves found. Make sure your Analogue Pocket SD card is inserted, and that you have run the camera app at least once.</p>';
    return;
  }
  for (const save of saves) {
    if (!save.previewPixels && save.handle) {
      try {
        const file = await save.handle.getFile();
        const buf = new Uint8Array(await file.arrayBuffer());
        save.previewPixels = decodeFirstPhoto(buf);
      } catch (_) {
      }
    }
  }
  const previewPalette = PALETTES.dmg;
  for (const save of saves) {
    const item = document.createElement("div");
    item.className = "save-item";
    const previewWrap = document.createElement("div");
    previewWrap.className = "save-preview-wrap";
    if (save.previewPixels) {
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_WIDTH;
      canvas.height = PHOTO_HEIGHT;
      canvas.className = "save-preview";
      const ctx = canvas.getContext("2d");
      const pixels = save.previewPixels instanceof Uint8Array ? save.previewPixels : new Uint8Array(save.previewPixels);
      renderToCanvas(ctx, pixels, previewPalette, 1);
      previewWrap.appendChild(canvas);
    } else {
      const ph = document.createElement("div");
      ph.className = "save-preview-empty";
      ph.textContent = "?";
      previewWrap.appendChild(ph);
    }
    const info = document.createElement("div");
    info.className = "save-info";
    info.innerHTML = `<span class="save-name">${save.name}</span><span class="save-path">📼 ${save.volume} › ${save.path.split("/").slice(-2).join("/")}</span>`;
    item.appendChild(previewWrap);
    item.appendChild(info);
    if (api.deletePocketSave) {
      const del = document.createElement("button");
      del.className = "save-delete";
      del.title = "Delete this save from the SD card";
      del.textContent = "✕";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        const result = await api.deletePocketSave(save);
        if (!result || result.canceled) return;
        if (result.error) {
          alert("Could not delete save:\n" + result.error);
          return;
        }
        item.remove();
        const idx = saves.indexOf(save);
        if (idx !== -1) saves.splice(idx, 1);
        if (selectedPocketSave === save) {
          selectedPocketSave = null;
          dom.pocketConfirm.disabled = true;
        }
        if (saves.length === 0) {
          dom.pocketSaveList.innerHTML = '<p style="color:var(--text-3);font-size:12px;line-height:1.5;">All camera saves deleted.</p>';
        }
      });
      item.appendChild(del);
    }
    item.addEventListener("click", () => {
      dom.pocketSaveList.querySelectorAll(".save-item").forEach((el) => el.classList.remove("selected"));
      item.classList.add("selected");
      selectedPocketSave = save;
      dom.pocketConfirm.disabled = false;
    });
    dom.pocketSaveList.appendChild(item);
  }
}
function closePocketModal() {
  dom.pocketModal.classList.add("hidden");
}
async function confirmPocketOpen() {
  if (!selectedPocketSave) return;
  closePocketModal();
  const result = await api.readFile(selectedPocketSave);
  await loadSavFile(result);
}
function getPresets() {
  return readJson(STORAGE_KEYS.presets, {});
}
function savePreset(name) {
  if (!name) return;
  const idx = state.selectedIndex;
  const eff = idx !== null ? getEffectiveSettings(idx) : null;
  const src = {
    activeFilters: eff ? [...eff.activeFilters] : [...state.activeFilters],
    filterIntensity: eff ? eff.filterIntensity : state.filterIntensity,
    filterVariant: eff ? eff.filterVariant : state.filterVariant,
    filterParams: JSON.parse(JSON.stringify(eff ? eff.filterParams : state.filterParams)),
    brightness: eff ? eff.brightness : state.brightness,
    contrast: eff ? eff.contrast : state.contrast,
    toneIntensity: eff ? eff.toneIntensity : state.toneIntensity,
    shadowColor: eff ? eff.shadowColor : state.shadowColor,
    highlightColor: eff ? eff.highlightColor : state.highlightColor,
    toneBalance: eff ? eff.toneBalance : state.toneBalance,
    borderId: eff ? eff.borderId : state.borderId,
    borderEnabled: eff ? eff.borderEnabled : state.borderEnabled
  };
  const presets = getPresets();
  presets[name] = src;
  writeJson(STORAGE_KEYS.presets, presets);
  renderPresetList();
  showToast(`Preset "${name}" saved`);
}
function loadPreset(name) {
  const presets = getPresets();
  const p = presets[name];
  if (!p) return;
  const targets = state.selectedPhotos.size > 0 ? [...state.selectedPhotos] : state.selectedIndex !== null ? [state.selectedIndex] : [];
  if (targets.length === 0) {
    showToast("Select a photo first");
    return;
  }
  for (const idx of targets) {
    if (!state.photoSettings[idx]) state.photoSettings[idx] = {};
    const ps = state.photoSettings[idx];
    if (p.activeFilters !== void 0) ps.activeFilters = [...p.activeFilters];
    if (p.filterIntensity !== void 0) ps.filterIntensity = p.filterIntensity;
    if (p.filterVariant !== void 0) ps.filterVariant = p.filterVariant;
    if (p.filterParams) ps.filterParams = JSON.parse(JSON.stringify(p.filterParams));
    if (p.brightness !== void 0) ps.brightness = p.brightness;
    if (p.contrast !== void 0) ps.contrast = p.contrast;
    if (p.toneIntensity !== void 0) ps.toneIntensity = p.toneIntensity;
    if (p.shadowColor !== void 0) ps.shadowColor = p.shadowColor;
    if (p.highlightColor !== void 0) ps.highlightColor = p.highlightColor;
    if (p.toneBalance !== void 0) ps.toneBalance = p.toneBalance;
    if (p.borderId !== void 0) ps.borderId = p.borderId;
    if (p.borderEnabled !== void 0) ps.borderEnabled = p.borderEnabled;
  }
  for (const idx of targets) repaintGridSlot(idx);
  if (state.selectedIndex !== null) {
    syncControlsToEffectiveSettings(state.selectedIndex);
  }
  updateSidebarPreview();
  if (state.viewMode === "solo" && state.selectedIndex !== null)
    renderSoloView(state.selectedIndex);
  const n = targets.length;
  showToast(`Preset "${name}" applied to ${n} photo${n !== 1 ? "s" : ""}`);
}
function deletePreset(name) {
  const presets = getPresets();
  delete presets[name];
  writeJson(STORAGE_KEYS.presets, presets);
  renderPresetList();
}
function renderPresetList() {
  const sel = document.getElementById("preset-select");
  if (!sel) return;
  const presets = getPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  const prev = sel.value;
  sel.innerHTML = '<option value="">— select preset —</option>';
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  if (prev && names.includes(prev)) sel.value = prev;
}
function exportPresets() {
  const presets = getPresets();
  if (Object.keys(presets).length === 0) {
    showToast("No presets to export");
    return;
  }
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mugdump-presets.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${Object.keys(presets).length} preset(s)`);
}
function setupPresetControls() {
  document.getElementById("btn-save-preset")?.addEventListener("click", () => {
    const name = prompt("Preset name:");
    if (name && name.trim()) savePreset(name.trim());
  });
  document.getElementById("btn-load-preset")?.addEventListener("click", () => {
    const sel = document.getElementById("preset-select");
    if (sel?.value) loadPreset(sel.value);
    else showToast("Select a preset first");
  });
  document.getElementById("btn-delete-preset")?.addEventListener("click", () => {
    const sel = document.getElementById("preset-select");
    if (!sel?.value) {
      showToast("Select a preset first");
      return;
    }
    if (confirm(`Delete preset "${sel.value}"?`)) deletePreset(sel.value);
  });
  document.getElementById("btn-export-presets")?.addEventListener("click", exportPresets);
  document.getElementById("btn-import-presets")?.addEventListener("click", () => {
    document.getElementById("preset-import-input")?.click();
  });
  document.getElementById("preset-import-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (typeof imported !== "object" || Array.isArray(imported))
          throw new Error("Invalid format");
        const existing = getPresets();
        const merged = { ...existing, ...imported };
        writeJson(STORAGE_KEYS.presets, merged);
        renderPresetList();
        showToast(`Imported ${Object.keys(imported).length} preset(s)`);
      } catch {
        showToast("Import failed — not a valid preset file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  renderPresetList();
}
function setupTheme() {
  const themeToggleBtn = document.getElementById("theme-toggle");
  function applyTheme(theme) {
    const light = theme === "light";
    document.documentElement.classList.toggle("theme-light", light);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = light ? "☀️" : "🌙";
      themeToggleBtn.title = light ? "Switch to dark theme" : "Switch to light theme";
    }
  }
  applyTheme(readString(STORAGE_KEYS.theme) === "light" ? "light" : "dark");
  themeToggleBtn?.addEventListener("click", () => {
    const nowLight = !document.documentElement.classList.contains("theme-light");
    applyTheme(nowLight ? "light" : "dark");
    writeString(STORAGE_KEYS.theme, nowLight ? "light" : "dark");
  });
}
const PROJECT_VERSION = 1;
const PROJECT_APP = "MugDump";
const PROJECT_SETTING_KEYS = [
  "exportScale",
  "exportFilter",
  "filterIntensity",
  "filterVariant",
  "filterParams",
  "brightness",
  "contrast",
  "toneIntensity",
  "shadowColor",
  "highlightColor",
  "toneBalance",
  "gifDelay",
  "gifLoop",
  "photoSettings",
  "photoTransforms",
  "filterOrder"
];
function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function serializeProject({
  sav,
  filename,
  paletteId,
  settings,
  customPalettes = [],
  recentPalettes = [],
  favPalettes = []
}) {
  const picked = {};
  for (const key of PROJECT_SETTING_KEYS) picked[key] = settings[key];
  return JSON.stringify(
    {
      version: PROJECT_VERSION,
      app: PROJECT_APP,
      filename: filename || "GBCAMERA.sav",
      sav: bytesToBase64(sav),
      settings: { paletteId, ...picked, customPalettes, recentPalettes, favPalettes }
    },
    null,
    2
  );
}
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function parseProject(json) {
  let project;
  try {
    project = JSON.parse(json);
  } catch {
    throw new Error("Invalid project file");
  }
  if (!isObject(project) || project.version !== PROJECT_VERSION || typeof project.sav !== "string") {
    throw new Error("Unrecognised project format");
  }
  let bytes;
  try {
    bytes = base64ToBytes(project.sav);
  } catch {
    throw new Error("Invalid project file");
  }
  if (bytes.length !== SRAM_SIZE) throw new Error("Unrecognised project format");
  const raw = isObject(project.settings) ? project.settings : {};
  const settings = { ...raw };
  for (const key of ["photoSettings", "photoTransforms"]) {
    if (!isObject(raw[key])) {
      delete settings[key];
      continue;
    }
    settings[key] = {};
    for (const [k, v] of Object.entries(raw[key])) {
      const idx = Number.parseInt(k, 10);
      if (Number.isInteger(idx) && isObject(v)) settings[key][idx] = v;
    }
  }
  if (!Array.isArray(raw.filterOrder) || !raw.filterOrder.every((id) => typeof id === "string")) {
    delete settings.filterOrder;
  }
  for (const key of ["customPalettes", "recentPalettes", "favPalettes"]) {
    if (!Array.isArray(raw[key])) delete settings[key];
  }
  return {
    buffer: bytes.buffer,
    filename: typeof project.filename === "string" ? project.filename : null,
    settings
  };
}
function buildProjectJson() {
  return serializeProject({
    sav: state.sav,
    filename: state.filename,
    paletteId: state.palette.id,
    settings: state,
    customPalettes: loadCustomPalettes(),
    recentPalettes: loadRecentPalettes(),
    favPalettes: loadFavPalettes()
  });
}
async function saveProject() {
  if (!state.sav) return;
  const baseName = (state.filename || "gbcamera").replace(/\.sav$/i, "");
  const result = await api.saveProject(buildProjectJson(), `${baseName}.gbcp`);
  if (result) showToast(`Project saved: ${result}`);
}
function applyProjectSettings(s) {
  if (s.paletteId && PALETTES[s.paletteId]) setPalette(s.paletteId);
  if (s.exportScale !== void 0) setExportScale(s.exportScale);
  if (s.exportFilter) {
    setScopedSetting("exportFilter", s.exportFilter);
    repaintGrid();
  }
  if (s.filterIntensity !== void 0) state.filterIntensity = s.filterIntensity;
  if (s.filterVariant) state.filterVariant = s.filterVariant;
  if (s.gifDelay) {
    state.gifDelay = s.gifDelay;
    if (dom.gifDelay) dom.gifDelay.value = s.gifDelay;
    if (dom.gifDelayVal) dom.gifDelayVal.textContent = `${s.gifDelay}ms`;
  }
  if (s.gifLoop) setGifLoop(s.gifLoop);
  if (s.photoSettings) state.photoSettings = s.photoSettings;
  if (s.filterOrder?.length) {
    state.filterOrder = s.filterOrder;
    const accordion = document.getElementById("filter-accordion");
    for (const filterId of s.filterOrder) {
      const item = accordion?.querySelector(`.fi-item[data-filter="${filterId}"]`);
      if (item) accordion.appendChild(item);
    }
  }
  if (s.customPalettes?.length) {
    const existing = loadCustomPalettes();
    const existingIds = new Set(existing.map((p) => p.id));
    const incoming = s.customPalettes.filter((p) => !existingIds.has(p.id));
    if (incoming.length > 0) {
      saveCustomPalettesToStorage([...existing, ...incoming]);
      refreshCustomPalettes();
      rebuildPalettePickerList();
    }
  }
  if (s.recentPalettes) saveRecentPalettes(s.recentPalettes);
  if (s.favPalettes) {
    saveFavPalettes(s.favPalettes);
    renderFavPalettes();
  }
  updateFilterUI();
  repaintGrid();
}
async function openProject() {
  const result = await api.openProject();
  if (!result) return;
  if (result.error) {
    showToast(`Error: ${result.error}`);
    return;
  }
  let project;
  try {
    project = parseProject(result.json);
  } catch (e) {
    showToast(e.message);
    return;
  }
  await loadSavFile({ buffer: project.buffer, name: project.filename || result.name, path: null });
  applyProjectSettings(project.settings);
  showToast(`Project loaded: ${result.name}`);
}
function wireButtons() {
  document.getElementById("btn-open-sav").addEventListener("click", async () => {
    const result = await api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById("btn-open-pocket").addEventListener("click", openPocketModal);
  document.getElementById("btn-develop-albums")?.addEventListener("click", exportSavestateAlbums);
  document.getElementById("btn-home")?.addEventListener("click", () => {
    if (state.photos.length > 0) resetToWelcome();
  });
  document.getElementById("tb-open-sav").addEventListener("click", async () => {
    const result = await api.openSavFile();
    await loadSavFile(result);
  });
  document.getElementById("tb-open-pocket").addEventListener("click", openPocketModal);
  document.querySelectorAll(".scale-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.scale === "custom" ? "custom" : parseInt(btn.dataset.scale);
      setExportScale(val);
    });
  });
  const customWidthInput = document.getElementById("custom-width");
  if (customWidthInput) {
    customWidthInput.addEventListener("input", updateCustomSizeDisplay);
  }
  const thumbSlider = document.getElementById("thumb-size-slider");
  if (thumbSlider) {
    thumbSlider.addEventListener("input", () => setThumbnailSize(parseInt(thumbSlider.value)));
  }
  document.querySelectorAll(".fmt-btn").forEach((btn) => {
    btn.addEventListener("click", () => setExportFormat(btn.dataset.fmt));
  });
  document.querySelectorAll(".btn-copy-effects").forEach((b) => b.addEventListener("click", copyEffects));
  document.querySelectorAll(".btn-paste-effects").forEach((b) => b.addEventListener("click", pasteEffects));
  document.getElementById("btn-reset-effects")?.addEventListener("click", resetEffects);
  const _previewCb = document.getElementById("effects-preview-check");
  if (_previewCb) {
    _previewCb.checked = !state.effectsPreviewMode;
    _previewCb.addEventListener("change", () => {
      state.effectsPreviewMode = !_previewCb.checked;
      repaintGrid();
      if (state.viewMode === "solo" && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }
  document.getElementById("btn-deselect-all")?.addEventListener("click", () => {
    deselectAll();
  });
  document.querySelectorAll(".section-check").forEach((cb) => {
    const section = cb.dataset.section;
    cb.checked = state.sectionEnabled[section] ?? false;
    cb.addEventListener("change", () => setSectionEnabled(section, cb.checked));
  });
  const SECTION_CONTAINERS = {
    exposure: "exposure-controls",
    splitTone: "split-tone-controls",
    effects: "effects-controls"
  };
  for (const [section, contId] of Object.entries(SECTION_CONTAINERS)) {
    const cont = document.getElementById(contId);
    if (!cont) continue;
    const autoEnable = (e) => {
      if (e.target.classList.contains("section-check")) return;
      if (!state.sectionEnabled[section]) setSectionEnabled(section, true);
    };
    cont.addEventListener("input", autoEnable);
    cont.addEventListener("change", autoEnable);
  }
  const borderEnabledCb = document.getElementById("border-enabled-check");
  if (borderEnabledCb) {
    borderEnabledCb.checked = state.borderEnabled ?? false;
    borderEnabledCb.addEventListener("change", () => {
      pushUndo();
      setScopedSetting("borderEnabled", borderEnabledCb.checked);
      repaintGrid();
      if (state.viewMode === "solo" && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }
  const filterScopeCb = document.getElementById("filter-scope-check");
  if (filterScopeCb) {
    filterScopeCb.checked = state.filterScope === "full";
    filterScopeCb.addEventListener("change", () => {
      state.filterScope = filterScopeCb.checked ? "full" : "photo";
      repaintGrid();
      if (state.viewMode === "solo" && state.selectedIndex !== null)
        renderSoloView(state.selectedIndex);
      updateSidebarPreview();
    });
  }
  document.getElementById("btn-view-grid")?.addEventListener("click", enterGridMode);
  document.getElementById("btn-view-solo")?.addEventListener("click", enterSoloMode);
  document.getElementById("solo-prev")?.addEventListener("click", () => soloStep(-1));
  document.getElementById("solo-next")?.addEventListener("click", () => soloStep(1));
  document.getElementById("solo-transforms")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".transform-btn");
    if (!btn || state.selectedIndex === null) return;
    const action = btn.dataset.action;
    if (action === "fullscreen") {
      openPresentation(state.selectedIndex);
      return;
    }
    if (action === "reset-transform") {
      const idx = state.selectedIndex;
      delete state.photoTransforms[idx];
      delete state.photoSettings[idx];
      _repaintAfterTransform(idx);
      syncControlsToEffectiveSettings(idx);
      updateSidebarPreview();
      showToast("Photo reset");
      return;
    }
    applyTransformAction(state.selectedIndex, action);
    _repaintAfterTransform(state.selectedIndex);
  });
  document.getElementById("btn-export-single").addEventListener("click", exportSinglePng);
  document.getElementById("btn-export-all").addEventListener("click", exportBatchPng);
  document.getElementById("btn-export-all-grid")?.addEventListener("click", exportBatchPng);
  document.getElementById("btn-export-gif").addEventListener("click", exportGif);
  document.getElementById("btn-contact-sheet")?.addEventListener("click", exportContactSheet);
  document.getElementById("btn-reset-all")?.addEventListener("click", clearEdits);
  document.getElementById("btn-select-all")?.addEventListener("click", () => {
    state.selectedPhotos.clear();
    state.photos.forEach((p) => {
      if (!p.isEmpty) state.selectedPhotos.add(p.index);
    });
    state.selectedIndex = [...state.selectedPhotos][0] ?? null;
    state.lastSelectedIndex = state.selectedIndex;
    dom.photoGrid.querySelectorAll(".photo-slot:not(.empty)").forEach((el) => el.classList.add("multi-selected"));
    if (state.selectedIndex !== null) syncControlsToEffectiveSettings(state.selectedIndex);
    updateSidebarPreview();
  });
  setupToneControls();
  document.getElementById("tb-export-sav")?.addEventListener("click", exportSav);
  document.getElementById("tb-save-project")?.addEventListener("click", saveProject);
  document.getElementById("tb-open-project")?.addEventListener("click", openProject);
  document.getElementById("tb-reload-sav")?.addEventListener("click", reloadSav);
  dom.presClose?.addEventListener("click", closePresentation);
  dom.presPrev?.addEventListener("click", () => presentationStep(-1));
  dom.presNext?.addEventListener("click", () => presentationStep(1));
  dom.presentationOverlay?.addEventListener("click", (e) => {
    if (e.target === dom.presentationOverlay) closePresentation();
  });
  document.getElementById("btn-palette-grid").addEventListener("click", openPaletteGrid);
  document.getElementById("palette-grid-close").addEventListener("click", closePaletteGrid);
  document.getElementById("btn-random-palette").addEventListener("click", () => {
    const ids = Object.keys(PALETTES);
    const id = ids[Math.floor(Math.random() * ids.length)];
    setPalette(id);
    showToast(`🎲 ${PALETTES[id].name}`);
  });
  document.getElementById("btn-gif-clear")?.addEventListener("click", clearGifFrames);
  document.getElementById("gif-cancel").addEventListener("click", () => {
    setExportFormat("png");
    document.querySelectorAll(".fmt-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.fmt === "png");
    });
  });
  document.querySelectorAll(".gif-loop-btn").forEach((btn) => {
    btn.addEventListener("click", () => setGifLoop(btn.dataset.loop));
  });
  dom.gifDelay.addEventListener("input", () => {
    state.gifDelay = parseInt(dom.gifDelay.value);
    dom.gifDelayVal.textContent = `${state.gifDelay}ms`;
    if (state.gifMode && state.gifSelection.size > 1) updateGifPreview();
  });
  document.getElementById("pocket-cancel").addEventListener("click", closePocketModal);
  document.getElementById("pocket-cancel-2").addEventListener("click", closePocketModal);
  dom.pocketConfirm.addEventListener("click", confirmPocketOpen);
  api.onMenuOpenPocket(() => openPocketModal());
  api.onMenuExportAll(() => {
    if (state.photos.length > 0) exportBatchPng();
  });
}
const DEFAULT_EXPORT_SCALE = 20;
const DEFAULT_THUMBNAIL_PX = 120;
function wireNativeMenu() {
  api.onMenuOpenSav(async () => loadSavFile(await api.openSavFile()));
  api.onMenuOpenPocket(() => openPocketModal());
  api.onMenuExportAll(() => {
    if (state.photos.length > 0) exportBatchPng();
  });
}
function init() {
  document.body.classList.toggle("web", !isElectron);
  const verEl = document.getElementById("app-version");
  if (verEl) verEl.textContent = `${"0.11.0"} `;
  setupTheme();
  buildPaletteBar();
  wireButtons();
  setupPaletteEditor();
  setupPresetControls();
  setupPreviewPanel();
  setupDragDrop();
  setupPanelResize();
  setupSidebarToggle();
  setupOverflowMenus();
  setupKeyboard();
  setupFavCarouselResponsive();
  setupSidebarCollapse();
  setupCollapsibleSections();
  setupFilterAccordion();
  preloadBorderImages();
  setupBorderPicker();
  wireNativeMenu();
  setStatus("No file loaded");
  setExportScale(DEFAULT_EXPORT_SCALE);
  setThumbnailSize(DEFAULT_THUMBNAIL_PX);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
