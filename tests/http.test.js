/**
 * 端到端测试：真的把页面跑在一个 HTTP 服务上，再通过网络取回并渲染。
 * 这一步验证的是「文件本身没问题」之外的链路：Content-Type、状态码、
 * 目录穿越防护、以及通过网络传输后 DOM 依然渲染正确。
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createStaticServer } from '../scripts/serve.mjs';

let server;
let base;

before(async () => {
  server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('4. 端到端：HTTP 服务 + 真实取回', () => {
  test('GET / 返回 200 且 Content-Type 正确', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const body = await res.text();
    assert.ok(body.length > 4000, '页面内容过短，可能没读到完整文件');
    assert.match(body, /Cline 云端沙箱环境报告/);
  });

  test('不存在的路径返回 404', async () => {
    const res = await fetch(base + '/nope.html');
    assert.equal(res.status, 404);
  });

  test('编码后的目录穿越被拦截（真正的攻击向量）', async () => {
    // %2e%2e%2f 不会像 ../ 那样被 URL 规范化掉，必须由服务端自己防
    const attacks = [
      '/%2e%2e%2fpackage.json',
      '/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '/..%2fpackage.json',
      '/%2e%2e%2f%2e%2e%2fworkspace-evil%2fsecret.txt',
    ];
    for (const p of attacks) {
      const res = await fetch(base + p);
      assert.equal(res.status, 403, `${p} 应返回 403，实际 ${res.status}`);
      const body = await res.text();
      assert.doesNotMatch(body, /devDependencies|root:x:/, `${p} 泄漏了文件内容`);
    }
  });

  test('未编码的 ../ 会被 URL 规范化，不会逃出根目录', async () => {
    // 客户端的 ../ 在服务端看到之前就已被折叠成 /package.json，
    // 因此这里的关键不是报错，而是「绝不能读到 root 之外的路径」
    for (const p of ['/../etc/passwd', '/../../etc/passwd', '/../node_modules/jsdom/package.json']) {
      const res = await fetch(base + p);
      assert.ok(res.status === 200 || res.status === 404, `${p} 状态码异常：${res.status}`);
      const body = await res.text();
      assert.doesNotMatch(body, /root:x:/, `${p} 读到了系统文件`);
    }
  });

  test('通过网络取回的页面能被完整解析并执行脚本', async () => {
    const res = await fetch(base + '/');
    const html = await res.text();

    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(String(e.message || e)));

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: base + '/',
      virtualConsole: vc,
    });
    const win = dom.window;
    await new Promise((r) => setTimeout(r, 150));

    assert.deepEqual(errors, [], '取回后执行脚本报错');
    assert.equal(win.document.body.getAttribute('data-rendered'), 'true', 'boot() 未执行');
    assert.ok(win.SandboxReport, 'SandboxReport 未挂载');
    assert.equal(win.document.querySelectorAll('#specBody > tr').length, 6);
    assert.match(win.document.querySelector('[data-kpi="cpu"]').textContent, /^60/);
    dom.window.close();
  });
});
