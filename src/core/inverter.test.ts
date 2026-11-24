import { describe, expect, it } from 'vitest';
import type { Breaker, GeneratorInterlock, InverterSettings, Project } from './types';
import { gridInputCheck, gridInputLabel, inverterCheck, inverterFedBy } from './inverter';
import { defaultInterlock, defaultInverterSettings, newBreaker, newProject, parseProject, planSubpanel, serializeProject } from './project';
import { validateProject } from './rules';
import { buildBom } from './bom';
import { calculateLoads } from './loadcalc';
import { feederCalc } from './feeder';
import { legLoads } from './balance';
import { transferBreaker } from './move';

interface GridOptions extends Partial<InverterSettings> {
  amps?: number;
  chargeVA?: number;
}

/**
 * The setup from the request: a 125 A breaker in the main panel feeds the critical-loads
 * panel's 125 A main (the bypass); the inverter back-feeds at spaces 1,3; an interlock
 * keeps the main off while the inverter breaker is on. `grid` adds a grid-input breaker
 * at 17,19 in the main panel.
 */
function criticalLoads(
  opts: { outputW?: number; surgeW?: number | null; inverterAmps?: number; loads?: Breaker[]; mainLoads?: Breaker[]; grid?: GridOptions } = {},
): Project {
  const p = newProject();
  const plan = planSubpanel(p.panels[0], 'Critical loads', 125)!;
  const { amps, chargeVA, ...settings } = opts.grid ?? {};
  const gridBreaker = opts.grid
    ? newBreaker('double', 17, 'standard', [
        {
          label: gridInputLabel('Critical loads'), loadType: 'inverter-input', amps: amps ?? 60, loadVA: chargeVA ?? 0, continuous: true,
          location: 'utility', servesReceptacles: false, wire: { size: '4', material: 'Cu', type: 'THHN/THWN-2' },
        },
      ])
    : null;
  const interlock: GeneratorInterlock = {
    ...defaultInterlock(),
    side: 'left', kind: 'inverter', generatorWatts: opts.outputW ?? 12000, inletAmps: null, surgeWatts: opts.surgeW ?? null,
    inverter: { ...defaultInverterSettings(), gridBreakerId: gridBreaker?.id ?? null, ...settings },
  };
  const inverter = newBreaker('double', 1, 'standard', [
    { label: 'Inverter output', loadType: 'inverter', amps: opts.inverterAmps ?? 70, servesReceptacles: false, wire: { size: '4', material: 'Cu', type: 'THHN/THWN-2' } },
  ]);
  const loads = opts.loads ?? [
    newBreaker('double', 2, 'standard', [{ label: 'Heat pump', loadType: 'hvac', amps: 30, loadVA: 4000, location: 'utility', servesReceptacles: false }], 'existing'),
    newBreaker('single', 5, 'standard', [{ label: 'Refrigerator', loadType: 'refrigerator', amps: 20, loadVA: 800 }], 'existing'),
    newBreaker('single', 6, 'standard', [{ label: 'Furnace', loadType: 'furnace', amps: 15, loadVA: 800, location: 'utility' }], 'existing'),
  ];
  const sub = { ...plan.panel, mainType: 'main-breaker' as const, mainAmps: 125, busAmps: 125, spaces: 24, maxCircuits: 24, interlock, breakers: [inverter, ...loads] };
  const mainLoads = opts.mainLoads ?? [
    newBreaker('double', 5, 'standard', [{ label: 'Range', loadType: 'range', amps: 50, loadVA: 12000 }], 'existing'),
  ];
  return { ...p, panels: [{ ...p.panels[0], breakers: [plan.feeder, ...mainLoads, ...(gridBreaker ? [gridBreaker] : [])] }, sub] };
}
const rules = (p: Project) => validateProject(p).map((f) => f.rule);
const finding = (p: Project, rule: string) => validateProject(p).find((f) => f.rule === rule);

