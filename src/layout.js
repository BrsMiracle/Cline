/**
 * 紧凑配列定义：五行 × 67 键。
 * w 以 1u（一个 1 宽键位）为单位；x 为该行内的累计偏移，稍后整体居中。
 * legend 为键帽上绘制的字符；code 对应 KeyboardEvent.code（体验模式映射用）。
 *
 * 行宽校验（每行合计 16u）：
 *   行0: 13×1 + 2 + 1 = 16
 *   行1: 1.5 + 12×1 + 1.5 + 1 = 16
 *   行2: 1.75 + 11×1 + 2.25 + 1 = 16
 *   行3: 2.25 + 10×1 + 1.75 + 1 + 1 = 16
 *   行4: 1.5 + 1.25 + 1.25 + 6.25 + 1.25 + 1.5 + 3×1 = 16
 */

const ROWS = [
  // 行 0 —— 数字行
  [
    ['`', 1, 'Backquote'],
    ['1', 1, 'Digit1'],
    ['2', 1, 'Digit2'],
    ['3', 1, 'Digit3'],
    ['4', 1, 'Digit4'],
    ['5', 1, 'Digit5'],
    ['6', 1, 'Digit6'],
    ['7', 1, 'Digit7'],
    ['8', 1, 'Digit8'],
    ['9', 1, 'Digit9'],
    ['0', 1, 'Digit0'],
    ['-', 1, 'Minus'],
    ['=', 1, 'Equal'],
    ['Backspace', 2, 'Backspace'],
    ['Del', 1, 'Delete'],
  ],
  // 行 1 —— Q 行
  [
    ['Tab', 1.5, 'Tab'],
    ['Q', 1, 'KeyQ'],
    ['W', 1, 'KeyW'],
    ['E', 1, 'KeyE'],
    ['R', 1, 'KeyR'],
    ['T', 1, 'KeyT'],
    ['Y', 1, 'KeyY'],
    ['U', 1, 'KeyU'],
    ['I', 1, 'KeyI'],
    ['O', 1, 'KeyO'],
    ['P', 1, 'KeyP'],
    ['[', 1, 'BracketLeft'],
    [']', 1, 'BracketRight'],
    ['\\', 1.5, 'Backslash'],
    ['Home', 1, 'Home'],
  ],
  // 行 2 —— A 行
  [
    ['Caps', 1.75, 'CapsLock'],
    ['A', 1, 'KeyA'],
    ['S', 1, 'KeyS'],
    ['D', 1, 'KeyD'],
    ['F', 1, 'KeyF'],
    ['G', 1, 'KeyG'],
    ['H', 1, 'KeyH'],
    ['J', 1, 'KeyJ'],
    ['K', 1, 'KeyK'],
    ['L', 1, 'KeyL'],
    [';', 1, 'Semicolon'],
    ["'", 1, 'Quote'],
    ['Enter', 2.25, 'Enter'],
    ['PgUp', 1, 'PageUp'],
  ],
  // 行 3 —— Z 行
  [
    ['Shift', 2.25, 'ShiftLeft'],
    ['Z', 1, 'KeyZ'],
    ['X', 1, 'KeyX'],
    ['C', 1, 'KeyC'],
    ['V', 1, 'KeyV'],
    ['B', 1, 'KeyB'],
    ['N', 1, 'KeyN'],
    ['M', 1, 'KeyM'],
    [',', 1, 'Comma'],
    ['.', 1, 'Period'],
    ['/', 1, 'Slash'],
    ['Shift', 1.75, 'ShiftRight'],
    ['↑', 1, 'ArrowUp'],
    ['PgDn', 1, 'PageDown'],
  ],
  // 行 4 —— 空格行（含 ← ↓ →）
  [
    ['Ctrl', 1.5, 'ControlLeft'],
    ['Win', 1.25, 'MetaLeft'],
    ['Alt', 1.25, 'AltLeft'],
    ['', 6.25, 'Space'],
    ['Alt', 1.25, 'AltRight'],
    ['Fn', 1.5, 'Fn'],
    ['←', 1, 'ArrowLeft'],
    ['↓', 1, 'ArrowDown'],
    ['→', 1, 'ArrowRight'],
  ],
];

/** 点缀键 legend（走 accent 配色） */
const ACCENT_LEGENDS = new Set(['Esc', 'Enter', '↑', '←', '↓', '→']);

const ROW_WIDTH = 16;
const ROWS_COUNT = ROWS.length;

/**
 * 生成扁平键位列表。
 * 坐标系：x 向右，z 向前（行 0 在最后 / z 最小），单位 = 1u。
 */
export function buildKeys() {
  const keys = [];
  ROWS.forEach((row, r) => {
    let cursor = 0;
    row.forEach(([legend, w, code]) => {
      const cx = cursor + w / 2 - ROW_WIDTH / 2;
      const cz = r - (ROWS_COUNT - 1) / 2;
      const isSpace = code === 'Space';
      const isAccent = ACCENT_LEGENDS.has(legend) || isSpace;
      keys.push({
        id: `${code}-${keys.length}`,
        legend,
        w,
        code,
        x: cx,
        z: cz,
        row: r,
        accent: isAccent,
        // 字母键与空格参与“体验模式”的真实键盘触发
        typeable:
          (code.startsWith('Key') && code.length === 4) || code === 'Space',
      });
      cursor += w;
    });
  });
  return keys;
}

export const LAYOUT = {
  width: ROW_WIDTH, // 16u
  rows: ROWS_COUNT,
  keyCount: ROWS.reduce((n, row) => n + row.length, 0), // 67
  unit: 1,
  pitch: 1, // 键距 1u
  gap: 0.08, // 键帽间隙
};
