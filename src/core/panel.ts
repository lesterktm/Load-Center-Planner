import type { Breaker, BreakerForm, PanelConfig, Phase, SystemType } from './types';

/** Row number (1-based). Spaces 1 and 2 share row 1, spaces 3 and 4 row 2, and so on. */
export const rowOf = (space: number): number => Math.ceil(space / 2);
/** Odd spaces are in the left column, even spaces in the right. */
export const isLeftSpace = (space: number): boolean => space % 2 === 1;
export const rowCount = (spaces: number): number => Math.ceil(spaces / 2);

/**
 * Which bus leg a space connects to. In a US 120/240 V load center the bus stabs
 * alternate every row, so a 2-pole breaker spanning two rows lands on both legs.
 */
export function phaseOfSpace(_system: SystemType, space: number): Phase {
  return rowOf(space) % 2 === 1 ? 'L1' : 'L2';
}

/** Rows a breaker form covers in its column. */
export const formRows = (form: BreakerForm): number => (form === 'double' || form === 'quad' ? 2 : 1);
/** Circuits a breaker form provides. */
export const formCircuits = (form: BreakerForm): number => (form === 'tandem' || form === 'quad' ? 2 : 1);
/** Poles used against the panel's circuit limit. */
export const formPoles = (form: BreakerForm): number => formRows(form) * formCircuits(form);
export const formVolts = (form: BreakerForm): 120 | 240 => (formRows(form) === 2 ? 240 : 120);

/** Spaces a breaker occupies: the same column, consecutive rows. */
export function spacesOf(form: BreakerForm, space: number): number[] {
  return Array.from({ length: formRows(form) }, (_, i) => space + 2 * i);
}

export function breakerPhases(system: SystemType, b: Pick<Breaker, 'form' | 'space'>): Phase[] {
  return spacesOf(b.form, b.space).map((s) => phaseOfSpace(system, s));
}

/** Directory-style circuit number: "5", "1,3", "7A" or "2A,4A". */
export function circuitNumber(b: Pick<Breaker, 'form' | 'space'>, index: number): string {
  const suffix = formCircuits(b.form) === 2 ? (index === 0 ? 'A' : 'B') : '';
  return spacesOf(b.form, b.space)
    .map((s) => `${s}${suffix}`)
    .join(',');
}

export function acceptsTandem(panel: Pick<PanelConfig, 'tandemSpaces'>, space: number): boolean {
  const t = panel.tandemSpaces;
  if (t === 'all') return true;
  if (t === 'none') return false;
  return t.includes(space);
}

export function polesUsed(breakers: readonly Breaker[]): number {
  return breakers.reduce((n, b) => n + formPoles(b.form), 0);
}

/** Map of space number to the breaker in it (first one wins if they overlap). */
export function occupancy(breakers: readonly Breaker[], ignoreId?: string): Map<number, Breaker> {
  const map = new Map<number, Breaker>();
  for (const b of breakers) {
    if (b.id === ignoreId) continue;
    for (const s of spacesOf(b.form, b.space)) if (!map.has(s)) map.set(s, b);
  }
  return map;
}

export type PlacementResult = { ok: true } | { ok: false; reason: string };

export function checkPlacement(
  panel: Pick<PanelConfig, 'spaces' | 'maxCircuits' | 'tandemSpaces'>,
  breakers: readonly Breaker[],
  form: BreakerForm,
  space: number,
  ignoreId?: string,
): PlacementResult {
  if (!Number.isInteger(space) || space < 1) return { ok: false, reason: 'Not a valid space number' };
  const spaces = spacesOf(form, space);
  const last = spaces[spaces.length - 1];
  if (last > panel.spaces) {
    return {
      ok: false,
      reason: formRows(form) === 2 ? `Needs space ${last}, past the end of the panel` : `Panel has only ${panel.spaces} spaces`,
    };
  }
  const occ = occupancy(breakers, ignoreId);
  const blocked = spaces.find((s) => occ.has(s));
  if (blocked !== undefined) return { ok: false, reason: `Space ${blocked} is taken` };
  if (formCircuits(form) === 2) {
    const bad = spaces.find((s) => !acceptsTandem(panel, s));
    if (bad !== undefined) return { ok: false, reason: `Space ${bad} doesn't take tandem breakers` };
  }
  const others = ignoreId ? breakers.filter((b) => b.id !== ignoreId) : breakers;
  if (polesUsed(others) + formPoles(form) > panel.maxCircuits) {
    return { ok: false, reason: `Panel is listed for ${panel.maxCircuits} circuits max` };
  }
  return { ok: true };
}

/** First space (searching from `from`, then wrapping) where the form fits. */
export function findFreeSpace(
  panel: Pick<PanelConfig, 'spaces' | 'maxCircuits' | 'tandemSpaces'>,
  breakers: readonly Breaker[],
  form: BreakerForm,
  from = 1,
): number | null {
  for (let s = from; s <= panel.spaces; s++) if (checkPlacement(panel, breakers, form, s).ok) return s;
  for (let s = 1; s < from; s++) if (checkPlacement(panel, breakers, form, s).ok) return s;
  return null;
}

/** Parse "21-30, 35" into [21, 22, ..., 30, 35]. */
export function parseSpaceList(text: string): number[] {
  const out = new Set<number>();
  for (const raw of text.split(',')) {
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(raw.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const lo = Math.min(a, b);
    const hi = Math.min(Math.max(a, b), lo + 200);
    for (let s = lo; s <= hi; s++) if (s > 0) out.add(s);
  }
  return [...out].sort((x, y) => x - y);
}

/** Format [1, 2, 3, 4, 9] as "1-4, 9". */
export function formatSpaceList(spaces: readonly number[]): string {
  const s = [...new Set(spaces)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}
