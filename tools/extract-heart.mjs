#!/usr/bin/env node
/**
 * Extract the heart from a BodyParts3D 4.0 atlas build into public/models/heart.glb.
 *
 *   node tools/extract-heart.mjs <models dir>
 *
 * <models dir> is a folder holding a Human Atlas style `atlas.json` plus its `*.bin` chunks
 * (for example D:\Solar system\repo4-human-atlas\public\models). Each part in atlas.json is one
 * BodyParts3D element: Float32 positions (metres, Y-up), normalised Int16 normals, Uint32 indices.
 *
 * Writes:
 *   public/models/heart.glb                        one node per structure, named by structure id
 *   src/heart/generated/geometry.json              per-structure bounds, centroid, counts, valve frames
 *   src/heart/generated/provenance.json            source hashes, elements used, transforms applied
 *
 * Fails loudly on a missing element, NaN/infinite position, bad index or zero-length normal.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = process.argv[2];
if (!modelsDir) {
  console.error('Usage: node tools/extract-heart.mjs <models dir containing atlas.json>');
  process.exit(2);
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const atlasPath = path.join(modelsDir, 'atlas.json');
const atlasBytes = fs.readFileSync(atlasPath);
const atlas = JSON.parse(atlasBytes.toString('utf8'));
if (atlas.version !== 'BodyParts3D 4.0') throw new Error(`Unexpected atlas version: ${atlas.version}`);

const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/heart/source/structures.source.json'), 'utf8'));
const parts = new Map(atlas.parts.map((p) => [p.id, p]));

// Load only the chunks we need.
const chunkCache = new Map();
const chunkHashes = {};
function chunk(index) {
  if (!chunkCache.has(index)) {
    const file = path.join(modelsDir, atlas.chunks[index].url.split('/').pop());
    const buf = fs.readFileSync(file);
    if (buf.length !== atlas.chunks[index].bytes) throw new Error(`Chunk ${file} has ${buf.length} bytes, manifest says ${atlas.chunks[index].bytes}`);
    chunkCache.set(index, buf);
    chunkHashes[path.basename(file)] = sha256(buf);
  }
  return chunkCache.get(index);
}

function readPart(id) {
  const p = parts.get(id);
  if (!p) throw new Error(`Element ${id} not found in atlas.json`);
  const b = chunk(p.chunk);
  const positions = new Float32Array(b.buffer.slice(b.byteOffset + p.positions, b.byteOffset + p.positions + p.vertexCount * 12));
  const normals16 = new Int16Array(b.buffer.slice(b.byteOffset + p.normals, b.byteOffset + p.normals + p.vertexCount * 6));
  const indices = new Uint32Array(b.buffer.slice(b.byteOffset + p.indices, b.byteOffset + p.indices + p.indexCount * 4));
  for (const v of positions) if (!Number.isFinite(v)) throw new Error(`${id}: non-finite position`);
  for (const i of indices) if (i >= p.vertexCount) throw new Error(`${id}: index ${i} out of range ${p.vertexCount}`);
  if (indices.length % 3 !== 0) throw new Error(`${id}: index count not a multiple of 3`);
  const normals = new Float32Array(p.vertexCount * 3);
  for (let i = 0; i < p.vertexCount; i++) {
    const x = normals16[i * 3] / 32767, y = normals16[i * 3 + 1] / 32767, z = normals16[i * 3 + 2] / 32767;
    const len = Math.hypot(x, y, z);
    if (!(len > 0.5)) throw new Error(`${id}: degenerate normal at vertex ${i} (length ${len})`);
    normals[i * 3] = x / len; normals[i * 3 + 1] = y / len; normals[i * 3 + 2] = z / len;
  }
  return { id, name: p.name, conceptId: p.conceptId, positions, normals, indices };
}

// Merge each structure's elements into one geometry.
const meshes = [];
for (const s of spec.structures) {
  if (s.kind !== 'mesh') continue;
  const els = s.elements.map(readPart);
  const vCount = els.reduce((n, e) => n + e.positions.length / 3, 0);
  const iCount = els.reduce((n, e) => n + e.indices.length, 0);
  const positions = new Float32Array(vCount * 3), normals = new Float32Array(vCount * 3), indices = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const e of els) {
    positions.set(e.positions, vo * 3); normals.set(e.normals, vo * 3);
    for (let k = 0; k < e.indices.length; k++) indices[io + k] = e.indices[k] + vo;
    vo += e.positions.length / 3; io += e.indices.length;
  }
  meshes.push({ structure: s, elements: els.map(({ id, name, conceptId }) => ({ id, name, conceptId })), positions, normals, indices });
}

// Centre on the heart proper (walls), so great vessels do not shift the pivot.
const bboxOf = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  return [lo, hi];
};
const wallBoxes = meshes.filter((m) => m.structure.layer === 'wall').map((m) => bboxOf(m.positions));
const centre = [0, 1, 2].map((a) => (Math.min(...wallBoxes.map((b) => b[0][a])) + Math.max(...wallBoxes.map((b) => b[1][a]))) / 2);
for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) m.positions[i + a] -= centre[a];

// Geometry facts used by validators and the flow path.
const r6 = (v) => Math.round(v * 1e6) / 1e6;
function centroid(pos) {
  const c = [0, 0, 0]; const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) c[a] += pos[i + a] / n;
  return c;
}
function covariance(pos, c) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0]; const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - c[0], pos[i + 1] - c[1], pos[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[r * 3 + k] += (d[r] * d[k]) / n;
  }
  return m;
}
// Smallest-eigenvalue eigenvector of a symmetric 3x3 via inverse power iteration on (M + eps I).
function smallestAxis(m) {
  const eps = 1e-12;
  const a = m.slice(); a[0] += eps; a[4] += eps; a[8] += eps;
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const inv = [
    (a[4] * a[8] - a[5] * a[7]) / det, (a[2] * a[7] - a[1] * a[8]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
    (a[5] * a[6] - a[3] * a[8]) / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[2] * a[3] - a[0] * a[5]) / det,
    (a[3] * a[7] - a[4] * a[6]) / det, (a[1] * a[6] - a[0] * a[7]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
  ];
  let v = [1, 1, 1];
  for (let it = 0; it < 100; it++) {
    const w = [0, 1, 2].map((r) => inv[r * 3] * v[0] + inv[r * 3 + 1] * v[1] + inv[r * 3 + 2] * v[2]);
    const len = Math.hypot(...w); v = w.map((x) => x / len);
  }
  return v;
}
// Principal (largest-variance) axis via power iteration.
function principalAxis(m) {
  let v = [1, 0.5, 0.25];
  for (let it = 0; it < 100; it++) {
    const w = [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
    const len = Math.hypot(...w); v = w.map((x) => x / len);
  }
  return v;
}

// Ray/triangle crossing count (Moller-Trumbore) for point-in-mesh tests on closed cavity casts.
function crossings(pos, idx, o, d) {
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-14) continue;
    const s = [o[0] - pos[a], o[1] - pos[a + 1], o[2] - pos[a + 2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 0) n++;
  }
  return n;
}
const DIRS = [[1, 0.0013, 0.0007], [0.0011, 1, 0.0017], [0.0009, 0.0015, 1]];
const inside = (pos, idx, p) => DIRS.filter((d) => crossings(pos, idx, p, d) % 2 === 1).length >= 2;

/** Deepest interior point of a closed mesh: inside, and farthest from any vertex (grid search). */
function interiorPoint(pos, idx) {
  const [lo, hi] = bboxOf(pos);
  const N = 14;
  let best = null, bestDist = -1;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) for (let k = 1; k < N; k++) {
    const p = [lo[0] + ((hi[0] - lo[0]) * i) / N, lo[1] + ((hi[1] - lo[1]) * j) / N, lo[2] + ((hi[2] - lo[2]) * k) / N];
    let dmin = Infinity;
    for (let v = 0; v < pos.length; v += 3) dmin = Math.min(dmin, Math.hypot(pos[v] - p[0], pos[v + 1] - p[1], pos[v + 2] - p[2]));
    if (dmin <= bestDist || !inside(pos, idx, p)) continue;
    best = p; bestDist = dmin;
  }
  return best ? { point: best, clearance: bestDist } : null;
}

