/**
 * LUMEN 65 — end-to-end verification.
 *
 * Renders the built page in headless Chrome, drives the real UI and the real
 * keyboard, then asserts on both the DOM state and the live Three.js scene.
 *
 * Usage (puppeteer is an optional dev dependency):
 *   npm run build
 *   npm i -D puppeteer                     # only needed for this script
 *   node tools/verify.mjs                  # verifies dist/
 *   node tools/verify.mjs --file lumen-65.html
 *   node tools/verify.mjs --keep-open      # keep the browser open at the end
 *
 * Screenshots land in screenshots/.
 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const valueOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const fileArg = valueOf('--file');
const width = Number(valueOf('--width') ?? 1360);
const height = Number(valueOf('--height') ?? 860);
const shotDir = join(root, 'screenshots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ->  ' + detail : ''}`);
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

/** serves dist/ (or a single html file) so the check needs no dev server */
async function startServer() {
  const single = fileArg ? resolve(fileArg) : null;
  const distDir = join(root, 'dist');
  const server = createServer(async (req, res) => {
    try {
      const url = (req.url || '/').split('?')[0];
      const target = single ? single : join(distDir, url === '/' ? 'index.html' : url);
      const info = await stat(target).catch(() => null);
      if (!info || info.isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      const body = await readFile(target);
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}


async function main() {
  await mkdir(shotDir, { recursive: true });
  const { server, url } = await startServer();

  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-gpu-sandbox',
    ],
    defaultViewport: { width, height, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const debug = () => page.evaluate(() => window.__LUMEN__.debug());
  const config = () => page.evaluate(() => window.__LUMEN__.getConfig());
  const text = (selector) =>
    page.$eval(selector, (el) => el.textContent.replace(/\s+/g, ' ').trim());
  /** the CI renderer is software only: give animations a few real frames */
  const settle = (ms = 2600) => wait(ms);
  const shot = (name) => page.screenshot({ path: join(shotDir, name + '.png') });
  const waitForScene = () =>
    page.waitForFunction(() => window.__LUMEN__ && window.__LUMEN__.debug().frames > 2, {
      timeout: 40000,
    });

  /* ------------------------------------------------------------ first paint */
  await page.goto(url, { waitUntil: 'load' });
  await waitForScene();
  await settle(4000);

  const initial = await debug();
  check('three.js scene boots with the full 63 key layout', initial.keys === 63, `keys=${initial.keys}`);
  check('render loop keeps producing frames', initial.frames > 5, `frames=${initial.frames}`);
  check('camera frames the whole product', initial.cameraDistance > 10, `d=${initial.cameraDistance}`);
  check('default configuration is applied', initial.finish === 'aurora' && initial.theme === 'nightfall');
  await shot('01-default-hero');

  /* ------------------------------------------------------- configuration UI */
  await page.click('[data-testid="finish-graphite"]');
  await settle(1400);
  const afterFinish = await debug();
  check('case finish switches the 3D material', afterFinish.bodyColor === '#30343c', `body=#${afterFinish.bodyColor}`);
  check(
    'summary follows the finish',
    (await text('[data-testid="summary-finish"]')).includes('石墨黑'),
    await text('[data-testid="summary-finish"]'),
  );

  await page.click('[data-testid="theme-ember"]');
  await settle(1400);
  const afterTheme = await debug();
  check('keycap theme switches the cap material', afterTheme.capColor === '#e7d9c2', `caps=#${afterTheme.capColor}`);
  check(
    'summary follows the theme',
    (await text('[data-testid="summary-theme"]')).includes('曜橙'),
    await text('[data-testid="summary-theme"]'),
  );
  await shot('02-graphite-ember');


  /* -------------------------------------------------------------- exploding */
  await page.click('[data-testid="toggle-explode"]');
  await settle(5500);
  const exploded = await debug();
  check('explode reaches the open state', exploded.exploded === 1, `value=${exploded.exploded}`);
  const visibleLabels = await page.$$eval(
    '.layer-label',
    (els) => els.filter((el) => el.style.visibility === 'visible' && Number(el.style.opacity) > 0.5).length,
  );
  check('layer labels are projected into the DOM overlay', visibleLabels === 3, `visible=${visibleLabels}`);
  check('summary reports the exploded state', (await text('[data-testid="summary-state"]')).includes('拆解'));
  await shot('03-exploded');

  // hammer the toggle: the animation must still settle on the correct target
  for (let i = 0; i < 6; i++) {
    await page.click('[data-testid="toggle-explode"]');
    await wait(90);
  }
  await settle(6500);
  const settled = await debug();
  const finalConfig = await config();
  check(
    'rapid toggling still settles on the right state',
    settled.exploded === settled.explodeTarget && finalConfig.exploded === Boolean(settled.explodeTarget),
    `value=${settled.exploded} target=${settled.explodeTarget} config=${finalConfig.exploded}`,
  );

  /* --------------------------------------------------------- typing feeling */
  await page.click('[data-testid="toggle-typing"]');
  await wait(800);
  await page.keyboard.down('a');
  await settle(1800);
  const pressed = await debug();
  check('pressing A pushes a keycap down', pressed.pressAttention > 0, `down=${pressed.pressAttention}`);
  await shot('04-key-pressed');
  await page.keyboard.up('a');
  await settle(2600);
  const released = await debug();
  check('releasing A springs the keycap back', released.pressAttention === 0, `down=${released.pressAttention}`);

  await page.keyboard.down('Space');
  await settle(1600);
  check('space bar reacts as well', (await debug()).pressAttention > 0);
  await page.keyboard.up('Space');
  await settle(1600);
  check('typing HUD shows the last key', (await text('[data-testid="typing-last"]')).length > 0, await text('[data-testid="typing-last"]'));

  /* ------------------------------------------- typing must not be hijacked */
  await page.click('[data-testid="space-text"]');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  for (let i = 0; i < 14; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('TYPED');
  await settle(1600);
  const inputValue = await page.$eval('[data-testid="space-text"]', (el) => el.value);
  const downWhileTyping = (await debug()).pressAttention;
  check('focused input keeps normal typing', inputValue === 'TYPED', `value="${inputValue}"`);
  check('a focused input does not drive the keycaps', downWhileTyping === 0, `down=${downWhileTyping}`);
  check(
    'space legend follows the input',
    (await text('[data-testid="summary-space"]')).includes('TYPED'),
    await text('[data-testid="summary-space"]'),
  );
  await shot('05-custom-space-legend');
  await page.$eval('[data-testid="space-text"]', (el) => el.blur());


  /* --------------------------------------------------------- pointer + view */
  const box = await page.$eval('[data-testid="canvas-host"]', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const centre = { x: box.x + box.w / 2, y: box.y + box.h * 0.62 };
  const beforeRotate = await debug();
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 200, centre.y - 40, { steps: 12 });
  await page.mouse.up();
  await settle(2200);
  const afterRotate = await debug();
  check(
    'dragging orbits the product',
    Math.abs(afterRotate.azimuth - beforeRotate.azimuth) > 0.05,
    `${beforeRotate.azimuth} -> ${afterRotate.azimuth}`,
  );

  const beforeZoom = await debug();
  await page.mouse.wheel({ deltaY: -420 });
  await settle(2000);
  const afterZoom = await debug();
  check(
    'wheel zooms the camera',
    Math.abs(afterZoom.cameraDistance - beforeZoom.cameraDistance) > 0.3,
    `${beforeZoom.cameraDistance} -> ${afterZoom.cameraDistance}`,
  );
  await shot('06-rotated');

  await page.click('[data-testid="reset-view"]');
  await settle(3200);
  const afterReset = await debug();
  check(
    'reset restores the hero framing',
    Math.abs(afterReset.cameraDistance - afterReset.fitDistance) < 0.8 &&
      Math.abs(afterReset.polar - 1.02) < 0.1,
    `d=${afterReset.cameraDistance}/${afterReset.fitDistance} polar=${afterReset.polar}`,
  );

  /* ------------------------------------------------------------ tap a keycap */
  const gPoint = await page.evaluate(() => window.__LUMEN__.projectKey('KeyG'));
  const tapLabelBefore = await text('[data-testid="typing-last"]');
  if (gPoint) {
    await page.mouse.click(gPoint.x, gPoint.y);
    await settle(1200);
  }
  const tapLabelAfter = await text('[data-testid="typing-last"]');
  check(
    'tapping a keycap in the 3D view registers a key press',
    tapLabelAfter === 'G' && tapLabelAfter !== tapLabelBefore,
    `${tapLabelBefore} -> ${tapLabelAfter}`,
  );

  /* ------------------------------------------------------------- persistence */
  await page.evaluate(() => localStorage.setItem('unrelated.app.key', 'must-survive'));
  await page.click('[data-testid="toggle-explode"]');
  await settle(3600);
  const storedRaw = await page.evaluate(() => localStorage.getItem('lumen65.product.config.v1'));
  const stored = JSON.parse(storedRaw ?? '{}');
  const liveConfig = await config();
  check(
    'configuration is written to localStorage',
    stored.finishId === liveConfig.finishId &&
      stored.themeId === liveConfig.themeId &&
      stored.spaceText === liveConfig.spaceText,
    storedRaw,
  );

  await page.reload({ waitUntil: 'load' });
  await waitForScene();
  await settle(5000);
  const restored = await config();
  const restoredDebug = await debug();
  check(
    'reload restores finish + theme from localStorage',
    restored.finishId === stored.finishId && restored.themeId === stored.themeId,
    `${restored.finishId} / ${restored.themeId}`,
  );
  check(
    'reload rebuilds the 3D scene with the stored colours',
    restoredDebug.bodyColor === '#30343c' && restoredDebug.capColor === '#e7d9c2',
    `body=#${restoredDebug.bodyColor} caps=#${restoredDebug.capColor}`,
  );
  check(
    'reload restores the configuration summary',
    (await text('[data-testid="summary-finish"]')).includes('石墨黑') &&
      (await text('[data-testid="summary-space"]')).includes('TYPED'),
    await text('[data-testid="summary-finish"]'),
  );
  await shot('07-after-reload');

  await page.click('[data-testid="reset-defaults"]');
  await settle(2000);
  const resetState = await page.evaluate(() => ({
    stored: localStorage.getItem('lumen65.product.config.v1'),
    unrelated: localStorage.getItem('unrelated.app.key'),
    finish: document.querySelector('[data-testid="summary-finish"]').textContent,
    theme: document.querySelector('[data-testid="summary-theme"]').textContent,
  }));
  check(
    '“restore defaults” only clears this page’s own key',
    resetState.stored === null && resetState.unrelated === 'must-survive',
    `stored=${resetState.stored} unrelated=${resetState.unrelated}`,
  );
  check(
    '“restore defaults” resets the summary',
    resetState.finish.includes('曜银') && resetState.theme.includes('极夜'),
    `${resetState.finish} / ${resetState.theme}`,
  );
  const defaultDebug = await debug();
  check(
    '“restore defaults” resets the 3D scene too',
    defaultDebug.bodyColor === '#cbd1da' && defaultDebug.capColor === '#23272f',
    `body=#${defaultDebug.bodyColor} caps=#${defaultDebug.capColor}`,
  );

  /* ------------------------------------------------------------------ mobile */
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2 });
  await settle(4500);
  await shot('08-mobile');
  const mobile = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  check(
    'no horizontal overflow on a phone viewport',
    mobile.scrollW <= mobile.clientW + 2,
    JSON.stringify(mobile),
  );

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  if (flag('--keep-open')) {
    console.log('browser left open on', url, '- press ctrl+c to exit');
    await new Promise(() => {});
  }
  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(', ')}` : ''),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
