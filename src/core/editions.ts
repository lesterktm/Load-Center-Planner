import type { Location, NecEdition } from './types';

/**
 * Requirements and section numbers that differ between NEC editions.
 *
 * Covered editions: 2005 through 2023. Article 220 (load calculations) kept
 * the same numbering from 2005 to 2020, so it is not mapped here; see loadcalc.ts.
 * Local amendments often change these rules, so the adopting jurisdiction's
 * version always governs.
 */

export const editionYear = (ed: NecEdition): number => Number(ed);

/** Conductor ampacity table: renumbered to 310.15(B)(16) in 2011 and back to 310.16 in 2020. */
export function ampacityTableRef(ed: NecEdition): string {
  const y = editionYear(ed);
  return y >= 2011 && y <= 2017 ? 'Table 310.15(B)(16)' : 'Table 310.16';
}

export interface AfciRule {
  ref: string;
  locations: readonly Location[];
}

/**
 * 210.12: dwelling rooms where 120 V, 15/20 A branch circuits need AFCI protection.
 * 2005: bedrooms only. 2008: most living areas. 2014: adds kitchens and laundry areas.
 */
export function afciRule(ed: NecEdition): AfciRule {
  const y = editionYear(ed);
  const ref = y <= 2008 ? '210.12(B)' : '210.12(A)';
  if (y <= 2005) return { ref, locations: ['bedroom'] };
  const living: Location[] = ['dining', 'living', 'bedroom', 'hallway', 'closet', 'office-den', 'finished-basement'];
  return { ref, locations: y >= 2014 ? [...living, 'kitchen', 'laundry'] : living };
}

export interface GfciScope {
  /** 210.8(A) locations covered in this edition. */
  locations: readonly Location[];
  /** Before 2020 only 125 V, 15/20 A receptacles were covered; from 2020, 125–250 V. */
  includes240V: boolean;
  /** Before 2023 only kitchen receptacles serving the countertop were covered. */
  allKitchenReceptacles: boolean;
  /** Laundry areas were added in 2014; before that, only receptacles within 6 ft of a sink. */
  laundryAreas: boolean;
  /** 210.8(D) dishwasher outlets, from 2014. */
  dishwasher: boolean;
  /** 625.54 EV charging receptacles, from 2017. */
  evReceptacles: boolean;
  /** 210.8(F) outdoor outlets up to 50 A, including hard-wired equipment, from 2020. */
  outdoorOutlets: boolean;
  /** Crawl space lighting outlets: 210.8(E) in 2017, 210.8(C) from 2020. Null before 2017. */
  crawlSpaceLightingRef: string | null;
}

export function gfciScope(ed: NecEdition): GfciScope {
  const y = editionYear(ed);
  const locations: Location[] = ['bathroom', 'garage', 'accessory-building', 'outdoor', 'crawlspace', 'unfinished-basement', 'kitchen'];
  if (y >= 2014) locations.push('laundry');
  if (y >= 2020) locations.push('finished-basement');
  return {
    locations,
    includes240V: y >= 2020,
    allKitchenReceptacles: y >= 2023,
    laundryAreas: y >= 2014,
    dishwasher: y >= 2014,
    evReceptacles: y >= 2017,
    outdoorOutlets: y >= 2020,
    crawlSpaceLightingRef: y >= 2020 ? '210.8(C)' : y >= 2017 ? '210.8(E)' : null,
  };
}

/**
 * AFCI protection when existing branch circuits are modified or extended (with the
 * 6 ft extension exception): 210.12(B) in 2014, 210.12(D) from 2017. Null before 2014.
 */
export function afciExtensionRef(ed: NecEdition): string | null {
  const y = editionYear(ed);
  if (y >= 2017) return '210.12(D)';
  if (y >= 2014) return '210.12(B)';
  return null;
}

/** Panel circuit directory: 408.4 until 2008, 408.4(A) from 2011. */
export const directoryRef = (ed: NecEdition): string => (editionYear(ed) <= 2008 ? '408.4' : '408.4(A)');

/** Optional standby transfer equipment: 702.6 until 2008, 702.5 from 2011. */
export const transferRef = (ed: NecEdition): string => (editionYear(ed) <= 2008 ? '702.6' : '702.5');

/**
 * Capacity of an optional standby source with manual transfer (an interlock): enough for
 * the equipment run at one time, which the user may choose. 702.5 in 2005, 702.5(B)(1) in
 * 2008, 702.4(B)(1) from 2011.
 */
export function standbyCapacityRef(ed: NecEdition): string {
  const y = editionYear(ed);
  if (y <= 2005) return '702.5';
  if (y <= 2008) return '702.5(B)(1)';
  return '702.4(B)(1)';
}

/** Optional standby warning sign at the service: 702.8 until 2008, 702.7 from 2011. */
export const standbySignRef = (ed: NecEdition): string => (editionYear(ed) <= 2008 ? '702.8' : '702.7');

/** Back-fed breakers must be secured with an additional fastener: 408.36(F) in 2005, 408.36(D) from 2008. */
export const backfedRef = (ed: NecEdition): string => (editionYear(ed) <= 2005 ? '408.36(F)' : '408.36(D)');

/** Batteries: Article 706 (energy storage systems) from 2017, with the dwelling shutoff in 706.15 from 2020; Article 480 before. */
export function energyStorageRef(ed: NecEdition): string {
  const y = editionYear(ed);
  if (y >= 2020) return 'Article 706, 706.15';
  return y >= 2017 ? 'Article 706' : 'Article 480';
}

/** EV feeders and branch circuits sized for 125% of the charger load: 625.21 until 2011, 625.41 from 2014. */
export const evOvercurrentRef = (ed: NecEdition): string => (editionYear(ed) <= 2011 ? '625.21' : '625.41');

/** The 3% voltage-drop recommendation: a fine print note (FPN) until 2008, an informational note from 2011. */
export const voltageDropRef = (ed: NecEdition): string =>
  editionYear(ed) <= 2008 ? '210.19(A)(1) FPN No. 4 (3% recommended)' : '210.19 informational note (3% recommended)';

/**
 * Dwelling service and whole-house feeder conductors at 83% of the rating (100–400 A).
 * A table in 310.15(B)(6) (2005–2008) and 310.15(B)(7) (2011–2014); the 83% rule in
 * 310.15(B)(7) (2017) and 310.12 (2020+). The old tables give the same sizes.
 */
export function dwellingConductorRef(ed: NecEdition): string {
  const y = editionYear(ed);
  if (y <= 2008) return 'Table 310.15(B)(6)';
  if (y <= 2014) return 'Table 310.15(B)(7)';
  if (y <= 2017) return '310.15(B)(7)';
  return '310.12';
}

/** 2005 only: a lighting and appliance panelboard may hold no more than 42 overcurrent devices (poles). Deleted in 2008. */
export const has42CircuitLimit = (ed: NecEdition): boolean => editionYear(ed) <= 2005;

/** 2005 still allowed a 3-wire feeder to a separate building with no other metal paths between them (250.32(B)(2)). */
export const allowsThreeWireBuildingFeeder = (ed: NecEdition): boolean => editionYear(ed) <= 2005;

/** 445.18(D) outdoor emergency shutdown for permanently installed generators, from 2020. */
export const needsGeneratorShutdown = (ed: NecEdition): boolean => editionYear(ed) >= 2020;
