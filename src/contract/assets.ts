/**
 * Approved asset registry. Definitions reference assets only by these ids; the runtime resolves
 * the file, and the validators check that every mesh structure has a node in the asset. Adding an
 * asset here requires a provenance and licence entry in public/ATTRIBUTION.md.
 */
export interface ApprovedAsset {
  id: string;
  /** Path relative to the app's base URL. */
  file: string;
  format: 'glb';
  license: string;
  attribution: string;
  /** Node names present in the file; kept in sync by tools/validate-assets.mjs. */
  nodes: readonly string[];
}

import geometry from '../heart/generated/geometry.json';

export const APPROVED_ASSETS: Readonly<Record<string, ApprovedAsset>> = {
  'bodyparts3d-heart-v1': {
    id: 'bodyparts3d-heart-v1',
    file: 'models/heart.glb',
    format: 'glb',
    license: 'CC-BY-4.0',
    attribution: 'BodyParts3D, © The Database Center for Life Science, licensed under CC BY 4.0',
    nodes: Object.keys(geometry.structures),
  },
};
