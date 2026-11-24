import { describe, expect, it } from 'vitest';
import type { Circuit, InverterSettings, Project } from './types';
import { batteryRuntime, hoursAt, inverterPanels, outageLoads } from './battery';
import { defaultInterlock, defaultInverterSettings, newBreaker, newProject, parseProject, planSubpanel, serializeProject } from './project';
import { validateProject } from './rules';
import { TYPICAL_OUTAGE_HOURS } from '../data/usage';
import { LOAD_TYPE_LABELS } from './labels';

function setup(settings: Partial<InverterSettings> = {}, fridge: Partial<Circuit> = {}, chargeVA = 0): Project {
  const p = newProject();
  const plan = planSubpanel(p.panels[0], 'Critical loads', 125)!;
  const grid = newBreaker('double', 17, 'standard', [{ label: 'Grid input', loadType: 'inverter-input', amps: 60, loadVA: chargeVA }]);
  const sub = {
    ...plan.panel,
    mainType: 'main-breaker' as const, mainAmps: 125, busAmps: 125, spaces: 24, maxCircuits: 24,
    interlock: {
      ...defaultInterlock(), side: 'left' as const, kind: 'inverter' as const, generatorWatts: 6000,
      inverter: { ...defaultInverterSettings(), gridBreakerId: grid.id, ...settings },
    },
    breakers: [
      newBreaker('double', 1, 'standard', [{ label: 'Inverter output', loadType: 'inverter', amps: 35 }]),
      newBreaker('single', 5, 'standard', [{ label: 'Refrigerator', loadType: 'refrigerator', amps: 20, loadVA: 800, ...fridge }]),
      newBreaker('single', 6, 'standard', [{ label: 'Furnace', loadType: 'furnace', amps: 15, loadVA: 600 }]),
      newBreaker('single', 7, 'standard', [{ label: 'Bedroom', loadType: 'general', amps: 15, loadVA: 0 }]),
      newBreaker('single', 8, 'standard', [{ label: 'Spare', loadType: 'other', amps: 20 }]),
    ],
  };
  return { ...p, panels: [{ ...p.panels[0], breakers: [plan.feeder, grid] }, sub] };
}
const runtime = (p: Project) => batteryRuntime(p, p.panels[1])!;

describe('battery run time', () => {
  it('has typical hours for every load type', () => {
    expect(Object.keys(TYPICAL_OUTAGE_HOURS).sort()).toEqual(Object.keys(LOAD_TYPE_LABELS).sort());
  });

  it('works out hours at a steady load with losses and the inverter\'s own draw', () => {
    const s = { ...defaultInverterSettings(), batteryKWh: 10, usablePct: 90, efficiencyPct: 90, idleWatts: 100 };
    // 9,000 Wh usable ÷ (900 ÷ 0.9 + 100) W
    expect(hoursAt(s, 900)).toBeCloseTo(9000 / 1100);
    expect(hoursAt({ ...s, idleWatts: 0, efficiencyPct: 100 }, 1000)).toBeCloseTo(9);
    expect(hoursAt({ ...s, batteryKWh: null }, 900)).toBeNull();
  });

  it('adds up the circuits: load × hours a day', () => {
    // Fridge 800 × 2 h + furnace 600 × 8 h = 1.6 + 4.8 = 6.4 kWh a day = 266.7 W average.
    const r = runtime(setup({ batteryKWh: 10, usablePct: 100, efficiencyPct: 100, idleWatts: 0 }));
    expect(r.loads.map((l) => l.circuit.label)).toEqual(['Refrigerator', 'Furnace', 'Bedroom']);
    expect(r.kWhPerDay).toBeCloseTo(6.4);
    expect(r.averageW).toBeCloseTo(266.67, 1);
    expect(r.hours).toBeCloseTo(37.5);
    expect(r.withoutLoad).toBe(1);
  });

  it('uses the hours entered on a circuit, with 0 meaning off', () => {
    expect(runtime(setup({}, { outageHours: 6 })).kWhPerDay).toBeCloseTo(4.8 + 4.8);
    const off = runtime(setup({}, { outageHours: 0 }));
    expect(off.kWhPerDay).toBeCloseTo(4.8);
    expect(off.loads[0].hours).toBe(0);
  });

  it('uses a measured average load when there is one', () => {
    const r = runtime(setup({ batteryKWh: 10, usablePct: 100, efficiencyPct: 100, idleWatts: 0, measuredLoadW: 500 }));
    expect(r.measured).toBe(true);
    expect(r.averageW).toBe(500);
    expect(r.kWhPerDay).toBe(12);
    expect(r.hours).toBeCloseTo(20);
  });

  it('includes panels fed from the backed-up panel, but not its feeder', () => {
    const p = setup();
    const plan = planSubpanel(p.panels[1], 'Shed', 30)!;
    const shed = { ...plan.panel, breakers: [newBreaker('single', 1, 'standard', [{ label: 'Shed lights', loadType: 'lighting', amps: 15, loadVA: 200 }])] };
    const q: Project = { ...p, panels: [p.panels[0], { ...p.panels[1], breakers: [...p.panels[1].breakers, plan.feeder] }, shed] };
    expect(outageLoads(q, q.panels[1]).map((l) => l.circuit.label)).toEqual(['Refrigerator', 'Furnace', 'Bedroom', 'Shed lights']);
  });

  it('estimates recharging from the grid', () => {
    // 10 kWh × 90% = 9 kWh at 5,000 W × 90% = 2 hours.
    expect(runtime(setup({ batteryKWh: 10, usablePct: 90, efficiencyPct: 90 }, {}, 5000)).rechargeHours).toBeCloseTo(2);
    expect(runtime(setup({ batteryKWh: 10 })).rechargeHours).toBeNull();
  });

  it('is limited by what the batteries can deliver', () => {
    const p = setup({ batteryKWh: 5, dischargeWatts: 5000, efficiencyPct: 90 });
    expect(runtime(p).maxLoadW).toBeCloseTo(4500);
    expect(validateProject(p).find((f) => f.rule === 'battery-discharge')?.severity).toBe('info');
    const small = setup({ batteryKWh: 5, dischargeWatts: 1000, efficiencyPct: 90 });
    expect(validateProject(small).find((f) => f.rule === 'battery-discharge')?.severity).toBe('warning');
    expect(validateProject(setup({ dischargeWatts: 7000 })).map((f) => f.rule)).not.toContain('battery-discharge');
  });

  it('adds the installation check by edition once a battery is entered', () => {
    const p = setup({ batteryKWh: 50 });
    const f = (q: Project) => validateProject(q).find((x) => x.rule === 'battery-install');
    expect(f({ ...p, necEdition: '2023' })?.ref).toBe('Article 706, 706.15');
    expect(f({ ...p, necEdition: '2017' })?.ref).toBe('Article 706');
    expect(f({ ...p, necEdition: '2008' })?.ref).toBe('Article 480');
    expect(f(p)?.message).toContain('This battery is 50 kWh');
    expect(f(setup())).toBeUndefined();
  });

  it('finds inverter panels, saves hours, and ignores generator panels', () => {
    const p = setup({}, { outageHours: 3.5 });
    expect(inverterPanels(p).map((x) => x.name)).toEqual(['Critical loads']);
    expect(batteryRuntime(p, p.panels[0])).toBeNull();
    const back = parseProject(serializeProject(p));
    expect(back.panels[1].breakers[1].circuits[0].outageHours).toBe(3.5);
  });
});
