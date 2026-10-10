import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { KeyboardModel, type KeyHandle } from './KeyboardModel';
import { getFinish, getTheme, type KeyDef } from '../config/presets';
import { SwitchAudio } from '../audio/switch';

export interface StageOptions {
  onCapTap?: (key: KeyDef) => void;
  onFirstInteraction?: () => void;
  onExplodeChange?: (open: boolean) => void;
  labelHost?: HTMLElement | null;
}

type LabelLayer = 'caps' | 'plate' | 'case';

const DEFAULT_POLAR = 1.02; // ~58°
const DEFAULT_AZIMUTH = 0.52; // ~30°, three quarter view from the front right
const TARGET = new Vector3(0, 1.2, 0);

export class Stage {
  readonly model: KeyboardModel;
  failed = false;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private opts: StageOptions;
  private audio = new SwitchAudio();

  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private pointerDown: { x: number; y: number; time: number; moved: boolean } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private explodeValue = 0;
  private explodeTarget = 0;
  private autoRotate = true;
  private userInteracted = false;
  private fitDistance = 20;
  private userZoomed = false;
  private fitBox = new Box3();
  private raf = 0;
  private lastTime = 0;
  private hoverKey: KeyHandle | null = null;
  private tween: {
    fromPos: Vector3;
    toPos: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    start: number;
    duration: number;
  } | null = null;

  private labels: Partial<Record<LabelLayer, HTMLElement>> = {};
  private labelAnchors: Record<LabelLayer, Vector3> = {
    caps: new Vector3(),
    plate: new Vector3(),
    case: new Vector3(),
  };

  typingMode = false;

  constructor(container: HTMLElement, opts: StageOptions = {}) {
    this.container = container;
    this.opts = opts;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(31, width / height, 0.4, 220);
    this.camera.position.set(11, 13, 17);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = 0.22;
    this.controls.maxPolarAngle = 1.5;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.target.copy(TARGET);

    this.setupEnvironment();
    this.setupGround();

    this.model = new KeyboardModel(this.renderer.capabilities.getMaxAnisotropy());
    this.model.applyFinish(getFinish('aurora'));
    this.model.applyTheme(getTheme('nightfall'));
    this.model.root.position.y = 0.05;
    this.scene.add(this.model.root);

    this.updateViewOffset(width, height);
    this.fitBox = new Box3().setFromObject(this.model.root);
    this.bindEvents();
    this.fitCamera();
    this.model.startIntro();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }


  /* ---------------------------------------------------------------- scene */

