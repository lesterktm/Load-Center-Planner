import { describe, expect, it } from 'vitest';
import type { Project } from './types';
import { checkMove, firstSpaceFor, movedFromText, transferBreaker } from './move';
import { newBreaker, newProject, planSubpanel } from './project';
import { projectReducer } from '../state/projectReducer';
import { buildBom } from './bom';
import { validateProject } from './rules';
import { calculateLoads } from './loadcalc';

/** Main panel with two existing circuits and a feeder to a "Critical loads" subpanel. */
function setup(): Project {
  const p = newProject();
  const plan = planSubpanel(p.panels[0], 'Critical loads', 60)!;
  const fridge = newBreaker('single', 5, 'standard', [{ label: 'Refrigerator', loadType: 'refrigerator', loadVA: 800 }], 'existing');
  const furnace = newBreaker('single', 7, 'standard', [{ label: 'Furnace', loadType: 'furnace', loadVA: 800 }], 'existing');
  const main = { ...p.panels[0], status: 'existing' as const, breakers: [plan.feeder, fridge, furnace] };
  return { ...p, panels: [main, plan.panel] };
}
const [MAIN, SUB] = [0, 1];
const ids = (p: Project) => ({ main: p.panels[MAIN].id, sub: p.panels[SUB].id, fridge: p.panels[MAIN].breakers[1].id, feeder: p.panels[MAIN].breakers[0].id });

describe('moving breakers between panels', () => {
  it('moves an existing circuit to the subpanel and remembers where it came from', () => {
    const p = setup();
    const { main, sub, fridge } = ids(p);
    const next = transferBreaker(p, main, fridge, sub, 1);
    expect(next.panels[MAIN].breakers.map((b) => b.id)).not.toContain(fridge);
    const moved = next.panels[SUB].breakers.find((b) => b.id === fridge)!;
    expect(moved.space).toBe(1);
    expect(moved.status).toBe('existing');
    expect(moved.movedFrom).toEqual({ panelId: main, space: 5 });
    expect(movedFromText(next, moved)).toBe('Main panel, circuit 5');
  });

  it('clears the origin when the circuit goes back to its original panel', () => {
    const p = setup();
    const { main, sub, fridge } = ids(p);
    const back = transferBreaker(transferBreaker(p, main, fridge, sub, 1), sub, fridge, main, 9);
    expect(back.panels[MAIN].breakers.find((b) => b.id === fridge)!.movedFrom).toBeNull();
  });

  it('keeps the first origin through a second move, and does not record one for new breakers', () => {
    let p = setup();
    const { main, sub, fridge } = ids(p);
    p = transferBreaker(p, main, fridge, sub, 1);
    p = transferBreaker(p, sub, fridge, sub, 3);
    expect(p.panels[SUB].breakers.find((b) => b.id === fridge)!.movedFrom).toEqual({ panelId: main, space: 5 });
    const added = newBreaker('single', 9, 'standard', [{ label: 'New' }], 'new');
    p.panels[MAIN].breakers.push(added);
    p = transferBreaker(p, main, added.id, sub, 5);
    expect(p.panels[SUB].breakers.find((b) => b.id === added.id)!.movedFrom).toBeNull();
  });

  it('refuses occupied spaces and putting a feeder inside the panel it feeds', () => {
    const p = setup();
    const { main, sub, fridge, feeder } = ids(p);
    expect(checkMove(p, main, fridge, main, 7).ok).toBe(false); // furnace is there
    expect(checkMove(p, main, feeder, sub, 1).ok).toBe(false);
    expect(transferBreaker(p, main, feeder, sub, 1)).toBe(p);
    expect(firstSpaceFor(p, main, feeder, sub)).toBeNull();
    expect(firstSpaceFor(p, main, fridge, sub)).toBe(1);
  });

  it('updates the subpanel feed when its feeder breaker moves to another panel', () => {
    let p = setup();
    const third = planSubpanel(p.panels[MAIN], 'Garage', 100)!;
    p = { ...p, panels: [{ ...p.panels[MAIN], breakers: [...p.panels[MAIN].breakers, third.feeder] }, p.panels[SUB], third.panel] };
    // Move the critical-loads feeder into the garage panel: critical loads is now fed from the garage.
    const { main, sub, feeder } = ids(p);
    p = transferBreaker(p, main, feeder, third.panel.id, 1);
    expect(p.panels.find((x) => x.id === sub)!.feed).toEqual({ panelId: third.panel.id, breakerId: feeder });
  });

  it('is one undoable reducer action', () => {
    const p = setup();
    const { main, sub, fridge } = ids(p);
    const next = projectReducer(p, { type: 'transferBreaker', fromPanelId: main, toPanelId: sub, id: fridge, space: 1 });
    expect(next.panels[SUB].breakers.some((b) => b.id === fridge)).toBe(true);
  });

  it('keeps moved circuits as existing load, lists them in materials, and notes them in the checks', () => {
    const p = setup();
    p.loadCalc.floorAreaFt2 = 1500;
    const { main, sub, fridge } = ids(p);
    const next = transferBreaker(p, main, fridge, sub, 1);
    const before = calculateLoads(p).methods.find((m) => m.id === 'existing')!;
    const after = calculateLoads(next).methods.find((m) => m.id === 'existing')!;
    expect(after.totalVA).toBeCloseTo(before.totalVA);
    const line = buildBom(next).lines.find((l) => l.description.includes('moving from another panel'));
    expect(line?.qty).toBe(1);
    expect(validateProject(next).map((f) => f.rule)).toContain('moved-circuits');
  });
});
