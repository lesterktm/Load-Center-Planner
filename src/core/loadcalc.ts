import type { Circuit, LoadCategory, LoadType, NecEdition, Project } from './types';
import { circuitNumber } from './panel';
import { isServicePanel, panelOrder, panelRating } from './tree';
import { evOvercurrentRef } from './editions';

/**
 * NEC Article 220 service and feeder load calculations for a one-family dwelling.
 *
 * Section numbers follow the 2005–2020 NEC, which share Article 220's layout. The
 * 2023 edition renumbered a few of them (the dwelling lighting load and its demand
 * table) without changing the method; the 2023 EVSE minimum (220.57) is applied
 * when 2023 is selected.
 */

export function autoCategory(loadType: LoadType): LoadCategory {
  switch (loadType) {
    case 'general':
    case 'lighting':
    case 'receptacles':
    case 'bathroom':
      return 'general-lighting';
    case 'small-appliance':
      return 'small-appliance';
    case 'laundry':
      return 'laundry';
    case 'dishwasher':
    case 'disposal':
    case 'microwave':
    case 'refrigerator':
    case 'water-heater':
    case 'hot-tub':
      return 'appliance';
    case 'furnace':
    case 'motor':
      return 'motor';
    case 'range':
    case 'cooktop-oven':
      return 'cooking';
    case 'dryer':
      return 'dryer';
    case 'hvac':
      return 'cooling';
    case 'heat':
      return 'heating';
    case 'ev':
      return 'ev';
    case 'landscape-lighting':
    case 'inverter-input': // battery charging power
    case 'other':
      return 'other';
    case 'subpanel':
    case 'generator':
    case 'inverter':
      return 'excluded';
  }
}

export const categoryOf = (c: Pick<Circuit, 'calcCategory' | 'loadType'>): LoadCategory =>
  c.calcCategory ?? autoCategory(c.loadType);

// ---- Table 220.55 (household cooking appliances) ---------------------------

const COLUMN_A = [0, 0.8, 0.75, 0.7, 0.66, 0.62]; // under 3.5 kW
const COLUMN_B = [0, 0.8, 0.65, 0.55, 0.5, 0.45]; // 3.5 to 8.75 kW
const COLUMN_C = [0, 8000, 11000, 14000, 17000, 20000]; // over 8.75 kW (not over 12 kW), VA

/**
 * Demand load for household cooking appliances (Table 220.55, Notes 1–3).
 * Up to five appliances per column; ranges over 12 kW add 5% per kW (or major fraction) over 12.
 */
export function cookingDemandVA(ratingsVA: readonly number[]): number {
  const r = ratingsVA.filter((v) => v > 0);
  const a = r.filter((v) => v < 3500);
  const b = r.filter((v) => v >= 3500 && v <= 8750);
  const c = r.filter((v) => v > 8750);
  const idx = (n: number) => Math.min(n, 5);
  const sumOf = (xs: number[]) => xs.reduce((n, v) => n + v, 0);
  let total = 0;
  if (a.length) total += sumOf(a) * COLUMN_A[idx(a.length)];
  if (b.length) total += sumOf(b) * COLUMN_B[idx(b.length)];
  if (c.length) {
    const avgKW = Math.max(12, sumOf(c) / c.length / 1000);
    const over = avgKW - 12;
    const steps = Math.floor(over) + (over - Math.floor(over) > 0.5 ? 1 : 0);
    total += COLUMN_C[idx(c.length)] * (1 + 0.05 * steps);
  }
  return total;
}

// ---- Items -----------------------------------------------------------------

export interface CalcItem {
  key: string;
  name: string;
  /** "Main panel · Ckt 5" or "What-if". */
  where: string;
  category: LoadCategory;
  va: number;
  isNew: boolean;
  source: 'circuit' | 'what-if';
  panelId?: string;
  breakerId?: string;
  circuitId?: string;
  loadType?: LoadType;
}

