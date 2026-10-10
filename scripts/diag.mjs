/**
 * 找出窄屏下真正溢出的元素。
 * 用法：LD_LIBRARY_PATH=... node scripts/diag.mjs
 */
import { chromium } from 'playwright';
import { createStaticServer } from './serve.mjs';

const server = createStaticServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const report = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > cw + 0.5 || r.width > cw + 0.5) {
      const cs = getComputedStyle(el);
      offenders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: (el.className || '').toString().slice(0, 28),
        w: Math.round(r.width),
        right: Math.round(r.right),
        overflowX: cs.overflowX,
        whiteSpace: cs.whiteSpace,
        sample: (el.textContent || '').trim().slice(0, 34),
      });
    }
  });
  return {
    clientWidth: cw,
    scrollWidth: document.documentElement.scrollWidth,
    tableWidths: [...document.querySelectorAll('table')].map((t) => ({
      w: Math.round(t.getBoundingClientRect().width),
      parent: Math.round(t.parentElement.getBoundingClientRect().width),
    })),
    preW: Math.round(document.getElementById('log').getBoundingClientRect().width),
    offenders: offenders.slice(0, 14),
  };
});

console.log('clientWidth :', report.clientWidth);
console.log('scrollWidth :', report.scrollWidth);
console.log('table widths:', JSON.stringify(report.tableWidths));
console.log('log width   :', report.preW);
console.log('\n溢出元素:');
for (const o of report.offenders) {
  console.log(`  <${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls : ''}> w=${o.w} right=${o.right} overflowX=${o.overflowX} ws=${o.whiteSpace}  "${o.sample}"`);
}

await browser.close();
await new Promise((r) => server.close(r));
