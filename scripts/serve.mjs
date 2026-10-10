/**
 * 极简静态文件服务器，用于本地预览与端到端测试。
 * 用法：node scripts/serve.mjs [端口]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

export function createStaticServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';

      // 防目录穿越：必须先解码再 resolve，并确保落在 root 之内
      // （注意加 path.sep，否则 /workspace-evil 会被 startsWith('/workspace') 放行）
      const target = path.resolve(root, '.' + rel);
      if (target !== root && !target.startsWith(root + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 Forbidden');
        return;
      }

      const info = await stat(target);
      if (info.isDirectory()) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const body = await readFile(target);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 ' + err.message);
      }
    }
  });
}

// 直接运行时启动监听
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createStaticServer().listen(PORT, () => {
    console.log(`静态服务已启动: http://localhost:${PORT}/  (根目录 ${ROOT})`);
  });
}