/** Every circuit in every panel, plus what-if loads, with its load-calc category. */
export function collectItems(p: Project): CalcItem[] {
  const multi = p.panels.length > 1;
  const items: CalcItem[] = [];
  for (const panel of panelOrder(p)) {
    for (const b of [...panel.breakers].sort((x, y) => x.space - y.space)) {
      b.circuits.forEach((c, i) => {
        items.push({
          key: c.id,
          name: c.label.trim() || 'Unlabeled',
          where: `${multi ? `${panel.name || 'Panel'} · ` : ''}Ckt ${circuitNumber(b, i)}`,
          category: categoryOf(c),
          va: Math.max(0, c.loadVA || 0),
          isNew: b.status === 'new',
          source: 'circuit',
          panelId: panel.id,
          breakerId: b.id,
          circuitId: c.id,
          loadType: c.loadType,
        });
      });
    }
  }
  for (const w of p.loadCalc.whatIf) {
    items.push({
      key: w.id,
      name: w.name.trim() || 'What-if load',
      where: 'What-if',
      category: w.category,
      va: Math.max(0, w.va || 0),
      isNew: true,
      source: 'what-if',
    });
  }
  return items;
}

// ---- Context ---------------------------------------------------------------

export interface CalcContext {
  edition: NecEdition;
  /**
   * service: the whole dwelling (floor area required, at least 2 small-appliance and 1 laundry circuit).
   * feeder: one subpanel's loads (no minimums; without a floor area, lighting and receptacle circuits count at their entered loads).
   */
  mode: 'service' | 'feeder';
  area: number;
  /** Small-appliance circuits used in the calculation, and how many were found. */
  sa: number;
  saCounted: number;
  laundry: number;
  laundryCounted: number;
  heatingUnits: number;
  heatingCounted: number;
  heatPumpWithStrips: boolean;
  serviceAmps: number;
}

/** Service rating: the setting, or the main rating(s) of the service panel(s). */
export function serviceAmpsOf(p: Project): number {
  if (p.loadCalc.serviceAmps) return p.loadCalc.serviceAmps;
  return p.panels.filter((x) => isServicePanel(p, x)).reduce((n, x) => n + panelRating(x), 0);
}

function makeContext(p: Project, items: CalcItem[]): CalcContext {
  const s = p.loadCalc;
  const saCounted = items.filter((i) => i.category === 'small-appliance').length;
  const laundryCounted = items.filter((i) => i.category === 'laundry').length;
  const heatingCounted = items.filter((i) => i.category === 'heating' && i.va > 0).length;
  return {
    edition: p.necEdition,
    mode: 'service',
    area: Math.max(0, s.floorAreaFt2 || 0),
    sa: s.smallApplianceCircuits ?? Math.max(2, saCounted),
    saCounted,
    laundry: s.laundryCircuits ?? Math.max(1, laundryCounted),
    laundryCounted,
    heatingUnits: s.heatingUnits ?? heatingCounted,
    heatingCounted,
    heatPumpWithStrips: s.heatPumpWithStrips,
    serviceAmps: serviceAmpsOf(p),
  };
}

/** Context for one subpanel feeder: counts come from that feeder's own circuits, with no minimums. */
export function feederContext(p: Project, items: CalcItem[], areaServed: number, feederAmps: number): CalcContext {
  const sa = items.filter((i) => i.category === 'small-appliance').length;
  const laundry = items.filter((i) => i.category === 'laundry').length;
  const heating = items.filter((i) => i.category === 'heating' && i.va > 0).length;
  return {
    edition: p.necEdition,
    mode: 'feeder',
    area: Math.max(0, areaServed || 0),
    sa,
    saCounted: sa,
    laundry,
    laundryCounted: laundry,
    heatingUnits: heating,
    heatingCounted: heating,
    heatPumpWithStrips: p.loadCalc.heatPumpWithStrips,
    serviceAmps: feederAmps,
  };
}

// ---- Methods ---------------------------------------------------------------

export interface CalcLine {
  label: string;
  va: number;
  ref?: string;
  strong?: boolean;
}

export type MethodId = 'standard' | 'optional' | 'existing' | 'measured';

