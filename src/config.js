/**
 * 主题定义与默认状态。
 * 三种外壳配色 × 三种键帽主题，任意组合共 9 种外观。
 */

export const STORAGE_KEY = 'mimo26-flash.config.v1';

/** 三种外壳配色（底壳材质） */
export const CASE_COLORS = [
  {
    id: 'space-grey',
    name: '深空灰',
    hex: 0x4a4d55,
    css: '#4a4d55',
    desc: '阳极氧化喷砂 · 经典灰',
  },
  {
    id: 'moonlight-silver',
    name: '月光银',
    hex: 0xd6d9de,
    css: '#d6d9de',
    desc: '细腻亮面 · 铝原色',
  },
  {
    id: 'lava-orange',
    name: '熔岩橙',
    hex: 0xd95b2a,
    css: '#d95b2a',
    desc: '高饱和烤漆 · 限定色',
  },
];

/**
 * 三种键帽主题。
 * base: 主键区底色; accent: Esc/回车/空格/方向键点缀色; legend: 字符颜色。
 */
export const CAP_THEMES = [
  {
    id: 'carbon-ember',
    name: '碳墨橙迹',
    base: 0x2b2d31,
    accent: 0xff7a45,
    legend: 0xf2f2f0,
    legendAccent: 0x1c1d20,
    css: '#2b2d31',
    accentCss: '#ff7a45',
    desc: '炭黑键帽 × 品牌橙点缀',
  },
  {
    id: 'cream-retro',
    name: '奶油复古',
    base: 0xe7e0d1,
    accent: 0x3fa7a0,
    legend: 0x35322b,
    legendAccent: 0xffffff,
    css: '#e7e0d1',
    accentCss: '#3fa7a0',
    desc: '奶油白 × 复古青点缀',
  },
  {
    id: 'polar-mist',
    name: '极地雾蓝',
    base: 0xc9d3e0,
    accent: 0x3b6ea5,
    legend: 0x2a3550,
    legendAccent: 0xffffff,
    css: '#c9d3e0',
    accentCss: '#3b6ea5',
    desc: '雾面浅蓝 × 深海蓝点缀',
  },
];

/** 默认状态（“恢复默认”即回到这里，同时只清除本页面自己的存储键） */
export const DEFAULTS = Object.freeze({
  caseColor: 'space-grey',
  capTheme: 'carbon-ember',
  configName: '',
  typingMode: true,
  sound: true,
  exploded: false,
});

export const getCaseColor = (id) =>
  CASE_COLORS.find((c) => c.id === id) || CASE_COLORS[0];

export const getCapTheme = (id) =>
  CAP_THEMES.find((t) => t.id === id) || CAP_THEMES[0];
