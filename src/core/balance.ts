import type { Panel, Phase, Project } from './types';
import { panelLegVA } from './circuits';

export interface LegLoads {
  /** Connected load per leg, VA. */
  va: Record<Phase, number>;
  /** Connected load per leg, amps at 120 V. */
  amps: Record<Phase, number>;
  totalVA: number;
  /** Difference between legs as a percent of the heavier leg. */
  imbalancePct: number;
}

/**
 * Connected (not demand) load on each leg of a panel, including its subpanels.
 * A 120 V circuit loads only its own leg; a 240 V circuit splits evenly across both.
 */
export function legLoads(p: Project, panel: Panel): LegLoads {
  const va = panelLegVA(p, panel);
  const hi = Math.max(va.L1, va.L2);
  const lo = Math.min(va.L1, va.L2);
  return {
    va,
    amps: { L1: va.L1 / 120, L2: va.L2 / 120 },
    totalVA: va.L1 + va.L2,
    imbalancePct: hi > 0 ? ((hi - lo) / hi) * 100 : 0,
  };
}
