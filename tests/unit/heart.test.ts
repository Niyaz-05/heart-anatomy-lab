import { describe, expect, it } from 'vitest';
import { heartDefinition } from '../../src/heart/definition';
import { validateDefinition } from '../../src/contract/validate';
import { buildFlowStreams, boundsOf } from '../../src/heart/flowPath';
import geometry from '../../src/heart/generated/geometry.json';

describe('heart definition', () => {
  it('passes schema and cross-reference validation with no warnings', () => {
    const result = validateDefinition(heartDefinition);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('covers every node in the model with a structure entry', () => {
    const ids = new Set(heartDefinition.structures.map((s) => s.id));
    for (const node of Object.keys(geometry.structures)) expect(ids.has(node), node).toBe(true);
  });

  it('includes the structures the brief requires', () => {
    const ids = new Set(heartDefinition.structures.map((s) => s.id));
    for (const id of [
      'right-atrium', 'left-atrium', 'right-ventricle', 'left-ventricle', 'interatrial-septum', 'interventricular-septum',
      'tricuspid-valve', 'mitral-valve', 'pulmonary-valve', 'aortic-valve', 'ascending-aorta', 'pulmonary-trunk',
      'right-pulmonary-artery', 'left-pulmonary-artery', 'superior-vena-cava', 'inferior-vena-cava', 'right-coronary-artery',
    ]) expect(ids.has(id), id).toBe(true);
  });

  it('labels pulmonary arteries oxygen-poor and pulmonary veins oxygen-rich', () => {
    const blood = (id: string) => heartDefinition.structures.find((s) => s.id === id)?.blood;
    expect(blood('pulmonary-trunk')).toBe('oxygen-poor');
    expect(blood('right-pulmonary-artery')).toBe('oxygen-poor');
    expect(blood('left-pulmonary-artery')).toBe('oxygen-poor');
    for (const v of ['right-superior-pulmonary-vein', 'right-inferior-pulmonary-vein', 'left-superior-pulmonary-vein', 'left-inferior-pulmonary-vein']) {
      expect(blood(v)).toBe('oxygen-rich');
    }
    expect(blood('superior-vena-cava')).toBe('oxygen-poor');
    expect(blood('ascending-aorta')).toBe('oxygen-rich');
  });

  it('declares the canonical flow sequence in order', () => {
    const steps = heartDefinition.flowPaths[0]!.steps.map((s) => s.structure ?? s.offModel);
    expect(steps).toEqual([
      'body', 'superior-vena-cava', 'right-atrium', 'tricuspid-valve', 'right-ventricle', 'pulmonary-valve', 'pulmonary-trunk',
      'lungs', 'right-superior-pulmonary-vein', 'left-atrium', 'mitral-valve', 'left-ventricle', 'aortic-valve', 'ascending-aorta', 'body',
    ]);
  });

  it('tour steps point at matching flow steps', () => {
    const steps = heartDefinition.flowPaths[0]!.steps;
    for (const t of heartDefinition.tour) {
      if (t.flowStep === undefined) continue;
      const st = steps[t.flowStep]!;
      if (st.structure) expect(t.focus, t.id).toContain(st.structure);
    }
  });
});

describe('validation gate', () => {
  it('rejects unknown assets, layers and references', () => {
    const bad = structuredClone(heartDefinition);
    bad.assets = [{ id: 'some-random-model', role: 'anatomy-model' }];
    bad.structures[0]!.layer = 'nope';
    bad.tour[0]!.focus = ['not-a-structure'];
    const r = validateDefinition(bad);
    expect(r.ok).toBe(false);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('asset.not-approved');
    expect(codes).toContain('ref.layer');
    expect(codes).toContain('ref.structure');
  });

  it('rejects URLs and non-kebab ids at the schema level', () => {
    const bad = structuredClone(heartDefinition) as unknown as { id: string; sources: { url: string }[] };
    bad.id = 'Heart Lab';
    bad.sources[0]!.url = 'http://insecure.example';
    const r = validateDefinition(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.path === 'id')).toBe(true);
    expect(r.issues.some((i) => i.path.startsWith('sources.0.url'))).toBe(true);
  });
});

describe('flow streams', () => {
  const streams = buildFlowStreams();
  const byId = new Map(streams.map((s) => [s.id, s]));
  const within = (p: number[], id: string, slack = 0.002) => {
    const [lo, hi] = boundsOf(id);
    return p.every((x, i) => x >= lo[i]! - slack && x <= hi[i]! + slack);
  };

  it('produces only finite points', () => {
    for (const s of streams) for (const p of s.points) for (const x of p) expect(Number.isFinite(x)).toBe(true);
  });

  it('runs the right heart RA → tricuspid → RV → pulmonary valve → trunk', () => {
    const rh = byId.get('right-heart')!;
    expect(rh.through).toEqual(['right-atrium', 'tricuspid-valve', 'right-ventricle', 'pulmonary-valve', 'pulmonary-trunk']);
    expect(within(rh.points[0]!, 'right-atrium')).toBe(true);
    expect(within(rh.points[1]!, 'tricuspid-valve')).toBe(true);
    expect(within(rh.points[2]!, 'right-ventricle')).toBe(true);
    expect(within(rh.points[3]!, 'pulmonary-valve')).toBe(true);
    expect(rh.blood).toBe('oxygen-poor');
  });

  it('runs the left heart LA → mitral → LV → aortic valve → aorta', () => {
    const lh = byId.get('left-heart')!;
    expect(lh.through.slice(0, 5)).toEqual(['left-atrium', 'mitral-valve', 'left-ventricle', 'aortic-valve', 'ascending-aorta']);
    expect(within(lh.points[0]!, 'left-atrium')).toBe(true);
    expect(within(lh.points[1]!, 'mitral-valve')).toBe(true);
    expect(within(lh.points[2]!, 'left-ventricle')).toBe(true);
    expect(within(lh.points[3]!, 'aortic-valve')).toBe(true);
    expect(lh.blood).toBe('oxygen-rich');
  });

  it('joins streams end to start: venae cavae → right heart → pulmonary arteries; veins → left heart', () => {
    const close = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 1e-9;
    const first = (id: string) => byId.get(id)!.points[0]!;
    const last = (id: string) => byId.get(id)!.points.at(-1)!;
    expect(close(last('superior-vena-cava'), first('right-heart'))).toBe(true);
    expect(close(last('inferior-vena-cava'), first('right-heart'))).toBe(true);
    expect(close(last('right-heart'), first('right-pulmonary-artery'))).toBe(true);
    expect(close(last('right-heart'), first('left-pulmonary-artery'))).toBe(true);
    for (const v of ['right-superior-pulmonary-vein', 'right-inferior-pulmonary-vein', 'left-superior-pulmonary-vein', 'left-inferior-pulmonary-vein']) {
      expect(close(last(v), first('left-heart')), v).toBe(true);
    }
  });

  it('sends the right pulmonary artery to the patient\'s right and the left to the left', () => {
    expect(byId.get('right-pulmonary-artery')!.points.at(-1)![0]).toBeLessThan(0);
    expect(byId.get('left-pulmonary-artery')!.points.at(-1)![0]).toBeGreaterThan(0);
  });

  it('marks every off-model leg', () => {
    for (const s of streams.filter((s) => s.id !== 'right-heart')) expect(s.offModel.length, s.id).toBe(1);
  });
});
