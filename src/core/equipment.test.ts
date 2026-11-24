import { describe, expect, it } from 'vitest';
import type { Project } from './types';
import { BATTERIES, batteryModel, inverterModel, INVERTERS } from '../data/equipment';
import { applyBatteryModel, applyInverterModel, chargeAmpsFor, chargeWatts, gridBreakerAmps, outputBreakerAmps } from './equipment';
import { batteryRuntime } from './battery';
import { gridInputCheck, inverterCheck } from './inverter';
import { defaultInterlock, defaultInverterSettings, newBreaker, newProject, parseProject, planSubpanel, serializeProject } from './project';
import { validateProject } from './rules';
import { suggestWireSize } from './wire';

const eco = inverterModel('ecoworthy-10kw-aio')!;
const mega = batteryModel('ecoworthy-powermega-314-v2')!;

/** Critical-loads panel on the ECO-WORTHY inverter, with `n` batteries and grid charging at `dcAmps`. */
function setup(n: number, dcAmps = 60, acVA = 4000): Project {
  const p = newProject();
  const plan = planSubpanel(p.panels[0], 'Critical loads', 125)!;
  const il = applyInverterModel({ ...defaultInterlock(), side: 'left' }, eco);
  il.inverter = applyBatteryModel(il.inverter, mega, n);
  const gridAmps = gridBreakerAmps(il.inverter);
  const grid = newBreaker('double', 17, 'standard', [
    {
      label: 'Grid input', loadType: 'inverter-input', amps: gridAmps, loadVA: chargeWatts(eco, dcAmps), continuous: true,
      wire: { size: suggestWireSize(gridAmps, 'Cu', 'THHN/THWN-2', 'inverter-input')!, material: 'Cu', type: 'THHN/THWN-2' },
    },
  ]);
  il.inverter.gridBreakerId = grid.id;
  const out = newBreaker('double', 1, 'standard', [{ label: 'Inverter output', loadType: 'inverter', amps: outputBreakerAmps(il), servesReceptacles: false }]);
  const ac = newBreaker('double', 2, 'standard', [{ label: 'AC condenser', loadType: 'hvac', amps: 30, loadVA: acVA, location: 'utility', servesReceptacles: false }]);
  const sub = { ...plan.panel, mainType: 'main-breaker' as const, mainAmps: 125, busAmps: 125, spaces: 24, maxCircuits: 24, interlock: il, breakers: [out, ac] };
  const range = newBreaker('double', 5, 'standard', [{ label: 'Range', loadType: 'range', amps: 50, loadVA: 12000 }]);
  return { ...p, panels: [{ ...p.panels[0], breakers: [plan.feeder, range, grid] }, sub] };
}
const rules = (p: Project) => validateProject(p).map((f) => f.rule);

