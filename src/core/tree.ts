import type { Breaker, Panel, PanelConfig, Project } from './types';

/** Helpers for the panel tree: service panel(s) at the top, subpanels fed from feeder breakers. */

export const findPanel = (p: Project, id: string | null | undefined): Panel | undefined =>
  id ? p.panels.find((x) => x.id === id) : undefined;

export function findBreaker(p: Project, breakerId: string): { panel: Panel; breaker: Breaker } | null {
  for (const panel of p.panels) {
    const breaker = panel.breakers.find((b) => b.id === breakerId);
    if (breaker) return { panel, breaker };
  }
  return null;
}

/** The subpanel fed by a breaker, if any. */
export const panelFedBy = (p: Project, breakerId: string): Panel | undefined =>
  p.panels.find((x) => x.feed?.breakerId === breakerId);

/** The breaker (and its panel) that feeds a subpanel. */
export function feederOf(p: Project, panel: Panel): { panel: Panel; breaker: Breaker } | null {
  if (!panel.feed) return null;
  const src = findPanel(p, panel.feed.panelId);
  const breaker = src?.breakers.find((b) => b.id === panel.feed?.breakerId);
  return src && breaker ? { panel: src, breaker } : null;
}

export const isServicePanel = (p: Project, panel: Panel): boolean => !panel.feed || !findPanel(p, panel.feed.panelId);

/** Subpanels fed directly from a panel, in feeder-breaker space order. */
export function childrenOf(p: Project, panelId: string): Panel[] {
  const src = findPanel(p, panelId);
  const spaceOf = (child: Panel) => src?.breakers.find((b) => b.id === child.feed?.breakerId)?.space ?? Infinity;
  return p.panels.filter((x) => x.id !== panelId && x.feed?.panelId === panelId).sort((a, b) => spaceOf(a) - spaceOf(b));
}

/** All panels in display order: each service panel followed by its subpanels, depth first. */
export function panelOrder(p: Project): Panel[] {
  const seen = new Set<string>();
  const out: Panel[] = [];
  const visit = (panel: Panel) => {
    if (seen.has(panel.id)) return;
    seen.add(panel.id);
    out.push(panel);
    for (const child of childrenOf(p, panel.id)) visit(child);
  };
  for (const panel of p.panels) if (isServicePanel(p, panel)) visit(panel);
  for (const panel of p.panels) visit(panel); // anything caught in a feed loop
  return out;
}

/** Panels upstream of this one, nearest first. `loop` is true if the feeds form a cycle. */
export function upstreamChain(p: Project, panel: Panel): { chain: Panel[]; loop: boolean } {
  const chain: Panel[] = [];
  const seen = new Set([panel.id]);
  let cur = panel;
  while (cur.feed) {
    const src = findPanel(p, cur.feed.panelId);
    if (!src) break;
    if (seen.has(src.id)) return { chain, loop: true };
    seen.add(src.id);
    chain.push(src);
    cur = src;
  }
  return { chain, loop: false };
}

/** True if `panelId` is `ancestorId` itself or is fed (directly or indirectly) from it. */
export function isWithin(p: Project, panelId: string, ancestorId: string): boolean {
  if (panelId === ancestorId) return true;
  const panel = findPanel(p, panelId);
  return panel ? upstreamChain(p, panel).chain.some((x) => x.id === ancestorId) : false;
}

/** Ids of a panel and every panel fed from it, directly or indirectly. */
export const subtreeIds = (p: Project, panelId: string): Set<string> =>
  new Set(p.panels.filter((x) => isWithin(p, x.id, panelId)).map((x) => x.id));

/** Depth in the tree: 0 for a service panel. */
export const depthOf = (p: Project, panel: Panel): number => upstreamChain(p, panel).chain.length;

/** The rating that limits a panel: its main breaker, or the bus for a main-lug panel. */
export const panelRating = (panel: Pick<PanelConfig, 'mainType' | 'mainAmps' | 'busAmps'>): number =>
  panel.mainType === 'main-breaker' && panel.mainAmps ? panel.mainAmps : panel.busAmps;
