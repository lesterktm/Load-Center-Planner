import { describe, expect, it } from 'vitest';
import {
  checkPlacement, circuitNumber, findFreeSpace, formatSpaceList, parseSpaceList, phaseOfSpace, polesUsed, spacesOf,
} from './panel';
import { newBreaker } from './project';

const panel = { spaces: 8, maxCircuits: 8, tandemSpaces: 'none' as const };

describe('phaseOfSpace', () => {
  it('alternates legs every row, both columns sharing a row', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => phaseOfSpace('120/240V-1PH', s))).toEqual(['L1', 'L1', 'L2', 'L2', 'L1', 'L1']);
  });
});

describe('spacesOf', () => {
  it('2-pole breakers take the next space in the same column', () => {
    expect(spacesOf('double', 3)).toEqual([3, 5]);
    expect(spacesOf('quad', 2)).toEqual([2, 4]);
    expect(spacesOf('tandem', 7)).toEqual([7]);
  });
});

describe('checkPlacement', () => {
  it('rejects overlap with an existing breaker', () => {
    const b = newBreaker('double', 1);
    expect(checkPlacement(panel, [b], 'single', 3).ok).toBe(false);
    expect(checkPlacement(panel, [b], 'single', 2).ok).toBe(true);
  });

  it('rejects a 2-pole that would run past the last space', () => {
    expect(checkPlacement(panel, [], 'double', 7).ok).toBe(false);
    expect(checkPlacement(panel, [], 'double', 6).ok).toBe(true);
  });

  it('only allows tandems in tandem-rated spaces', () => {
    expect(checkPlacement(panel, [], 'tandem', 1).ok).toBe(false);
    expect(checkPlacement({ ...panel, tandemSpaces: [5, 6] }, [], 'tandem', 5).ok).toBe(true);
    expect(checkPlacement({ ...panel, tandemSpaces: [5, 6] }, [], 'quad', 5).ok).toBe(false);
  });

  it('enforces the listed circuit limit', () => {
    const small = { spaces: 4, maxCircuits: 4, tandemSpaces: 'all' as const };
    const bs = [newBreaker('tandem', 1), newBreaker('tandem', 2)];
    expect(polesUsed(bs)).toBe(4);
    expect(checkPlacement(small, bs, 'single', 3).ok).toBe(false);
  });

  it('ignores the breaker being moved', () => {
    const b = newBreaker('double', 1);
    expect(checkPlacement(panel, [b], 'double', 3, b.id).ok).toBe(true);
    expect(checkPlacement(panel, [b], 'double', 3).ok).toBe(false);
  });

  it('finds the next free space', () => {
    const bs = [newBreaker('single', 1), newBreaker('single', 2)];
    expect(findFreeSpace(panel, bs, 'single')).toBe(3);
    expect(findFreeSpace(panel, bs, 'double', 7)).toBe(3);
  });
});

describe('circuitNumber', () => {
  it('formats directory numbers', () => {
    expect(circuitNumber({ form: 'single', space: 5 }, 0)).toBe('5');
    expect(circuitNumber({ form: 'double', space: 1 }, 0)).toBe('1,3');
    expect(circuitNumber({ form: 'tandem', space: 5 }, 0)).toBe('5A');
    expect(circuitNumber({ form: 'tandem', space: 5 }, 1)).toBe('5B');
    expect(circuitNumber({ form: 'quad', space: 2 }, 1)).toBe('2B,4B');
  });
});

describe('space lists', () => {
  it('parses and formats ranges', () => {
    expect(parseSpaceList('1-4, 9')).toEqual([1, 2, 3, 4, 9]);
    expect(parseSpaceList('junk, 3')).toEqual([3]);
    expect(formatSpaceList([9, 1, 2, 3, 4])).toBe('1-4, 9');
  });
});
