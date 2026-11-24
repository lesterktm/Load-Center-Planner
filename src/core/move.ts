import type { Breaker, Project } from './types';
import { checkPlacement, circuitNumber, findFreeSpace, type PlacementResult } from './panel';
import { findPanel, isWithin, panelFedBy } from './tree';

/** "Main panel, circuit 17" for a breaker moved from another panel; null if it wasn't moved. */
export function movedFromText(p: Project, b: Breaker, index = 0): string | null {
  if (!b.movedFrom) return null;
  const src = findPanel(p, b.movedFrom.panelId);
  return `${src?.name || 'another panel'}, circuit ${circuitNumber({ ...b, space: b.movedFrom.space }, index)}`;
}

/**
 * Moving breakers between panels, for example existing circuits going to a new
 * critical-loads or garage subpanel. An existing breaker remembers where it came
 * from, so the schedule can say which circuits to pull from the old panel.
 */

/** Can breaker `breakerId` in panel `from` go to `space` in panel `to`? */
export function checkMove(p: Project, from: string, breakerId: string, to: string, space: number): PlacementResult {
  const src = findPanel(p, from);
  const dst = findPanel(p, to);
  const b = src?.breakers.find((x) => x.id === breakerId);
  if (!src || !dst || !b) return { ok: false, reason: 'Breaker or panel not found' };
  if (from === to) return checkPlacement(dst, dst.breakers, b.form, space, b.id);
  const fed = panelFedBy(p, b.id);
  if (fed && isWithin(p, to, fed.id)) {
    return { ok: false, reason: `This breaker feeds ${fed.name || 'a subpanel'}, so it can't go in that panel or below it` };
  }
  return checkPlacement(dst, dst.breakers, b.form, space);
}

/** First space in panel `to` that can take the breaker, or null. */
export function firstSpaceFor(p: Project, from: string, breakerId: string, to: string): number | null {
  const src = findPanel(p, from);
  const dst = findPanel(p, to);
  const b = src?.breakers.find((x) => x.id === breakerId);
  if (!src || !dst || !b) return null;
  const space = findFreeSpace(dst, from === to ? dst.breakers.filter((x) => x.id !== b.id) : dst.breakers, b.form);
  return space != null && checkMove(p, from, breakerId, to, space).ok ? space : null;
}

/**
 * Move a breaker to another panel. Returns the project unchanged if the move isn't allowed.
 * A subpanel fed by the breaker follows it. Existing breakers record their original spot,
 * which is cleared if they go back to their original panel.
 */
export function transferBreaker(p: Project, from: string, breakerId: string, to: string, space: number): Project {
  if (!checkMove(p, from, breakerId, to, space).ok) return p;
  const b = findPanel(p, from)!.breakers.find((x) => x.id === breakerId)!;
  if (from === to) {
    if (b.space === space) return p;
    return { ...p, panels: p.panels.map((x) => (x.id === from ? { ...x, breakers: x.breakers.map((y) => (y.id === b.id ? { ...y, space } : y)) } : x)) };
  }
  const origin = b.movedFrom ?? (b.status === 'existing' ? { panelId: from, space: b.space } : null);
  const moved: Breaker = { ...b, space, movedFrom: origin && origin.panelId !== to ? origin : null };
  const fed = panelFedBy(p, b.id);
  return {
    ...p,
    panels: p.panels.map((x) => {
      let next = x;
      if (x.id === from) next = { ...next, breakers: next.breakers.filter((y) => y.id !== b.id) };
      if (x.id === to) next = { ...next, breakers: [...next.breakers, moved] };
      if (fed && x.id === fed.id) next = { ...next, feed: { panelId: to, breakerId: b.id } };
      return next;
    }),
  };
}
