import { describe, expect, it } from 'vitest';
import type { Breaker, Panel, Project } from './types';
import { buildBom, wireTotals } from './bom';
import { newBreaker, newProject } from './project';
import { getFamily } from '../data/families';
import { exampleProject } from './example';

function projectWith(breakers: Breaker[], panel: Partial<Panel> = {}): Project {
  const p = newProject();
  return { ...p, panels: [{ ...p.panels[0], ...panel, breakers }] };
}

describe('buildBom', () => {
  it('groups new breakers and suggests Homeline part numbers', () => {
    const p = projectWith(
      [
        newBreaker('single', 1, 'standard', [{ amps: 20 }]),
        newBreaker('single', 2, 'standard', [{ amps: 20 }]),
        newBreaker('double', 3, 'standard', [{ amps: 30 }]),
        newBreaker('tandem', 4, 'standard', [{ amps: 20 }, { amps: 15 }]),
        newBreaker('single', 6, 'standard', [{ amps: 15 }], 'existing'),
      ],
      { family: 'sqd-hom', tandemSpaces: 'all' },
    );
    const bom = buildBom(p);
    expect(bom.lines[0].key).toMatch(/^panel-/);
    const byPn = Object.fromEntries(bom.lines.slice(1).map((l) => [l.partNumber, l.qty]));
    expect(byPn).toEqual({ HOM120: 2, HOMT1520: 1, HOM230: 1 });
    expect(bom.existingBreakers).toBe(1);
  });

  it('leaves existing panels off and adds interlock hardware', () => {
    const bom = buildBom(exampleProject());
    expect(bom.existingPanels).toBe(1);
    const keys = bom.lines.map((l) => l.key.split('-')[0]);
    expect(keys).toContain('interlock');
    expect(keys).toContain('holddown');
    expect(keys).toContain('inlet');
    // The workshop subpanel is new, the main panel is not.
    expect(bom.lines.filter((l) => l.key.startsWith('panel-'))).toHaveLength(1);
  });

  it('builds GE THQL numbers', () => {
    expect(getFamily('ge-thql').partNumber({ form: 'double', protection: 'standard', amps: [100] }).partNumber).toBe('THQL21100');
    expect(getFamily('ge-thql').partNumber({ form: 'single', protection: 'standard', amps: [20] }).partNumber).toBe('THQL1120');
  });

  it('flags specialty breakers for verification', () => {
    expect(getFamily('sqd-hom').partNumber({ form: 'single', protection: 'df', amps: [20] }).verify).toBe(true);
    expect(getFamily('sqd-hom').partNumber({ form: 'single', protection: 'standard', amps: [20] }).verify).toBe(false);
  });
});

describe('wireTotals', () => {
  it('sums run lengths of new circuits by cable', () => {
    const p = projectWith([
      newBreaker('single', 1, 'standard', [{ amps: 20, lengthFt: 40 }]),
      newBreaker('single', 2, 'standard', [{ amps: 20, lengthFt: 60 }]),
      newBreaker('single', 4, 'standard', [{ amps: 20, lengthFt: 500 }], 'existing'),
      newBreaker('double', 5, 'standard', [{ amps: 30, loadType: 'dryer' }]),
    ]);
    const totals = wireTotals(p);
    expect(totals.find((t) => t.description.startsWith('12/2'))?.totalFt).toBe(100);
    expect(totals.find((t) => t.description.startsWith('10/3'))?.runsWithoutLength).toBe(1);
  });
});
