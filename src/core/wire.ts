import type { ConductorMaterial, LoadType, Wire, WireSize, WireType } from './types';

export const WIRE_SIZES: readonly WireSize[] = [
  '14', '12', '10', '8', '6', '4', '3', '2', '1', '1/0', '2/0', '3/0', '4/0', '250', '300', '350',
];
export const WIRE_TYPES: readonly WireType[] = ['NM-B', 'UF-B', 'THHN/THWN-2', 'XHHW-2', 'USE-2', 'SER', 'MC'];

/** Standard ampere ratings for inverse-time breakers (NEC 240.6(A)), up to 400 A. */
export const STANDARD_RATINGS: readonly number[] = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400,
];

type Amp3 = readonly [t60: number, t75: number, t90: number];

/** NEC Table 310.16 (Table 310.15(B)(16) in 2017): not more than 3 current-carrying conductors, 30 °C ambient. */
const COPPER: Record<WireSize, Amp3> = {
  '14': [15, 20, 25],
  '12': [20, 25, 30],
  '10': [30, 35, 40],
  '8': [40, 50, 55],
  '6': [55, 65, 75],
  '4': [70, 85, 95],
  '3': [85, 100, 115],
  '2': [95, 115, 130],
  '1': [110, 130, 145],
  '1/0': [125, 150, 170],
  '2/0': [145, 175, 195],
  '3/0': [165, 200, 225],
  '4/0': [195, 230, 260],
  '250': [215, 255, 290],
  '300': [240, 285, 320],
  '350': [260, 310, 350],
};

const ALUMINUM: Partial<Record<WireSize, Amp3>> = {
  '12': [15, 20, 25],
  '10': [25, 30, 35],
  '8': [35, 40, 45],
  '6': [40, 50, 55],
  '4': [55, 65, 75],
  '3': [65, 75, 85],
  '2': [75, 90, 100],
  '1': [85, 100, 115],
  '1/0': [100, 120, 135],
  '2/0': [115, 135, 150],
  '3/0': [130, 155, 175],
  '4/0': [150, 180, 205],
  '250': [170, 205, 230],
  '300': [195, 230, 260],
  '350': [210, 250, 280],
};

/** Conductor area in circular mils (NEC Chapter 9, Table 8). */
const CIRCULAR_MILS: Record<WireSize, number> = {
  '14': 4110,
  '12': 6530,
  '10': 10380,
  '8': 16510,
  '6': 26240,
  '4': 41740,
  '3': 52620,
  '2': 66360,
  '1': 83690,
  '1/0': 105600,
  '2/0': 133100,
  '3/0': 167800,
  '4/0': 211600,
  '250': 250000,
  '300': 300000,
  '350': 350000,
};

/** Resistivity constant (ohm-cmil/ft) for the K-factor voltage-drop method. */
const K_FACTOR: Record<ConductorMaterial, number> = { Cu: 12.9, Al: 21.2 };

export function sizeLabel(size: WireSize): string {
  return Number(size) >= 250 ? `${size} kcmil` : `${size} AWG`;
}

export function wireLabel(w: Wire): string {
  return `${sizeLabel(w.size)} ${w.material} ${w.type}`;
}

/**
 * Temperature column used for ampacity. NM-B (334.80) and UF-B (340.80) are held
 * to 60 °C. Others assume 75 °C-rated terminations (110.14(C)), which is typical
 * for modern residential breakers and lugs.
 */
export function ampacityColumn(type: WireType): 60 | 75 {
  return type === 'NM-B' || type === 'UF-B' ? 60 : 75;
}

export function tableAmpacity(wire: Wire): number | null {
  const row = (wire.material === 'Cu' ? COPPER : ALUMINUM)[wire.size];
  if (!row) return null;
  return ampacityColumn(wire.type) === 60 ? row[0] : row[1];
}