  private setupEnvironment() {
    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.02);
    this.scene.environment = env.texture;
    (this.scene as Scene & { environmentIntensity?: number }).environmentIntensity = 0.85;
    room.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry?.dispose?.();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm?.dispose?.());
      }
    });
    pmrem.dispose();

    const key = new DirectionalLight(new Color('#ffffff'), 2.5);
    key.position.set(7.5, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 46;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.022;
    key.shadow.radius = 2.6;
    this.scene.add(key);

    const fill = new DirectionalLight(new Color('#a8c8ff'), 0.85);
    fill.position.set(-11, 7, 6);
    this.scene.add(fill);

    const rim = new DirectionalLight(new Color('#ffcfa3'), 1.35);
    rim.position.set(-5, 5, -12);
    this.scene.add(rim);

    this.scene.add(new HemisphereLight(new Color('#dce9ff'), new Color('#0a0c11'), 0.55));
  }

  private setupGround() {
    const catcher = new Mesh(
      new PlaneGeometry(120, 120),
      new ShadowMaterial({ opacity: 0.42, color: new Color('#03050a') }),
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    catcher.name = 'shadow-catcher';
    this.scene.add(catcher);

    // soft contact shadow so the board always looks anchored to the floor
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    grad.addColorStop(0, 'rgba(2,4,10,0.6)');
    grad.addColorStop(0.45, 'rgba(3,6,12,0.32)');
    grad.addColorStop(1, 'rgba(4,8,16,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const contact = new Mesh(
      new PlaneGeometry(19, 10.5),
      new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.004;
    contact.name = 'contact-shadow';
    this.scene.add(contact);
  }

  /* ------------------------------------------------------------- framing */

  /** places the camera so the whole product is visible, whatever the aspect */
  private fitCamera(animate = false, keepDistance = false) {
    this.updateFitFrac();
    const box = this.fitBox.clone();
    const center = box.getCenter(new Vector3());
    const dir = new Vector3(
      Math.sin(DEFAULT_POLAR) * Math.sin(DEFAULT_AZIMUTH),
      Math.cos(DEFAULT_POLAR),
      Math.sin(DEFAULT_POLAR) * Math.cos(DEFAULT_AZIMUTH),
    ).normalize();
    const target = new Vector3(center.x, TARGET.y, center.z);
    const corners = this.boxCorners(box);

    let distance = 22;
    for (let i = 0; i < 4; i++) {
      this.camera.position.copy(target).addScaledVector(dir, distance);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      let maxX = 0;
      let maxY = 0;
      for (const corner of corners) {
        const p = corner.clone().project(this.camera);
        maxX = Math.max(maxX, Math.abs(p.x));
        maxY = Math.max(maxY, Math.abs(p.y));
      }
      const worst = Math.max(maxX / this.fitFrac.x, maxY / this.fitFrac.y);
      distance *= Math.min(1.6, Math.max(0.7, worst));
    }
    this.fitDistance = distance;
    this.controls.minDistance = distance * 0.34;
    this.controls.maxDistance = distance * 2.6;
    if (keepDistance) {
      this.controls.target.copy(target);
      return;
    }
    const pos = target.clone().addScaledVector(dir, distance);
    if (animate) this.animateView(pos, target, 620);
    else {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  /** how much of the frame the product may fill (desktop leaves room for the HUD) */
  private fitFrac = { x: 0.53, y: 0.56 };

  private updateFitFrac() {
    const aspect = this.camera.aspect;
    if (aspect >= 1.5) this.fitFrac = { x: 0.53, y: 0.56 };
    else if (aspect >= 1.2) this.fitFrac = { x: 0.6, y: 0.56 };
    else this.fitFrac = { x: 0.96, y: 0.72 };
  }

  /** the HUD can sit around the product on wide screens, below it on phones */
  private updateViewOffset(width: number, height: number) {
    void width;
    void height;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private boxCorners(box: Box3): Vector3[] {
    const { min, max } = box;
    const out: Vector3[] = [];
    for (const x of [min.x, max.x])
      for (const y of [min.y, max.y])
        for (const z of [min.z, max.z]) out.push(new Vector3(x, y, z));
    return out;
  }

  resetView() {
    this.userZoomed = false;
    const box = this.fitBox.clone();
    const center = box.getCenter(new Vector3());
    const target = new Vector3(center.x, TARGET.y, center.z);
    const dir = new Vector3(
      Math.sin(DEFAULT_POLAR) * Math.sin(DEFAULT_AZIMUTH),
      Math.cos(DEFAULT_POLAR),
      Math.sin(DEFAULT_POLAR) * Math.cos(DEFAULT_AZIMUTH),
    ).normalize();
    this.animateView(target.clone().addScaledVector(dir, this.fitDistance), target, 640);
    this.model.releaseAll();
  }

  private animateView(toPos: Vector3, toTarget: Vector3, duration: number) {
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: toPos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
      start: performance.now(),
      duration,
    };
    this.controls.enabled = false;
  }


  /* ------------------------------------------------------------ interaction */

  private bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancel);
    dom.addEventListener('pointerleave', this.onPointerLeave);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
  }

  private markInteraction() {
    if (this.tween) {
      this.tween = null;
      this.controls.enabled = true;
    }
    if (!this.userInteracted) {
      this.userInteracted = true;
      this.controls.autoRotate = false;
      this.opts.onFirstInteraction?.();
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    this.markInteraction();
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now(), moved: false };
  };

  private onPointerMove = (event: PointerEvent) => {
    const dom = this.renderer.domElement;
    if (this.pointerDown) {
      const dist = Math.hypot(
        event.clientX - this.pointerDown.x,
        event.clientY - this.pointerDown.y,
      );
      if (dist > 7) this.pointerDown.moved = true;
      return;
    }
    const now = performance.now();
    if (now - this.lastHover < 45) return;
    this.lastHover = now;
    const hit = this.pickKey(event.clientX, event.clientY);
    this.hoverKey = hit;
    dom.style.cursor = hit ? 'pointer' : 'grab';
  };

  private lastHover = 0;

  private onPointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.moved) return;
    if (performance.now() - down.time > 700) return;
    const key = this.pickKey(event.clientX, event.clientY);
    if (!key || !key.def.code) return;
    this.tapKey(key.def.code, 150);
    this.opts.onCapTap?.(key.def);
  };

  private onPointerCancel = () => {
    this.pointerDown = null;
  };

  private onPointerLeave = () => {
    this.pointerDown = null;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private onWheel = () => {
    this.userZoomed = true;
    this.markInteraction();
  };

  private pickKey(clientX: number, clientY: number): KeyHandle | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.model.capsGroup.children, true);
    for (const hit of hits) {
      let obj = hit.object as import('three').Object3D | null;
      while (obj) {
        const handle = obj.userData?.key as KeyHandle | undefined;
        if (handle) return handle;
        obj = obj.parent;
      }
    }
    return null;
  }

  /** press + release a key (pointer taps and the typing hint use this) */
  tapKey(code: string, duration = 150) {
    const ok = this.model.pressCode(code, duration);
    if (ok && this.audio.enabled) this.audio.click('down');
    return ok;
  }

  pressKey(code: string) {
    const ok = this.model.setPressed(code, true);
    if (ok && this.audio.enabled) this.audio.click('down');
    return ok;
  }

  releaseKey(code: string) {
    const ok = this.model.setPressed(code, false);
    if (ok && this.audio.enabled) this.audio.click('up');
    return ok;
  }

  setTypingMode(enabled: boolean) {
    this.typingMode = enabled;
    if (!enabled) this.model.releaseAll();
  }

  setSound(enabled: boolean) {
    this.audio.enabled = enabled;
    if (enabled) this.audio.arm();
  }

  setAutoRotate(enabled: boolean) {
    this.controls.autoRotate = enabled;
    if (enabled) this.userInteracted = false;
  }

  get autoRotateEnabled() {
    return this.controls.autoRotate;
  }

  /* -------------------------------------------------------------- layers */

  setExploded(open: boolean) {
    this.explodeTarget = open ? 1 : 0;
  }

  get exploded() {
    return this.explodeValue;
  }

  get explodeTargetValue() {
    return this.explodeTarget;
  }

  /** screen position of a keycap — used by the automated UI check */
  projectKey(code: string): { x: number; y: number } | null {
    const handle = this.model.keyByCode(code)[0];
    if (!handle) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1) return null;
    const point = handle.pivot.getWorldPosition(new Vector3());
    point.project(this.camera);
    return {
      x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
    };
  }

  setLabelElements(elements: Partial<Record<'caps' | 'plate' | 'case', HTMLElement>>) {
    this.labels = elements;
  }

  private layoutLabels() {
    const alpha = Math.min(1, Math.max(0, (this.explodeValue - 0.18) / 0.3));
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h) return;
    const m = this.model;
    const anchors = {
      caps: m.deck.localToWorld(new Vector3(-4.6, m.capTopY + 0.55, -2.35)),
      plate: m.deck.localToWorld(new Vector3(-4.6, m.plateGroup.position.y + 0.25, -2.35)),
      case: m.caseGroup.localToWorld(new Vector3(-5.6, 0.85, 2.6)),
    };
    for (const layer of ['caps', 'plate', 'case'] as const) {
      const el = this.labels[layer];
      if (!el) continue;
      this.labelAnchors[layer].copy(anchors[layer]);
      const p = anchors[layer].clone().project(this.camera);
      const visible = alpha > 0.02 && p.z < 1;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      const x = rect.left + (p.x * 0.5 + 0.5) * w;
      const y = rect.top + (-p.y * 0.5 + 0.5) * h;
      el.style.transform =
        'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)';
      el.style.opacity = alpha.toFixed(3);
    }
  }

  /* -------------------------------------------------------------- setters */

  setFinish(id: string) {
    this.model.applyFinish(getFinish(id));
  }

  setTheme(id: string) {
    this.model.applyTheme(getTheme(id));
  }

  setSpaceLegend(text: string) {
    this.model.setSpaceLegend(text);
  }

  setPixelRatio(ratio: number) {
    this.renderer.setPixelRatio(Math.min(ratio, 2));
  }

  private onResize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.updateViewOffset(w, h);
    this.fitCamera(false, this.userZoomed);
  };

  /* ----------------------------------------------------------------- loop */

  private updateTween(now: number) {
    if (!this.tween) return;
    const t = Math.min(1, (now - this.tween.start) / this.tween.duration);
    const e = t * t * (3 - 2 * t);
    this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
    this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
    this.camera.lookAt(this.controls.target);
    if (t >= 1) {
      this.tween = null;
      this.controls.enabled = true;
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.1);

    this.updateTween(now);

    const diff = this.explodeTarget - this.explodeValue;
    if (Math.abs(diff) > 0.0008) {
      this.explodeValue += diff * (1 - Math.exp(-10.5 * dt));
    } else if (diff !== 0) {
      this.explodeValue = this.explodeTarget;
    }

    this.model.setExplode(this.explodeValue);
    this.model.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels();
    this.frames++;
  };

  private frames = 0;

  get debug() {
    return {
      keys: this.model.keys.length,
      pressAttention: this.model.keys.filter((k) => k.press > 0.01).length,
      exploded: Number(this.explodeValue.toFixed(3)),
      explodeTarget: this.explodeTarget,
      fitDistance: Number(this.fitDistance.toFixed(2)),
      cameraDistance: Number(this.camera.position.distanceTo(this.controls.target).toFixed(2)),
      polar: Number(this.controls.getPolarAngle().toFixed(3)),
      azimuth: Number(this.controls.getAzimuthalAngle().toFixed(3)),
      frames: this.frames,
      autoRotate: this.controls.autoRotate,
      typingMode: this.typingMode,
      sound: this.audio.enabled,
      finish: this.model.currentFinish?.id ?? null,
      theme: this.model.currentTheme?.id ?? null,
      bodyColor: `#${this.model.materialColors.body}`,
      capColor: `#${this.model.materialColors.std}`,
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerCancel);
    dom.removeEventListener('pointerleave', this.onPointerLeave);
    dom.removeEventListener('wheel', this.onWheel);
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.model.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry?.dispose?.();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm?.dispose?.());
      }
    });
    this.scene.clear();
    this.renderer.dispose();
    if (dom.parentElement === this.container) this.container.removeChild(dom);
  }
}
