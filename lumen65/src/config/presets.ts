/**
 * LUMEN 65 — product data: layout definition, case finishes, keycap themes.
 * Pure data + tiny helpers, shared by the 3D model builder and the React UI.
 */

export type KeyKind = 'std' | 'mod' | 'accent' | 'arrow';

export interface KeyDef {
  /** stable id, also used as the DOM/three object name */
  id: string;
  /** main legend line */
  label: string;
  /** shifted legend line (drawn above `label`) */
  labelTop?: string;
  /** key width in units (1u = 19.05mm) */
  w: number;
  /** row index: 0 = back (number row) … 4 = front row */
  row: number;
  /** centre of the key along the width axis */
  x: number;
  /** centre of the key along the depth axis (in units, 0 = middle of the board) */
  z: number;
  /** KeyboardEvent.code used by the typing-experience mode */
  code?: string;
  kind: KeyKind;
  /** wide keys render their legend as a horizontal text label */
  wide?: boolean;
}

/* ------------------------------------------------------------------ layout */

/** distance between key centres, in units */
export const PITCH = 1;
/** gap between neighbouring keycaps, in units */
export const GAP = 0.055;
/** per-row keycap depth (real keycap profiles are sculpted per row) */
export const ROW_DEPTH = [0.965, 0.97, 0.98, 0.99, 0.99];
/** per-row keycap height */
export const ROW_HEIGHT = [0.52, 0.5, 0.47, 0.45, 0.47];
/** per-row keycap tilt (radians, relative to the mounting plate) */
export const ROW_TILT = [-4.5, -2, 0, 2.4, 4].map((d) => (d * Math.PI) / 180);

type KeySpec = [label: string, w: number, code: string | undefined, kind: KeyKind, wide?: boolean];

/** compact 65% layout — 5 rows, 15u wide */
const rows: KeySpec[][] = [
  // row 0 — function / number row
  [
    ['Esc', 1, 'Escape', 'accent'],
    ['1', 1, 'Digit1', 'std'],
    ['2', 1, 'Digit2', 'std'],
    ['3', 1, 'Digit3', 'std'],
    ['4', 1, 'Digit4', 'std'],
    ['5', 1, 'Digit5', 'std'],
    ['6', 1, 'Digit6', 'std'],
    ['7', 1, 'Digit7', 'std'],
    ['8', 1, 'Digit8', 'std'],
    ['9', 1, 'Digit9', 'std'],
    ['0', 1, 'Digit0', 'std'],
    ['-', 1, 'Minus', 'std'],
    ['+', 1, 'Equal', 'std'],
    ['Backspace', 2, 'Backspace', 'mod', true],
  ],
  // row 1 — qwerty
  [
    ['Tab', 1.5, 'Tab', 'mod', true],
    ['Q', 1, 'KeyQ', 'std'],
    ['W', 1, 'KeyW', 'std'],
    ['E', 1, 'KeyE', 'std'],
    ['R', 1, 'KeyR', 'std'],
    ['T', 1, 'KeyT', 'std'],
    ['Y', 1, 'KeyY', 'std'],
    ['U', 1, 'KeyU', 'std'],
    ['I', 1, 'KeyI', 'std'],
    ['O', 1, 'KeyO', 'std'],
    ['P', 1, 'KeyP', 'std'],
    ['[', 1, 'BracketLeft', 'std'],
    [']', 1, 'BracketRight', 'std'],
    ['\\', 1.5, 'Backslash', 'mod'],
  ],
  // row 2 — home row
  [
    ['Caps', 1.75, 'CapsLock', 'mod', true],
    ['A', 1, 'KeyA', 'std'],
    ['S', 1, 'KeyS', 'std'],
    ['D', 1, 'KeyD', 'std'],
    ['F', 1, 'KeyF', 'std'],
    ['G', 1, 'KeyG', 'std'],
    ['H', 1, 'KeyH', 'std'],
    ['J', 1, 'KeyJ', 'std'],
    ['K', 1, 'KeyK', 'std'],
    ['L', 1, 'KeyL', 'std'],
    [';', 1, 'Semicolon', 'std'],
    ["'", 1, 'Quote', 'std'],
    ['Enter', 2.25, 'Enter', 'accent', true],
  ],
  // row 3 — bottom letter row + up arrow
  [
    ['Shift', 2.25, 'ShiftLeft', 'mod', true],
    ['Z', 1, 'KeyZ', 'std'],
    ['X', 1, 'KeyX', 'std'],
    ['C', 1, 'KeyC', 'std'],
    ['V', 1, 'KeyV', 'std'],
    ['B', 1, 'KeyB', 'std'],
    ['N', 1, 'KeyN', 'std'],
    ['M', 1, 'KeyM', 'std'],
    [',', 1, 'Comma', 'std'],
    ['.', 1, 'Period', 'std'],
    ['/', 1, 'Slash', 'std'],
    ['Shift', 1.75, 'ShiftRight', 'mod', true],
    ['↑', 1, 'ArrowUp', 'arrow'],
  ],
  // row 4 — bottom row + arrow cluster
  [
    ['Ctrl', 1.25, 'ControlLeft', 'mod', true],
    ['Win', 1.25, 'MetaLeft', 'mod', true],
    ['Alt', 1.25, 'AltLeft', 'mod', true],
    ['', 6.25, 'Space', 'mod'],
    ['Alt', 1, 'AltRight', 'mod', true],
    ['Fn', 1, 'Fn', 'mod', true],
    ['←', 1, 'ArrowLeft', 'arrow'],
    ['↓', 1, 'ArrowDown', 'arrow'],
    ['→', 1, 'ArrowRight', 'arrow'],
  ],
];

