import { describe, expect, it } from 'vitest';
import { isKiloText, parseLoad } from './units';

describe('parseLoad', () => {
  it('reads plain VA and watts', () => {
    expect(parseLoad('4500')).toBe(4500);
    expect(parseLoad('4,500 VA')).toBe(4500);
    expect(parseLoad('4500w')).toBe(4500);
    expect(parseLoad(' 1500 ')).toBe(1500);
  });
  it('converts kilowatts to VA', () => {
    expect(parseLoad('4.5 kW')).toBe(4500);
    expect(parseLoad('4.5kw')).toBe(4500);
    expect(parseLoad('4.5k')).toBe(4500);
    expect(parseLoad('12 KVA')).toBe(12000);
    expect(parseLoad('.75 kw')).toBe(750);
  });
  it('rejects text that is not a load', () => {
    expect(parseLoad('')).toBeNull();
    expect(parseLoad('4.')).toBeNull();
    expect(parseLoad('abc')).toBeNull();
    expect(parseLoad('4.5 amps')).toBeNull();
    expect(parseLoad('-5')).toBeNull();
  });
  it('knows when the text is in kW', () => {
    expect(isKiloText('4.5 kW')).toBe(true);
    expect(isKiloText('4.5k')).toBe(true);
    expect(isKiloText('4500 VA')).toBe(false);
  });
});
