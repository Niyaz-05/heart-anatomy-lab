import type { AnatomicalStructure } from '../contract/schema';
import type { TissueLook } from './tissue';

/**
 * Real blood colours: oxygen-rich blood is bright red, oxygen-poor blood is dark red. The flow
 * particles and the legend use a slightly purple dark red so the two stay easy to tell apart.
 */
export const BLOOD = {
  'oxygen-poor': '#5a1e4a',
  'oxygen-rich': '#e3352c',
} as const;

const VEINS = new Set(['superior-vena-cava', 'inferior-vena-cava', 'right-superior-pulmonary-vein', 'right-inferior-pulmonary-vein', 'left-superior-pulmonary-vein', 'left-inferior-pulmonary-vein']);

/**
 * Real-tissue looks for a fresh heart: deep red-brown muscle with yellow epicardial fat along the
 * coronary vessels (baked), pale fibrous valves, pale artery walls, dark purple-red veins, and the
 * blood in the chambers bright red (oxygen-rich) or dark red (oxygen-poor).
 */
const REAL: Record<string, TissueLook> = {
  wall: { color: '#8f3b33', roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.35, sheenColor: '#ffc9bd', rim: 0.3, rimColor: '#ff6a55', ao: 0.85, mottle: 0.3, mottleTint: '#6e2a25', fat: 0.95, fatColor: '#e2c272' },
  papillary: { color: '#9a463c', roughness: 0.5, clearcoat: 0.5, sheen: 0.3, rim: 0.25, ao: 0.8, mottle: 0.25, mottleTint: '#6e2a25' },
  valve: { color: '#e8d7bc', roughness: 0.4, clearcoat: 0.6, sheen: 0.3, sheenColor: '#fff3e0', rim: 0.18, rimColor: '#ffb79e', ao: 0.7, mottle: 0.12, mottleTint: '#cdb391' },
  'chamber-oxygen-rich': { color: '#b0201f', roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.12, sheen: 0, rim: 0.3, rimColor: '#ff5040', ao: 0.5, mottle: 0.08 },
  'chamber-oxygen-poor': { color: '#5e1525', roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.12, sheen: 0, rim: 0.3, rimColor: '#a8354e', ao: 0.5, mottle: 0.08 },
  artery: { color: '#d8a297', roughness: 0.42, clearcoat: 0.6, sheen: 0.3, sheenColor: '#ffe3da', rim: 0.2, ao: 0.75, mottle: 0.15, mottleTint: '#b67d72' },
  vein: { color: '#5e2a3e', roughness: 0.38, clearcoat: 0.7, sheen: 0.25, sheenColor: '#c48ba0', rim: 0.24, rimColor: '#b0506e', ao: 0.75, mottle: 0.12, mottleTint: '#3e1828' },
  coronary: { color: '#b8302c', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.2, rim: 0.3, rimColor: '#ff6a55', ao: 0.6, mottle: 0.1 },
  'cardiac-vein': { color: '#56263c', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, sheen: 0.2, rim: 0.28, rimColor: '#a8506e', ao: 0.6, mottle: 0.1 },
};

export function realLook(s: AnatomicalStructure): TissueLook {
  if (s.id.includes('papillary')) return REAL.papillary!;
  if (s.layer === 'chamber') return REAL[s.blood === 'oxygen-rich' ? 'chamber-oxygen-rich' : 'chamber-oxygen-poor']!;
  if (s.layer === 'vessel') return VEINS.has(s.id) ? REAL.vein! : REAL.artery!;
  return REAL[s.layer] ?? REAL.wall!;
}

export function baseColour(s: AnatomicalStructure): string {
  return realLook(s).color;
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