/** two-line legends for the number / punctuation rows, keyed by key label */
const shiftedLegends: Record<string, string> = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|',
  ';': ':', "'": '"', ',': '<', '.': '>', '/': '?',
};

export const KEYS: KeyDef[] = (() => {
  const out: KeyDef[] = [];
  const rowWidth = 15;
  rows.forEach((spec, row) => {
    let x = -rowWidth / 2; // centre the key block on x = 0
    spec.forEach(([label, w, code, kind, wide]) => {
      out.push({
        id: `${row}-${label || 'space'}`,
        label,
        labelTop: shiftedLegends[label],
        w,
        row,
        x: x + w / 2,
        z: (row - 2) * PITCH,
        code,
        kind,
        wide,
      });
      x += w;
    });
  });
  return out;
})();

/* ------------------------------------------------------------------ colors */

export interface Finish {
  id: string;
  name: string;
  nameEn: string;
  body: number;
  /** inner tray / recess tone */
  tray: number;
  /** accent metal for the knob ring + badge */
  accent: number;
  metalness: number;
  roughness: number;
  swatch: string;
}

export const FINISHES: Finish[] = [
  {
    id: 'aurora',
    name: '曜银',
    nameEn: 'Aurora Silver',
    body: 0xcbd1da,
    tray: 0x9aa3b0,
    accent: 0x7f8a9c,
    metalness: 0.95,
    roughness: 0.26,
    swatch: 'linear-gradient(140deg,#f2f5fa 0%,#ccd3dd 45%,#9aa3b0 100%)',
  },
  {
    id: 'graphite',
    name: '石墨黑',
    nameEn: 'Graphite',
    body: 0x30343c,
    tray: 0x1e2126,
    accent: 0x8d97a6,
    metalness: 0.82,
    roughness: 0.38,
    swatch: 'linear-gradient(140deg,#5b636f 0%,#33373f 45%,#171a1e 100%)',
  },
  {
    id: 'twilight',
    name: '暮光紫',
    nameEn: 'Twilight Violet',
    body: 0x6f62d6,
    tray: 0x4a3f9c,
    accent: 0xd7d1ff,
    metalness: 0.86,
    roughness: 0.3,
    swatch: 'linear-gradient(140deg,#a99cfb 0%,#6f62d6 45%,#40348f 100%)',
  },
];

export interface KeycapTheme {
  id: string;
  name: string;
  nameEn: string;
  /** base alpha keys */
  base: number;
  /** modifiers (Tab / Caps / Shift / Ctrl / space …) */
  mod: number;
  /** highlight keys (Esc / Enter) */
  accent: number;
  legendBase: string;
  legendMod: string;
  legendAccent: string;
  roughness: number;
  swatch: string;
}

export const THEMES: KeycapTheme[] = [
  {
    id: 'nightfall',
    name: '极夜',
    nameEn: 'Nightfall PBT',
    base: 0x23272f,
    mod: 0x171a20,
    accent: 0x2f6df6,
    legendBase: '#e8eef7',
    legendMod: '#9fb0c6',
    legendAccent: '#f3f8ff',
    roughness: 0.6,
    swatch: 'linear-gradient(135deg,#3a4150 0%,#23272f 55%,#12151a 100%)',
  },
  {
    id: 'mist',
    name: '云白',
    nameEn: 'Mist PBT',
    base: 0xeff2f7,
    mod: 0xd6dce6,
    accent: 0x5566ff,
    legendBase: '#262b36',
    legendMod: '#3c4453',
    legendAccent: '#ffffff',
    roughness: 0.55,
    swatch: 'linear-gradient(135deg,#ffffff 0%,#e6ebf3 55%,#c3cbd8 100%)',
  },
  {
    id: 'ember',
    name: '曜橙',
    nameEn: 'Ember Retro',
    base: 0xe7d9c2,
    mod: 0x44504e,
    accent: 0xd06a33,
    legendBase: '#3b332a',
    legendMod: '#e9dcc5',
    legendAccent: '#fff4e4',
    roughness: 0.64,
    swatch: 'linear-gradient(135deg,#f3e8d4 0%,#d9c6a5 55%,#44504e 100%)',
  },
];

export interface ProductConfig {
  finishId: string;
  /** custom text printed on the space bar */
  spaceText: string;
  themeId: string;
  exploded: boolean;
  typingMode: boolean;
  sound: boolean;
}

export const DEFAULT_CONFIG: ProductConfig = {
  finishId: FINISHES[0].id,
  spaceText: 'LUMEN 65',
  themeId: THEMES[0].id,
  exploded: false,
  typingMode: false,
  sound: true,
};

export const getFinish = (id: string): Finish =>
  FINISHES.find((f) => f.id === id) ?? FINISHES[0];
export const getTheme = (id: string): KeycapTheme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];


export const LAYOUT_META = {
  name: '65%',
  keyCount: KEYS.length,
  widthU: 15,
  rows: 5,
};