/** NEC 240.4(D) small-conductor limits on the overcurrent device. */
export function smallConductorLimit(wire: Wire): number | null {
  const limits: Partial<Record<WireSize, number>> =
    wire.material === 'Cu' ? { '14': 15, '12': 20, '10': 30 } : { '12': 15, '10': 25 };
  return limits[wire.size] ?? null;
}

/** Largest breaker the wire allows on its own (no next-size-up, no equipment exceptions). */
export function maxBreakerForWire(wire: Wire): number | null {
  const a = tableAmpacity(wire);
  if (a == null) return null;
  const cap = smallConductorLimit(wire);
  return cap == null ? a : Math.min(a, cap);
}

export const isStandardRating = (amps: number): boolean => STANDARD_RATINGS.includes(amps);
export const nextRatingAbove = (amps: number): number | null => STANDARD_RATINGS.find((r) => r > amps) ?? null;
export function largestRatingAtMost(amps: number): number | null {
  let best: number | null = null;
  for (const r of STANDARD_RATINGS) if (r <= amps) best = r;
  return best;
}

const MOTOR_TYPES: readonly LoadType[] = ['hvac', 'furnace', 'motor'];
const MULTI_OUTLET_TYPES: readonly LoadType[] = ['general', 'receptacles', 'small-appliance', 'bathroom', 'laundry'];

export type WireVerdict =
  /** Breaker is within the wire's rating. */
  | { status: 'ok'; limit: number }
  /** Over the ampacity but allowed by 240.4(B) if the load stays within the ampacity. */
  | { status: 'next-size-up'; limit: number }
  /** Over the ampacity on motor/AC equipment: allowed by 240.4(G) per the nameplate. */
  | { status: 'equipment-mocp'; limit: number }
  | { status: 'undersized'; limit: number }
  /** Not a table entry (for example 14 AWG aluminum). */
  | { status: 'unknown' };

export function checkWire(wire: Wire, breakerAmps: number, loadType: LoadType, servesReceptacles: boolean): WireVerdict {
  const ampacity = tableAmpacity(wire);
  if (ampacity == null) return { status: 'unknown' };
  const cap = smallConductorLimit(wire);
  const limit = cap == null ? ampacity : Math.min(ampacity, cap);
  if (breakerAmps <= limit) return { status: 'ok', limit };
  if (MOTOR_TYPES.includes(loadType)) return { status: 'equipment-mocp', limit };
  if (cap != null && breakerAmps > cap) return { status: 'undersized', limit };
  const multiOutlet = servesReceptacles && MULTI_OUTLET_TYPES.includes(loadType);
  const next = nextRatingAbove(ampacity);
  if (!multiOutlet && !isStandardRating(ampacity) && next != null && breakerAmps <= next) {
    return { status: 'next-size-up', limit };
  }
  return { status: 'undersized', limit };
}

/** Smallest wire that is fully rated for the breaker (no next-size-up or equipment exceptions). */
export function suggestWireSize(
  amps: number,
  material: ConductorMaterial,
  type: WireType,
  loadType: LoadType = 'other',
  servesReceptacles = false,
): WireSize | null {
  for (const size of WIRE_SIZES) {
    if (checkWire({ size, material, type }, amps, loadType, servesReceptacles).status === 'ok') return size;
  }
  return null;
}

// ---- Feeders and services ----------------------------------------------------

/**
 * Service or whole-house feeder conductors for a one-family dwelling may be sized
 * at 83% of the rating, for ratings of 100 through 400 A (310.12; 310.15(B)(6)/(B)(7)
 * in older editions). Null when the rule does not apply.
 */
export function dwellingMinAmpacity(rating: number): number | null {
  return rating >= 100 && rating <= 400 ? rating * 0.83 : null;
}

export type FeederWireVerdict =
  /** Rated for the feeder breaker. */
  | { status: 'ok'; ampacity: number }
  /** Below the breaker rating but at least 83% of it, on a feeder carrying the whole house. */
  | { status: 'dwelling'; ampacity: number; min: number }
  /** Below the breaker rating; allowed by 240.4(B) because the calculated load fits. */
  | { status: 'next-size-up'; ampacity: number }
  /** Smaller than the calculated feeder load (215.2(A)(1)). */
  | { status: 'below-load'; ampacity: number }
  /** Not protected by the breaker. */
  | { status: 'undersized'; ampacity: number }
  | { status: 'unknown' };

