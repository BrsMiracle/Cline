/**
 * Kestrel 67 —— 入口：装配 3D 键盘、配置界面与交互逻辑。
 * 页面结构为普通 HTML（Hero + 配置面板），只有键盘模型绘制在 Canvas 中。
 */
import './styles.css';
import { getCaseColor, getCapTheme } from './config.js';
import { getState, subscribe } from './store.js';
import { buildKeyboard } from './keyboardModel.js';
import { createScene } from './scene.js';
import { setupTyping, tapCap } from './input.js';
import { setSoundEnabled, playClick } from './sound.js';
import { initUI, syncUI, markRestored } from './ui.js';
import { LAYOUT } from './layout.js';

const state = getState();

// ---- 3D 键盘 ----
const kb = buildKeyboard(
  getCaseColor(state.caseColor).hex,
  getCapTheme(state.capTheme),
);

const sceneApi = createScene(document.getElementById('stage'), kb);
sceneApi.capRecords = kb.capRecords; // 供输入模块查找键位

// ---- 配置界面 ----
initUI({
  onExplodeChange: (on) => sceneApi.setExploded(on),
  onTypingChange: () => syncUI(getState()),
  onSoundChange: (on) => setSoundEnabled(on),
  onResetView: () => sceneApi.resetView(),
  onZoom: (f) => sceneApi.zoomBy(f),
});

// ---- 状态订阅：预览与摘要同步变化 ----
subscribe((s) => {
  kb.applyCaseColor(getCaseColor(s.caseColor).hex);
  kb.applyCapTheme(getCapTheme(s.capTheme));
  setSoundEnabled(s.sound);
  syncUI(s);
});

// ---- 体验模式：物理键盘 ----
setupTyping({
  sceneApi,
  isEnabled: () => getState().typingMode,
});

// ---- 体验模式：点击 / 触摸键帽 ----
sceneApi.setCapPressHandler((key) => {
  tapCap(sceneApi, key.id, getState().sound);
});

// ---- 初始同步 ----
syncUI(getState());
setSoundEnabled(getState().sound);
markRestored(getState());

// 首次交互解锁音频上下文（浏览器自动播放策略）
window.addEventListener('pointerdown', function once() {
  playClick(false);
  window.removeEventListener('pointerdown', once);
}, { once: true });

// 开发期调试句柄
window.__KESTREL__ = { getState, kb, sceneApi, LAYOUT };
