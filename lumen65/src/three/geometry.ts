import {
  BufferAttribute,
  ExtrudeGeometry,
  PlaneGeometry,
  Shape,
  type BufferGeometry,
} from 'three';

/** rounded rectangle outline centred on the origin */
export function roundedRectShape(width: number, depth: number, radius: number): Shape {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w * 0.98, d * 0.98);
  const s = new Shape();
  s.moveTo(-w + r, -d);
  s.lineTo(w - r, -d);
  s.quadraticCurveTo(w, -d, w, -d + r);
  s.lineTo(w, d - r);
  s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d);
  s.quadraticCurveTo(-w, d, -w, d - r);
  s.lineTo(-w, -d + r);
  s.quadraticCurveTo(-w, -d, -w + r, -d);
  return s;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** how much the top face of a keycap is pulled in relative to its base */
export const CAP_TAPER = 0.78;
/** bevel size used by createKeycapGeometry */
export const CAP_BEVEL = 0.028;

/**
 * A keycap: rounded bottom footprint, tapered towards the top, slightly
 * rounded edges (bevel) — the geometry's origin sits on the *bottom* face,
 * +Y is up. Row specific sculpting is applied by the caller (rotation/height).
 */
export function createKeycapGeometry(width: number, depth: number, height: number): BufferGeometry {
  const bevel = CAP_BEVEL;
  const radius = Math.min(0.13, width * 0.2, depth * 0.2);
  const shape = roundedRectShape(width, depth, radius);
  const geom = new ExtrudeGeometry(shape, {
    depth: Math.max(0.05, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 3,
  });

  // ---- taper: keep the skirt straight-ish, pull the shoulder in
  const pos = geom.attributes.position as BufferAttribute;
  const taper = CAP_TAPER;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, (z + bevel) / height));
    const s = 1 + (taper - 1) * smoothstep(t);
    pos.setX(i, pos.getX(i) * s);
    pos.setY(i, pos.getY(i) * s);
  }

  // stand the cap up: local +Z (extrusion) becomes world +Y
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, bevel, 0);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export interface SlabOptions {
  width: number;
  depth: number;
  height: number;
  radius?: number;
  bevel?: number;
  curveSegments?: number;
}

/** a flat rounded slab (plate / gasket / tray), origin on the bottom face */
export function createSlabGeometry({
  width,
  depth,
  height,
  radius = 0.2,
  bevel = 0.03,
  curveSegments = 6,
}: SlabOptions): BufferGeometry {
  const shape = roundedRectShape(width, depth, radius);
  const geom = new ExtrudeGeometry(shape, {
    depth: Math.max(0.02, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    steps: 1,
    curveSegments,
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, bevel, 0);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Bottom shell: a rounded slab whose top face is sheared so that the deck
 * slopes down towards the user (front).  The bottom stays perfectly flat,
 * the profile is a straight wedge:  y -= y * k * (z - zMin)/depth.
 *
 * Returns geometry plus the resulting deck metrics so the plate/keycaps can
 * be placed on exactly the same plane.
 */
export function createCaseGeometry(opts: {
  width: number;
  depth: number;
  frontHeight: number;
  rearHeight: number;
  radius?: number;
  bevel?: number;
}): { geometry: BufferGeometry; deckTilt: number; deckY: number; front: number; rear: number } {
  const { width, depth, frontHeight, rearHeight, radius = 0.34, bevel = 0.045 } = opts;
  const geom = createSlabGeometry({
    width,
    depth,
    height: frontHeight,
    radius,
    bevel,
    curveSegments: 8,
  });
  const pos = geom.attributes.position as BufferAttribute;
  const zMin = -depth / 2;
  const k = (rearHeight - frontHeight) / frontHeight; // height gain at the back
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, (z - zMin) / depth)); // 0 = back, 1 = front
    const y = pos.getY(i);
    pos.setY(i, y * (1 + k * (1 - t)));
  }
  pos.needsUpdate = true;
  geom.translate(0, 0, 0);
  geom.computeVertexNormals();
  geom.computeBoundingBox();

  // deck plane matches y(z) = frontHeight - (rearHeight - frontHeight) * (z/depth)
  const deckTilt = Math.atan((rearHeight - frontHeight) / depth);
  const deckY = (frontHeight + rearHeight) / 2;
  return { geometry: geom, deckTilt, deckY, front: frontHeight, rear: rearHeight };
}

/** plane used to print legends on top of a keycap */
export function createLegendPlateGeometry(width: number, depth: number): BufferGeometry {
  const geom = new PlaneGeometry(width, depth, 1, 1);
  geom.rotateX(-Math.PI / 2);
  return geom;
}

/** small helper used by the badge / port details */
export function createRoundedPlate(width: number, depth: number, height: number, radius = 0.05) {
  return createSlabGeometry({ width, depth, height, radius, bevel: 0.012, curveSegments: 4 });
}
