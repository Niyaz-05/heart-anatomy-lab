/**
 * Validation gate for simulation definitions: schema first, then the cross-references a schema
 * cannot express (ids that must exist, assets that must be approved, mesh structures that must
 * have geometry). Returns every issue rather than stopping at the first, so a generator's repair
 * step can see the whole picture.
 */
import { SimulationDefinition } from './schema';
import { APPROVED_ASSETS, type ApprovedAsset } from './assets';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; definition: SimulationDefinition; issues: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function validateDefinition(
  input: unknown,
  assets: Readonly<Record<string, ApprovedAsset>> = APPROVED_ASSETS,
): ValidationResult {
  const parsed = SimulationDefinition.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: 'error',
        code: `schema.${i.code}`,
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const def = parsed.data;
  const issues: ValidationIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ severity: 'error', code, path, message });

  const dupes = (ids: string[], path: string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) err('ref.duplicate-id', `${path}.${i}`, `duplicate id "${id}"`);
      seen.add(id);
    });
    return seen;
  };
  const layers = dupes(def.layers.map((l) => l.id), 'layers');
  const structures = dupes(def.structures.map((s) => s.id), 'structures');
  const sources = dupes(def.sources.map((s) => s.id), 'sources');
  const cameras = dupes(def.cameraPresets.map((c) => c.id), 'cameraPresets');
  dupes(def.tour.map((t) => t.id), 'tour');

  const nodes = new Set<string>();
  def.assets.forEach((a, i) => {
    const approved = assets[a.id];
    if (!approved) err('asset.not-approved', `assets.${i}.id`, `asset "${a.id}" is not in the approved registry`);
    else approved.nodes.forEach((n) => nodes.add(n));
  });

  if (!cameras.has(def.defaultCamera)) err('ref.camera', 'defaultCamera', `unknown camera preset "${def.defaultCamera}"`);

  def.structures.forEach((s, i) => {
    const p = `structures.${i}`;
    if (!layers.has(s.layer)) err('ref.layer', `${p}.layer`, `unknown layer "${s.layer}"`);
    if (s.kind === 'mesh' && !nodes.has(s.id)) err('asset.missing-node', `${p}.id`, `no node "${s.id}" in the approved assets`);
    if (s.kind === 'zone') {
      if (!s.between) err('zone.between', `${p}.between`, 'a zone needs the structures it lies between');
      s.between?.forEach((b, j) => {
        if (!structures.has(b)) err('ref.structure', `${p}.between.${j}`, `unknown structure "${b}"`);
      });
    }
    s.related.forEach((r, j) => {
      if (!structures.has(r)) err('ref.structure', `${p}.related.${j}`, `unknown structure "${r}"`);
      if (r === s.id) err('ref.self', `${p}.related.${j}`, 'a structure cannot relate to itself');
    });
    s.sources.forEach((r, j) => {
      if (!sources.has(r)) err('ref.source', `${p}.sources.${j}`, `unknown source "${r}"`);
    });
  });

  def.flowPaths.forEach((f, i) => {
    f.steps.forEach((st, j) => {
      if (st.structure && !structures.has(st.structure)) err('ref.structure', `flowPaths.${i}.steps.${j}.structure`, `unknown structure "${st.structure}"`);
    });
  });

  def.tour.forEach((t, i) => {
    t.focus.forEach((f, j) => {
      if (!structures.has(f)) err('ref.structure', `tour.${i}.focus.${j}`, `unknown structure "${f}"`);
    });
    if (t.camera && !cameras.has(t.camera)) err('ref.camera', `tour.${i}.camera`, `unknown camera preset "${t.camera}"`);
    const flow = def.flowPaths[0];
    if (t.flowStep !== undefined && (!flow || t.flowStep >= flow.steps.length)) {
      err('ref.flow-step', `tour.${i}.flowStep`, `flow step ${t.flowStep} does not exist`);
    }
  });

  // Mesh nodes nobody can select are not an error, but worth knowing.
  for (const n of nodes) {
    if (!structures.has(n)) issues.push({ severity: 'warning', code: 'asset.unused-node', path: 'assets', message: `node "${n}" has no structure entry` });
  }

  const errors = issues.filter((x) => x.severity === 'error');
  return errors.length ? { ok: false, issues } : { ok: true, definition: def, issues };
}
