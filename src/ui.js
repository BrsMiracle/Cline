/**
 * 配置界面：全部为普通 HTML 控件（非 Canvas 绘制），
 * 负责渲染选项、同步摘要、保存 / 恢复默认。
 */
import { CASE_COLORS, CAP_THEMES, getCaseColor, getCapTheme } from './config.js';
import { setState, resetConfig, saveNow, getState } from './store.js';
import { LAYOUT } from './layout.js';

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--show'), 2200);
}

/** 渲染三种外壳配色按钮 */
function renderCaseSwatches() {
  const box = $('case-swatches');
  box.innerHTML = '';
  CASE_COLORS.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = c.id;
    btn.title = c.desc;
    btn.innerHTML = '<span class="swatch__dot" style="background:' + c.css + '"></span>' +
      '<span class="swatch__name">' + c.name + '</span>';
    btn.addEventListener('click', () => setState({ caseColor: c.id }));
    box.appendChild(btn);
  });
}

/** 渲染三种键帽主题卡片 */
function renderCapThemes() {
  const box = $('cap-themes');
  box.innerHTML = '';
  CAP_THEMES.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cap-card';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = t.id;
    btn.title = t.desc;
    btn.innerHTML =
      '<span class="cap-card__keys">' +
      '<i style="background:' + t.css + '"></i>' +
      '<i style="background:' + t.css + '"></i>' +
      '<i class="cap-card__accent" style="background:' + t.accentCss + '"></i>' +
      '</span>' +
      '<span class="cap-card__name">' + t.name + '</span>' +
      '<span class="cap-card__desc">' + t.desc + '</span>';
    btn.addEventListener('click', () => setState({ capTheme: t.id }));
    box.appendChild(btn);
  });
}

/** 高亮当前选中项 + 刷新文案与摘要 */
export function syncUI(state, opts = {}) {
  const cse = getCaseColor(state.caseColor);
  const cap = getCapTheme(state.capTheme);

  document.querySelectorAll('.swatch').forEach((el) => {
    const on = el.dataset.id === state.caseColor;
    el.classList.toggle('swatch--on', on);
    el.setAttribute('aria-checked', on);
  });
  document.querySelectorAll('.cap-card').forEach((el) => {
    const on = el.dataset.id === state.capTheme;
    el.classList.toggle('cap-card--on', on);
    el.setAttribute('aria-checked', on);
  });

  $('case-name').textContent = cse.name;
  $('cap-name').textContent = cap.name;
  $('sum-case').textContent = cse.name;
  $('sum-cap').textContent = cap.name;
  $('sum-combo').textContent = cse.name + ' × ' + cap.name;
  $('sum-layout').textContent = LAYOUT.keyCount + ' 键 · ' + LAYOUT.rows + ' 行 · 65% 紧凑';
  $('sum-view').textContent = state.exploded ? '拆解视图' : '组装完成';
  const modeBits = [];
  modeBits.push(state.typingMode ? '体验模式' : '浏览模式');
  modeBits.push(state.sound ? '按键音开' : '按键音关');
  $('sum-mode').textContent = modeBits.join(' · ');

  const explodeBtn = $('btn-explode');
  explodeBtn.textContent = state.exploded ? '组装还原' : '拆解视图';
  explodeBtn.setAttribute('aria-pressed', String(state.exploded));
  $('toggle-typing').checked = state.typingMode;
  $('toggle-sound').checked = state.sound;
  $('typing-hint').textContent = state.typingMode
    ? '体验模式已开启：直接按下 A–Z 或空格，对应键帽会下压回弹；触屏可直接点击键帽。'
    : '浏览模式：可自由旋转 / 缩放查看。开启体验模式后可用真实键盘敲击。';

  const nameInput = $('config-name');
  if (document.activeElement !== nameInput) nameInput.value = state.configName;
}

/** 绑定所有控件；onChange 用于把界面动作接到 3D 层 */
export function initUI({ onExplodeChange, onTypingChange, onSoundChange, onResetView, onZoom }) {
  renderCaseSwatches();
  renderCapThemes();

  $('btn-explode').addEventListener('click', () => {
    const next = !getState().exploded;
    setState({ exploded: next });
    onExplodeChange(next);
  });
  $('btn-reset-view').addEventListener('click', () => onResetView());
  $('btn-zoom-in').addEventListener('click', () => onZoom(0.85));
  $('btn-zoom-out').addEventListener('click', () => onZoom(1.18));

  $('toggle-typing').addEventListener('change', (e) => {
    setState({ typingMode: e.target.checked });
    onTypingChange(e.target.checked);
  });
  $('toggle-sound').addEventListener('change', (e) => {
    setState({ sound: e.target.checked });
    onSoundChange(e.target.checked);
  });

  let nameTimer = null;
  $('config-name').addEventListener('input', (e) => {
    clearTimeout(nameTimer);
    const v = e.target.value;
    // 摘要即时跟随，存储稍作防抖
    nameTimer = setTimeout(() => {
      setState({ configName: v });
      $('save-status').textContent = '草稿已自动保存 · ' + timeStr();
    }, 250);
  });

  $('btn-save').addEventListener('click', () => {
    setState({ configName: $('config-name').value });
    const ok = saveNow();
    $('save-status').textContent = ok
      ? '已保存到本机浏览器 · ' + timeStr()
      : '保存失败（浏览器存储不可用）';
    toast(ok ? '配置已保存，刷新后自动恢复' : '当前浏览器不允许本地存储');
  });

  $('btn-reset-config').addEventListener('click', () => {
    resetConfig(); // 仅清除本页面自己的存储键
    toast('已恢复默认配置（仅清除本页配置）');
    $('save-status').textContent = '已恢复默认 · 仅清除了本页面的配置';
  });
}

function timeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export function markRestored(state) {
  if (state.restored) {
    $('save-status').textContent = '已恢复上次保存的配置 · 按「恢复默认」可清除';
  }
}
