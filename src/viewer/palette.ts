import type { AnatomicalStructure } from '../contract/schema';

/**
 * Colours follow the textbook convention of blue for oxygen-poor and red for oxygen-rich blood.
 * The legend says so explicitly, so the colour teaches oxygen content, not "vein vs artery".
 */
export const BLOOD = {
  'oxygen-poor': '#4a73c4',
  'oxygen-rich': '#c8443b',
} as const;

const LAYER: Record<string, string> = {
  wall: '#b86a5c',
  valve: '#e2cfa6',
  coronary: '#d8473a',
  'cardiac-vein': '#4f6cc0',
};

export function baseColour(s: AnatomicalStructure): string {
  if (s.id.includes('papillary')) return '#c98576';
  if (s.layer === 'chamber' || s.layer === 'vessel') {
    return s.blood === 'not-applicable' ? '#999999' : BLOOD[s.blood];
  }
  return LAYER[s.layer] ?? '#aaaaaa';
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
