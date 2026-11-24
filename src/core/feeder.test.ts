import { describe, expect, it } from 'vitest';
import type { Breaker, NecEdition, Project } from './types';
import { feederCalc, serviceConductors } from './feeder';
import { newBreaker, newProject, planSubpanel } from './project';
import { exampleProject } from './example';
import { validateProject } from './rules';
import { checkFeederWire, egcSize } from './wire';

/** A main panel with a feeder to one subpanel holding `subBreakers`. */
function withSub(subBreakers: Breaker[], opts: { feederAmps?: number; edition?: NecEdition; mainBreakers?: Breaker[] } = {}): Project {
  const p = newProject();
  p.necEdition = opts.edition ?? '2023';
  const plan = planSubpanel(p.panels[0], 'Garage', opts.feederAmps ?? 60)!;
  const main = { ...p.panels[0], breakers: [plan.feeder, ...(opts.mainBreakers ?? [newBreaker('single', 5, 'standard', [{ label: 'Kitchen lights', loadVA: 600 }])])] };
  return { ...p, panels: [main, { ...plan.panel, breakers: subBreakers }] };
}
const sub = (p: Project) => feederCalc(p, p.panels[1]);

describe('subpanel feeder calculation', () => {
  it('calculates the example workshop feeder with the standard method', () => {
    const p = exampleProject();
    const fc = feederCalc(p, p.panels.find((x) => x.name === 'Workshop')!);
    // Receptacles 1,500 + lights 500 (no living area) + compressor 3,600 + mini-split 2,400 + 25% of the compressor 900.
    expect(fc.wholeHouse).toBe(false);
    expect(fc.method!.totalVA).toBeCloseTo(8900);
    expect(fc.amps).toBeCloseTo(37.08, 1);
    expect(fc.minBreaker).toBe(40);
    expect(fc.wire?.status).toBe('ok');
    expect(fc.egc).toEqual({ Cu: '10', Al: '8' });
    expect(fc.voltageDrop!.percent).toBeLessThan(3);
  });

  it('uses 3 VA/ft² for the living area a subpanel serves, covering its lighting circuits', () => {
    const p = withSub([newBreaker('single', 1, 'afci', [{ label: 'Bedroom', loadType: 'general', loadVA: 1200 }])]);
    p.panels[1].feederAreaFt2 = 1000;
    const fc = sub(p);
    expect(fc.method!.lines[0].va).toBe(3000);
    expect(fc.method!.totalVA).toBeCloseTo(3000);
  });

  it('applies 220.53 to four or more appliances on the same feeder', () => {
    const loads = [1, 3, 5, 7].map((s) => newBreaker('single', s, 'standard', [{ label: `Appliance ${s}`, loadType: 'disposal', loadVA: 1000 }]));
    const fc = sub(withSub(loads));
    expect(fc.method!.lines.find((l) => l.ref === '220.53')!.va).toBeCloseTo(3000);
  });

  it('takes EV chargers at 125% on a feeder (625.41)', () => {
    const ev = newBreaker('double', 1, 'standard', [{ label: 'EV', loadType: 'ev', amps: 50, loadVA: 9600, continuous: true }]);
    const fc = sub(withSub([ev], { edition: '2020' }));
    expect(fc.method!.totalVA).toBeCloseTo(12000);
    expect(fc.method!.lines.some((l) => l.ref === '625.41')).toBe(true);
    expect(sub(withSub([ev], { edition: '2008' })).method!.lines.some((l) => l.ref === '625.21')).toBe(true);
  });

  it('allows the next size up on a feeder only when the calculated load fits', () => {
    const nm6 = { size: '6' as const, material: 'Cu' as const, type: 'NM-B' as const }; // 55 A at 60 °C
    expect(checkFeederWire(nm6, 60, 30, false).status).toBe('next-size-up');
    expect(checkFeederWire(nm6, 60, 58, false).status).toBe('below-load');
    expect(checkFeederWire({ ...nm6, size: '8' }, 60, 30, false).status).toBe('undersized');
  });

  it('flags a feeder breaker smaller than the calculated load', () => {
    const heat = [1, 3].map((s) => newBreaker('double', s, 'standard', [{ label: 'Heat', loadType: 'heat', amps: 30, loadVA: 5000, continuous: true }]));
    const p = withSub(heat, { feederAmps: 40 });
    expect(sub(p).amps).toBeCloseTo(10000 / 240);
    expect(validateProject(p).map((f) => f.rule)).toContain('feeder-load');
  });

  it('treats a feeder carrying the whole house like the service, with 83% conductors', () => {
    const p = withSub([newBreaker('double', 1, 'standard', [{ label: 'Range', loadType: 'range', amps: 50, loadVA: 12000 }])], {
      feederAmps: 200,
      mainBreakers: [],
    });
    p.panels[1] = { ...p.panels[1], busAmps: 200, mainType: 'main-breaker', mainAmps: 200 };
    p.panels[0].breakers[0].circuits[0].wire = { size: '2/0', material: 'Cu', type: 'THHN/THWN-2' }; // 175 A
    p.loadCalc.floorAreaFt2 = 2000;
    const fc = sub(p);
    expect(fc.wholeHouse).toBe(true);
    expect(fc.method?.id).toBeDefined();
    expect(fc.wire?.status).toBe('dwelling');
    expect(validateProject(p).map((f) => f.rule)).not.toContain('wire-undersized');
  });
});

describe('service conductors', () => {
  const sizes = (amps: number, edition: NecEdition = '2023') => {
    const p = newProject();
    p.necEdition = edition;
    p.loadCalc.serviceAmps = amps;
    const s = serviceConductors(p);
    return [s.Cu, s.Al];
  };
  it('matches the dwelling service table (83% of the rating)', () => {
    expect(sizes(100)).toEqual(['4', '2']);
    expect(sizes(125)).toEqual(['2', '1/0']);
    expect(sizes(150)).toEqual(['1', '2/0']);
    expect(sizes(175)).toEqual(['1/0', '3/0']);
    expect(sizes(200)).toEqual(['2/0', '4/0']);
    expect(sizes(225)).toEqual(['3/0', '250']);
    expect(sizes(300)).toEqual(['250', '350']);
  });
  it('cites the section for the edition', () => {
    const ref = (ed: NecEdition) => {
      const p = newProject();
      p.necEdition = ed;
      return serviceConductors(p).ref;
    };
    expect(ref('2008')).toBe('Table 310.15(B)(6)');
    expect(ref('2014')).toBe('Table 310.15(B)(7)');
    expect(ref('2017')).toBe('310.15(B)(7)');
    expect(ref('2023')).toBe('310.12');
  });
});

describe('equipment grounding conductor (Table 250.122)', () => {
  it('sizes by the feeder breaker', () => {
    expect(egcSize(60)).toEqual({ Cu: '10', Al: '8' });
    expect(egcSize(100)).toEqual({ Cu: '8', Al: '6' });
    expect(egcSize(200)).toEqual({ Cu: '6', Al: '4' });
  });
});
