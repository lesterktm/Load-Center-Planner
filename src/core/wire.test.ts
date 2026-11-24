import { describe, expect, it } from 'vitest';
import type { ConductorMaterial, Wire, WireSize, WireType } from './types';
import { checkWire, maxBreakerForWire, sizeForVoltageDrop, suggestWireSize, voltageDrop } from './wire';

const w = (size: WireSize, type: WireType = 'NM-B', material: ConductorMaterial = 'Cu'): Wire => ({ size, material, type });

describe('maxBreakerForWire', () => {
  it('applies the 60 °C column to NM-B', () => {
    expect(maxBreakerForWire(w('6'))).toBe(55);
    expect(maxBreakerForWire(w('8'))).toBe(40);
  });
  it('applies 240.4(D) small-conductor limits', () => {
    expect(maxBreakerForWire(w('14'))).toBe(15);
    expect(maxBreakerForWire(w('12', 'THHN/THWN-2'))).toBe(20);
    expect(maxBreakerForWire(w('10', 'NM-B', 'Al'))).toBe(25);
  });
  it('uses 75 °C for conductors in conduit', () => {
    expect(maxBreakerForWire(w('6', 'THHN/THWN-2'))).toBe(65);
  });
});

describe('checkWire', () => {
  it('flags undersized wire', () => {
    expect(checkWire(w('14'), 20, 'general', true).status).toBe('undersized');
  });
  it('allows next size up for a single-outlet appliance', () => {
    expect(checkWire(w('6'), 60, 'range', true).status).toBe('next-size-up');
  });
  it('does not allow next size up on multi-outlet receptacle circuits', () => {
    expect(checkWire(w('6'), 60, 'receptacles', true).status).toBe('undersized');
  });
  it('defers to nameplate MOCP for AC equipment', () => {
    expect(checkWire(w('12'), 25, 'hvac', false).status).toBe('equipment-mocp');
  });
  it('passes a correctly sized circuit', () => {
    expect(checkWire(w('8'), 40, 'cooktop-oven', false).status).toBe('ok');
  });
});

describe('suggestWireSize', () => {
  it('picks the smallest fully rated size', () => {
    expect(suggestWireSize(20, 'Cu', 'NM-B')).toBe('12');
    expect(suggestWireSize(40, 'Cu', 'NM-B')).toBe('8');
    expect(suggestWireSize(50, 'Cu', 'NM-B')).toBe('6');
    expect(suggestWireSize(60, 'Cu', 'THHN/THWN-2')).toBe('6');
    expect(suggestWireSize(100, 'Al', 'SER')).toBe('1');
  });
});

describe('voltageDrop', () => {
  it('matches the K-factor formula', () => {
    // 2 × 12.9 × 16 A × 100 ft / 6530 cmil = 6.32 V
    const vd = voltageDrop(w('12'), 100, 16, 120);
    expect(vd.volts).toBeCloseTo(6.32, 2);
    expect(vd.percent).toBeCloseTo(5.27, 2);
  });
  it('suggests a size that meets the target', () => {
    expect(sizeForVoltageDrop(w('12'), 100, 16, 120, 3)).toBe('8');
  });
});
