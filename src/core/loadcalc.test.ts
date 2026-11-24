import { describe, expect, it } from 'vitest';
import type { BreakerForm, InstallStatus, LoadType, NecEdition, Project } from './types';
import { calculateLoads, cookingDemandVA } from './loadcalc';
import { newBreaker, newProject } from './project';
import { exampleProject } from './example';

type Load = [loadType: LoadType, va: number, status?: InstallStatus];
const TWO_POLE: LoadType[] = ['range', 'dryer', 'water-heater', 'hvac', 'heat', 'ev', 'cooktop-oven'];

function house(area: number, loads: Load[], edition: NecEdition = '2023', serviceAmps: number | null = 200): Project {
  const p = newProject();
  const breakers = loads.map(([loadType, loadVA, status], i) => {
    const form: BreakerForm = TWO_POLE.includes(loadType) ? 'double' : 'single';
    return newBreaker(form, i * 4 + 1, 'standard', [{ loadType, loadVA, label: loadType }], status ?? 'new');
  });
  return {
    ...p,
    necEdition: edition,
    panels: [{ ...p.panels[0], breakers }],
    loadCalc: { ...p.loadCalc, floorAreaFt2: area, serviceAmps },
  };
}
const method = (p: Project, id: string) => calculateLoads(p).methods.find((m) => m.id === id)!;

describe('cookingDemandVA (Table 220.55)', () => {
  it('uses Column C for a 12 kW range', () => expect(cookingDemandVA([12000])).toBe(8000));
  it('adds 5% per kW over 12 kW (Note 1)', () => expect(cookingDemandVA([14000])).toBeCloseTo(8800));
  it('uses Column B for 3.5–8.75 kW appliances', () => {
    expect(cookingDemandVA([8000])).toBeCloseTo(6400);
    expect(cookingDemandVA([6000, 4000])).toBeCloseTo(6500);
  });
});

describe('standard method', () => {
  it('matches NEC Annex D Example D1(a): 18,600 VA, 77.5 A', () => {
    // 1,500 ft², 12 kW range, 5.5 kW dryer, 2 small-appliance and 1 laundry circuit.
    const m = method(house(1500, [['range', 12000], ['dryer', 5500]]), 'standard');
    expect(m.totalVA).toBeCloseTo(18600);
    expect(m.amps).toBeCloseTo(77.5);
  });

  it('applies 75% to four or more fixed appliances', () => {
    const loads: Load[] = [['dishwasher', 1200], ['disposal', 800], ['water-heater', 4500], ['microwave', 1500]];
    const m = method(house(1000, loads), 'standard');
    const line = m.lines.find((l) => l.ref === '220.53')!;
    expect(line.va).toBeCloseTo(8000 * 0.75);
  });

  it('uses the 7,200 VA EV minimum only from 2023', () => {
    const evLine = (ed: NecEdition) => method(house(1000, [['ev', 6000]], ed), 'standard').lines.find((l) => l.label.includes('EV'))!;
    expect(evLine('2023').va).toBe(7200);
    expect(evLine('2020').va).toBe(6000);
  });

  it('counts the larger of heating and cooling, not both', () => {
    const m = method(house(1000, [['hvac', 5000], ['heat', 8000]]), 'standard');
    expect(m.lines.find((l) => l.ref === '220.60')!.va).toBe(8000);
  });
});

describe('optional method (220.82)', () => {
  it('matches NEC Annex D Example D2(a): 21,480 VA, 89.5 A', () => {
    // 1,500 ft², 12 kW range, 2.5 kW water heater, 1.2 kW dishwasher, 5 kW dryer,
    // 9 kW heat in five rooms, 1.38 kVA room AC.
    const loads: Load[] = [
      ['range', 12000], ['water-heater', 2500], ['dishwasher', 1200], ['dryer', 5000], ['hvac', 1380],
      ['heat', 1800], ['heat', 1800], ['heat', 1800], ['heat', 1800], ['heat', 1800],
    ];
    const m = method(house(1500, loads), 'optional');
    expect(m.totalVA).toBeCloseTo(21480);
    expect(m.amps).toBeCloseTo(89.5);
  });

  it('needs a 100 A service', () => {
    expect(method(house(1000, [], '2023', 60), 'optional').applicable).toBe(false);
  });
});

describe('existing dwelling (220.83)', () => {
  it('needs existing breakers', () => {
    expect(method(house(1500, [['range', 12000]]), 'existing').applicable).toBe(false);
  });

  it('uses 8 kVA at 100% and the rest at 40% when no heating or A/C is added', () => {
    const p = house(1500, [['range', 12000, 'existing'], ['ev', 9600, 'new']]);
    const m = method(p, 'existing');
    expect(m.ref).toBe('220.83(A)');
    // 4,500 + 3,000 + 1,500 + 12,000 + 9,600 = 30,600 → 8,000 + 40% of 22,600
    expect(m.totalVA).toBeCloseTo(8000 + 0.4 * 22600);
    expect(m.before!.totalVA).toBeCloseTo(8000 + 0.4 * 13000);
  });

  it('switches to 220.83(B) when A/C is added', () => {
    const p = house(1500, [['range', 12000, 'existing'], ['hvac', 5000, 'new']]);
    const m = method(p, 'existing');
    expect(m.ref).toBe('220.83(B)');
    expect(m.totalVA).toBeCloseTo(5000 + 8000 + 0.4 * (21000 - 8000));
  });
});

describe('measured demand (220.87)', () => {
  it('adds new loads to 125% of the measured peak', () => {
    const p = house(1500, [['range', 12000, 'existing'], ['ev', 9600, 'new']]);
    p.loadCalc.measuredPeakKW = 10;
    expect(method(p, 'measured').totalVA).toBeCloseTo(12500 + 9600);
  });
});

describe('example project', () => {
  it('fits the 200 A service with the existing-dwelling method', () => {
    const r = calculateLoads(exampleProject());
    expect(r.best?.id).toBe('existing');
    expect(r.best!.amps).toBeLessThan(200);
    expect(r.methods.find((m) => m.id === 'existing')!.ref).toBe('220.83(B)');
  });
});
