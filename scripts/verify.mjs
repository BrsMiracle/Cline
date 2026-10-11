/** 端到端验证：截图、交互、持久化、控制台错误 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'index.html');
const shots = path.join(root, '.verify');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('file://' + dist);
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(shots, '01-first-screen.png') });

// 1. 键位数量与首屏要素
const stats = await page.evaluate(() => ({
  keys: window.__KESTREL__.kb.capRecords.length,
  title: document.querySelector('.hero__title')?.textContent.trim(),
  intro: !!document.querySelector('.hero__intro'),
  panel: !!document.querySelector('#config-panel'),
  canvas: !!document.querySelector('#stage canvas'),
}));
console.log('STATS', JSON.stringify(stats));

// 2. 换配色 + 换键帽主题 → 摘要同步
await page.click('.swatch[data-id="moonlight-silver"]');
await page.click('.cap-card[data-id="cream-retro"]');
await page.waitForTimeout(400);
console.log('COMBO', await page.textContent('#sum-combo'));
await page.screenshot({ path: path.join(shots, '02-silver-cream.png') });

// 3. 拆解视图（随后快速连点 5 次，验证最终收敛回组装态）
await page.click('#btn-explode');
await page.waitForTimeout(1400);
console.log('EXPLODED_Y', await page.evaluate(() => window.__KESTREL__.kb.capLayer.position.y.toFixed(3)));
await page.screenshot({ path: path.join(shots, '03-exploded.png') });
for (let i = 0; i < 5; i++) { await page.click('#btn-explode'); await page.waitForTimeout(90); }
await page.waitForTimeout(1600);
console.log('AFTER_RAPID_TOGGLE_Y', await page.evaluate(() => window.__KESTREL__.kb.capLayer.position.y.toFixed(3)));
await page.screenshot({ path: path.join(shots, '04-reassembled.png') });

// 4. 体验模式：物理按键 A/Z/空格 → 键帽下压
await page.click('#stage'); // 让焦点回到页面
await page.keyboard.down('a');
await page.waitForTimeout(120);
const aPress = await page.evaluate(() => {
  const r = window.__KESTREL__.kb.capRecords.find((x) => x.key.code === 'KeyA');
  return r.press.toFixed(4);
});
console.log('KEY_A_PRESS', aPress);
await page.keyboard.up('a');
await page.waitForTimeout(500);
console.log('KEY_A_RELEASED', await page.evaluate(() => {
  const r = window.__KESTREL__.kb.capRecords.find((x) => x.key.code === 'KeyA');
  return r.press.toFixed(4);
}));

// 4b. 输入框获得焦点时不劫持（按 S 不应触发键帽）
await page.click('#config-name');
await page.keyboard.down('s');
await page.waitForTimeout(120);
const sInInput = await page.evaluate(() => {
  const r = window.__KESTREL__.kb.capRecords.find((x) => x.key.code === 'KeyS');
  return r.press.toFixed(4);
});
console.log('KEY_S_IN_INPUT_PRESS', sInInput);
await page.keyboard.up('s');
console.log('INPUT_VALUE', await page.inputValue('#config-name'));

// 5. 保存 → 刷新恢复
await page.fill('#config-name', '工位黑橙');
await page.click('.swatch[data-id="lava-orange"]');
await page.click('.cap-card[data-id="polar-mist"]');
await page.click('#btn-save');
await page.waitForTimeout(300);
await page.reload();
await page.waitForTimeout(1500);
console.log('AFTER_RELOAD_COMBO', await page.textContent('#sum-combo'));
console.log('AFTER_RELOAD_NAME', await page.inputValue('#config-name'));
await page.screenshot({ path: path.join(shots, '05-restored.png') });

// 6. 恢复默认（只清本页配置）
await page.evaluate(() => localStorage.setItem('other-app-key', 'keep-me'));
await page.click('#btn-reset-config');
await page.waitForTimeout(300);
console.log('AFTER_RESET_COMBO', await page.textContent('#sum-combo'));
console.log('OTHER_KEY_SURVIVED', await page.evaluate(() => localStorage.getItem('other-app-key')));
console.log('OUR_KEY_CLEARED', await page.evaluate(() => localStorage.getItem('kestrel67.config.v1')));

// 7. 视角复位与缩放按钮可点
await page.click('#btn-zoom-in');
await page.waitForTimeout(500);
await page.click('#btn-reset-view');
await page.waitForTimeout(900);

console.log('CONSOLE_ERRORS', JSON.stringify(errors));
await browser.close();