/** Centreline of a tube-like mesh: mean of the vertices in slices along its principal axis. */
function centreline(pos, c, axis, slices = 6) {
  const proj = [];
  for (let v = 0; v < pos.length; v += 3) proj.push((pos[v] - c[0]) * axis[0] + (pos[v + 1] - c[1]) * axis[1] + (pos[v + 2] - c[2]) * axis[2]);
  const min = Math.min(...proj), max = Math.max(...proj);
  const pts = [];
  for (let s = 0; s < slices; s++) {
    const a = min + ((max - min) * s) / slices, b = min + ((max - min) * (s + 1)) / slices;
    const acc = [0, 0, 0]; let n = 0;
    proj.forEach((t, i) => { if (t >= a && t <= b) { acc[0] += pos[i * 3]; acc[1] += pos[i * 3 + 1]; acc[2] += pos[i * 3 + 2]; n++; } });
    if (n) pts.push(acc.map((x) => x / n));
  }
  return pts;
}

const geometry = {};
for (const m of meshes) {
  const [lo, hi] = bboxOf(m.positions);
  const c = centroid(m.positions);
  const cov = covariance(m.positions, c);
  const axis = principalAxis(cov);
  const entry = {
    layer: m.structure.layer,
    bounds: [lo.map(r6), hi.map(r6)],
    centroid: c.map(r6),
    principalAxis: axis.map(r6),
    thinAxis: smallestAxis(cov).map(r6),
    vertexCount: m.positions.length / 3,
    triangleCount: m.indices.length / 3,
  };
  if (m.structure.layer === 'chamber') {
    const ip = interiorPoint(m.positions, m.indices);
    if (!ip) throw new Error(`${m.structure.id}: no interior point found; is the cavity mesh closed?`);
    entry.interiorPoint = ip.point.map(r6);
    entry.interiorClearance = r6(ip.clearance);
    entry.centroidInside = inside(m.positions, m.indices, c);
  }
  if (m.structure.layer === 'vessel') entry.centreline = centreline(m.positions, c, axis).map((p) => p.map(r6));
  // A point on the structure's own surface near its middle, for labels: a curved vessel's
  // centroid can lie inside the heart, where it would be hidden.
  let nearest = 0, nearestD = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]);
    if (d < nearestD) { nearestD = d; nearest = i; }
  }
  entry.surfaceAnchor = [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6);
  geometry[m.structure.id] = entry;
}

