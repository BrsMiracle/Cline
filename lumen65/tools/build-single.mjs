/**
 * Bundles the built app into ONE self contained html file
 * (css + js inlined, no external requests) named after the product.
 *
 *   npm run build:single      # → lumen-65.html (project root)
 *   npm run build:single -- --out /some/path/lumen-65.html
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = join(root, 'dist');
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const outFile = outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(root, 'lumen-65.html');

const escapeScript = (code) => code.replace(/<\/script/gi, '<\\/script');

async function main() {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  const assets = join(dist, 'assets');
  const files = await readdir(assets).catch(() => []);

  const cssFile = files.find((f) => f.endsWith('.css'));
  const jsFile = files.find((f) => f.endsWith('.js'));
  const jsFiles = files.filter((f) => f.endsWith('.js'));

  let out = html;
  let inlinedScript = '';
  if (cssFile) {
    const css = await readFile(join(assets, cssFile), 'utf8');
    out = out.replace(
      new RegExp(`<link[^>]*href="[^"]*${cssFile}"[^>]*>`),
      () => `<style>\n${css}\n</style>`,
    );
  }
  if (jsFile) {
    const js = await readFile(join(assets, jsFile), 'utf8');
    // the bundle has no imports/exports of its own → a classic script works
    // everywhere, including file:// where inline modules are rejected
    const isPlainScript = !/\bimport\s*\(|\bimport\.meta\b|^\s*(?:import|export)\s/m.test(js);
    const tag = isPlainScript ? 'script' : 'script type="module"';
    inlinedScript = `<${tag}>\n${escapeScript(js)}\n</script>`;
    out = out.replace(new RegExp(`<script[^>]*src="[^"]*${jsFile}"[^>]*>\\s*</script>`), () => '');
  }

  // a classic script must run after the markup exists → keep it at the end of <body>
  if (out.includes('</body>')) {
    out = out.replace('</body>', () => `    ${inlinedScript}\n  </body>`);
  } else {
    out += inlinedScript;
  }

  // only the markup counts: the bundle itself mentions its own asset urls
  const markup = out.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  const leftovers = [...markup.matchAll(/(?:src|href)="\.?\/?assets\/[^"]+"/g)].map((m) => m[0]);
  out = out.replace(
    '</head>',
    '    <!-- LUMEN 65 — single file build: everything is inlined below -->\n  </head>',
  );

  await writeFile(outFile, out, 'utf8');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`wrote ${basename(outFile)} (${kb} kB)`);
  if (jsFiles.length > 1) console.warn('note: multiple js chunks found, only the entry was inlined');
  if (leftovers.length) console.warn('unresolved asset references:', leftovers);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
