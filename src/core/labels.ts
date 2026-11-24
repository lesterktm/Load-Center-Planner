import type { BreakerForm, InstallStatus, LoadCategory, LoadType, Location, Protection, WireType } from './types';

export const LOCATION_LABELS: Record<Location, string> = {
  kitchen: 'Kitchen',
  dining: 'Dining room',
  living: 'Living / family room',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  hallway: 'Hallway',
  closet: 'Closet',
  laundry: 'Laundry area',
  'office-den': 'Office / den',
  'finished-basement': 'Basement (finished)',
  'unfinished-basement': 'Basement (unfinished)',
  garage: 'Garage',
  crawlspace: 'Crawl space',
  attic: 'Attic',
  outdoor: 'Outdoors',
  'accessory-building': 'Accessory building / shed',
  utility: 'Utility / mechanical room',
  'pool-spa': 'Pool / spa / fountain',
  multiple: 'Multiple areas',
  other: 'Other',
};

export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  general: 'Lighting & receptacles',
  lighting: 'Lighting only',
  receptacles: 'Receptacles only',
  'small-appliance': 'Kitchen countertop (small appliance)',
  bathroom: 'Bathroom receptacles',
  laundry: 'Laundry receptacles',
  dishwasher: 'Dishwasher',
  disposal: 'Disposal',
  microwave: 'Microwave',
  refrigerator: 'Refrigerator / freezer',
  range: 'Range',
  'cooktop-oven': 'Cooktop / wall oven',
  dryer: 'Clothes dryer',
  'water-heater': 'Water heater',
  hvac: 'AC / heat pump',
  furnace: 'Furnace / air handler blower',
  heat: 'Electric heat',
  motor: 'Motor / pump',
  ev: 'EV charger',
  'hot-tub': 'Hot tub / spa',
  'landscape-lighting': 'Landscape lighting',
  subpanel: 'Subpanel feeder',
  generator: 'Generator (back-fed)',
  inverter: 'Inverter output (back-fed)',
  'inverter-input': 'Inverter grid input',
  other: 'Other',
};

export const CATEGORY_LABELS: Record<LoadCategory, string> = {
  excluded: 'Not counted',
  'general-lighting': 'Covered by floor area',
  'small-appliance': 'Small-appliance circuit',
  laundry: 'Laundry circuit',
  appliance: 'Fixed appliance',
  motor: 'Motor / fixed appliance',
  cooking: 'Cooking appliance',
  dryer: 'Clothes dryer',
  cooling: 'Air conditioning / heat pump',
  heating: 'Electric heat',
  ev: 'EV charging',
  other: 'Other (100%)',
};

export const STATUS_LABELS: Record<InstallStatus, string> = {
  existing: 'Existing',
  new: 'New',
};

export const PROTECTION_LABELS: Record<Protection, string> = {
  standard: 'Standard',
  afci: 'AFCI (combination)',
  gfci: 'GFCI (5 mA, personnel)',
  df: 'Dual-function AFCI/GFCI',
  gfep: 'GFEP (30 mA, equipment)',
};

export const PROTECTION_BADGE: Record<Protection, string> = {
  standard: '',
  afci: 'AFCI',
  gfci: 'GFCI',
  df: 'DF',
  gfep: 'GFEP',
};

export const FORM_LABELS: Record<BreakerForm, string> = {
  single: '1-pole (120 V)',
  double: '2-pole (240 V)',
  tandem: 'Tandem (2 × 120 V)',
  quad: 'Quad (2 × 240 V)',
};

export const FORM_SHORT: Record<BreakerForm, string> = {
  single: '1P',
  double: '2P',
  tandem: 'Tandem',
  quad: 'Quad',
};

export const WIRE_TYPE_NOTES: Record<WireType, string> = {
  'NM-B': 'Indoor dry locations; 60 °C ampacity (334.80)',
  'UF-B': 'Direct burial / wet locations; 60 °C ampacity (340.80)',
  'THHN/THWN-2': 'Single conductors in conduit; 75 °C terminations assumed',
  'XHHW-2': 'Single conductors in conduit; 75 °C terminations assumed',
  'USE-2': 'Service / underground; 75 °C terminations assumed',
  SER: 'Service-entrance cable; 75 °C assumed (not in thermal insulation)',
  MC: 'Metal-clad cable; 75 °C terminations assumed',
};

/** Load types the NEC treats as continuous (breaker at 125% of load). */
export const CONTINUOUS_LOAD_TYPES: readonly LoadType[] = ['ev', 'water-heater', 'heat', 'inverter-input'];

// ---- Dropdown order ------------------------------------------------------------

const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

/** Alphabetical, case-insensitive, with numbers in numeric order ("20 spaces" before "100 spaces"). */
export const compareText = (a: string, b: string): number => collator.compare(a, b);

/** Sort items by their text, keeping catch-all entries (like "Other") at the end. */
export function sortByText<T>(items: readonly T[], text: (item: T) => string, last: readonly T[] = []): T[] {
  return [...items].sort((a, b) => {
    const la = last.indexOf(a);
    const lb = last.indexOf(b);
    if (la !== lb) return la === -1 ? -1 : lb === -1 ? 1 : la - lb;
    return compareText(text(a), text(b));
  });
}

/** Keys of a label map in alphabetical order of their labels. */
export function sortedKeys<K extends string>(labels: Record<K, string>, last: readonly K[] = []): K[] {
  return sortByText(Object.keys(labels) as K[], (k) => labels[k], last);
}

export const LOCATION_OPTIONS = sortedKeys(LOCATION_LABELS, ['other']);
export const LOAD_TYPE_OPTIONS = sortedKeys(LOAD_TYPE_LABELS, ['other']);
export const CATEGORY_OPTIONS = sortedKeys(CATEGORY_LABELS, ['other']);
export const PROTECTION_OPTIONS = sortedKeys(PROTECTION_LABELS);
export const FORM_OPTIONS = sortedKeys(FORM_LABELS);
