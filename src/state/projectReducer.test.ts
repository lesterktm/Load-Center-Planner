import { describe, expect, it } from 'vitest';
import type { Breaker, Project } from '../core/types';
import { projectReducer } from './projectReducer';
import { initHistory, withHistory } from './history';
import { newBreaker, newProject, parseProject, planSubpanel, serializeProject } from '../core/project';
import { exampleProject } from '../core/example';

function withBreakers(breakers: Breaker[]): Project {
  const p = newProject();
  return { ...p, panels: [{ ...p.panels[0], breakers }] };
}

describe('projectReducer', () => {
  it('adds a second circuit when a breaker becomes a tandem, and drops it when it goes back', () => {
    const b = newBreaker('single', 1);
    let p = withBreakers([b]);
    const panelId = p.panels[0].id;
    p = projectReducer(p, { type: 'changeForm', panelId, id: b.id, form: 'tandem' });
    expect(p.panels[0].breakers[0].circuits).toHaveLength(2);
    p = projectReducer(p, { type: 'changeForm', panelId, id: b.id, form: 'single' });
    expect(p.panels[0].breakers[0].circuits).toHaveLength(1);
    expect(p.panels[0].breakers[0].circuits[0].id).toBe(b.circuits[0].id);
  });

  it('returns the same object when nothing changes', () => {
    const b = newBreaker('single', 1);
    const p = withBreakers([b]);
    const panelId = p.panels[0].id;
    expect(projectReducer(p, { type: 'moveBreaker', panelId, id: b.id, space: 1 })).toBe(p);
    expect(projectReducer(p, { type: 'deleteBreaker', panelId, id: 'missing' })).toBe(p);
    expect(projectReducer(p, { type: 'updateBreaker', panelId, id: b.id, patch: { status: 'new' } })).toBe(p);
  });

  it('updates a circuit', () => {
    const b = newBreaker('single', 1);
    const p0 = withBreakers([b]);
    const p = projectReducer(p0, {
      type: 'updateCircuit', panelId: p0.panels[0].id, breakerId: b.id, circuitId: b.circuits[0].id, patch: { label: 'Kitchen' },
    });
    expect(p.panels[0].breakers[0].circuits[0].label).toBe('Kitchen');
  });

  it('adds a subpanel with its feeder, and refuses to delete a panel that feeds another', () => {
    let p = newProject();
    const main = p.panels[0];
    const plan = planSubpanel(main, 'Garage')!;
    p = projectReducer(p, { type: 'addPanel', panel: plan.panel, feeder: { panelId: main.id, breaker: plan.feeder } });
    expect(p.panels).toHaveLength(2);
    expect(p.panels[0].breakers).toHaveLength(1);
    expect(projectReducer(p, { type: 'deletePanel', panelId: main.id })).toBe(p);
    const after = projectReducer(p, { type: 'deletePanel', panelId: plan.panel.id });
    expect(after.panels).toHaveLength(1);
  });
});

describe('history', () => {
  const reducer = withHistory(projectReducer);

  it('undoes and redoes', () => {
    let h = initHistory(newProject());
    h = reducer(h, { type: 'do', action: { type: 'meta', patch: { name: 'A' } }, at: 0 });
    h = reducer(h, { type: 'do', action: { type: 'meta', patch: { name: 'B' } }, at: 5000 });
    expect(h.present.name).toBe('B');
    h = reducer(h, { type: 'undo' });
    expect(h.present.name).toBe('A');
    h = reducer(h, { type: 'redo' });
    expect(h.present.name).toBe('B');
  });

  it('merges rapid edits with the same key', () => {
    let h = initHistory(newProject());
    h = reducer(h, { type: 'do', action: { type: 'meta', patch: { name: 'K' } }, coalesceKey: 'name', at: 0 });
    h = reducer(h, { type: 'do', action: { type: 'meta', patch: { name: 'Ki' } }, coalesceKey: 'name', at: 200 });
    h = reducer(h, { type: 'do', action: { type: 'meta', patch: { name: 'Kit' } }, coalesceKey: 'name', at: 400 });
    expect(h.past).toHaveLength(1);
    h = reducer(h, { type: 'undo' });
    expect(h.present.name).toBe('New project');
  });
});

describe('save / load', () => {
  it('round-trips a project', () => {
    const p = exampleProject();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('rejects bad files with a readable error', () => {
    expect(() => parseProject('not json')).toThrow(/not valid JSON/);
    expect(() => parseProject('{"schemaVersion": 99}')).toThrow(/Unsupported/);
  });

  it('upgrades version 1 files (one panel) and fills in missing fields', () => {
    const p = parseProject(
      JSON.stringify({
        schemaVersion: 1,
        name: 'Old file',
        panel: { spaces: 20, name: 'Main' },
        breakers: [{ form: 'tandem', space: 3, circuits: [{ label: 'Only one' }] }],
      }),
    );
    expect(p.schemaVersion).toBe(2);
    expect(p.panels).toHaveLength(1);
    expect(p.panels[0].spaces).toBe(20);
    expect(p.panels[0].feed).toBeNull();
    const b = p.panels[0].breakers[0];
    expect(b.status).toBe('new');
    expect(b.circuits).toHaveLength(2);
    expect(b.circuits[0].label).toBe('Only one');
    expect(b.circuits[1].amps).toBe(20);
    expect(b.circuits[0].gfciReceptacle).toBe(false);
    expect(p.panels[0].feederAreaFt2).toBe(0);
    expect(p.loadCalc.floorAreaFt2).toBe(0);
  });

  it('keeps older NEC editions and the GFCI receptacle and feeder fields', () => {
    const p = exampleProject();
    p.necEdition = '2008';
    p.panels[1].feederAreaFt2 = 400;
    const back = parseProject(serializeProject(p));
    expect(back.necEdition).toBe('2008');
    expect(back.panels[1].feederAreaFt2).toBe(400);
    expect(back.panels[0].breakers.filter((b) => b.circuits[0].gfciReceptacle)).toHaveLength(3);
    expect(parseProject(JSON.stringify({ ...p, necEdition: '1999' })).necEdition).toBe('2023');
  });
});
