/**
 * Kestrel 67 键盘三维模型。
 *
 * 三层结构（拆解动画即在这三层之间展开）：
 *   1. caseLayer   —— 楔形底壳（前低后高 6° 打字倾角）+ 橡胶脚垫 + USB-C 口 + 铭牌
 *   2. plateLayer  —— 定位板（带 67 个轴孔的金属薄板）+ 轴体
 *   3. capLayer    —— 67 颗带锥度与可读字符的键帽
 *
 * 坐标：1 单位 = 1u 键距；x 向右，z 向前（行 0 在后），y 向上。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildKeys, LAYOUT } from './layout.js';

const GAP = LAYOUT.gap;      // 键帽间隙 0.08u
const CAP_H = 0.62;          // 键帽底面到定位板顶面的悬浮高度
const CAP_TOP = 0.46;        // 键帽实体高度
const DECK_H = 0.16;         // 定位板厚度

/** 为一枚键帽生成字符贴图（透明底 + 实色字符） */
function makeLegendTexture(legend, colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  if (legend) {
    ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = legend.length <= 2 ? 58 : legend.length <= 5 ? 40 : 28;
    ctx.font = '600 ' + fs + 'px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(legend, size / 2, size / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 楔形底壳几何：顶面前低后高，底面水平。 */
function buildCaseGeometry(w, d, hFront, hBack) {
  const geo = new THREE.BoxGeometry(w, 1, d, 1, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y > 0) {
      const t = (d / 2 - z) / d; // 前(+z)→0，后(-z)→1
      pos.setY(i, hFront + (hBack - hFront) * t);
    } else {
      pos.setY(i, 0);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** 构建整把键盘：返回三层分组与控制接口 */
export function buildKeyboard(caseColor, capTheme) {
  const root = new THREE.Group();
  const keys = buildKeys();

  // ---- 三层分组（拆解动画直接操作这三组的 y 偏移） ----
  const caseLayer = new THREE.Group();
  const plateLayer = new THREE.Group();
  const capLayer = new THREE.Group();
  caseLayer.name = 'case';
  plateLayer.name = 'plate';
  capLayer.name = 'caps';
  root.add(caseLayer, plateLayer, capLayer);

  const W = LAYOUT.width + 1.6; // 底壳略宽于键区
  const D = LAYOUT.rows + 1.4;
  const CASE_H_FRONT = 1.05;   // 前缘高度
  const CASE_H_BACK = 1.7;     // 后缘高度（打字倾角约 6°）

  /* ---- 底壳 ---- */
  const caseMat = new THREE.MeshStandardMaterial({
    color: caseColor, metalness: 0.6, roughness: 0.4, name: 'case',
  });
  const caseMesh = new THREE.Mesh(buildCaseGeometry(W, D, CASE_H_FRONT, CASE_H_BACK), caseMat);
  caseMesh.castShadow = true;
  caseMesh.receiveShadow = true;
  caseLayer.add(caseMesh);

  // 橡胶脚垫 ×4
  const footMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.9, metalness: 0 });
  const footGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.12, 20);
  [[-W / 2 + 0.55, D / 2 - 0.5], [W / 2 - 0.55, D / 2 - 0.5],
   [-W / 2 + 0.55, -D / 2 + 0.5], [W / 2 - 0.55, -D / 2 + 0.5]].forEach(([fx, fz]) => {
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(fx, -0.06, fz);
    caseLayer.add(foot);
  });

  // USB-C 口（后缘）
  const port = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.22, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.6 }),
  );
  port.position.set(0, 0.42, -D / 2 - 0.02);
  caseLayer.add(port);

  // 品牌铭牌（前缘）
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 96;
  const pctx = plaqueCanvas.getContext('2d');
  pctx.clearRect(0, 0, 512, 96);
  pctx.fillStyle = '#c8ccd4';
  pctx.font = '600 52px "Segoe UI", Arial, sans-serif';
  pctx.textAlign = 'center';
  pctx.textBaseline = 'middle';
  pctx.fillText('KESTREL 67', 256, 50);
  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.6),
    new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true }),
  );
  plaque.position.set(W / 2 - 2.4, 0.3, D / 2 + 0.011);
  caseLayer.add(plaque);

  /* ---- 倾斜甲板：让定位板/键帽平行于壳体顶面（前低后高） ---- */
  const deck = new THREE.Group();
  deck.position.y = (CASE_H_FRONT + CASE_H_BACK) / 2;
  deck.rotation.x = Math.atan2(CASE_H_BACK - CASE_H_FRONT, D);
  root.add(deck);
  deck.add(plateLayer, capLayer); // add() 会自动从 root 移入 deck
  plateLayer.position.y = DECK_H / 2; // 板底面贴壳体顶面

  /* ---- 定位板 + 轴体 ---- */
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xb6bcc6, metalness: 0.9, roughness: 0.3, name: 'plate',
  });
  const plateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(LAYOUT.width + 0.5, DECK_H, LAYOUT.rows + 0.5),
    plateMat,
  );
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  plateLayer.add(plateMesh);

  // 轴体外壳与轴心（拆解后从键帽下露出）
  const switchGeo = new THREE.BoxGeometry(LAYOUT.pitch - 0.24, 0.3, LAYOUT.pitch - 0.24);
  const switchMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d44, roughness: 0.55, metalness: 0.2, name: 'switch',
  });
  const stemGeo = new THREE.BoxGeometry(0.16, 0.14, 0.16);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.5, name: 'stem' });

  /* ---- 键帽 ---- */
  const capBaseMat = new THREE.MeshStandardMaterial({
    color: capTheme.base, roughness: 0.65, metalness: 0.02, name: 'cap-base',
  });
  const capAccentMat = new THREE.MeshStandardMaterial({
    color: capTheme.accent, roughness: 0.6, metalness: 0.02, name: 'cap-accent',
  });

  const capMeshes = [];   // 拾取用
  const capRecords = []; // 按压动画状态

  keys.forEach((k) => {
    const capW = k.w - GAP;
    const capD = LAYOUT.pitch - GAP;
    const rounded = new RoundedBoxGeometry(capW, CAP_TOP, capD, 2, 0.07);
    const mat = k.accent ? capAccentMat : capBaseMat;
    const mesh = new THREE.Mesh(rounded, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 字符贴片（略高于键帽顶面）
    const legendColor = k.accent ? capTheme.legendAccent : capTheme.legend;
    const tex = makeLegendTexture(k.legend, legendColor);
    const legend = new THREE.Mesh(
      new THREE.PlaneGeometry(capW * 0.78, capD * 0.78),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    legend.rotation.x = -Math.PI / 2;
    legend.position.y = CAP_TOP / 2 + 0.006;

    const cap = new THREE.Group();
    cap.add(mesh, legend);
    cap.position.set(k.x, CAP_H + DECK_H / 2, k.z);
    capLayer.add(cap);

    // 轴体挂在定位板层（拆解时可见）
    const sw = new THREE.Mesh(switchGeo, switchMat);
    sw.position.set(k.x, DECK_H / 2 + 0.12, k.z);
    plateLayer.add(sw);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(k.x, DECK_H / 2 + 0.32, k.z);
    plateLayer.add(stem);

    capMeshes.push(mesh);
    capRecords.push({ cap, key: k, restY: cap.position.y, press: 0, velocity: 0 });
  });

  /* ---- 换色 / 换主题接口 ---- */
  function applyCaseColor(color) {
    caseMat.color.setHex(color);
  }

  function applyCapTheme(theme) {
    capBaseMat.color.setHex(theme.base);
    capAccentMat.color.setHex(theme.accent);
    capRecords.forEach((rec) => {
      const k = rec.key;
      const legendColor = k.accent ? theme.legendAccent : theme.legend;
      const newTex = makeLegendTexture(k.legend, legendColor);
      const legendMat = rec.cap.children[1].material;
      legendMat.map.dispose();
      legendMat.map = newTex;
      legendMat.needsUpdate = true;
    });
  }

  return {
    root, deck, caseLayer, plateLayer, capLayer,
    capRecords, capMeshes,
    applyCaseColor, applyCapTheme,
  };
}
