/**
 * 体验模式：真实键盘 A–Z / 空格 → 对应键帽下压回弹。
 * 输入控件（input/textarea/contenteditable）获得焦点时不拦截，
 * 保证正常输入不被劫持。
 */
import { playClick } from './sound.js';

export function setupTyping({ sceneApi, isEnabled }) {
  const held = new Map(); // code -> rec

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function findRec(code) {
    return sceneApi.capRecords.find((r) => r.key.code === code);
  }

  function onKeyDown(e) {
    if (!isEnabled() || e.repeat) return;
    if (isEditable(document.activeElement)) return; // 不劫持正常输入

    let code = null;
    if (/^Key[A-Z]$/.test(e.code)) code = e.code;
    else if (e.code === 'Space') code = 'Space';
    if (!code) return;

    const rec = findRec(code);
    if (!rec || held.has(code)) return;
    held.set(code, rec);
    sceneApi.pressKey(rec, true);
    playClick(true);
    e.preventDefault(); // 防止空格滚动页面
  }

  function onKeyUp(e) {
    const rec = held.get(e.code);
    if (rec) {
      sceneApi.releaseKey(rec);
      held.delete(e.code);
      playClick(false);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // 页面失焦时释放所有按住的键，避免卡键
  window.addEventListener('blur', () => {
    held.forEach((rec) => sceneApi.releaseKey(rec));
    held.clear();
  });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}

/** 触屏/鼠标点击键帽：短促按压 */
export function tapCap(sceneApi, keyId, soundOn) {
  const rec = sceneApi.capRecords.find((r) => r.key.id === keyId);
  if (!rec) return;
  sceneApi.pressKey(rec, false);
  if (soundOn) playClick(true);
  setTimeout(() => sceneApi.releaseKey(rec), 70);
}
