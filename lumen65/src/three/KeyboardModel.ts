import {
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  CylinderGeometry,
  type Material,
  type Texture,
  type BufferGeometry,
} from 'three';
import {
  GAP,
  PITCH,
  ROW_DEPTH,
  ROW_HEIGHT,
  ROW_TILT,
  KEYS,
  type Finish,
  type KeyDef,
  type KeycapTheme,
} from '../config/presets';
import {
  CAP_TAPER,
  createCaseGeometry,
  createKeycapGeometry,
  createLegendPlateGeometry,
  createSlabGeometry,
} from './geometry';
import { createLegendTexture, createWordmarkTexture } from './legends';

export interface KeyHandle {
  def: KeyDef;
  pivot: Group;
  cap: Mesh;
  legend: Mesh | null;
  baseX: number;
  baseZ: number;
  /** resting height inside the cap group */
  baseY: number;
  /** 0 = up, 1 = fully pressed (animated with a light spring for the rebound) */
  press: number;
  pressVel: number;
  pressTarget: number;
  /** extra height used by the drop-in intro animation */
  introLift: number;
  introVel: number;
  introDelay: number;
}

interface CaseMetrics {
  width: number;
  depth: number;
  front: number;
  rear: number;
}

const CASE_MARGIN = { side: 0.35, back: 0.5, front: 0.55 };
const KEY_AREA_WIDTH = 15;
const KEY_AREA_DEPTH = 5;
/** top of the switch housings = bottom of the keycaps */
const CAP_BASE_Y = 0.44;
const LEGEND_OFFSET = 0.006;
/** the shell rests on its rubber feet */
const BASE_Y = 0.05;
const PLATE_HEIGHT = 0.16;

export class KeyboardModel {
  readonly root = new Group();
  readonly caseGroup = new Group();
  readonly deck = new Group();
  readonly plateGroup = new Group();
  readonly capsGroup = new Group();
  readonly keys: KeyHandle[] = [];

  private caseMetrics: CaseMetrics;
  private deckTilt = 0;
  private deckY = 0;
  private badgeMesh!: Mesh;

  private materials: {
    body: MeshPhysicalMaterial;
    tray: MeshStandardMaterial;
    accent: MeshStandardMaterial;
    plate: MeshStandardMaterial;
    gasket: MeshStandardMaterial;
    switchBody: MeshStandardMaterial;
    stem: MeshStandardMaterial;
    rubber: MeshStandardMaterial;
    badge: MeshStandardMaterial;
    led: MeshStandardMaterial[];
  };

  private capMaterials = new Map<string, MeshPhysicalMaterial>();
  private legendMaterials = new Map<KeyHandle, MeshStandardMaterial>();
  private spaceText = 'LUMEN 65';
  private wordmark: Texture | null = null;
  private readonly anisotropy: number;
  private theme: KeycapTheme | null = null;
  private finish: Finish | null = null;
  private disposables: Array<BufferGeometry | Material | Texture> = [];

