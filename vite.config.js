import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base: './' 保证产物可以以任意相对路径（含 file://）打开。
// viteSingleFile 把 JS/CSS 全部内联进 index.html，
// 便于额外产出一个自包含的单文件版本（见 scripts/make-single.mjs）。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100 * 1024 * 1024,
    chunkSizeWarningLimit: 100 * 1024 * 1024,
    cssCodeSplit: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});