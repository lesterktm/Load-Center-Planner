import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS, CATEGORY_OPTIONS, LOAD_TYPE_LABELS, LOAD_TYPE_OPTIONS, LOCATION_LABELS, LOCATION_OPTIONS, PROTECTION_OPTIONS, sortByText,
} from './labels';

const isAlphabetical = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1].localeCompare(x, 'en-US', { sensitivity: 'base' }) <= 0);

describe('dropdown order', () => {
  it('sorts locations, load types and categories alphabetically, with "Other" last', () => {
    for (const [keys, labels] of [
      [LOCATION_OPTIONS, LOCATION_LABELS],
      [LOAD_TYPE_OPTIONS, LOAD_TYPE_LABELS],
      [CATEGORY_OPTIONS, CATEGORY_LABELS],
    ] as [string[], Record<string, string>][]) {
      expect(keys.at(-1)).toBe('other');
      expect(isAlphabetical(keys.slice(0, -1).map((k) => labels[k]))).toBe(true);
      expect(new Set(keys).size).toBe(Object.keys(labels).length);
    }
  });

  it('sorts protection types', () => {
    expect(PROTECTION_OPTIONS).toEqual(['afci', 'df', 'gfci', 'gfep', 'standard']);
  });

  it('puts numbers in numeric order', () => {
    expect(sortByText(['200 A', '100 A', '20 A'], (x) => x)).toEqual(['20 A', '100 A', '200 A']);
  });
});