/** Feeder conductor check against the feeder breaker and the calculated feeder load. */
export function checkFeederWire(wire: Wire, breakerAmps: number, loadAmps: number, wholeHouse: boolean): FeederWireVerdict {
  const ampacity = tableAmpacity(wire);
  if (ampacity == null) return { status: 'unknown' };
  const cap = smallConductorLimit(wire);
  const limit = cap == null ? ampacity : Math.min(ampacity, cap);
  if (limit >= breakerAmps) return { status: 'ok', ampacity };
  const min = wholeHouse ? dwellingMinAmpacity(breakerAmps) : null;
  if (min != null && cap == null && ampacity >= min) return { status: 'dwelling', ampacity, min };
  if (ampacity < loadAmps) return { status: 'below-load', ampacity };
  const next = nextRatingAbove(ampacity);
  if (cap == null && !isStandardRating(ampacity) && next != null && breakerAmps <= next && breakerAmps <= 800) {
    return { status: 'next-size-up', ampacity };
  }
  return { status: 'undersized', ampacity };
}

const FEEDER_OK: readonly FeederWireVerdict['status'][] = ['ok', 'dwelling', 'next-size-up'];

/** Smallest conductor that passes checkFeederWire. */
export function suggestFeederWire(
  material: ConductorMaterial,
  type: WireType,
  breakerAmps: number,
  loadAmps: number,
  wholeHouse: boolean,
): WireSize | null {
  for (const size of WIRE_SIZES) {
    if (FEEDER_OK.includes(checkFeederWire({ size, material, type }, breakerAmps, loadAmps, wholeHouse).status)) return size;
  }
  return null;
}

/** Smallest conductor with at least the given ampacity. */
export function smallestWireFor(material: ConductorMaterial, type: WireType, minAmpacity: number): WireSize | null {
  for (const size of WIRE_SIZES) {
    const a = tableAmpacity({ size, material, type });
    if (a != null && a >= minAmpacity) return size;
  }
  return null;
}

/** NEC Table 250.122: minimum equipment grounding conductor for the overcurrent device rating. */
const EGC_TABLE: readonly [maxAmps: number, cu: WireSize, al: WireSize][] = [
  [15, '14', '12'],
  [20, '12', '10'],
  [60, '10', '8'],
  [100, '8', '6'],
  [200, '6', '4'],
  [300, '4', '2'],
  [400, '3', '1'],
];

export function egcSize(breakerAmps: number): { Cu: WireSize; Al: WireSize } | null {
  const row = EGC_TABLE.find(([max]) => breakerAmps <= max);
  return row ? { Cu: row[1], Al: row[2] } : null;
}

/** Single-phase voltage drop using the K-factor method: VD = 2·K·I·L / cmil. */
export function voltageDrop(wire: Wire, lengthFt: number, amps: number, volts: number): { volts: number; percent: number } {
  const vd = (2 * K_FACTOR[wire.material] * amps * lengthFt) / CIRCULAR_MILS[wire.size];
  return { volts: vd, percent: (vd / volts) * 100 };
}

/** Smallest size, starting at the wire's own size, that keeps voltage drop at or under maxPercent. */
export function sizeForVoltageDrop(
  wire: Wire,
  lengthFt: number,
  amps: number,
  volts: number,
  maxPercent = 3,
): WireSize | null {
  const start = WIRE_SIZES.indexOf(wire.size);
  for (let i = Math.max(0, start); i < WIRE_SIZES.length; i++) {
    const w: Wire = { ...wire, size: WIRE_SIZES[i] };
    if (voltageDrop(w, lengthFt, amps, volts).percent <= maxPercent) return w.size;
  }
  return null;
}
