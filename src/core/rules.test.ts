import { describe, expect, it } from 'vitest';
import type { Breaker, LoadType, Location, NecEdition, Panel, Project } from './types';
import { validateProject } from './rules';
import { defaultInverterSettings, newBreaker, newProject, planSubpanel } from './project';
import { exampleProject } from './example';
import { legLoads } from './balance';
import { generatorLoad } from './generator';

function projectWith(breakers: Breaker[], edition: NecEdition = '2023', panel: Partial<Panel> = {}): Project {
  const p = newProject();
  return { ...p, necEdition: edition, panels: [{ ...p.panels[0], ...panel, breakers }] };
}
const rules = (p: Project) => validateProject(p).map((f) => f.rule);

describe('example project', () => {
  it('has no errors', () => {
    expect(validateProject(exampleProject()).filter((f) => f.severity === 'error')).toEqual([]);
  });
  it('is reasonably balanced', () => {
    const p = exampleProject();
    expect(legLoads(p, p.panels[0]).imbalancePct).toBeLessThan(15);
  });
});

describe('AFCI', () => {
  it('flags a standard breaker serving a bedroom', () => {
    const b = newBreaker('single', 1, 'standard', [{ label: 'Bedroom', location: 'bedroom', amps: 15 }]);
    expect(rules(projectWith([b]))).toContain('afci');
  });
  it('is satisfied by an AFCI breaker', () => {
    const b = newBreaker('single', 1, 'afci', [{ label: 'Bedroom', location: 'bedroom', amps: 15 }]);
    expect(rules(projectWith([b]))).not.toContain('afci');
  });
});

describe('GFCI', () => {
  it('kitchen receptacles beyond the countertop are covered from 2023', () => {
    const b = newBreaker('single', 1, 'afci', [{ label: 'Fridge', location: 'kitchen', loadType: 'refrigerator', servesReceptacles: true }]);
    expect(rules(projectWith([b], '2020'))).not.toContain('gfci');
    expect(rules(projectWith([b], '2023'))).toContain('gfci');
  });
  it('outdoor hard-wired equipment is covered from 2020 (210.8(F))', () => {
    const b = newBreaker('double', 1, 'standard', [{ label: 'AC', location: 'outdoor', loadType: 'hvac', amps: 30, servesReceptacles: false }]);
    expect(rules(projectWith([b], '2017'))).not.toContain('gfci');
    expect(rules(projectWith([b], '2020'))).toContain('gfci');
  });
  it('240 V laundry receptacles are covered from 2020', () => {
    const b = newBreaker('double', 1, 'standard', [{ label: 'Dryer', location: 'laundry', loadType: 'dryer', amps: 30, servesReceptacles: true }]);
    expect(rules(projectWith([b], '2017'))).not.toContain('gfci');
    expect(rules(projectWith([b], '2020'))).toContain('gfci');
  });
  it('GFEP does not count as personnel protection', () => {
    const b = newBreaker('single', 1, 'gfep', [{ label: 'Garage', location: 'garage', servesReceptacles: true }]);
    expect(rules(projectWith([b]))).toContain('gfci');
  });
});

describe('GFCI receptacle on the circuit', () => {
  const garage = (gfciReceptacle: boolean) =>
    newBreaker('single', 1, 'standard', [{ label: 'Garage', location: 'garage', servesReceptacles: true, gfciReceptacle }]);
  it('satisfies the receptacle GFCI requirement', () => {
    expect(rules(projectWith([garage(false)]))).toContain('gfci');
    expect(rules(projectWith([garage(true)]))).not.toContain('gfci');
  });
  it('does not count on a 240 V circuit', () => {
    const b = newBreaker('double', 1, 'standard', [{ label: 'Welder', location: 'garage', amps: 50, servesReceptacles: true, gfciReceptacle: true }]);
    expect(rules(projectWith([b], '2023'))).toContain('gfci');
  });
  it('does not count when the circuit has no receptacles', () => {
    const b = newBreaker('single', 1, 'standard', [{ label: 'Fountain', location: 'pool-spa', servesReceptacles: false, gfciReceptacle: true }]);
    expect(rules(projectWith([b]))).toContain('gfci');
  });
});