describe('equipment from manuals', () => {
  it('has unique ids and a page for every note', () => {
    const all = [...INVERTERS, ...BATTERIES];
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    for (const m of all) for (const n of m.notes) expect(n.page, n.text).toBeTruthy();
  });

  it('fills in the inverter from its manual and keeps the rest', () => {
    const before = { ...defaultInterlock(), side: 'left' as const, inverter: { ...defaultInverterSettings(), gridBreakerId: 'x', idleWatts: 85 } };
    const il = applyInverterModel(before, eco);
    expect(il).toMatchObject({ side: 'left', kind: 'inverter', generatorWatts: 10000, surgeWatts: 20000, inletAmps: null });
    expect(il.inverter).toMatchObject({ modelId: eco.id, gridInputAmps: 63, acBreakerAmps: 63, throttlesInput: false, efficiencyPct: 92, gridBreakerId: 'x', idleWatts: 85 });
  });

  it('uses 60 A breakers and 6 AWG, the US sizes within the manual\'s 63 A', () => {
    const il = applyInverterModel(defaultInterlock(), eco);
    expect(outputBreakerAmps(il)).toBe(60); // 41.7 A × 1.25 = 52.1 A
    expect(gridBreakerAmps(il.inverter)).toBe(60);
    expect(suggestWireSize(60, 'Cu', 'THHN/THWN-2', 'inverter-input')).toBe('6');
  });

  it('sizes a grid breaker without a model', () => {
    const s = defaultInverterSettings();
    expect(gridBreakerAmps(s)).toBe(60);
    expect(gridBreakerAmps({ ...s, gridInputAmps: 63 })).toBe(60);
    expect(gridBreakerAmps({ ...s, gridInputAmps: 50, throttlesInput: true })).toBe(70);
    expect(gridBreakerAmps({ ...s, gridInputAmps: 50 })).toBe(50);
  });

  it('turns the charging current setting into AC power', () => {
    expect(chargeWatts(eco, 60)).toBe(3704); // 60 A × 56.8 V ÷ 92%
    expect(chargeWatts(eco, 120)).toBe(7409);
    expect(chargeAmpsFor(eco, 3704)).toBe(59); // rounded down, so it never exceeds the power given
    expect(chargeAmpsFor(eco, 99999)).toBe(120);
  });

  it('adds up batteries, within the number that can be paralleled', () => {
    const s = applyBatteryModel(defaultInverterSettings(), mega, 2);
    expect(s).toMatchObject({ batteryCount: 2, batteryKWh: 32.152, dischargeWatts: 15360, dischargeSurgeWatts: 25600 });
    expect(applyBatteryModel(s, mega, 40).batteryCount).toBe(15);
  });

  it('shows one battery holding the inverter back, and two not', () => {
    const one = setup(1);
    expect(batteryRuntime(one, one.panels[1])!.maxLoadW).toBeCloseTo(7680 * 0.92);
    expect(inverterCheck(one, one.panels[1])!.surgeLimitW).toBeCloseTo(12800 * 0.92);
    expect(rules(one)).toContain('battery-discharge');
    const two = setup(2);
    expect(batteryRuntime(two, two.panels[1])!.maxLoadW).toBe(10000);
    expect(inverterCheck(two, two.panels[1])!.surgeLimitW).toBe(20000);
    expect(rules(two)).not.toContain('battery-discharge');
  });

  it('fits default charging on the 60 A breaker, and warns at full charging beside a big load', () => {
    // AC 4,000 + 25% = 5,000 VA = 20.8 A passed through, plus 15.4 A of charging.
    const ok = setup(2);
    expect(gridInputCheck(ok, ok.panels[1])!.drawAmps).toBeCloseTo(36.3, 1);
    expect(rules(ok)).not.toContain('grid-input-breaker');
    expect(rules(ok)).not.toContain('grid-input-limit');
    // AC 8,000 + 25% = 10,000 VA = 41.7 A, plus 30.9 A of charging = 72.6 A, over the 63 A input.
    const full = setup(2, 120, 8000);
    expect(rules(full)).toContain('grid-input-limit');
    expect(validateProject(full).find((f) => f.rule === 'grid-input-limit')?.message).toContain('setting 28');
  });

  it('adds the manual\'s neutral advice, asks for a battery listing, and drops the export note', () => {
    const p = setup(1);
    expect(validateProject(p).find((f) => f.rule === 'inverter-neutral')?.message).toContain('setting 63');
    expect(rules(p)).toContain('battery-listing');
    expect(rules(p)).not.toContain('grid-input-export');
  });

  it('saves the models and ignores ones it does not know', () => {
    const p = setup(2);
    expect(parseProject(serializeProject(p)).panels[1].interlock).toEqual(p.panels[1].interlock);
    const raw = JSON.parse(serializeProject(p));
    raw.panels[1].interlock.inverter.modelId = 'unknown';
    expect(parseProject(JSON.stringify(raw)).panels[1].interlock!.inverter.modelId).toBeNull();
  });
});
