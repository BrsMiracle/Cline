/**
 * 场景管理：渲染器、相机、灯光、轨道控制、
 * 拆解动画、键帽按压动画与点击拾取。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EXPLODE_STEP = { case: 0, plate: 1.9, caps: 3.9 }; // 拆解后各层抬起高度

export function createScene(container, keyboard) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(keyboard.root);

  // ---- 相机：初始 3/4 俯视角完整展示产品 ----
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const HOME_POS = new THREE.Vector3(7.5, 15.5, 25.5);
  const HOME_TARGET = new THREE.Vector3(2.6, 0.6, 0);
  camera.position.copy(HOME_POS);

  // ---- 灯光 ----
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x30343c, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(9, 16, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5);
  fill.position.set(-12, 8, -6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff9d6b, 0.55);
  rim.position.set(-4, 6, -14);
  scene.add(rim);

  // 地面接触阴影
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.ShadowMaterial({ opacity: 0.28 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.13;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 轨道控制：整体旋转 + 缩放，阻尼平滑 ----
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 55;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  let viewTween = null; // 复位/缩放动画
  function tweenView(pos, target, dur = 0.7) {
    viewTween = {
      fromP: camera.position.clone(), toP: pos.clone(),
      fromT: controls.target.clone(), toT: target.clone(),
      t: 0, dur,
    };
  }
  controls.addEventListener('start', () => { viewTween = null; });

  function resetView() { tweenView(HOME_POS, HOME_TARGET); }
  function zoomBy(factor) {
    const dir = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(dir.length() * factor, controls.minDistance, controls.maxDistance);
    tweenView(controls.target.clone().add(dir.setLength(len)), controls.target, 0.45);
  }

  // ---- 拆解状态：始终朝目标平滑插值，快速连点也能收敛到正确位置 ----
  let explodeTarget = 0;
  let explodeCur = 0;
  const basePlateY = keyboard.plateLayer.position.y;
  const baseCapY = keyboard.capLayer.position.y;
  function setExploded(on) { explodeTarget = on ? 1 : 0; }

  // ---- 键帽按压：弹簧积分，支持长按与快速连击 ----
  const K = 420;  // 弹簧刚度
  const C = 26;   // 阻尼
  const TRAVEL = 0.17; // 键程
  function pressKey(rec, hold = true) {
    rec.hold = hold;
    rec.press = Math.max(rec.press, 0.001);
    rec.velocity = -4.5; // 给一个向下的初速，下压更脆
  }
  function releaseKey(rec) { rec.hold = false; }

  // ---- 点击/触摸键帽拾取 ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPos = null;
  let onCapPress = null; // 回调：(key) => void
  function setCapPressHandler(fn) { onCapPress = fn; }

  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(keyboard.capMeshes, false);
    if (hits.length) {
      const cap = hits[0].object.parent;
      return cap.userData.key || keyboard.capRecords.find((r) => r.cap === cap)?.key;
    }
    return null;
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return; // 是拖拽旋转，不是点击
    const key = pick(e);
    if (key && onCapPress) onCapPress(key);
  });

  // ---- 主循环 ----
  const clock = new THREE.Clock();
  let running = true;
  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    // 拆解插值（指数趋近，天然抗快速连点）
    const rate = 1 - Math.exp(-dt * 6.5);
    explodeCur += (explodeTarget - explodeCur) * rate;
    if (Math.abs(explodeTarget - explodeCur) < 0.0004) explodeCur = explodeTarget;
    keyboard.capLayer.position.y = baseCapY + explodeCur * EXPLODE_STEP.caps;
    keyboard.plateLayer.position.y = basePlateY + explodeCur * EXPLODE_STEP.plate;

    // 键帽按压弹簧
    keyboard.capRecords.forEach((rec) => {
      if (rec.hold) {
        // 目标：压到底
        const a = K * (TRAVEL - rec.press) - C * rec.velocity;
        rec.velocity += a * dt;
      } else if (rec.press > 0 || rec.velocity !== 0) {
        const a = -K * rec.press - C * rec.velocity;
        rec.velocity += a * dt;
      } else return;
      rec.press += rec.velocity * dt;
      if (!rec.hold && rec.press <= 0 && Math.abs(rec.velocity) < 0.05) {
        rec.press = 0;
        rec.velocity = 0;
      }
      rec.cap.position.y = rec.restY - rec.press;
    });

    // 视角补间
    if (viewTween) {
      viewTween.t = Math.min(1, viewTween.t + dt / viewTween.dur);
      const e = 1 - Math.pow(1 - viewTween.t, 3);
      camera.position.lerpVectors(viewTween.fromP, viewTween.toP, e);
      controls.target.lerpVectors(viewTween.fromT, viewTween.toT, e);
      if (viewTween.t >= 1) viewTween = null;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ---- 尺寸自适应 ----
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return {
    renderer, scene, camera, controls,
    setExploded, resetView, zoomBy,
    pressKey, releaseKey, setCapPressHandler,
  };
}
