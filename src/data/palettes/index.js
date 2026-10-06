/**
 * The live palette registry.
 *
 * Built-in palettes are merged at load time; user palettes (flagged `custom`)
 * are added and removed by app/palette-store.js. Every entry has the shape
 * { id, name, group, colors: [lightest, light, dark, darkest] }.
 */
import { BASE_PALETTES } from './base.js';
import { EXTENDED_PALETTES } from './extended.js';

export const PALETTES = { ...BASE_PALETTES, ...EXTENDED_PALETTES };
