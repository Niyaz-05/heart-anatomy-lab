import geometryJson from './generated/geometry.json';
import type { SimulationDefinition } from '../contract/schema';
import type { Vec3 } from './flowPath';

interface G { centroid: number[]; bounds: number[][]; interiorPoint?: number[]; surfaceAnchor?: number[] }
const geometry = geometryJson.structures as Record<string, G>;

const vec = (p: number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/**
 * A point to hang a label on: inside a chamber cast, on the structure's own surface otherwise,
 * midway between for a zone.
 */
export function anchorOf(def: SimulationDefinition, id: string): Vec3 | null {
  const g = geometry[id];
  if (g) return vec(g.interiorPoint ?? g.surfaceAnchor ?? g.centroid);
  const s = def.structures.find((x) => x.id === id);
  if (s?.kind === 'zone' && s.between) {
    const pts = s.between.map((b) => anchorOf(def, b)).filter((p): p is Vec3 => p !== null);
    if (!pts.length) return null;
    return [0, 1, 2].map((a) => pts.reduce((n, p) => n + p[a]!, 0) / pts.length) as Vec3;
  }
  return null;
}

/** Axis-aligned bounds of a set of structures (zones expand to what they lie between). */
export function boundsOfIds(def: SimulationDefinition, ids: readonly string[]): [Vec3, Vec3] | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (id: string) => {
    const g = geometry[id];
    if (g) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!);
        hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!);
      }
      return;
    }
    def.structures.find((x) => x.id === id)?.between?.forEach(visit);
  };
  ids.forEach(visit);
  return Number.isFinite(lo[0]) ? [lo, hi] : null;
}

/** Bounds of the whole model. */
export function modelBounds(): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const g of Object.values(geometry)) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!);
      hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!);
    }
  }
  return [lo, hi];
}

/** Bounds of the heart proper (walls only), used for the default framing. */
export function heartBounds(def: SimulationDefinition): [Vec3, Vec3] {
  const walls = def.structures.filter((s) => s.layer === 'wall' && s.kind === 'mesh').map((s) => s.id);
  return boundsOfIds(def, walls) ?? modelBounds();
}
