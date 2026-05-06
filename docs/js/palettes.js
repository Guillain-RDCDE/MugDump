/**
 * palettes.js — GB Camera palette definitions
 *
 * colors[0] = lightest (pixel value 0 from the 2bpp decoder)
 * colors[3] = darkest  (pixel value 3)
 *
 * group:
 *   'hardware' — based on real GB/GBC hardware screens
 *   'gbc'      — the 12 official Nintendo GBC bootstrap ROM palettes (BG layer),
 *                activated by button combos at GBC startup. Hex values sourced from
 *                The Cutting Room Floor (tcrf.net/Notes:Game_Boy_Color_Bootstrap_ROM).
 *                These are the reference palettes used by Analogue Pocket, SameBoy, etc.
 *   'artistic' — aesthetic/creative palettes
 */

window.PALETTES = {

  // ── GB Hardware ─────────────────────────────────────────────────────────────

  dmg: {
    id: 'dmg',
    name: 'DMG Green',
    group: 'hardware',
    colors: ['#9BBC0F', '#8BAC0F', '#306230', '#0F380F'],
  },
  pocket: {
    id: 'pocket',
    name: 'GB Pocket',
    group: 'hardware',
    colors: ['#C4CFA1', '#8B956D', '#4D533C', '#1F1F1F'],
  },
  light: {
    id: 'light',
    name: 'GB Light',
    group: 'hardware',
    colors: ['#FFFFFF', '#B8D0C8', '#6B9080', '#1A2E2A'],
  },
  printer: {
    id: 'printer',
    name: 'GB Printer',
    group: 'hardware',
    colors: ['#F8F8E8', '#C0C0A8', '#606060', '#101010'],
  },
  gbcam_gold: {
    id: 'gbcam_gold',
    name: 'Pocket Camera (JP)',
    group: 'hardware',
    colors: ['#FFFFFF', '#FFCE00', '#9C6300', '#000000'],
  },
  gbcam_red: {
    id: 'gbcam_red',
    name: 'Game Boy Camera Gold (US)',
    group: 'hardware',
    colors: ['#FFFFFF', '#FF8484', '#943A3A', '#000000'],
  },

  // ── GBC Official (Nintendo bootstrap ROM, BG palette) ──────────────────────
  // Button combo reference: hold at GBC startup while the logo displays.

  gbc_up: {
    id: 'gbc_up',
    name: 'GBC Brown (↑)',
    group: 'gbc',
    colors: ['#FFFFFF', '#FFAD63', '#843100', '#000000'],
  },
  gbc_a_up: {
    id: 'gbc_a_up',
    name: 'GBC Red (A+↑)',
    group: 'gbc',
    colors: ['#FFFFFF', '#FF8484', '#943A3A', '#000000'],
  },
  gbc_b_up: {
    id: 'gbc_b_up',
    name: 'GBC Tan (B+↑)',
    group: 'gbc',
    colors: ['#FFE6C5', '#CE9C84', '#846B29', '#5A3108'],
  },
  gbc_left: {
    id: 'gbc_left',
    name: 'GBC Blue (←)',
    group: 'gbc',
    colors: ['#FFFFFF', '#63A5FF', '#0000FF', '#000000'],
  },
  gbc_a_left: {
    id: 'gbc_a_left',
    name: 'GBC Indigo (A+←)',
    group: 'gbc',
    colors: ['#FFFFFF', '#8C8CDE', '#52528C', '#000000'],
  },
  gbc_b_left: {
    id: 'gbc_b_left',
    name: 'GBC Gray (B+←)',
    group: 'gbc',
    colors: ['#FFFFFF', '#A5A5A5', '#525252', '#000000'],
  },
  gbc_down: {
    id: 'gbc_down',
    name: 'GBC Pastel (↓)',
    group: 'gbc',
    colors: ['#FFFFA5', '#FF9494', '#9494FF', '#000000'],
  },
  gbc_a_down: {
    id: 'gbc_a_down',
    name: 'GBC Fire (A+↓)',
    group: 'gbc',
    colors: ['#FFFFFF', '#FFFF00', '#FF0000', '#000000'],
  },
  gbc_b_down: {
    id: 'gbc_b_down',
    name: 'GBC Gold (B+↓)',
    group: 'gbc',
    colors: ['#FFFFFF', '#FFFF00', '#7B4A00', '#000000'],
  },
  gbc_right: {
    id: 'gbc_right',
    name: 'GBC Neon (→)',
    group: 'gbc',
    colors: ['#FFFFFF', '#52FF00', '#FF4200', '#000000'],
  },
  gbc_a_right: {
    id: 'gbc_a_right',
    name: 'GBC Teal (A+→)',
    group: 'gbc',
    colors: ['#FFFFFF', '#7BFF31', '#0063C5', '#000000'],
  },
  gbc_b_right: {
    id: 'gbc_b_right',
    name: 'GBC Dark (B+→)',
    group: 'gbc',
    colors: ['#000000', '#008484', '#FFDE00', '#FFFFFF'],
  },

  // ── Community (lospec.com — verified hex values from API) ──────────────────
  // Colors sorted lightest → darkest (perceived luminance).
  // Credit: individual palette authors on lospec.com

  kirokaze: {
    id: 'kirokaze', name: 'Kirokaze Gameboy', group: 'community',
    credit: 'Kirokaze', creditUrl: 'https://lospec.com/palette-list/kirokaze-gameboy',
    colors: ['#e2f3e4', '#94e344', '#46878f', '#332c50'],
  },
  ice_cream: {
    id: 'ice_cream', name: 'Ice Cream GB', group: 'community',
    credit: 'Kerrie Lake', creditUrl: 'https://lospec.com/palette-list/ice-cream-gb',
    colors: ['#fff6d3', '#f9a875', '#eb6b6f', '#7c3f58'],
  },
  mist_gb: {
    id: 'mist_gb', name: 'Mist GB', group: 'community',
    credit: 'Kerrie Lake', creditUrl: 'https://lospec.com/palette-list/mist-gb',
    colors: ['#c4f0c2', '#5ab9a8', '#1e606e', '#2d1b00'],
  },
  hollow: {
    id: 'hollow', name: 'Hollow', group: 'community',
    credit: 'Poltergasm', creditUrl: 'https://lospec.com/palette-list/hollow',
    colors: ['#fafbf6', '#c6b7be', '#565a75', '#0f0f1b'],
  },
  nostalgia: {
    id: 'nostalgia', name: 'Nostalgia', group: 'community',
    credit: 'WildLeoKnight', creditUrl: 'https://lospec.com/palette-list/nostalgia',
    colors: ['#d0d058', '#a0a840', '#708028', '#405010'],
  },
  spacehaze: {
    id: 'spacehaze', name: 'Spacehaze', group: 'community',
    credit: 'WildLeoKnight', creditUrl: 'https://lospec.com/palette-list/spacehaze',
    colors: ['#f8e3c4', '#cc3495', '#6b1fb1', '#0b0630'],
  },
  velvet_cherry: {
    id: 'velvet_cherry', name: 'Velvet Cherry', group: 'community',
    credit: 'Klafooty', creditUrl: 'https://lospec.com/palette-list/velvet-cherry-gb',
    colors: ['#9775a6', '#683a68', '#412752', '#2d162c'],
  },
  rustic_gb: {
    id: 'rustic_gb', name: 'Rustic GB', group: 'community',
    credit: 'Kerrie Lake', creditUrl: 'https://lospec.com/palette-list/rustic-gb',
    colors: ['#edb4a1', '#a96868', '#764462', '#2c2137'],
  },
  demichrome: {
    id: 'demichrome', name: '2bit Demichrome', group: 'community',
    credit: 'Space Sandwich', creditUrl: 'https://lospec.com/palette-list/2bit-demichrome',
    colors: ['#e9efec', '#a0a08b', '#555568', '#211e20'],
  },
  crimson: {
    id: 'crimson', name: 'Crimson', group: 'community',
    credit: 'WildLeoKnight', creditUrl: 'https://lospec.com/palette-list/crimson',
    colors: ['#eff9d6', '#ba5044', '#7a1c4b', '#1b0326'],
  },
  links_awakening: {
    id: 'links_awakening', name: "Link's Awakening SGB", group: 'community',
    credit: 'Lospec', creditUrl: 'https://lospec.com/palette-list/links-awakening-sgb',
    colors: ['#ffffb5', '#7bc67b', '#6b8c42', '#5a3921'],
  },
  pokemon_sgb: {
    id: 'pokemon_sgb', name: 'Pokémon SGB', group: 'community',
    credit: 'Lospec', creditUrl: 'https://lospec.com/palette-list/pokemon-sgb',
    colors: ['#ffefff', '#f7b58c', '#84739c', '#181010'],
  },
  blk_aqu4: {
    id: 'blk_aqu4', name: 'BLK AQU4', group: 'community',
    credit: 'BurakoIRL', creditUrl: 'https://lospec.com/palette-list/blk-aqu4',
    colors: ['#9ff4e5', '#00b9be', '#005f8c', '#002b59'],
  },

  // ── Artistic ────────────────────────────────────────────────────────────────

  grayscale: {
    id: 'grayscale',
    name: 'Grayscale',
    group: 'artistic',
    colors: ['#FFFFFF', '#AAAAAA', '#555555', '#000000'],
  },
  inverted: {
    id: 'inverted',
    name: 'Inverted',
    group: 'artistic',
    colors: ['#000000', '#555555', '#AAAAAA', '#FFFFFF'],
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    group: 'artistic',
    colors: ['#F5E6C8', '#C8A878', '#7D5A3C', '#3B2507'],
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber',
    group: 'artistic',
    colors: ['#E0FFE0', '#00FF00', '#007700', '#001100'],
  },
};

// Helper: get palette as [[r,g,b], ...] for GIF encoding
window.paletteToRGB = function(palette) {
  return palette.colors.map(hex => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  });
};