describe('older NEC editions', () => {
  const find = (p: Project, rule: string) => validateProject(p).find((f) => f.rule === rule);
  const room = (location: Location, loadType: LoadType = 'general') =>
    newBreaker('single', 1, 'standard', [{ label: location, location, loadType, amps: 15, servesReceptacles: true }]);

  it('AFCI: bedrooms only in 2005, living areas from 2008, kitchens and laundry from 2014', () => {
    expect(find(projectWith([room('bedroom')], '2005'), 'afci')?.ref).toBe('210.12(B)');
    expect(rules(projectWith([room('living')], '2005'))).not.toContain('afci');
    expect(find(projectWith([room('living')], '2008'), 'afci')?.ref).toBe('210.12(B)');
    expect(find(projectWith([room('living')], '2011'), 'afci')?.ref).toBe('210.12(A)');
    expect(rules(projectWith([room('kitchen', 'small-appliance')], '2011'))).not.toContain('afci');
    expect(rules(projectWith([room('kitchen', 'small-appliance')], '2014'))).toContain('afci');
    expect(rules(projectWith([room('laundry', 'laundry')], '2014'))).toContain('afci');
  });

  it('GFCI: laundry areas from 2014; before that, receptacles near a sink', () => {
    expect(find(projectWith([room('laundry', 'laundry')], '2011'), 'gfci')?.ref).toBe('210.8(A)(7)');
    expect(find(projectWith([room('laundry', 'laundry')], '2014'), 'gfci')?.ref).toBe('210.8(A)');
  });

  it('GFCI: dishwashers from 2014, EV receptacles from 2017, crawl space lighting from 2017', () => {
    const dw = newBreaker('single', 1, 'afci', [{ label: 'Dishwasher', location: 'kitchen', loadType: 'dishwasher', servesReceptacles: false }]);
    expect(rules(projectWith([dw], '2011'))).not.toContain('gfci');
    expect(rules(projectWith([dw], '2014'))).toContain('gfci');
    const ev = newBreaker('double', 1, 'standard', [{ label: 'EV', location: 'other', loadType: 'ev', amps: 50, servesReceptacles: true }]);
    expect(rules(projectWith([ev], '2014'))).not.toContain('gfci');
    expect(find(projectWith([ev], '2017'), 'gfci')?.ref).toBe('625.54');
    const crawl = newBreaker('single', 1, 'standard', [{ label: 'Crawl lights', location: 'crawlspace', loadType: 'lighting', servesReceptacles: false }]);
    expect(rules(projectWith([crawl], '2014'))).not.toContain('gfci');
    expect(find(projectWith([crawl], '2017'), 'gfci')?.ref).toBe('210.8(E)');
    expect(find(projectWith([crawl], '2020'), 'gfci')?.ref).toBe('210.8(C)');
  });

  it('cites the ampacity table by edition', () => {
    const b = newBreaker('single', 1, 'standard', [{ label: 'Garage', amps: 20, wire: { size: '14', material: 'Cu', type: 'NM-B' } }]);
    expect(find(projectWith([b], '2008'), 'wire-undersized')?.ref).toContain('Table 310.16');
    expect(find(projectWith([b], '2011'), 'wire-undersized')?.ref).toContain('Table 310.15(B)(16)');
    expect(find(projectWith([b], '2023'), 'wire-undersized')?.ref).toContain('Table 310.16');
  });

  it('limits a 2005 panel to 42 circuits', () => {
    const many = Array.from({ length: 44 }, (_, i) => newBreaker('single', i + 1, 'standard', [{ label: `Ckt ${i + 1}` }]));
    const opts = { spaces: 44, maxCircuits: 44 };
    expect(rules(projectWith(many, '2005', opts))).toContain('panel-42');
    expect(rules(projectWith(many, '2008', opts))).not.toContain('panel-42');
  });

  it('cites Article 702 by edition', () => {
    const gen = newBreaker('double', 2, 'standard', [{ label: 'Generator', loadType: 'generator', amps: 30, servesReceptacles: false }]);
    expect(find(projectWith([gen], '2008'), 'generator-no-interlock')?.ref).toBe('702.6');
    expect(find(projectWith([gen], '2011'), 'generator-no-interlock')?.ref).toBe('702.5');
  });
});

describe('load and wire checks', () => {
  it('flags wire too small for the breaker', () => {
    const b = newBreaker('single', 1, 'standard', [{ label: 'Garage', amps: 20, wire: { size: '14', material: 'Cu', type: 'NM-B' } }]);
    expect(rules(projectWith([b]))).toContain('wire-undersized');
  });
  it('flags overload', () => {
    const b = newBreaker('single', 1, 'standard', [{ label: 'Heater', amps: 15, loadVA: 3000 }]);
    expect(rules(projectWith([b]))).toContain('overload');
  });
  it('uses the Table 220.55 demand for a range branch circuit', () => {
    const b = newBreaker('double', 1, 'standard', [{ label: 'Range', loadType: 'range', amps: 40, loadVA: 12000, wire: { size: '8', material: 'Cu', type: 'NM-B' } }]);
    expect(rules(projectWith([b]))).not.toContain('overload');
  });
  it('flags a continuous load above 80% of the breaker', () => {
    const b = newBreaker('double', 1, 'standard', [{ label: 'EV', loadType: 'ev', amps: 40, loadVA: 9600, continuous: true, wire: { size: '8', material: 'Cu', type: 'NM-B' } }]);
    expect(rules(projectWith([b]))).toContain('continuous');
  });
  it('flags long runs with high voltage drop', () => {
    const b = newBreaker('single', 1, 'gfci', [{ label: 'Lights', location: 'outdoor', amps: 20, loadVA: 600, lengthFt: 200, wire: { size: '12', material: 'Cu', type: 'UF-B' } }]);
    expect(rules(projectWith([b]))).toContain('voltage-drop');
  });
  it('flags more circuits than the panel is listed for', () => {
    const p = projectWith([newBreaker('single', 1), newBreaker('single', 2), newBreaker('single', 3)], '2023', { spaces: 4, maxCircuits: 2 });
    expect(rules(p)).toContain('too-many-circuits');
  });
  it('flags overlapping breakers', () => {
    expect(rules(projectWith([newBreaker('double', 1), newBreaker('single', 3)]))).toContain('overlap');
  });
});

