import type { LoadType } from '../core/types';

/**
 * Rough hours a day each kind of load runs at its entered VA, for battery run time.
 *
 * These are planning estimates, not measurements: a refrigerator is plugged in all
 * day but its compressor averages a couple of hours at full load. People replace
 * them with their own figures on the Battery tab. Feeders and back-fed breakers
 * aren't loads, and an EV normally isn't charged from the house battery.
 */
export const TYPICAL_OUTAGE_HOURS: Record<LoadType, number> = {
  general: 1,
  lighting: 3,
  receptacles: 1,
  'small-appliance': 0.5,
  bathroom: 0.25,
  laundry: 0.5,
  dishwasher: 1,
  disposal: 0.1,
  microwave: 0.25,
  refrigerator: 2,
  range: 0.25,
  'cooktop-oven': 0.5,
  dryer: 0.5,
  'water-heater': 2.5,
  hvac: 8,
  furnace: 8,
  heat: 8,
  motor: 1,
  ev: 0,
  'hot-tub': 1,
  'landscape-lighting': 5,
  subpanel: 0,
  generator: 0,
  inverter: 0,
  'inverter-input': 0,
  other: 1,
};
