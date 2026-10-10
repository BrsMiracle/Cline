import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import type { KeyDef, KeycapTheme } from '../config/presets';

const FONT_STACK =
  '"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",system-ui,sans-serif';

export function legendColor(theme: KeycapTheme, key: KeyDef): string {
  switch (key.kind) {
    case 'mod':
    case 'arrow':
      return theme.legendMod;
    case 'accent':
      return theme.legendAccent;
    default:
      return theme.legendBase;
  }
}

/** arrows are drawn as vector paths so they never depend on font coverage */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  dir: 'up' | 'down' | 'left' | 'right',
  cx: number,
  cy: number,
  size: number,
) {
  const h = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  if (dir === 'down') ctx.rotate(Math.PI);
  if (dir === 'left') ctx.rotate(-Math.PI / 2);
  if (dir === 'right') ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(h * 0.78, -h * 0.05);
  ctx.lineTo(h * 0.3, -h * 0.05);
  ctx.lineTo(h * 0.3, h * 0.92);
  ctx.lineTo(-h * 0.3, h * 0.92);
  ctx.lineTo(-h * 0.3, -h * 0.05);
  ctx.lineTo(-h * 0.78, -h * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  startPx: number,
  maxWidth: number,
  weight = 600,
): number {
  let size = startPx;
  for (let i = 0; i < 24; i++) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth || size <= 6) break;
    size *= 0.92;
  }
  return size;
}

/**
 * Paints one keycap legend into a canvas that matches the aspect ratio of the
 * cap's top face, so glyphs are never stretched.
 */
export function createLegendTexture(
  key: KeyDef,
  theme: KeycapTheme,
  planeW: number,
  planeD: number,
  anisotropy = 1,
  spaceText = 'LUMEN 65',
): Texture | null {
  if (!key.label && key.code !== 'Space') return null;
  const H = 128;
  const W = Math.max(24, Math.round(H * (planeW / planeD)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const color = legendColor(theme, key);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isArrow = key.kind === 'arrow';
  const isSpace = key.code === 'Space';

  if (isArrow) {
    const dir = ({ '↑': 'up', '↓': 'down', '←': 'left', '→': 'right' } as const)[key.label] ?? 'up';
    drawArrow(ctx, dir, W / 2, H / 2, H * 0.44);
  } else if (isSpace) {
    // the customer's own legend, printed on the space bar
    const text = spaceText.trim();
    if (text) {
      const size = fitFont(ctx, text, H * 0.2, W * 0.62, 650);
      ctx.globalAlpha = 0.55;
      ctx.font = `650 ${size}px ${FONT_STACK}`;
      ctx.fillText(text, W / 2, H / 2);
      ctx.globalAlpha = 1;
    }
  } else if (key.wide) {
    const size = fitFont(ctx, key.label, H * 0.3, W * 0.74, 600);
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    ctx.fillText(key.label, W / 2, H * 0.52);
  } else if (key.labelTop) {
    const topSize = fitFont(ctx, key.labelTop, H * 0.36, W * 0.6, 600);
    ctx.font = `600 ${topSize}px ${FONT_STACK}`;
    ctx.fillText(key.labelTop, W / 2, H * 0.33);
    const baseSize = fitFont(ctx, key.label, H * 0.42, W * 0.6, 600);
    ctx.font = `600 ${baseSize}px ${FONT_STACK}`;
    ctx.fillText(key.label, W / 2, H * 0.71);
  } else {
    const size = fitFont(ctx, key.label, H * 0.5, W * 0.62, 650);
    ctx.font = `650 ${size}px ${FONT_STACK}`;
    ctx.fillText(key.label, W / 2, H * 0.52);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** etched wordmark used on the front lip of the case */
export function createWordmarkTexture(text: string, color: string, aspect = 8): Texture {
  const H = 96;
  const W = Math.round(H * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitFont(ctx, text, H * 0.62, W * 0.9, 700);
  ctx.font = `700 ${size}px ${FONT_STACK}`;
  ctx.letterSpacing = `${Math.round(size * 0.18)}px`;
  ctx.fillText(text, W / 2, H * 0.54);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