export interface MethodResult {
  id: MethodId;
  title: string;
  ref: string;
  applicable: boolean;
  /** Why the method can't be used, when not applicable. */
  reason?: string;
  lines: CalcLine[];
  totalVA: number;
  amps: number;
  /** For the existing-dwelling method: the load before the new work. */
  before?: { totalVA: number; amps: number };
  notes: string[];
}

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const sum = (xs: readonly CalcItem[]) => xs.reduce((n, i) => n + i.va, 0);
const counted = (items: readonly CalcItem[], ...cats: LoadCategory[]) => items.filter((i) => cats.includes(i.category) && i.va > 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const tier8 = (v: number) => Math.min(v, 8000) + 0.4 * Math.max(0, v - 8000);

function result(id: MethodId, title: string, ref: string, lines: CalcLine[], total: number, notes: string[] = []): MethodResult {
  return {
    id,
    title,
    ref,
    applicable: true,
    lines: [...lines, { label: 'Calculated load', va: total, strong: true }],
    totalVA: total,
    amps: total / 240,
    notes,
  };
}

function notApplicable(id: MethodId, title: string, ref: string, reason: string): MethodResult {
  return { id, title, ref, applicable: false, reason, lines: [], totalVA: 0, amps: 0, notes: [] };
}

function lightingLines(ctx: CalcContext, refs: { gl: string; sa: string; laundry: string }): CalcLine[] {
  return [
    { label: `General lighting and receptacles: ${fmt(ctx.area)} ft² × 3 VA`, va: ctx.area * 3, ref: refs.gl },
    { label: `Small-appliance circuits: ${ctx.sa} × 1,500 VA`, va: ctx.sa * 1500, ref: refs.sa },
    { label: `Laundry circuits: ${ctx.laundry} × 1,500 VA`, va: ctx.laundry * 1500, ref: refs.laundry },
  ];
}

/** Lighting lines for a subpanel feeder: only what applies, and circuits at their entered loads when no area is served. */
function feederLightingLines(items: CalcItem[], ctx: CalcContext): { lines: CalcLine[]; va: number } {
  const lines: CalcLine[] = [];
  let va = 0;
  if (ctx.area > 0) {
    lines.push({ label: `General lighting and receptacles: ${fmt(ctx.area)} ft² of living area × 3 VA`, va: ctx.area * 3, ref: 'Table 220.12' });
    va += ctx.area * 3;
  } else {
    const general = items.filter((i) => i.category === 'general-lighting');
    const v = sum(general);
    if (general.length) {
      lines.push({
        label: `Lighting and receptacle circuits (${general.length}) at their entered loads (no living area served)`,
        va: v,
        ref: '220.14',
      });
      va += v;
    }
  }
  if (ctx.sa > 0) {
    lines.push({ label: `Small-appliance circuits: ${ctx.sa} × 1,500 VA`, va: ctx.sa * 1500, ref: '220.52(A)' });
    va += ctx.sa * 1500;
  }
  if (ctx.laundry > 0) {
    lines.push({ label: `Laundry circuits: ${ctx.laundry} × 1,500 VA`, va: ctx.laundry * 1500, ref: '220.52(B)' });
    va += ctx.laundry * 1500;
  }
  return { lines, va };
}

/**
 * Standard method for a one-family dwelling (Article 220, Part III). In feeder mode
 * it covers one subpanel's loads, and EV chargers are taken at 125% because the
 * feeder supplies them (625.41).
 */
export function standardMethod(items: CalcItem[], ctx: CalcContext): MethodResult {
  const feeder = ctx.mode === 'feeder';
  let lines: CalcLine[];
  let base: number;
  if (feeder) {
    ({ lines, va: base } = feederLightingLines(items, ctx));
  } else {
    lines = lightingLines(ctx, { gl: 'Table 220.12', sa: '220.52(A)', laundry: '220.52(B)' });
    base = ctx.area * 3 + (ctx.sa + ctx.laundry) * 1500;
  }
  const baseDemand =
    Math.min(base, 3000) + Math.max(0, Math.min(base, 120000) - 3000) * 0.35 + Math.max(0, base - 120000) * 0.25;
  if (base > 0 || !feeder) {
    lines.push({
      label: `Subtotal ${fmt(base)} VA: first 3,000 VA at 100%, remainder at 35%`,
      va: baseDemand,
      ref: 'Table 220.42',
      strong: true,
    });
  }
  let total = baseDemand;

  const apps = counted(items, 'appliance', 'motor');
  if (apps.length) {
    const factor = apps.length >= 4 ? 0.75 : 1;
    const v = sum(apps) * factor;
    lines.push({
      label: `Fixed appliances (${apps.length}): ${fmt(sum(apps))} VA${factor < 1 ? ' at 75% (4 or more)' : ''}`,
      va: v,
      ref: '220.53',
    });
    total += v;
  }

  const dryers = counted(items, 'dryer');
  if (dryers.length) {
    const v = dryers.reduce((n, d) => n + Math.max(5000, d.va), 0);
    lines.push({ label: `${plural(dryers.length, 'clothes dryer')} at nameplate, 5,000 VA minimum`, va: v, ref: '220.54' });
    total += v;
  }

  const cooking = counted(items, 'cooking');
  if (cooking.length) {
    const v = cookingDemandVA(cooking.map((c) => c.va));
    lines.push({
      label: `${plural(cooking.length, 'cooking appliance')}, ${(sum(cooking) / 1000).toLocaleString('en-US')} kW nameplate`,
      va: v,
      ref: 'Table 220.55',
    });
    total += v;
  }

  const coolItems = counted(items, 'cooling');
  const cool = sum(coolItems);
  const heat = sum(counted(items, 'heating')) + (ctx.heatPumpWithStrips ? cool : 0);
  if (cool > 0 || heat > 0) {
    const v = Math.max(cool, heat);
    lines.push({
      label: `Heating ${fmt(heat)} VA${ctx.heatPumpWithStrips ? ' (backup heat + heat pump)' : ''} vs. cooling ${fmt(cool)} VA: larger only`,
      va: v,
      ref: '220.60',
    });
    total += v;
  }

  // 25% of the largest motor that is part of the calculation.
  const coolingCounts = cool > 0 && (cool >= heat || ctx.heatPumpWithStrips);
  const motors = [...apps.filter((a) => a.category === 'motor'), ...(coolingCounts ? coolItems : [])];
  if (motors.length) {
    const m = motors.reduce((x, y) => (y.va > x.va ? y : x));
    lines.push({ label: `Largest motor (${m.name}): 25% of ${fmt(m.va)} VA`, va: m.va * 0.25, ref: '220.50, 430.24' });
    total += m.va * 0.25;
  }

  const evs = counted(items, 'ev');
  if (evs.length) {
    const min = ctx.edition === '2023' ? 7200 : 0;
    const v = evs.reduce((n, e) => n + Math.max(min, e.va), 0);
    lines.push({
      label: `${plural(evs.length, 'EV charger')} at nameplate${min ? ', 7,200 VA minimum each' : ''}`,
      va: v,
      ref: min ? '220.57' : 'Article 625',
    });
    total += v;
    if (feeder) {
      lines.push({ label: 'EV charging is a continuous load: add 25% for the feeder', va: v * 0.25, ref: evOvercurrentRef(ctx.edition) });
      total += v * 0.25;
    }
  }

  const other = counted(items, 'other');
  if (other.length) {
    lines.push({ label: `Other loads (${other.length}) at 100%`, va: sum(other) });
    total += sum(other);
  }

  return result('standard', 'Standard method', 'Article 220, Part III', lines, total);
}

function optionalHvac(items: CalcItem[], ctx: CalcContext): CalcLine | null {
  const cool = sum(counted(items, 'cooling'));
  const heat = sum(counted(items, 'heating'));
  if (cool <= 0 && heat <= 0) return null;
  const options: [number, string][] = [[cool, `100% of air conditioning, ${fmt(cool)} VA`]];
  if (heat > 0) {
    if (ctx.heatPumpWithStrips) {
      options.push([cool + 0.65 * heat, `heat pump ${fmt(cool)} VA + 65% of ${fmt(heat)} VA backup heat`]);
    } else if (ctx.heatingUnits >= 4) {
      options.push([0.4 * heat, `40% of ${fmt(heat)} VA electric heat (4 or more separately controlled units)`]);
    } else {
      options.push([0.65 * heat, `65% of ${fmt(heat)} VA electric heat (fewer than 4 units)`]);
    }
  }
  const best = options.reduce((x, y) => (y[0] > x[0] ? y : x));
  return { label: `Heating and cooling, the largest: ${best[1]}`, va: best[0], ref: '220.82(C)' };
}

/** Optional method for a dwelling unit (220.82). */
function optionalMethod(items: CalcItem[], ctx: CalcContext): MethodResult {
  const title = 'Optional method';
  if (ctx.serviceAmps < 100) {
    return notApplicable('optional', title, '220.82', 'Needs a service of 100 A or more (220.82(A)).');
  }
  const lines: CalcLine[] = [
    { label: `General lighting and receptacles: ${fmt(ctx.area)} ft² × 3 VA`, va: ctx.area * 3, ref: '220.82(B)(1)' },
    {
      label: `Small-appliance and laundry circuits: ${ctx.sa + ctx.laundry} × 1,500 VA`,
      va: (ctx.sa + ctx.laundry) * 1500,
      ref: '220.82(B)(2)',
    },
  ];
  let general = ctx.area * 3 + (ctx.sa + ctx.laundry) * 1500;
  const groups: [string, LoadCategory[], string][] = [
    ['Fixed appliances and water heater', ['appliance'], '220.82(B)(3)'],
    ['Motors', ['motor'], '220.82(B)(4)'],
    ['Cooking appliances', ['cooking'], '220.82(B)(3)'],
    ['Clothes dryers', ['dryer'], '220.82(B)(3)'],
    ['EV chargers', ['ev'], '220.82(B)(3)'],
    ['Other loads', ['other'], '220.82(B)(3)'],
  ];
  for (const [label, cats, ref] of groups) {
    const its = counted(items, ...cats);
    if (!its.length) continue;
    lines.push({ label: `${label} (${its.length}) at nameplate`, va: sum(its), ref });
    general += sum(its);
  }
  const demand = Math.min(general, 10000) + 0.4 * Math.max(0, general - 10000);
  lines.push({
    label: `General loads ${fmt(general)} VA: first 10,000 VA at 100%, remainder at 40%`,
    va: demand,
    ref: '220.82(B)',
    strong: true,
  });
  let total = demand;
  const hvac = optionalHvac(items, ctx);
  if (hvac) {
    lines.push(hvac);
    total += hvac.va;
  }
  return result('optional', title, '220.82', lines, total);
}

/** Existing dwelling unit with new loads (220.83). */
function existingMethod(items: CalcItem[], ctx: CalcContext, hasExistingBreakers: boolean): MethodResult {
  if (!hasExistingBreakers) {
    return notApplicable(
      'existing',
      'Existing dwelling, adding loads',
      '220.83',
      'Mark the breakers that are already installed as "Existing" to use this method.',
    );
  }
  const newItems = items.filter((i) => i.isNew);
  const addsHvac = counted(newItems, 'cooling', 'heating').length > 0;
  const lighting = ctx.area * 3 + (ctx.sa + ctx.laundry) * 1500;

  const compute = (list: CalcItem[]) => {
    const others = sum(counted(list, 'appliance', 'motor', 'cooking', 'dryer', 'ev', 'other'));
    const cool = sum(counted(list, 'cooling'));
    const heat = sum(counted(list, 'heating'));
    if (!addsHvac) {
      const base = lighting + others + cool + heat;
      return { base, others, cool, heat, hvac: 0, total: tier8(base) };
    }
    const base = lighting + others;
    const hvac = Math.max(cool, heat);
    return { base, others, cool, heat, hvac, total: hvac + tier8(base) };
  };

  const after = compute(items);
  const before = compute(items.filter((i) => !i.isNew));
  const lines: CalcLine[] = lightingLines(ctx, { gl: '220.83', sa: '220.83', laundry: '220.83' });
  lines.push({ label: 'Appliances, cooking, dryers, motors, EV and other loads at nameplate', va: after.others, ref: '220.83' });
  if (!addsHvac && after.cool + after.heat > 0) {
    lines.push({ label: 'Existing heating and air conditioning at nameplate', va: after.cool + after.heat, ref: '220.83(A)' });
  }
  lines.push({
    label: `Subtotal ${fmt(after.base)} VA: first 8,000 VA at 100%, remainder at 40%`,
    va: tier8(after.base),
    ref: addsHvac ? '220.83(B)' : '220.83(A)',
    strong: true,
  });
  if (addsHvac) {
    lines.push({
      label: `Larger of heating ${fmt(after.heat)} VA or cooling ${fmt(after.cool)} VA, at 100%`,
      va: after.hvac,
      ref: '220.83(B)',
    });
  }
  const notes: string[] = [];
  if (!newItems.some((i) => i.va > 0 && i.category !== 'excluded')) {
    notes.push('No new loads yet. Mark planned breakers as "New" or add a what-if load.');
  }
  if (addsHvac && ctx.heatingUnits >= 4) {
    notes.push('Four or more separately controlled heating units are counted at 100% here, which is conservative.');
  }
  const r = result(
    'existing',
    addsHvac ? 'Existing dwelling, adding heating or A/C' : 'Existing dwelling, adding loads',
    addsHvac ? '220.83(B)' : '220.83(A)',
    lines,
    after.total,
    notes,
  );
  r.before = { totalVA: before.total, amps: before.total / 240 };
  return r;
}

/** Load a new item adds when added to measured demand (220.87). */
function newItemVA(i: CalcItem, ctx: CalcContext): number {
  switch (i.category) {
    case 'excluded':
    case 'general-lighting':
      return 0;
    case 'small-appliance':
    case 'laundry':
      return 1500;
    case 'dryer':
      return Math.max(5000, i.va);
    case 'ev':
      return Math.max(ctx.edition === '2023' ? 7200 : 0, i.va);
    case 'cooking':
      return cookingDemandVA([i.va]);
    default:
      return i.va;
  }
}

/** Existing load from a year of utility demand data, plus the new loads (220.87). */
function measuredMethod(items: CalcItem[], ctx: CalcContext, peakKW: number | null): MethodResult {
  const title = 'Measured demand';
  if (!peakKW || peakKW <= 0) {
    return notApplicable('measured', title, '220.87', 'Enter the highest demand (kW) from 12 months of utility data to use this method.');
  }
  const existing = peakKW * 1000 * 1.25;
  const newOnes = items.filter((i) => i.isNew && newItemVA(i, ctx) > 0);
  const added = newOnes.reduce((n, i) => n + newItemVA(i, ctx), 0);
  const lines: CalcLine[] = [
    { label: `Highest demand ${peakKW.toLocaleString('en-US')} kW × 125%`, va: existing, ref: '220.87' },
    { label: `New loads (${newOnes.length})`, va: added, ref: '220.87' },
  ];
  return result('measured', title, '220.87', lines, existing + added, [
    'Needs a full year of demand data. A 30-day recording can substitute in some cases; see 220.87.',
  ]);
}

// ---- Entry point -----------------------------------------------------------

export interface LoadCalcResult {
  items: CalcItem[];
  ctx: CalcContext;
  methods: MethodResult[];
  /** The applicable method with the lowest result (any applicable method may be used). */
  best: MethodResult | null;
}

/** Service load by every method. `skip` leaves items out (for a feeder or inverter that doesn't carry them). */
export function calculateLoads(p: Project, skip?: (i: CalcItem) => boolean): LoadCalcResult {
  const items = skip ? collectItems(p).filter((i) => !skip(i)) : collectItems(p);
  const ctx = makeContext(p, items);
  const hasExisting = p.panels.some((panel) => panel.breakers.some((b) => b.status === 'existing'));
  const methods = [
    standardMethod(items, ctx),
    optionalMethod(items, ctx),
    existingMethod(items, ctx, hasExisting),
    measuredMethod(items, ctx, p.loadCalc.measuredPeakKW),
  ];
  const applicable = methods.filter((m) => m.applicable);
  const best = applicable.length ? applicable.reduce((x, y) => (y.amps < x.amps ? y : x)) : null;
  return { items, ctx, methods, best };
}
