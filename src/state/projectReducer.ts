import type { Breaker, BreakerForm, Circuit, LoadCalcSettings, Panel, Project } from '../core/types';
import { formCircuits } from '../core/panel';
import { newCircuit } from '../core/project';
import { transferBreaker } from '../core/move';

export type PanelPatch = Partial<Omit<Panel, 'id' | 'breakers'>>;

export type ProjectAction =
  | { type: 'replace'; project: Project }
  | { type: 'meta'; patch: Partial<Pick<Project, 'name' | 'address' | 'notes' | 'necEdition'>> }
  | { type: 'loadCalc'; patch: Partial<LoadCalcSettings> }
  | { type: 'panel'; panelId: string; patch: PanelPatch }
  /** Add a panel, optionally with the feeder breaker that supplies it. */
  | { type: 'addPanel'; panel: Panel; feeder?: { panelId: string; breaker: Breaker } }
  | { type: 'deletePanel'; panelId: string }
  | { type: 'addBreaker'; panelId: string; breaker: Breaker }
  | { type: 'deleteBreaker'; panelId: string; id: string }
  | { type: 'moveBreaker'; panelId: string; id: string; space: number }
  /** Move a breaker to a space in another panel (or the same one). */
  | { type: 'transferBreaker'; fromPanelId: string; toPanelId: string; id: string; space: number }
  | { type: 'updateBreaker'; panelId: string; id: string; patch: Partial<Pick<Breaker, 'protection' | 'status'>> }
  | { type: 'changeForm'; panelId: string; id: string; form: BreakerForm }
  | { type: 'updateCircuit'; panelId: string; breakerId: string; circuitId: string; patch: Partial<Omit<Circuit, 'id'>> };

/** Dispatch with an optional key: consecutive edits with the same key merge into one undo step. */
export type Dispatch = (action: ProjectAction, coalesceKey?: string) => void;

function mapPanel(p: Project, panelId: string, fn: (panel: Panel) => Panel): Project {
  let changed = false;
  const panels = p.panels.map((panel) => {
    if (panel.id !== panelId) return panel;
    const next = fn(panel);
    if (next !== panel) changed = true;
    return next;
  });
  return changed ? { ...p, panels } : p;
}

function mapBreaker(p: Project, panelId: string, id: string, fn: (b: Breaker) => Breaker): Project {
  return mapPanel(p, panelId, (panel) => {
    let changed = false;
    const breakers = panel.breakers.map((b) => {
      if (b.id !== id) return b;
      const next = fn(b);
      if (next !== b) changed = true;
      return next;
    });
    return changed ? { ...panel, breakers } : panel;
  });
}

function apply(p: Project, a: ProjectAction): Project {
  switch (a.type) {
    case 'replace':
      return a.project;
    case 'meta':
      return { ...p, ...a.patch };
    case 'loadCalc':
      return { ...p, loadCalc: { ...p.loadCalc, ...a.patch } };
    case 'panel':
      return mapPanel(p, a.panelId, (panel) => ({ ...panel, ...a.patch }));
    case 'addPanel': {
      const withFeeder = a.feeder
        ? mapPanel(p, a.feeder.panelId, (panel) => ({ ...panel, breakers: [...panel.breakers, a.feeder!.breaker] }))
        : p;
      return { ...withFeeder, panels: [...withFeeder.panels, a.panel] };
    }
    case 'deletePanel': {
      // Refuse to orphan subpanels or delete the last panel.
      if (p.panels.length <= 1 || p.panels.some((x) => x.feed?.panelId === a.panelId)) return p;
      if (!p.panels.some((x) => x.id === a.panelId)) return p;
      return { ...p, panels: p.panels.filter((x) => x.id !== a.panelId) };
    }
    case 'addBreaker':
      return mapPanel(p, a.panelId, (panel) => ({ ...panel, breakers: [...panel.breakers, a.breaker] }));
    case 'deleteBreaker':
      return mapPanel(p, a.panelId, (panel) =>
        panel.breakers.some((b) => b.id === a.id) ? { ...panel, breakers: panel.breakers.filter((b) => b.id !== a.id) } : panel,
      );
    case 'moveBreaker':
      return mapBreaker(p, a.panelId, a.id, (b) => (b.space === a.space ? b : { ...b, space: a.space }));
    case 'transferBreaker':
      return transferBreaker(p, a.fromPanelId, a.id, a.toPanelId, a.space);
    case 'updateBreaker':
      return mapBreaker(p, a.panelId, a.id, (b) => {
        const changed = (Object.keys(a.patch) as (keyof typeof a.patch)[]).some((k) => a.patch[k] !== b[k]);
        return changed ? { ...b, ...a.patch } : b;
      });
    case 'changeForm':
      return mapBreaker(p, a.panelId, a.id, (b) => {
        if (b.form === a.form) return b;
        const n = formCircuits(a.form);
        const circuits = b.circuits.slice(0, n);
        while (circuits.length < n) circuits.push(newCircuit(a.form));
        return { ...b, form: a.form, circuits };
      });
    case 'updateCircuit':
      return mapBreaker(p, a.panelId, a.breakerId, (b) => ({
        ...b,
        circuits: b.circuits.map((c) => (c.id === a.circuitId ? { ...c, ...a.patch } : c)),
      }));
  }
}

export function projectReducer(state: Project, action: ProjectAction): Project {
  const next = apply(state, action);
  if (next === state || action.type === 'replace') return next;
  return { ...next, updatedAt: new Date().toISOString() };
}