describe('battery inverter interlock', () => {
  it('sizes the inverter output and its breaker at 125%', () => {
    const p = criticalLoads();
    const inv = inverterCheck(p, p.panels[1])!;
    expect(inv.outputAmps).toBe(50);
    expect(inv.minBreaker).toBe(70);
    expect(inv.connectedVA).toBe(5600);
    expect(inv.largestMotor).toEqual({ name: 'Heat pump', va: 4000 });
  });

  it('accepts the inverter breaker at spaces 1,3 with the interlock on the left', () => {
    const r = rules(criticalLoads({ surgeW: 24000 }));
    expect(r).not.toContain('interlock-position');
    expect(r).not.toContain('generator-no-interlock');
    expect(r).not.toContain('generator-loads');
    expect(r).not.toContain('inverter-load');
    expect(r).not.toContain('inverter-surge');
    expect(r).not.toContain('inverter-breaker');
    expect(r).toContain('interlock-install');
  });

  it('warns when the calculated load is more than the inverter can supply', () => {
    // Fridge 800 + furnace 800 + heat pump 4,000 + 25% of the heat pump 1,000 = 6,600 VA.
    const p = criticalLoads({ outputW: 4000 });
    expect(inverterCheck(p, p.panels[1])!.calcVA).toBeCloseTo(6600);
    expect(rules(p)).toContain('inverter-load');
  });

  it('uses the panel\'s own loads when its feeder carries the whole house and no area is entered', () => {
    const p = criticalLoads({ outputW: 4000, mainLoads: [] });
    expect(inverterCheck(p, p.panels[1])!.calcVA).toBeCloseTo(6600);
    expect(rules(p)).toContain('inverter-load');
  });

  it('warns when the surge rating likely cannot start the largest motor', () => {
    const p = criticalLoads({ surgeW: 9000 }); // heat pump 4,000 VA × 3 = 12,000 VA
    expect(finding(p, 'inverter-surge')?.severity).toBe('warning');
    expect(finding(criticalLoads(), 'inverter-surge')?.severity).toBe('info');
  });

  it('checks the inverter breaker against the continuous output current', () => {
    expect(finding(criticalLoads({ inverterAmps: 60 }), 'inverter-breaker')?.severity).toBe('check');
    expect(finding(criticalLoads({ inverterAmps: 40 }), 'inverter-breaker')?.severity).toBe('warning');
  });

  it('still checks the 125 A bypass feeder against the panel', () => {
    const p = criticalLoads();
    expect(p.panels[0].breakers[0].circuits[0].amps).toBe(125);
    expect(rules(p)).not.toContain('feeder-load');
    expect(rules(p)).not.toContain('feed-over-bus');
  });

  it('lists inverter interlock hardware and saves the settings', () => {
    const p = criticalLoads({ surgeW: 24000, grid: { chargeVA: 5000, gridInputAmps: 50, passThrough: false, batteryKWh: 14.3, idleWatts: 60 } });
    const text = buildBom(p).lines.map((l) => l.description).join('\n');
    expect(text).toContain('inverter breaker on the left side');
    expect(text).toContain('battery inverter');
    const back = parseProject(serializeProject(p));
    expect(back.panels[1].interlock).toEqual(p.panels[1].interlock);
  });

  it('fills in inverter settings for files saved before they existed', () => {
    const p = criticalLoads();
    const raw = JSON.parse(serializeProject(p));
    delete raw.panels[1].interlock.inverter;
    delete raw.panels[1].breakers[1].circuits[0].outageHours;
    const back = parseProject(JSON.stringify(raw));
    expect(back.panels[1].interlock!.inverter).toEqual(defaultInverterSettings());
    expect(back.panels[1].breakers[1].circuits[0].outageHours).toBeNull();
  });
});

