/**
 * 轻量状态管理：单一 store + 订阅通知。
 * 持久化只读写本页面自己的 STORAGE_KEY，绝不触碰其它来源的存储内容。
 */
import { DEFAULTS, STORAGE_KEY } from './config.js';

function sanitize(raw) {
  const s = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    if (typeof raw.caseColor === 'string') s.caseColor = raw.caseColor;
    if (typeof raw.capTheme === 'string') s.capTheme = raw.capTheme;
    if (typeof raw.configName === 'string') s.configName = raw.configName.slice(0, 24);
    if (typeof raw.typingMode === 'boolean') s.typingMode = raw.typingMode;
    if (typeof raw.sound === 'boolean') s.sound = raw.sound;
    // exploded 不持久化：刷新后始终以完整组装状态呈现产品
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, restored: false };
    return { ...sanitize(JSON.parse(raw)), restored: true };
  } catch {
    return { ...DEFAULTS, restored: false };
  }
}

const state = load();
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  persist();
  emit();
}

/** 恢复默认：仅移除本页面自己的存储键 */
export function resetConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略隐私模式等场景 */
  }
  Object.assign(state, DEFAULTS, { restored: false });
  emit();
}

function persist() {
  try {
    const { caseColor, capTheme, configName, typingMode, sound } = state;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ caseColor, capTheme, configName, typingMode, sound, savedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function saveNow() {
  return persist();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(state));
}