// Orientation sanity checks (patient's left = +X, anterior = +Z, superior = +Y).
const g = (id) => geometry[id];
const checks = {
  leftVentricleIsLeftOfRight: g('left-ventricle').centroid[0] > g('right-ventricle').centroid[0],
  leftAtriumIsPosteriorToRightVentricle: g('left-atrium').centroid[2] < g('right-ventricle').centroid[2],
  descendingAortaIsPosterior: g('descending-thoracic-aorta').centroid[2] < g('ascending-aorta').centroid[2],
  superiorVenaCavaIsAboveInferior: g('superior-vena-cava').centroid[1] > g('inferior-vena-cava').centroid[1],
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) throw new Error(`Orientation checks failed: ${failed.join(', ')}`);

// Write the GLB: one node + mesh per structure, named by id.
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('heart');
for (const m of meshes) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.indices).setBuffer(buffer));
  const mesh = doc.createMesh(m.structure.id).addPrimitive(prim);
  const node = doc.createNode(m.structure.id).setMesh(mesh).setExtras({ layer: m.structure.layer, elements: m.elements.map((e) => e.id) });
  scene.addChild(node);
}
doc.getRoot().getAsset().generator = 'heart-anatomy-lab tools/extract-heart.mjs';
doc.getRoot().getAsset().copyright = 'BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0';

const outGlb = path.join(root, 'public/models/heart.glb');
fs.mkdirSync(path.dirname(outGlb), { recursive: true });
const glb = await new NodeIO().writeBinary(doc);
fs.writeFileSync(outGlb, glb);

let sourceCommit = null;
try {
  sourceCommit = execFileSync('git', ['-C', path.resolve(modelsDir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch { /* not a git checkout; recorded as null */ }

const genDir = path.join(root, 'src/heart/generated');
fs.mkdirSync(genDir, { recursive: true });
fs.writeFileSync(path.join(genDir, 'geometry.json'), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 2) + '\n');
fs.writeFileSync(path.join(genDir, 'provenance.json'), JSON.stringify({
  output: { file: 'public/models/heart.glb', bytes: glb.byteLength, sha256: sha256(glb) },
  dataset: {
    name: 'BodyParts3D 4.0',
    owner: 'The Database Center for Life Science (DBCLS)',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    download: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
    citation: 'Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782-5. doi:10.1093/nar/gkn613',
  },
  intermediate: {
    name: 'Human Atlas (ashemag/human-atlas, fork Niyaz-05/human-atlas)',
    codeLicense: 'MIT',
    dataLicense: 'CC-BY-4.0 (BodyParts3D)',
    commit: sourceCommit,
    changesBySource: 'mm/Z-up to metres/Y-up; meshoptimizer simplification with 0.2% relative error bound per element; normals quantised to Int16',
    atlasJsonSha256: sha256(atlasBytes),
    chunkSha256: chunkHashes,
  },
  changesHere: 'Selected the elements listed in src/heart/source/structures.source.json, merged them into one mesh per structure, decoded normals to Float32, translated so the centre of the heart walls is the origin. No vertex positions were otherwise altered.',
  centreOffsetMetres: centre.map(r6),
  orientationChecks: checks,
  structures: meshes.map((m) => ({ id: m.structure.id, elements: m.elements })),
}, null, 2) + '\n');

const tris = meshes.reduce((n, m) => n + m.indices.length / 3, 0);
console.log(JSON.stringify({ structures: meshes.length, triangles: tris, bytes: glb.byteLength, centre: centre.map(r6), checks }, null, 2));