describe('inverter grid input', () => {
  it('adds pass-through and charging, with charging at 125% for the breaker', () => {
    // Pass-through 6,600 VA = 27.5 A; charging 4,800 VA = 20 A (25 A at 125%).
    const p = criticalLoads({ grid: { amps: 60, chargeVA: 4800 } });
    const g = gridInputCheck(p, p.panels[1])!;
    expect(g.passAmps).toBeCloseTo(27.5);
    expect(g.chargeAmps).toBeCloseTo(20);
    expect(g.drawAmps).toBeCloseTo(47.5);
    expect(g.minAmps).toBeCloseTo(52.5);
    expect(g.minBreaker).toBe(60);
    expect(g.loop).toBe(false);
    expect(inverterFedBy(p, g.breaker.id)?.name).toBe('Critical loads');
    expect(rules(p)).not.toContain('grid-input-breaker');
    expect(rules(p)).not.toContain('grid-input-unlinked');
  });

  it('warns when the breaker is below the draw, or below 125% of charging', () => {
    const under = finding(criticalLoads({ grid: { amps: 40, chargeVA: 4800 } }), 'grid-input-breaker');
    expect(under?.severity).toBe('warning');
    expect(under?.message).toContain('may trip');
    const cont = finding(criticalLoads({ grid: { amps: 50, chargeVA: 4800 } }), 'grid-input-breaker');
    expect(cont?.ref).toBe('210.20(A)');
  });

  it('holds the draw to the input limit only if the inverter slows its charging', () => {
    const p = criticalLoads({ grid: { amps: 50, chargeVA: 9600, gridInputAmps: 40, throttlesInput: true } });
    const g = gridInputCheck(p, p.panels[1])!;
    expect(g.wantAmps).toBeCloseTo(67.5);
    expect(g.chargeAmps).toBeCloseTo(12.5);
    expect(g.drawAmps).toBeCloseTo(40);
    expect(g.minAmps).toBeCloseTo(43.125);
    expect(finding(p, 'grid-input-limit')?.severity).toBe('info');
    expect(rules(p)).not.toContain('grid-input-breaker');
    // Otherwise charging and pass-through add in full, and the overrun is a warning.
    const q = criticalLoads({ grid: { amps: 60, chargeVA: 9600, gridInputAmps: 40 } });
    expect(gridInputCheck(q, q.panels[1])!.drawAmps).toBeCloseTo(67.5);
    expect(finding(q, 'grid-input-limit')?.severity).toBe('warning');
    // The panel alone asks for more than the inverter can take in.
    expect(finding(criticalLoads({ grid: { chargeVA: 4800, gridInputAmps: 20 } }), 'grid-input-limit')?.severity).toBe('warning');
  });

  it('works out how much charging fits beside the pass-through load', () => {
    // Pass-through 27.5 A. Limit 40 A leaves 12.5 A; a 50 A breaker leaves 22.5 A ÷ 1.25 = 18 A.
    const p = criticalLoads({ grid: { amps: 50, chargeVA: 4800, gridInputAmps: 40 } });
    expect(gridInputCheck(p, p.panels[1])!.roomForChargingVA).toBeCloseTo(12.5 * 240);
    const q = criticalLoads({ grid: { amps: 50, chargeVA: 4800 } });
    expect(gridInputCheck(q, q.panels[1])!.roomForChargingVA).toBeCloseTo(18 * 240);
  });

  it('warns when a breaker is larger than the inverter manual allows', () => {
    expect(finding(criticalLoads({ grid: { amps: 70, acBreakerAmps: 63 } }), 'grid-input-max')?.message).toContain('Use 60 A');
    expect(rules(criticalLoads({ grid: { amps: 60, acBreakerAmps: 63 } }))).not.toContain('grid-input-max');
    expect(finding(criticalLoads({ inverterAmps: 70, grid: { acBreakerAmps: 63 } }), 'inverter-breaker-max')?.message).toContain('Use 60 A');
  });

  it('uses the battery limit for surge when it is lower than the inverter\'s', () => {
    // Heat pump 4,000 VA × 3 = 12,000 VA. Batteries: 12,800 W × 92% = 11,776 W.
    const p = criticalLoads({ surgeW: 20000, grid: { dischargeSurgeWatts: 12800 } });
    const inv = inverterCheck(p, p.panels[1])!;
    expect(inv.surgeLimitW).toBeCloseTo(11776);
    expect(inv.surgeByBattery).toBe(true);
    expect(finding(p, 'inverter-surge')?.message).toContain('the batteries can deliver');
    expect(rules(criticalLoads({ surgeW: 20000, grid: { dischargeSurgeWatts: 25600 } }))).not.toContain('inverter-surge');
  });

  it('carries only charging when grid power does not pass through', () => {
    const p = criticalLoads({ grid: { amps: 30, chargeVA: 4800, passThrough: false } });
    const g = gridInputCheck(p, p.panels[1])!;
    expect(g.drawAmps).toBeCloseTo(20);
    expect(rules(p)).not.toContain('grid-input-breaker');
  });

  it('adds only the charging power to the service, not the panel loads twice', () => {
    const base = criticalLoads();
    const withGrid = criticalLoads({ grid: { chargeVA: 5000 } });
    const std = (p: Project) => calculateLoads(p).methods.find((m) => m.id === 'standard')!.totalVA;
    expect(std(withGrid) - std(base)).toBeCloseTo(5000);
    expect(legLoads(withGrid, withGrid.panels[0]).totalVA - legLoads(base, base.panels[0]).totalVA).toBeCloseTo(5000);
    // The bypass feeder and the inverter carry the panel's loads, not its charging.
    expect(feederCalc(withGrid, withGrid.panels[1]).method!.totalVA).toBeCloseTo(6600);
    expect(inverterCheck(withGrid, withGrid.panels[1])!.calcVA).toBeCloseTo(6600);
  });

  it('keeps a whole-house bypass feeder "whole house", without the charging', () => {
    const p = criticalLoads({ mainLoads: [], grid: { chargeVA: 5000 } });
    p.loadCalc = { ...p.loadCalc, floorAreaFt2: 1500 };
    const fc = feederCalc(p, p.panels[1]);
    expect(fc.wholeHouse).toBe(true);
    const bare = criticalLoads({ mainLoads: [] });
    bare.loadCalc = { ...bare.loadCalc, floorAreaFt2: 1500 };
    expect(fc.method!.totalVA).toBeCloseTo(feederCalc(bare, bare.panels[1]).method!.totalVA);
    expect(inverterCheck(p, p.panels[1])!.calcVA).toBeCloseTo(fc.method!.totalVA);
  });

  it('flags an inverter that would feed its own grid input', () => {
    const p = criticalLoads({ grid: { chargeVA: 4800 } });
    const id = p.panels[1].interlock!.inverter.gridBreakerId!;
    const moved = transferBreaker(p, p.panels[0].id, id, p.panels[1].id, 9);
    expect(gridInputCheck(moved, moved.panels[1])!.loop).toBe(true);
    expect(finding(moved, 'grid-input-loop')?.severity).toBe('error');
  });

  it('asks about the shared neutral, and tells you about an unlinked grid input', () => {
    expect(finding(criticalLoads({ grid: { chargeVA: 4800 } }), 'inverter-neutral')?.severity).toBe('check');
    expect(rules(criticalLoads())).not.toContain('inverter-neutral');
    const loose = criticalLoads({ grid: { chargeVA: 4800 } });
    loose.panels[1].interlock!.inverter.gridBreakerId = null;
    expect(rules(loose)).toContain('grid-input-unlinked');
    expect(gridInputCheck(loose, loose.panels[1])).toBeNull();
  });

  it('drops the link when the breaker is deleted or becomes something else', () => {
    const p = criticalLoads({ grid: { chargeVA: 4800 } });
    const main = p.panels[0];
    const gone = { ...p, panels: [{ ...main, breakers: main.breakers.filter((b) => b.id !== p.panels[1].interlock!.inverter.gridBreakerId) }, p.panels[1]] };
    expect(gridInputCheck(gone, gone.panels[1])).toBeNull();
    main.breakers.at(-1)!.circuits[0].loadType = 'dryer';
    expect(gridInputCheck(p, p.panels[1])).toBeNull();
  });

  it('checks the grid input wire against what it carries', () => {
    // 47.5 A through 8 AWG (50 A) on a 60 A breaker: undersized for the breaker.
    const p = criticalLoads({ grid: { amps: 60, chargeVA: 4800 } });
    p.panels[0].breakers.at(-1)!.circuits[0].wire = { size: '8', material: 'Cu', type: 'THHN/THWN-2' };
    expect(rules(p)).toContain('wire-undersized');
  });
});
