import type { Breaker, Circuit, Panel, Phase, Project } from './types';
import { breakerPhases, circuitNumber, formVolts } from './panel';

export interface CircuitRow {
  panel: Panel;
  breaker: Breaker;
  circuit: Circuit;
  index: number;
  number: string;
  volts: 120 | 240;
  phases: Phase[];
  /** Load used for balance: the circuit's own load, or a subpanel's connected load for its feeder. */
  loadVA: number;
  /** That load on each leg of this panel, VA. */
  va: Record<Phase, number>;
  /** The subpanel this circuit feeds, if any. */
  feeds?: Panel;
}

/**
 * All circuits in a panel, in space order, with their phase loading. A subpanel
 * feeder carries the subpanel's whole connected load (recursively).
 */
export function circuitRows(p: Project, panel: Panel, seen: ReadonlySet<string> = new Set()): CircuitRow[] {
  const visited = new Set(seen).add(panel.id);
  const rows: CircuitRow[] = [];
  for (const b of [...panel.breakers].sort((x, y) => x.space - y.space)) {
    const phases = breakerPhases(panel.system, b);
    const volts = formVolts(b.form);
    const fed = p.panels.find((x) => x.feed?.breakerId === b.id && x.feed.panelId === panel.id);
    b.circuits.forEach((c, index) => {
      const va: Record<Phase, number> = { L1: 0, L2: 0 };
      let loadVA = Math.max(0, c.loadVA || 0);
      let feeds: Panel | undefined;
      if (fed && index === 0 && !visited.has(fed.id)) {
        feeds = fed;
        const sub = panelLegVA(p, fed, visited);
        va[phases[0]] += sub.L1;
        va[phases[1] ?? phases[0]] += sub.L2;
        loadVA = sub.L1 + sub.L2;
      } else if (volts === 120) {
        va[phases[0]] += loadVA;
      } else {
        for (const ph of phases) va[ph] += loadVA / phases.length;
      }
      rows.push({ panel, breaker: b, circuit: c, index, number: circuitNumber(b, index), volts, phases, loadVA, va, feeds });
    });
  }
  return rows;
}

/** Connected load on each leg of a panel, including its subpanels. */
export function panelLegVA(p: Project, panel: Panel, seen: ReadonlySet<string> = new Set()): Record<Phase, number> {
  const total: Record<Phase, number> = { L1: 0, L2: 0 };
  for (const r of circuitRows(p, panel, seen)) {
    total.L1 += r.va.L1;
    total.L2 += r.va.L2;
  }
  return total;
}
