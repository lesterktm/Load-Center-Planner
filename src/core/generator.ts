import type { Breaker, GeneratorInterlock, LoadType, Panel, Phase, Project } from './types';
import { circuitRows } from './circuits';

/** Load types for breakers back-fed by a backup source. */
export const isBackfedType = (t: LoadType): boolean => t === 'generator' || t === 'inverter';

/** Breakers in a panel that are back-fed from a generator or inverter. */
export function backfedBreakers(panel: Panel): Breaker[] {
  return panel.breakers.filter((b) => b.circuits.some((c) => isBackfedType(c.loadType)));
}

/** "inverter" or "generator", for messages. */
export const sourceName = (il: Pick<GeneratorInterlock, 'kind'>): string => (il.kind === 'inverter' ? 'inverter' : 'generator');

/** True if a generator (not an inverter) backs up this panel or one upstream, so circuits can be marked "On generator". */
export const isGeneratorInterlock = (il: GeneratorInterlock | null): boolean => !!il && il.kind !== 'inverter';

/** Spaces the interlock kit expects the source breaker in. */
export const interlockSpace = (side: 'left' | 'right'): number => (side === 'left' ? 1 : 2);

export interface GeneratorLoad {
  totalVA: number;
  legVA: Record<Phase, number>;
  /** Number of circuits marked to run on the generator. */
  circuits: number;
}

/**
 * Load of the circuits marked "on generator" in a panel and its subpanels,
 * mapped onto this panel's legs.
 */
export function generatorLoad(p: Project, panel: Panel, seen: ReadonlySet<string> = new Set()): GeneratorLoad {
  const visited = new Set(seen).add(panel.id);
  const legVA: Record<Phase, number> = { L1: 0, L2: 0 };
  let circuits = 0;
  for (const row of circuitRows(p, panel, seen)) {
    if (row.feeds) {
      if (visited.has(row.feeds.id)) continue;
      const sub = generatorLoad(p, row.feeds, visited);
      legVA[row.phases[0]] += sub.legVA.L1;
      legVA[row.phases[1] ?? row.phases[0]] += sub.legVA.L2;
      circuits += sub.circuits;
    } else if (row.circuit.onGenerator && !isBackfedType(row.circuit.loadType)) {
      legVA.L1 += row.va.L1;
      legVA.L2 += row.va.L2;
      circuits++;
    }
  }
  return { totalVA: legVA.L1 + legVA.L2, legVA, circuits };
}
