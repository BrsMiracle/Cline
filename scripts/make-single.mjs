/**
 * 产出以作品名命名的自包含单文件版本：Kestrel67.html
 * vite-plugin-singlefile 已把 JS/CSS 内联进 dist/index.html，
 * 这里只做拷贝 + 完整性断言（无外部引用）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'dist', 'index.html');
const out = path.join(root, 'Kestrel67.html');

if (!fs.existsSync(src)) {
  console.error('未找到 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

const html = fs.readFileSync(src, 'utf8');

// 完整性断言：单文件不应引用任何外部 JS/CSS 资源
const extRefs = html.match(/(?:src|href)="(?!data:|#)([^"']+)"/g) || [];
const leftovers = extRefs.filter((r) => !r.includes('favicon'));
if (leftovers.length) {
  console.error('仍存在外部引用，无法作为单文件交付：', leftovers);
  process.exit(1);
}
if (!html.includes('three') || html.length < 100_000) {
  console.error('产物体积异常，可能未内联 three.js');
  process.exit(1);
}

fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log('已生成单文件版本：' + path.relative(root, out) + ' (' + kb + ' KB)');