describe('subpanels', () => {
  function withSub(feederAmps: number, sub: Partial<Panel> = {}) {
    const p = newProject();
    const plan = planSubpanel(p.panels[0], 'Garage', feederAmps)!;
    const main = { ...p.panels[0], breakers: [plan.feeder] };
    return { ...p, panels: [main, { ...plan.panel, ...sub }] };
  }

  it('places the feeder in the first free 2-pole space', () => {
    const p = withSub(60);
    expect(p.panels[0].breakers[0].space).toBe(1);
    expect(p.panels[1].feed).toEqual({ panelId: p.panels[0].id, breakerId: p.panels[0].breakers[0].id });
  });

  it('rolls subpanel load up into the main panel legs', () => {
    const p = withSub(60);
    p.panels[1].breakers = [newBreaker('single', 1, 'standard', [{ label: 'Lights', loadVA: 1200 }])];
    const legs = legLoads(p, p.panels[0]);
    expect(legs.totalVA).toBe(1200);
  });

  it('flags a feeder larger than a main-lug subpanel bus', () => {
    expect(rules(withSub(125))).toContain('feed-over-bus');
    expect(rules(withSub(60))).not.toContain('feed-over-bus');
  });

  it('flags a missing feeder breaker', () => {
    const p = withSub(60);
    p.panels[0].breakers = [];
    expect(rules(p)).toContain('feed-missing');
  });

  it('asks for a disconnect in a separate building with a main-lug panel', () => {
    expect(rules(withSub(60, { separateBuilding: true }))).toContain('separate-building-disconnect');
    expect(rules(withSub(60, { separateBuilding: true, mainType: 'main-breaker', mainAmps: 100 }))).not.toContain(
      'separate-building-disconnect',
    );
  });
});

describe('generator interlock', () => {
  const gen = (space: number, amps = 30) =>
    newBreaker('double', space, 'standard', [{ label: 'Generator', loadType: 'generator', amps, servesReceptacles: false, wire: { size: '10', material: 'Cu', type: 'THHN/THWN-2' } }]);
  const interlock = { side: 'right' as const, kind: 'portable' as const, generatorWatts: 7500, inletAmps: 30, surgeWatts: null, inverter: defaultInverterSettings() };

  it('flags a back-fed breaker with no interlock', () => {
    expect(rules(projectWith([gen(2)]))).toContain('generator-no-interlock');
  });
  it('accepts the generator breaker in the interlock position', () => {
    const r = rules(projectWith([gen(2)], '2023', { interlock }));
    expect(r).not.toContain('interlock-position');
    expect(r).toContain('interlock-install');
  });
  it('flags the generator breaker in the wrong spaces', () => {
    expect(rules(projectWith([gen(6)], '2023', { interlock }))).toContain('interlock-position');
  });
  it('needs a main breaker', () => {
    expect(rules(projectWith([gen(2)], '2023', { interlock, mainType: 'main-lug', mainAmps: null }))).toContain('interlock-no-main');
  });
  it('flags a breaker larger than the inlet', () => {
    expect(rules(projectWith([gen(2, 50)], '2023', { interlock }))).toContain('generator-inlet');
  });
  it('totals the circuits marked for the generator against its rating', () => {
    const loads = [1, 3, 5, 7].map((s) => newBreaker('single', s, 'standard', [{ label: `Load ${s}`, loadVA: 2400, onGenerator: true }]));
    const p = projectWith([gen(2), ...loads], '2023', { interlock });
    expect(generatorLoad(p, p.panels[0]).totalVA).toBe(9600);
    expect(rules(p)).toContain('generator-overload');
  });
});

describe('load calculation finding', () => {
  it('warns when the calculated load exceeds the service', () => {
    const big = [1, 5, 9, 13, 17].map((s) => newBreaker('double', s, 'standard', [{ label: 'Heat', loadType: 'heat', loadVA: 10000, amps: 60 }]));
    const p = projectWith(big, '2023', { mainAmps: 100, busAmps: 100 });
    p.loadCalc = { ...p.loadCalc, floorAreaFt2: 2000 };
    expect(rules(p)).toContain('service-load');
  });
});
