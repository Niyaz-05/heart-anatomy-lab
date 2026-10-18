/**
 * Builds the blood-flow streams from measured model geometry: chamber interior points (inside
 * the closed cavity casts), valve centroids (in the orifice) and vessel centrelines. Nothing is
 * hand-placed except the short off-model legs to the lungs and body, which are drawn dashed and
 * labelled as schematic.
 */
import geometryJson from './generated/geometry.json';
import type { Oxygenation } from '../contract/schema';

export type Vec3 = [number, number, number];

interface StructureGeometry {
  centroid: number[];
  bounds: number[][];
  interiorPoint?: number[];
  centreline?: number[][];
}
const geometry = geometryJson.structures as Record<string, StructureGeometry>;

export interface FlowStream {
  id: string;
  blood: Exclude<Oxygenation, 'not-applicable'>;
  points: Vec3[];
  /** Index ranges of `points` that lie off the model (drawn dashed). */
  offModel: { from: number; to: number; label: 'Body' | 'Lungs' }[];
  /** Structures this stream passes through, in order. */
  through: string[];
}

const v = (p: number[] | undefined, what: string): Vec3 => {
  if (!p || p.length !== 3) throw new Error(`flow path: missing geometry for ${what}`);
  return [p[0]!, p[1]!, p[2]!];
};
const g = (id: string) => {
  const s = geometry[id];
  if (!s) throw new Error(`flow path: no geometry for "${id}"`);
  return s;
};
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const chamber = (id: string) => v(g(id).interiorPoint, `${id} interior point`);
const valve = (id: string) => v(g(id).centroid, `${id} centroid`);
/** Vessel centreline ordered so it starts at the end nearest `from`. */
function vessel(id: string, from: Vec3): Vec3[] {
  const line = (g(id).centreline ?? []).map((p, i) => v(p, `${id} centreline ${i}`));
  if (line.length < 2) throw new Error(`flow path: ${id} has no centreline`);
  return dist(line[0]!, from) <= dist(line[line.length - 1]!, from) ? line : [...line].reverse();
}
/** Vessel centreline ordered so it ends at the end nearest `to`. */
const vesselTo = (id: string, to: Vec3) => vessel(id, to).reverse();

const OFF = 0.03; // length of the schematic off-model legs, metres

export function buildFlowStreams(): FlowStream[] {
  const ra = chamber('right-atrium'), rv = chamber('right-ventricle');
  const la = chamber('left-atrium'), lv = chamber('left-ventricle');

  const svc = vesselTo('superior-vena-cava', ra);
  const ivc = vesselTo('inferior-vena-cava', ra);
  const pt = vessel('pulmonary-trunk', valve('pulmonary-valve'));
  const ptEnd = pt[pt.length - 1]!;
  const rpa = vessel('right-pulmonary-artery', ptEnd);
  const lpa = vessel('left-pulmonary-artery', ptEnd);
  const lungR = add(rpa[rpa.length - 1]!, [-OFF, 0, 0]);
  const lungL = add(lpa[lpa.length - 1]!, [OFF, 0, 0]);
  const asc = vessel('ascending-aorta', valve('aortic-valve'));
  const arch = vessel('aortic-arch', asc[asc.length - 1]!);
  const desc = vessel('descending-thoracic-aorta', arch[arch.length - 1]!);

  const vein = (id: string, lung: Vec3): FlowStream => {
    const line = vesselTo(id, la);
    return { id, blood: 'oxygen-rich', points: [lung, ...line, la], offModel: [{ from: 0, to: 1, label: 'Lungs' }], through: [id, 'left-atrium'] };
  };

  return [
    {
      id: 'superior-vena-cava', blood: 'oxygen-poor',
      points: [add(svc[0]!, [0, OFF, 0]), ...svc, ra],
      offModel: [{ from: 0, to: 1, label: 'Body' }], through: ['superior-vena-cava', 'right-atrium'],
    },
    {
      id: 'inferior-vena-cava', blood: 'oxygen-poor',
      points: [add(ivc[0]!, [0, -OFF, 0]), ...ivc, ra],
      offModel: [{ from: 0, to: 1, label: 'Body' }], through: ['inferior-vena-cava', 'right-atrium'],
    },
    {
      id: 'right-heart', blood: 'oxygen-poor',
      points: [ra, valve('tricuspid-valve'), rv, valve('pulmonary-valve'), ...pt],
      offModel: [], through: ['right-atrium', 'tricuspid-valve', 'right-ventricle', 'pulmonary-valve', 'pulmonary-trunk'],
    },
    {
      id: 'right-pulmonary-artery', blood: 'oxygen-poor',
      points: [ptEnd, ...rpa, lungR], offModel: [{ from: rpa.length, to: rpa.length + 1, label: 'Lungs' }],
      through: ['pulmonary-trunk', 'right-pulmonary-artery'],
    },
    {
      id: 'left-pulmonary-artery', blood: 'oxygen-poor',
      points: [ptEnd, ...lpa, lungL], offModel: [{ from: lpa.length, to: lpa.length + 1, label: 'Lungs' }],
      through: ['pulmonary-trunk', 'left-pulmonary-artery'],
    },
    vein('right-superior-pulmonary-vein', lungR),
    vein('right-inferior-pulmonary-vein', lungR),
    vein('left-superior-pulmonary-vein', lungL),
    vein('left-inferior-pulmonary-vein', lungL),
    leftHeart(),
  ];

  function leftHeart(): FlowStream {
    const points: Vec3[] = [la, valve('mitral-valve'), lv, valve('aortic-valve'), ...asc, ...arch, ...desc];
    points.push(add(desc[desc.length - 1]!, [0, -OFF, 0]));
    return {
      id: 'left-heart', blood: 'oxygen-rich', points,
      offModel: [{ from: points.length - 2, to: points.length - 1, label: 'Body' }],
      through: ['left-atrium', 'mitral-valve', 'left-ventricle', 'aortic-valve', 'ascending-aorta', 'aortic-arch', 'descending-thoracic-aorta'],
    };
  }
}

/** Bounds of a structure, for containment tests. */
export function boundsOf(id: string): [Vec3, Vec3] {
  const b = g(id).bounds;
  return [v(b[0], `${id} min`), v(b[1], `${id} max`)];
}