  constructor(anisotropy = 1) {
    this.anisotropy = anisotropy;
    this.caseMetrics = {
      width: KEY_AREA_WIDTH + CASE_MARGIN.side * 2,
      depth: KEY_AREA_DEPTH + CASE_MARGIN.back + CASE_MARGIN.front,
      front: 0.95,
      rear: 1.55,
    };

    this.materials = {
      body: new MeshPhysicalMaterial({ metalness: 0.9, roughness: 0.3, envMapIntensity: 1 }),
      tray: new MeshStandardMaterial({ metalness: 0.85, roughness: 0.5 }),
      accent: new MeshStandardMaterial({ metalness: 1, roughness: 0.28, envMapIntensity: 1.1 }),
      plate: new MeshStandardMaterial({ color: 0x33383f, metalness: 0.75, roughness: 0.42 }),
      gasket: new MeshStandardMaterial({ color: 0x191b20, metalness: 0.1, roughness: 0.95 }),
      switchBody: new MeshStandardMaterial({ color: 0x131519, metalness: 0.15, roughness: 0.65 }),
      stem: new MeshStandardMaterial({ color: 0x8ea2ff, metalness: 0.05, roughness: 0.55 }),
      rubber: new MeshStandardMaterial({ color: 0x0f1114, metalness: 0, roughness: 1 }),
      badge: new MeshStandardMaterial({
        transparent: true,
        metalness: 0.9,
        roughness: 0.32,
        envMapIntensity: 1.2,
      }),
      led: [
        new MeshStandardMaterial({ color: 0x1a1d22, emissive: 0x63b3ff, emissiveIntensity: 2.4 }),
        new MeshStandardMaterial({ color: 0x1a1d22, emissive: 0x0a2a44, emissiveIntensity: 1 }),
        new MeshStandardMaterial({ color: 0x1a1d22, emissive: 0x0a2a44, emissiveIntensity: 1 }),
      ],
    };

    this.root.add(this.caseGroup, this.deck);
    this.root.name = 'LUMEN_65';
    this.root.position.y = BASE_Y;
    this.buildCase();
    this.buildPlate();
    this.buildKeys();
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
      }
    });
  }

  /* ------------------------------------------------------------------ case */

  private buildCase() {
    const { width, depth, front, rear } = this.caseMetrics;
    const made = createCaseGeometry({
      width,
      depth,
      frontHeight: front,
      rearHeight: rear,
      radius: 0.36,
      bevel: 0.05,
    });
    this.deckTilt = made.deckTilt;
    this.deckY = made.deckY;
    this.disposables.push(made.geometry);

    const shell = new Mesh(made.geometry, this.materials.body);
    shell.name = 'case-shell';
    shell.receiveShadow = true;
    this.caseGroup.add(shell);

    // inner tray, visible through the gaps between keycaps
    const trayGeom = createSlabGeometry({
      width: width - 0.5,
      depth: depth - 0.6,
      height: 0.34,
      radius: 0.28,
      bevel: 0.04,
    });
    const tray = new Mesh(trayGeom, this.materials.tray);
    tray.position.y = front - 0.3;
    tray.receiveShadow = true;
    this.disposables.push(trayGeom);
    this.caseGroup.add(tray);

    // accent band around the case (suggests a two piece shell)
    const bandGeom = createSlabGeometry({
      width: width + 0.014,
      depth: depth + 0.014,
      height: 0.06,
      radius: 0.375,
      bevel: 0.008,
      curveSegments: 8,
    });
    const band = new Mesh(bandGeom, this.materials.accent);
    band.position.y = 0.5;
    band.name = 'case-band';
    this.disposables.push(bandGeom);
    this.caseGroup.add(band);



    // USB-C port on the back face
    const portGeom = createSlabGeometry({
      width: 0.78,
      depth: 0.26,
      height: 0.34,
      radius: 0.12,
      bevel: 0.012,
    });
    const port = new Mesh(portGeom, this.materials.gasket);
    port.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    port.position.set(0, 0.38, -depth / 2 + 0.05);
    port.name = 'usb-c';
    port.castShadow = false;
    this.disposables.push(portGeom);
    this.caseGroup.add(port);

    // rubber feet — the shell floats a hair above the desk
    const footGeom = new CylinderGeometry(0.19, 0.15, 0.05, 18);
    this.disposables.push(footGeom);
    const feet: Array<[number, number]> = [
      [-width / 2 + 0.62, -depth / 2 + 0.72],
      [width / 2 - 0.62, -depth / 2 + 0.72],
      [-width / 2 + 0.62, depth / 2 - 0.72],
      [width / 2 - 0.62, depth / 2 - 0.72],
    ];
    for (const [x, z] of feet) {
      const foot = new Mesh(footGeom, this.materials.rubber);
      foot.position.set(x, 0.025, z);
      foot.castShadow = false;
      this.caseGroup.add(foot);
    }

    // status LEDs on the front strip
    const ledGeom = new CylinderGeometry(0.045, 0.045, 0.016, 14);
    this.disposables.push(ledGeom);
    [-0.17, 0, 0.17].forEach((dx, i) => {
      const led = new Mesh(ledGeom, this.materials.led[i]);
      led.position.set(width / 2 - 0.8 + dx, front + 0.01, depth / 2 - 0.17);
      led.castShadow = false;
      this.caseGroup.add(led);
    });

    // etched wordmark on the front lip
    const badgeGeom = new PlaneGeometry(2.3, 0.27);
    this.disposables.push(badgeGeom);
    this.badgeMesh = new Mesh(badgeGeom, this.materials.badge);
    this.badgeMesh.position.set(-width / 2 + 1.6, 0.47, depth / 2 + 0.006);
    this.badgeMesh.name = 'badge';
    this.badgeMesh.castShadow = false;
    this.caseGroup.add(this.badgeMesh);

    this.deck.position.y = this.deckY;
    this.deck.rotation.x = this.deckTilt;
    this.deck.add(this.plateGroup, this.capsGroup);
    this.plateGroup.name = 'plate-group';
    this.capsGroup.name = 'caps-group';
  }

  /* ----------------------------------------------------------------- plate */

  private buildPlate() {
    const plateW = KEY_AREA_WIDTH + 0.3;
    const plateD = KEY_AREA_DEPTH + 0.5;

    // poron gasket peeking out under the plate
    const gasketGeom = createSlabGeometry({
      width: plateW + 0.14,
      depth: plateD + 0.14,
      height: 0.075,
      radius: 0.26,
      bevel: 0.02,
    });
    const gasket = new Mesh(gasketGeom, this.materials.gasket);
    gasket.position.y = -0.062;
    gasket.name = 'gasket';
    gasket.receiveShadow = true;
    this.disposables.push(gasketGeom);
    this.plateGroup.add(gasket);

    // the aluminium plate itself
    const plateGeom = createSlabGeometry({
      width: plateW,
      depth: plateD,
      height: PLATE_HEIGHT,
      radius: 0.2,
      bevel: 0.026,
      curveSegments: 6,
    });
    const plate = new Mesh(plateGeom, this.materials.plate);
    plate.position.y = -0.02;
    plate.name = 'plate';
    plate.receiveShadow = true;
    this.disposables.push(plateGeom);
    this.plateGroup.add(plate);

    // switch housings (one per key) + stems
    const housingGeom = createSlabGeometry({
      width: 0.62,
      depth: 0.62,
      height: 0.3,
      radius: 0.07,
      bevel: 0.018,
      curveSegments: 3,
    });
    const stemGeom = new CylinderGeometry(0.075, 0.085, 0.16, 14);
    this.disposables.push(housingGeom, stemGeom);
    for (const key of KEYS) {
      const housing = new Mesh(housingGeom, this.materials.switchBody);
      housing.position.set(key.x, PLATE_HEIGHT - 0.02, key.z);
      this.plateGroup.add(housing);
      const stem = new Mesh(stemGeom, this.materials.stem);
      stem.position.set(key.x, PLATE_HEIGHT + CAP_BASE_Y - 0.05, key.z);
      this.plateGroup.add(stem);
    }

  }
  /* ------------------------------------------------------------------ keys */

  private buildKeys() {
    const capGeoms = new Map<string, BufferGeometry>();
    const legendGeoms = new Map<string, BufferGeometry>();
    for (const def of KEYS) {
      const w = def.w * PITCH - GAP;
      const d = ROW_DEPTH[def.row] - GAP;
      const h = ROW_HEIGHT[def.row];
      const gk = `${w.toFixed(3)}|${d.toFixed(3)}|${h.toFixed(3)}`;
      let capGeom = capGeoms.get(gk);
      if (!capGeom) {
        capGeom = createKeycapGeometry(w, d, h);
        capGeoms.set(gk, capGeom);
        this.disposables.push(capGeom);
      }
      const lk = `${(w * CAP_TAPER).toFixed(3)}|${(d * CAP_TAPER).toFixed(3)}`;
      let legendGeom = legendGeoms.get(lk);
      if (!legendGeom) {
        legendGeom = createLegendPlateGeometry(w * CAP_TAPER, d * CAP_TAPER);
        legendGeoms.set(lk, legendGeom);
        this.disposables.push(legendGeom);
      }

      const pivot = new Group();
      pivot.name = `key-${def.code ?? def.label}`;
      pivot.position.set(def.x, CAP_BASE_Y, def.z);
      pivot.rotation.x = ROW_TILT[def.row];

      const matKind = def.kind === 'mod' || def.kind === 'arrow' ? 'mod' : def.kind;
      const capMaterial = this.capMaterial(matKind);
      const cap = new Mesh(capGeom, capMaterial);
      cap.name = `${pivot.name}-cap`;
      pivot.add(cap);

      const handle: KeyHandle = {
        def,
        pivot,
        cap,
        legend: null,
        baseX: def.x,
        baseZ: def.z,
        baseY: CAP_BASE_Y,
        press: 0,
        pressVel: 0,
        pressTarget: 0,
        introLift: 0,
        introVel: 0,
        introDelay: 0,
      };

      // printed legend on the cap's top face
      const legendMat = new MeshStandardMaterial({
        transparent: true,
        depthWrite: false,
        roughness: 0.45,
        metalness: 0.02,
        envMapIntensity: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      legendMat.name = 'legend';
      const legend = new Mesh(legendGeom, legendMat);
      legend.name = `${pivot.name}-legend`;
      legend.position.y = h + LEGEND_OFFSET;
      legend.castShadow = false;
      legend.receiveShadow = false;
      pivot.add(legend);
      handle.legend = legend;
      cap.userData.key = handle;
      legend.userData.key = handle;
      this.legendMaterials.set(handle, legendMat);

      this.capsGroup.add(pivot);
      this.keys.push(handle);
      if (def.code) {
        const list = this.byCode.get(def.code);
        if (list) list.push(handle);
        else this.byCode.set(def.code, [handle]);
      }
    }
  }

  private byCode = new Map<string, KeyHandle[]>();
  private introActive = false;
  private introRoot = 0;
  private introRootVel = 0;
  private introPlate = 0;
  private introPlateVel = 0;
  private capMaterial(kind: string): MeshPhysicalMaterial {
    let mat = this.capMaterials.get(kind);
    if (!mat) {
      mat = new MeshPhysicalMaterial({
        metalness: 0.03,
        roughness: 0.6,
        clearcoat: 0.22,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.75,
      });
      mat.name = `cap-${kind}`;
      this.capMaterials.set(kind, mat);
      this.disposables.push(mat);
    }
    return mat;
  }




  /* --------------------------------------------------------------- theming */

  applyFinish(finish: Finish) {
    this.finish = finish;
    this.materials.body.color.setHex(finish.body);
    this.materials.body.metalness = finish.metalness;
    this.materials.body.roughness = finish.roughness;
    this.materials.tray.color.setHex(finish.tray);
    this.materials.accent.color.setHex(finish.accent);
    this.materials.badge.color.setHex(finish.accent);

    this.wordmark?.dispose();
    this.wordmark = createWordmarkTexture('LUMEN 65', '#ffffff', 8.4);
    this.materials.badge.map = this.wordmark;
    this.materials.badge.needsUpdate = true;
  }

  /** custom legend printed on the space bar */
  setSpaceLegend(text: string) {
    this.spaceText = text;
    for (const handle of this.keys) {
      if (handle.def.code === 'Space') this.refreshLegend(handle);
    }
  }

  private refreshLegend(handle: KeyHandle) {
    const theme = this.theme;
    if (!theme) return;
    const def = handle.def;
    const w = def.w * PITCH - GAP;
    const d = ROW_DEPTH[def.row] - GAP;
    const tex = createLegendTexture(
      def,
      theme,
      w * CAP_TAPER,
      d * CAP_TAPER,
      this.anisotropy,
      this.spaceText,
    );
    const mat = this.legendMaterials.get(handle);
    if (!mat) return;
    const previous = mat.map;
    mat.map = tex;
    mat.needsUpdate = true;
    previous?.dispose();
  }

  applyTheme(theme: KeycapTheme) {
    this.theme = theme;
    const std = this.capMaterial('std');
    std.color.setHex(theme.base);
    std.roughness = theme.roughness;
    const mod = this.capMaterial('mod');
    mod.color.setHex(theme.mod);
    mod.roughness = theme.roughness;
    const accent = this.capMaterial('accent');
    accent.color.setHex(theme.accent);
    accent.roughness = Math.max(0.35, theme.roughness - 0.12);
    this.materials.stem.color.setHex(theme.accent).lerp(new Color(0xffffff), 0.42);

    // repaint every legend for the new colour scheme
    for (const handle of this.keys) this.refreshLegend(handle);
  }

  /* ------------------------------------------------------------- behaviour */

  /** press = 1 → key fully down; update() springs it back for a natural rebound */
  setPressed(code: string, down: boolean) {
    const list = this.byCode.get(code);
    if (!list) return false;
    for (const handle of list) handle.pressTarget = down ? 1 : 0;
    return true;
  }

  /** tap a key for `duration` ms (used by pointer input on the caps) */
  pressCode(code: string, duration = 0) {
    const list = this.byCode.get(code);
    if (!list) return false;
    for (const handle of list) {
      handle.pressTarget = 1;
      handle.pressVel += 12;
    }
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => this.setPressed(code, false), duration);
    }
    return true;
  }

  releaseAll() {
    for (const handle of this.keys) handle.pressTarget = 0;
  }

  keyByCode(code: string): KeyHandle[] {
    return this.byCode.get(code) ?? [];
  }

  /** explodes the three layers: 0 = assembled, 1 = fully open */
  setExplode(e: number) {
    const spread = 1 + 0.045 * e;
    this.plateGroup.position.y = 0.85 * e + this.introPlate;
    this.capsGroup.position.y = 1.85 * e;
    for (const handle of this.keys) {
      handle.pivot.position.x = handle.baseX * spread;
      handle.pivot.position.z = handle.baseZ * spread;
    }
  }

  /** the keycaps drop onto the board, row by row, when the page opens */
  startIntro() {
    this.introActive = true;
    this.introRoot = 2.1;
    this.introRootVel = 0;
    this.introPlate = 1.15;
    this.introPlateVel = 0;
    for (const handle of this.keys) {
      handle.introLift = 3.1 + handle.def.row * 0.22;
      handle.introVel = 0;
      handle.introDelay = 0.12 + handle.def.row * 0.085;
    }
  }

  update(dt: number) {
    const depth = 0.16;
    let remaining = Math.min(dt, 0.06);
    while (remaining > 0) {
      const h = Math.min(1 / 180, remaining);
      remaining -= h;

      if (this.introActive) {
        this.introActive = this.stepIntro(h);
        this.root.position.y = BASE_Y + this.introRoot;
      }

      for (const handle of this.keys) {
        if (handle.introDelay > 0) {
          handle.introDelay -= h;
          handle.pivot.position.y =
            handle.baseY + handle.introLift - handle.press * depth;
          continue;
        }
        if (handle.introLift !== 0 || handle.introVel !== 0) {
          const accel = -handle.introLift * 120 - handle.introVel * 13;
          handle.introVel += accel * h;
          handle.introLift += handle.introVel * h;
          if (Math.abs(handle.introLift) < 0.0015 && Math.abs(handle.introVel) < 0.02) {
            handle.introLift = 0;
            handle.introVel = 0;
          }
        }
        if (handle.press === handle.pressTarget && Math.abs(handle.pressVel) < 0.0005) {
          handle.pressVel = 0;
          handle.pivot.position.y = handle.baseY + handle.introLift;
          continue;
        }
        const accel = (handle.pressTarget - handle.press) * 900 - handle.pressVel * 26;
        handle.pressVel += accel * h;
        handle.press += handle.pressVel * h;
        if (
          Math.abs(handle.pressTarget - handle.press) < 0.0004 &&
          Math.abs(handle.pressVel) < 0.012
        ) {
          handle.press = handle.pressTarget;
          handle.pressVel = 0;
        }
        handle.pivot.position.y =
          handle.baseY + handle.introLift - handle.press * depth;
      }
    }
  }

  private stepIntro(h: number): boolean {
    let busy = Math.abs(this.introRoot) > 0.002 || Math.abs(this.introRootVel) > 0.02;
    this.introRootVel += (-this.introRoot * 90 - this.introRootVel * 15) * h;
    this.introRoot += this.introRootVel * h;
    if (Math.abs(this.introRoot) < 0.002 && Math.abs(this.introRootVel) < 0.03) {
      this.introRoot = 0;
      this.introRootVel = 0;
    }
    this.introPlateVel += (-this.introPlate * 150 - this.introPlateVel * 18) * h;
    this.introPlate += this.introPlateVel * h;
    if (Math.abs(this.introPlate) < 0.002 && Math.abs(this.introPlateVel) < 0.03) {
      this.introPlate = 0;
      this.introPlateVel = 0;
    }
    if (!busy) {
      const keys = this.keys.some((k) => Math.abs(k.introLift) > 0.002);
      busy = keys;
    }
    return busy;
  }

  get tilt() {
    return this.deckTilt;
  }

  get deckHeight() {
    return this.deckY;
  }

  get metrics() {
    return this.caseMetrics;
  }

  get currentFinish() {
    return this.finish;
  }

  get currentTheme() {
    return this.theme;
  }

  /** cap top surface, in cap-group local space (used by the label overlay) */
  get capTopY() {
    const tallest = Math.max(...ROW_HEIGHT);
    return this.capsGroup.position.y + CAP_BASE_Y + tallest;
  }

  /** current colours, handy for debugging + automated checks */
  get materialColors() {
    const hex = (m: { color: { getHexString(): string } }) => m.color.getHexString();
    return {
      body: hex(this.materials.body),
      tray: hex(this.materials.tray),
      std: hex(this.capMaterial('std')),
      mod: hex(this.capMaterial('mod')),
      accent: hex(this.capMaterial('accent')),
    };
  }

  dispose() {
    this.wordmark?.dispose();
    this.legendMaterials.forEach((m) => m.map?.dispose());
    this.disposables.forEach((d) => d.dispose?.());
    this.legendMaterials.forEach((m) => m.dispose());
    this.legendMaterials.clear();
    this.capMaterials.clear();
    this.root.clear();
    this.keys.length = 0;
    this.byCode.clear();
  }
}
