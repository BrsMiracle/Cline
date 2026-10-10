/**
 * index.html 的自动化测试
 * 运行：npm test
 *
 * 覆盖三层：
 *   1. 静态结构 —— 单文件、零外部依赖、必需节点齐全
 *   2. 纯函数   —— 数字/容量格式化与百分比计算
 *   3. 真实 DOM —— 用 jsdom 真实执行 <script>，验证渲染与交互
 */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = path.join(ROOT, 'index.html');

let html = '';
let win = null;

before(async () => {
  html = await readFile(HTML_PATH, 'utf8');

  const vc = new VirtualConsole();
  const scriptErrors = [];
  vc.on('jsdomError', (e) => scriptErrors.push(e));
  vc.on('error', (e) => scriptErrors.push(e));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
  });
  win = dom.window;
  win.__scriptErrors = scriptErrors;

  // 等 DOMContentLoaded 后的 boot() 跑完
  await new Promise((r) => setTimeout(r, 150));
});

describe('1. 静态结构', () => {
  test('是完整的 HTML5 文档', () => {
    assert.match(html, /^<!DOCTYPE html>/i);
    assert.match(html, /<html lang="zh-CN">/);
    assert.match(html, /<\/html>\s*$/);
  });

  test('包含 viewport meta，可自适应移动端', () => {
    const vp = win.document.querySelector('meta[name="viewport"]');
    assert.ok(vp, '缺少 viewport meta');
    assert.match(vp.getAttribute('content'), /width=device-width/);
  });

  test('零外部依赖：没有任何远程资源引用', () => {
    assert.doesNotMatch(html, /<script[^>]+src=/i, '不应有外链脚本');
    assert.doesNotMatch(html, /<link[^>]+stylesheet/i, '不应有外链样式');
    assert.doesNotMatch(html, /<img[^>]+src=/i, '不应有图片');
    assert.doesNotMatch(html, /<iframe/i, '不应有 iframe');
    assert.doesNotMatch(html, /@import/i, '@import 会发起网络请求');
    const remote = html.match(/https?:\/\/[^\s"')]+/g) || [];
    assert.deepEqual(remote, [], `发现远程引用：${remote.join(', ')}`);
  });

  test('所有必需节点都存在', () => {
    const ids = ['kpis', 'specBody', 'toolBody', 'checkBody', 'runBtn', 'log', 'themeBtn', 'ts'];
    for (const id of ids) {
      assert.ok(win.document.getElementById(id), `缺少 #${id}`);
    }
    assert.equal(win.document.querySelectorAll('h1').length, 1, '应有且仅有一个 h1');
    assert.equal(win.document.querySelectorAll('div.wrap').length, 1, '.wrap 容器应只有一个');
  });

  test('结构闭合正确：footer 位于 .wrap 内部', () => {
    const footer = win.document.querySelector('footer');
    assert.ok(footer, '缺少 footer');
    assert.ok(footer.closest('.wrap'), 'footer 应在 .wrap 内 => div 未提前闭合');
    assert.equal(win.document.querySelectorAll('section').length, 4, '应有 4 个 section');
  });

  test('页面脚本没有执行期异常', () => {
    assert.deepEqual(
      win.__scriptErrors.map((e) => String(e.message || e)),
      [],
      '页面脚本抛出了异常'
    );
  });
});

describe('2. 纯函数', () => {
  let R;
  before(() => {
    R = win.SandboxReport;
    assert.ok(R, 'window.SandboxReport 未导出');
  });

  test('导出完整的 API 面', () => {
    for (const fn of ['clampPct', 'pct', 'formatBytes', 'formatUptime', 'buildKpis', 'render', 'toggleTheme']) {
      assert.equal(typeof R[fn], 'function', `${fn} 不是函数`);
    }
  });

  test('clampPct 夹逼到 0..100 并处理非法输入', () => {
    assert.equal(R.clampPct(-5), 0);
    assert.equal(R.clampPct(0), 0);
    assert.equal(R.clampPct(42.5), 42.5);
    assert.equal(R.clampPct(150), 100);
    assert.equal(R.clampPct(NaN), 0);
    assert.equal(R.clampPct(Infinity), 0);
    assert.equal(R.clampPct('80'), 0);
    assert.equal(R.clampPct(undefined), 0);
  });

  test('pct 处理除零', () => {
    assert.equal(R.pct(50, 200), 25);
    assert.equal(R.pct(0, 100), 0);
    assert.equal(R.pct(100, 0), 0, '除零应返回 0 而不是 Infinity');
    assert.equal(R.pct(5, -1), 0);
    assert.equal(R.pct(300, 100), 100, '超过 100% 应被夹逼');
  });

  test('formatBytes 二进制单位换算', () => {
    assert.equal(R.formatBytes(0), '0 B');
    assert.equal(R.formatBytes(512), '512 B');
    assert.equal(R.formatBytes(1024), '1.0 KiB');
    assert.equal(R.formatBytes(1536), '1.5 KiB');
    assert.equal(R.formatBytes(1024 ** 3, 0), '1 GiB');
    assert.equal(R.formatBytes(247401560 * 1024, 1), '235.9 GiB');
    assert.equal(R.formatBytes(1024 ** 5, 1), '1.0 PiB');
  });

  test('formatBytes 对非法输入返回占位符', () => {
    assert.equal(R.formatBytes(-1), '—');
    assert.equal(R.formatBytes('big'), '—');
    assert.equal(R.formatBytes(NaN), '—');
    assert.equal(R.formatBytes(Infinity), '—');
    assert.equal(R.formatBytes(null), '—');
  });

  test('formatUptime 按量级切换单位', () => {
    assert.equal(R.formatUptime(306653), '3 天 13 小时');
    assert.equal(R.formatUptime(86400), '1 天 0 小时');
    assert.equal(R.formatUptime(3661), '1 小时 1 分');
    assert.equal(R.formatUptime(90), '1 分 30 秒');
    assert.equal(R.formatUptime(0), '0 分 0 秒');
    assert.equal(R.formatUptime(-3), '—');
    assert.equal(R.formatUptime(NaN), '—');
  });

  test('buildKpis 与快照数值一致', () => {
    const kpis = R.buildKpis(R.SNAPSHOT);
    assert.equal(kpis.length, 4);
    // 注意：kpis 来自 jsdom realm，需展开到宿主张量再深比较，否则原型不同会误报
    assert.deepEqual([...kpis.map((k) => k.key)], ['cpu', 'mem', 'disk', 'uptime']);

    assert.equal(kpis[0].value, '60');
    assert.equal(kpis[0].barPct, 60);

    assert.equal(kpis[1].value + ' ' + kpis[1].unit, '235.9 GiB');
    assert.ok(kpis[1].barPct > 6 && kpis[1].barPct < 7, `内存占用率应在 6~7%，实际 ${kpis[1].barPct}`);

    assert.equal(kpis[2].value + ' ' + kpis[2].unit, '15.6 GiB');
    assert.ok(kpis[2].barPct >= 0 && kpis[2].barPct < 1, '磁盘占用率应接近 0');

    assert.equal(kpis[3].value, '3 天 13 小时');
  });

  test('buildKpis 的所有进度条都在合法区间', () => {
    for (const k of R.buildKpis(R.SNAPSHOT)) {
      assert.ok(k.barPct >= 0 && k.barPct <= 100, `${k.key} 进度越界：${k.barPct}`);
      assert.equal(typeof k.label, 'string');
      assert.notEqual(k.label.length, 0);
    }
  });
});

describe('3. 真实 DOM 渲染与交互', () => {
  test('boot() 已执行并标记 body', () => {
    assert.equal(win.document.body.getAttribute('data-rendered'), 'true');
  });

  test('四张 KPI 卡片都填入了数值和宽度', () => {
    for (const key of ['cpu', 'mem', 'disk', 'uptime']) {
      const box = win.document.querySelector(`[data-kpi="${key}"]`);
      const bar = win.document.querySelector(`[data-bar="${key}"]`);
      assert.ok(box.textContent.trim().length > 0, `${key} 数值为空`);
      assert.ok(box.title.includes('：'), `${key} 缺少 tooltip`);
      assert.match(bar.style.width, /^\d+(\.\d+)?%$/, `${key} 进度条宽度非法：${bar.style.width}`);
    }
    assert.match(win.document.querySelector('[data-kpi="cpu"]').textContent, /^60/);
    assert.match(win.document.querySelector('[data-kpi="mem"]').textContent, /^235\.9/);
  });

  test('三张表格行数与数据源一致', () => {
    const counts = {
      specBody: 6,
      toolBody: win.SandboxReport.SNAPSHOT.tools.length,
      checkBody: win.SandboxReport.SNAPSHOT.checks.length,
    };
    for (const [id, expected] of Object.entries(counts)) {
      const rows = win.document.querySelectorAll(`#${id} > tr`);
      assert.equal(rows.length, expected, `#${id} 应有 ${expected} 行`);
      for (const row of rows) {
        assert.equal(row.children.length, 3, '每行应有 3 列');
      }
    }
  });

  test('状态徽章正确区分可用与缺失', () => {
    const tools = win.SandboxReport.SNAPSHOT.tools;
    const missing = tools.filter((t) => !t.ok).length;
    assert.equal(win.document.querySelectorAll('#toolBody .pill.no').length, missing);
    assert.equal(win.document.querySelectorAll('#toolBody .pill.ok').length, tools.length - missing);
    assert.equal(win.document.querySelectorAll('#checkBody .pill.no').length, 0, '自检项应全部通过');
  });

  test('时间戳被写入', () => {
    assert.equal(win.document.getElementById('ts').textContent, win.SandboxReport.SNAPSHOT.capturedAt);
  });

  test('点击主题按钮可往返切换，并写入 localStorage', () => {
    const btn = win.document.getElementById('themeBtn');
    const root = win.document.documentElement;

    assert.equal(root.getAttribute('data-theme'), null, '默认应为暗色（不设属性）');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.getAttribute('data-theme'), 'light');
    assert.equal(win.localStorage.getItem('sandbox-theme'), 'light');

    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(win.localStorage.getItem('sandbox-theme'), 'dark');
  });

  test('点击自检按钮生成日志', () => {
    const pre = win.document.getElementById('log');
    assert.equal(pre.textContent, '等待运行…', '初始应为占位文案');

    win.document.getElementById('runBtn')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    const lines = pre.textContent.split('\n');
    assert.equal(lines.length, 7, `应有 7 行日志，实际 ${lines.length}`);
    assert.match(lines[0], /沙箱自检 @ \d{4}-\d{2}-\d{2}/);
    for (let i = 1; i <= 5; i++) {
      assert.match(pre.textContent, new RegExp(`\\[${i}/5\\]`), `缺少第 ${i} 步`);
    }
    assert.match(pre.textContent, /✔ 自检完成/);
  });

  test('重复点击自检不会累积重复日志', () => {
    const pre = win.document.getElementById('log');
    const btn = win.document.getElementById('runBtn');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    assert.equal(pre.textContent.split('\n').length, 7, '日志应被重置而非追加');
  });

  test('渲染是幂等的：重复 render 不产生重复行', () => {
    const { render, SNAPSHOT } = win.SandboxReport;
    render(SNAPSHOT);
    render(SNAPSHOT);
    assert.equal(win.document.querySelectorAll('#checkBody > tr').length, SNAPSHOT.checks.length);
    assert.equal(win.document.querySelectorAll('#specBody > tr').length, 6);
    assert.equal(win.document.querySelectorAll('#kpis .card').length, 4);
  });
});

