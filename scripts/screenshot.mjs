/**
 * 用真实 Chromium 渲染页面：断言 + 截图 + 控制台报错捕获。
 * 用法：node scripts/screenshot.mjs [端口]
 *
 * 与 jsdom 测试的区别：这里是真浏览器、真排版引擎、真 CSS 计算。
 * jsdom 不做布局，所以「元素是否可见/是否有尺寸」只有这里才能验证。
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStaticServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✔' : '✘'} ${name}${detail ? '  — ' + detail : ''}`);
}

const server = createStaticServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
page.on('requestfailed', (r) => consoleErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

// 记录所有发出的网络请求，验证「零外部依赖」
const requests = [];
page.on('request', (r) => requests.push(r.url()));

await page.goto(base + '/', { waitUntil: 'networkidle' });

// ---- 1. 无报错 ----
check('页面无 JS 运行时异常', pageErrors.length === 0, pageErrors.join(' | '));
check('控制台无 error 级日志', consoleErrors.length === 0, consoleErrors.join(' | '));

// ---- 2. 只请求了页面本身 ----
const external = requests.filter((u) => !u.startsWith(base));
check('零外部网络请求', external.length === 0, external.join(', '));
check('仅发起 1 个请求（页面本身）', requests.length === 1, `实际 ${requests.length}: ${requests.join(', ')}`);

// ---- 3. 脚本确实执行了 ----
const rendered = await page.getAttribute('body', 'data-rendered');
check('boot() 已在真浏览器执行', rendered === 'true', `data-rendered=${rendered}`);

// ---- 4. 真浏览器里的 DOM 断言 ----
const cpuText = (await page.textContent('[data-kpi="cpu"]'))?.trim();
check('CPU 卡片文本正确', /^60\s*核?$/.test(cpuText), `实际 "${cpuText}"`);

const rowCounts = await page.evaluate(() => ({
  spec: document.querySelectorAll('#specBody > tr').length,
  tool: document.querySelectorAll('#toolBody > tr').length,
  check: document.querySelectorAll('#checkBody > tr').length,
  cards: document.querySelectorAll('#kpis .card').length,
}));
check('表格行数正确', rowCounts.spec === 6 && rowCounts.tool === 8 && rowCounts.check === 7,
  JSON.stringify(rowCounts));
check('KPI 卡片数正确', rowCounts.cards === 4, `实际 ${rowCounts.cards}`);

// ---- 5. 真实布局：元素有尺寸且可见（jsdom 测不了这一层）----
const layout = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), display: s.display, visibility: s.visibility };
  };
  return {
    h1: pick('h1'),
    table: pick('#specBody'),
    btn: pick('#runBtn'),
    bar: pick('[data-bar="mem"]'),
  };
});
for (const [key, box] of Object.entries(layout)) {
  check(`${key} 已真实排版出尺寸`, !!box && box.w > 0 && box.h > 0 && box.display !== 'none' && box.visibility !== 'hidden',
    JSON.stringify(box));
}

// ---- 6. 进度条宽度真的按百分比计算出像素 ----
const barPx = await page.evaluate(() => {
  const bar = document.querySelector('[data-bar="mem"]');
  const track = bar.parentElement;
  return {
    widthPct: bar.style.width,
    barPx: bar.getBoundingClientRect().width,
    trackPx: track.getBoundingClientRect().width,
  };
});
check('内存进度条按百分比渲染出真实像素',
  barPx.barPx > 0 && barPx.barPx < barPx.trackPx,
  `宽度 ${Math.round(barPx.barPx)}px / 轨道 ${Math.round(barPx.trackPx)}px (${barPx.widthPct})`);

// ---- 7. 交互：真点击 ----
await page.click('#runBtn');
const logText = await page.textContent('#log');
check('点击自检按钮后日志有 7 行', logText.split('\n').length === 7);
check('日志包含完成标记', logText.includes('✔ 自检完成'));

await page.click('#themeBtn');
const theme = await page.getAttribute('html', 'data-theme');
// body 有 0.25s 背景过渡，必须等过渡结束再读计算样式，否则读到的是插值中间态
await page.waitForTimeout(450);
const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('切换到浅色主题生效', theme === 'light', `data-theme=${theme}`);
check('浅色主题真的改变了背景色', bgLight === 'rgb(244, 246, 251)', `background=${bgLight}`);

await page.screenshot({ path: path.join(OUT, 'light.png'), fullPage: true });

await page.click('#themeBtn');
await page.waitForTimeout(450);
const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeBack = await page.getAttribute('html', 'data-theme');
check('切回深色主题生效', themeBack === 'dark' && bgDark === 'rgb(11, 16, 32)', `data-theme=${themeBack} background=${bgDark}`);

await page.screenshot({ path: path.join(OUT, 'dark.png'), fullPage: true });

// ---- 8. 响应式：窄屏不得溢出，且不得把标签挤断行 ----
for (const width of [390, 320]) {
  await page.setViewportSize({ width, height: 844 });
  await page.waitForTimeout(250);

  const layout = await page.evaluate(() => {
    // 数一个单元格里真实的「行数」。
    // 不能用 getBoundingClientRect：表格单元格会被整行行高撑高，
    // 中间列换行会连带首列也测出高。Range 的 client rects 是按行盒给的。
    const lineCount = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set(
        [...range.getClientRects()].filter((r) => r.height > 1 && r.width > 1).map((r) => Math.round(r.top))
      );
      return tops.size || 1;
    };
    const singleLine = (el) => lineCount(el) <= 1;
    const pills = [...document.querySelectorAll('.pill')];
    const firstCells = [...document.querySelectorAll('tbody td:first-child')];
    return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      pillCount: pills.length,
      wrappedPills: pills.filter((p) => !singleLine(p)).length,
      wrappedLabels: firstCells.filter((c) => !singleLine(c)).map((c) => c.textContent.trim()),
      labelCount: firstCells.length,
    };
  });

  check(`${width}px 无横向溢出`, layout.scrollW <= layout.clientW + 1,
    `scrollWidth=${layout.scrollW} clientWidth=${layout.clientW}`);
  check(`${width}px 状态徽章不换行`, layout.wrappedPills === 0,
    `${layout.pillCount} 个徽章中 ${layout.wrappedPills} 个换行`);
  check(`${width}px 首列标签不被挤断行`, layout.wrappedLabels.length === 0,
    layout.wrappedLabels.length ? `断行: ${layout.wrappedLabels.join(' / ')}` : `${layout.labelCount} 个标签均为单行`);

  if (width === 390) await page.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
  if (width === 320) await page.screenshot({ path: path.join(OUT, 'mobile-320.png'), fullPage: true });
}

await browser.close();
await new Promise((r) => server.close(r));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
console.log(`截图已保存到 ${OUT}`);
if (failed.length) {
  console.log('\n未通过：');
  failed.forEach((f) => console.log(`  ✘ ${f.name} — ${f.detail}`));
  process.exit(1);
}
