/**
 * The .gbcp project file format (version 1): the raw 128 KB save as base64
 * plus every global and per-photo setting. Pure functions, unit-tested.
 */
import { SRAM_SIZE } from '../core/gbcam.js';

export const PROJECT_VERSION = 1;
export const PROJECT_APP = 'MugDump';

/** Keys of `state` that a project carries verbatim. */
export const PROJECT_SETTING_KEYS = [
  'exportScale',
  'exportFilter',
  'filterIntensity',
  'filterVariant',
  'filterParams',
  'brightness',
  'contrast',
  'toneIntensity',
  'shadowColor',
  'highlightColor',
  'toneBalance',
  'gifDelay',
  'gifLoop',
  'photoSettings',
  'photoTransforms',
  'filterOrder',
];

export function bytesToBase64(bytes) {
  let binary = '';
  // Chunked to stay well under the argument-count limit of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Build the JSON text of a project.
 * @param {{ sav: Uint8Array, filename?: string, paletteId: string, settings: object,
 *           customPalettes?: object[], recentPalettes?: string[], favPalettes?: string[] }} input
 */
export function serializeProject({
  sav,
  filename,
  paletteId,
  settings,
  customPalettes = [],
  recentPalettes = [],
  favPalettes = [],
}) {
  const picked = {};
  for (const key of PROJECT_SETTING_KEYS) picked[key] = settings[key];
  return JSON.stringify(
    {
      version: PROJECT_VERSION,
      app: PROJECT_APP,
      filename: filename || 'GBCAMERA.sav',
      sav: bytesToBase64(sav),
      settings: { paletteId, ...picked, customPalettes, recentPalettes, favPalettes },
    },
    null,
    2,
  );
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Parse and validate project JSON.
 * @returns {{ buffer: ArrayBuffer, filename: string|null, settings: Record<string, any> }}
 * @throws {Error} 'Invalid project file' | 'Unrecognised project format'
 */
export function parseProject(json) {
  let project;
  try {
    project = JSON.parse(json);
  } catch {
    throw new Error('Invalid project file');
  }
  if (
    !isObject(project) ||
    project.version !== PROJECT_VERSION ||
    typeof project.sav !== 'string'
  ) {
    throw new Error('Unrecognised project format');
  }
  let bytes;
  try {
    bytes = base64ToBytes(project.sav);
  } catch {
    throw new Error('Invalid project file');
  }
  if (bytes.length !== SRAM_SIZE) throw new Error('Unrecognised project format');

  const raw = isObject(project.settings) ? project.settings : {};
  const settings = { ...raw };
  // JSON object keys are strings; per-photo maps are indexed by photo number.
  for (const key of ['photoSettings', 'photoTransforms']) {
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
  if (!Array.isArray(raw.filterOrder) || !raw.filterOrder.every((id) => typeof id === 'string')) {
    delete settings.filterOrder;
  }
  for (const key of ['customPalettes', 'recentPalettes', 'favPalettes']) {
    if (!Array.isArray(raw[key])) delete settings[key];
  }

  return {
    buffer: bytes.buffer,
    filename: typeof project.filename === 'string' ? project.filename : null,
    settings,
  };
}
