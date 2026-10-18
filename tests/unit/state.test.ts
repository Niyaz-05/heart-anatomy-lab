import { describe, expect, it } from 'vitest';
import { heartDefinition as def } from '../../src/heart/definition';
import { initialState, isVisible, makeReducer, highlightedIds } from '../../src/app/state';
import { searchStructures } from '../../src/app/search';

const reduce = makeReducer(def);

describe('lab state', () => {
  it('starts with default layers: chambers hidden, walls shown', () => {
    const s = initialState(def);
    expect(s.visibleLayers.has('wall')).toBe(true);
    expect(s.visibleLayers.has('chamber')).toBe(false);
    expect(isVisible(def, s, 'left-ventricle')).toBe(false);
    expect(isVisible(def, s, 'ventricular-wall')).toBe(true);
  });

  it('selecting a hidden chamber reveals it; selecting again deselects', () => {
    let s = reduce(initialState(def), { type: 'select', id: 'left-ventricle' });
    expect(s.selected).toBe('left-ventricle');
    expect(isVisible(def, s, 'left-ventricle')).toBe(true);
    s = reduce(s, { type: 'select', id: 'left-ventricle' });
    expect(s.selected).toBeNull();
  });

  it('ignores unknown ids', () => {
    const s0 = initialState(def);
    expect(reduce(s0, { type: 'select', id: 'spleen' })).toBe(s0);
    expect(reduce(s0, { type: 'toggle-layer', layer: 'bones' })).toBe(s0);
    expect(reduce(s0, { type: 'camera', preset: 'fisheye' })).toBe(s0);
  });

  it('a zone highlights the structures it lies between', () => {
    expect([...highlightedIds(def, ['interventricular-septum'])].sort()).toEqual(['left-ventricle', 'right-ventricle']);
  });

  it('isolate shows only the selection', () => {
    let s = reduce(initialState(def), { type: 'select', id: 'mitral-valve' });
    s = reduce(s, { type: 'set-isolate', value: true });
    expect(isVisible(def, s, 'mitral-valve')).toBe(true);
    expect(isVisible(def, s, 'aortic-valve')).toBe(false);
    expect(isVisible(def, s, 'ventricular-wall')).toBe(false);
  });

  it('toggling a layer hides and shows its structures', () => {
    let s = reduce(initialState(def), { type: 'toggle-layer', layer: 'coronary' });
    expect(isVisible(def, s, 'right-coronary-artery')).toBe(false);
    s = reduce(s, { type: 'toggle-layer', layer: 'coronary' });
    expect(isVisible(def, s, 'right-coronary-artery')).toBe(true);
  });

  it('reset restores defaults and issues a new camera request', () => {
    let s = reduce(initialState(def), { type: 'select', id: 'aortic-arch' });
    s = reduce(s, { type: 'toggle-layer', layer: 'wall' });
    s = reduce(s, { type: 'set-isolate', value: true });
    s = reduce(s, { type: 'camera', preset: 'posterior' });
    const nonce = s.camera.nonce;
    s = reduce(s, { type: 'reset' });
    expect(s.selected).toBeNull();
    expect(s.isolate).toBe(false);
    expect(s.visibleLayers.has('wall')).toBe(true);
    expect(s.camera.preset).toBe('anterior');
    expect(s.camera.nonce).toBeGreaterThan(nonce);
  });

  it('tour navigation clamps to the step range and moves the camera', () => {
    let s = reduce(initialState(def), { type: 'set-mode', mode: 'tour' });
    expect(s.tourIndex).toBe(0);
    s = reduce(s, { type: 'tour-go', index: -3 });
    expect(s.tourIndex).toBe(0);
    s = reduce(s, { type: 'tour-go', index: 999 });
    expect(s.tourIndex).toBe(def.tour.length - 1);
    expect(s.camera.focus).toEqual(def.tour.at(-1)!.focus);
  });
});

describe('structure search', () => {
  it('finds by label, abbreviation and synonym', () => {
    expect(searchStructures(def.structures, 'mitral')[0]?.structure.id).toBe('mitral-valve');
    expect(searchStructures(def.structures, 'bicuspid')[0]?.structure.id).toBe('mitral-valve');
    expect(searchStructures(def.structures, 'LAD')[0]?.structure.id).toBe('left-anterior-descending-artery');
    expect(searchStructures(def.structures, 'svc')[0]?.structure.id).toBe('superior-vena-cava');
  });

  it('is case- and punctuation-insensitive and needs every word', () => {
    expect(searchStructures(def.structures, 'LEFT   ventricle')[0]?.structure.id).toBe('left-ventricle');
    expect(searchStructures(def.structures, 'left zebra')).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(searchStructures(def.structures, '   ')).toEqual([]);
  });

  it('lists all four pulmonary veins for "pulmonary vein"', () => {
    const ids = searchStructures(def.structures, 'pulmonary vein').map((h) => h.structure.id);
    expect(ids.filter((i) => i.includes('pulmonary-vein')).length).toBe(4);
  });
});
