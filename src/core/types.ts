/**
 * Core data model. Plain data only (no React, no DOM) so it can be saved as JSON,
 * unit-tested, and reused by other front ends.
 */

export type NecEdition = '2005' | '2008' | '2011' | '2014' | '2017' | '2020' | '2023';
export const NEC_EDITIONS: readonly NecEdition[] = ['2005', '2008', '2011', '2014', '2017', '2020', '2023'];

/**
 * Electrical system. Only 120/240 V single-phase is implemented today; phases are
 * modelled as a list so 120/208 V three-phase (A/B/C) can be added later.
 */
export type SystemType = '120/240V-1PH';
export type Phase = 'L1' | 'L2';

export type BreakerFamilyId =
  | 'generic'
  | 'sqd-hom'
  | 'sqd-qo'
  | 'eaton-br'
  | 'eaton-ch'
  | 'siemens-qp'
  | 'ge-thql';

/** Which spaces accept tandem/quad (half-size) breakers. */
export type TandemSpaces = 'none' | 'all' | number[];

/** Whether equipment is already installed or part of the planned work. */
export type InstallStatus = 'existing' | 'new';

/** Panel settings that come from the panel label (also used by presets). */
export interface PanelConfig {
  presetId: string | null;
  name: string;
  family: BreakerFamilyId;
  system: SystemType;
  busAmps: number;
  mainType: 'main-breaker' | 'main-lug';
  mainAmps: number | null;
  /** Full-size (1 in.) spaces. Odd numbers are on the left, even on the right. */
  spaces: number;
  /** Maximum poles the panel is listed for (the "circuits" figure on the label). */
  maxCircuits: number;
  tandemSpaces: TandemSpaces;
  catalogNumber: string;
}

/** A subpanel is fed from a 2-pole breaker in another panel. */
export interface PanelFeed {
  panelId: string;
  breakerId: string;
}

/** Backup source behind an interlock: a portable generator via an inlet, a standby generator, or a battery inverter. */
export type BackupKind = 'portable' | 'standby' | 'inverter';

/** A battery inverter's grid input and battery. Only used when the backup source is an inverter. */
export interface InverterSettings {
  /** Inverter model the figures came from (src/data/equipment.ts). Null = entered by hand. */
  modelId: string | null;
  /** 2-pole breaker (normally in the panel upstream) that feeds the inverter's grid (AC) input. Null if none. */
  gridBreakerId: string | null;
  /** The inverter's AC input limit, amps (its rating, or the limit set in it). Null if unknown. */
  gridInputAmps: number | null;
  /** The inverter slows its charging to stay within that limit. If not, charging and pass-through add in full. */
  throttlesInput: boolean;
  /** Largest breaker the manual allows on the AC input and output, amps. Null if unknown. */
  acBreakerAmps: number | null;
  /** While the utility is up, its power passes through the inverter to the panel's loads, as well as charging. */
  passThrough: boolean;
  /** Battery model the battery figures came from. Null = entered by hand. */
  batteryModelId: string | null;
  /** How many of that battery. */
  batteryCount: number;
  /** Total battery capacity, kWh. Null if not entered. */
  batteryKWh: number | null;
  /** Part of that capacity used before the inverter shuts off, percent. */
  usablePct: number;
  /** Conversion efficiency between battery and AC, percent. */
  efficiencyPct: number;
  /** The inverter's own consumption, watts. */
  idleWatts: number;
  /** Most the batteries can deliver continuously, watts. Null if unknown. */
  dischargeWatts: number | null;
  /** Most the batteries can deliver for a moment (motor starting), watts. Null if unknown. */
  dischargeSurgeWatts: number | null;
  /** Measured average load in an outage, watts. Null = add it up from the circuits. */
  measuredLoadW: number | null;
}

/**
 * A mechanical interlock that lets a back-fed source breaker (generator or
 * battery inverter) turn on only when the main breaker is off. With an inverter,
 * the main is usually the bypass: off in normal operation, on if the inverter is
 * out of service.
 */
export interface GeneratorInterlock {
  /** Which side of the main the source breaker sits on: left = spaces 1,3; right = spaces 2,4. */
  side: 'left' | 'right';
  kind: BackupKind;
  /** Continuous output, watts: a generator's running watts or an inverter's continuous output. */
  generatorWatts: number;
  /** Power inlet rating for a portable generator, amps (e.g. 30 or 50). */
  inletAmps: number | null;
  /** Inverter surge (peak) rating, watts, for starting motors. Null if unknown. */
  surgeWatts: number | null;
  /** Grid input and battery, for an inverter. */
  inverter: InverterSettings;
}

export interface Panel extends PanelConfig {
  id: string;
  status: InstallStatus;
  breakers: Breaker[];
  /** Null for a service (main) panel. */
  feed: PanelFeed | null;
  /** In a detached building (garage, shop): needs its own electrode and disconnect. */
  separateBuilding: boolean;
  interlock: GeneratorInterlock | null;
  /** Living area served by a subpanel, ft² (for its feeder calculation). 0 = none, so its circuits count at their entered loads. */
  feederAreaFt2: number;
}

export type BreakerForm = 'single' | 'double' | 'tandem' | 'quad';
export type Protection = 'standard' | 'afci' | 'gfci' | 'df' | 'gfep';

export type WireSize =
  | '14' | '12' | '10' | '8' | '6' | '4' | '3' | '2' | '1'
  | '1/0' | '2/0' | '3/0' | '4/0' | '250' | '300' | '350';
export type ConductorMaterial = 'Cu' | 'Al';
export type WireType = 'NM-B' | 'UF-B' | 'THHN/THWN-2' | 'XHHW-2' | 'USE-2' | 'SER' | 'MC';

export interface Wire {
  size: WireSize;
  material: ConductorMaterial;
  type: WireType;
}

export type Location =
  | 'kitchen' | 'dining' | 'living' | 'bedroom' | 'bathroom' | 'hallway' | 'closet' | 'laundry'
  | 'office-den' | 'finished-basement' | 'unfinished-basement' | 'garage' | 'crawlspace' | 'attic'
  | 'outdoor' | 'accessory-building' | 'utility' | 'pool-spa' | 'multiple' | 'other';

export type LoadType =
  | 'general' | 'lighting' | 'receptacles' | 'small-appliance' | 'bathroom' | 'laundry'
  | 'dishwasher' | 'disposal' | 'microwave' | 'refrigerator' | 'range' | 'cooktop-oven' | 'dryer'
  | 'water-heater' | 'hvac' | 'furnace' | 'heat' | 'motor' | 'ev' | 'hot-tub' | 'landscape-lighting'
  | 'subpanel' | 'generator' | 'inverter' | 'inverter-input' | 'other';

/** How a load is treated in the NEC Article 220 service calculation. */
export type LoadCategory =
  | 'excluded'
  | 'general-lighting'
  | 'small-appliance'
  | 'laundry'
  | 'appliance'
  | 'motor'
  | 'cooking'
  | 'dryer'
  | 'cooling'
  | 'heating'
  | 'ev'
  | 'other';

export interface Circuit {
  id: string;
  /** Text for the panel directory, e.g. "Kitchen countertop – left of sink". */
  label: string;
  location: Location;
  loadType: LoadType;
  /** Breaker trip rating for this circuit, amps. */
  amps: number;
  /** Nameplate load in volt-amps (0 = not entered). */
  loadVA: number;
  /** Load runs 3 hours or more, so the breaker must be at least 125% of the load. */
  continuous: boolean;
  /** Circuit feeds receptacle outlets (affects GFCI rules). */
  servesReceptacles: boolean;
  /** GFCI protection comes from a GFCI receptacle on the circuit (it also protects the outlets wired after it). */
  gfciReceptacle: boolean;
  wire: Wire | null;
  /** One-way run length in feet (used for voltage drop and the materials list). */
  lengthFt: number | null;
  notes: string;
  /** Load-calculation category; null = decide from the load type. */
  calcCategory: LoadCategory | null;
  /** Planned to run while on generator power (panels with an interlock). */
  onGenerator: boolean;
  /** Hours a day this load runs (at its entered VA) on battery. Null = typical for the load type; 0 = left off. */
  outageHours: number | null;
}

/** Where an existing breaker was before it was moved to another panel. */
export interface BreakerOrigin {
  panelId: string;
  space: number;
}

export interface Breaker {
  id: string;
  form: BreakerForm;
  /** Top-most space the breaker occupies (1-based). */
  space: number;
  protection: Protection;
  status: InstallStatus;
  /** One circuit for single/double breakers, two for tandem/quad. */
  circuits: Circuit[];
  /** Set when an existing circuit is planned to move to another panel; null otherwise. */
  movedFrom: BreakerOrigin | null;
}

/** A load being considered that isn't on a breaker yet ("can I add a hot tub?"). */
export interface WhatIfLoad {
  id: string;
  name: string;
  category: LoadCategory;
  va: number;
}

export interface LoadCalcSettings {
  /** Living area in square feet (outside dimensions, excluding open porches, garages and unfinished spaces). */
  floorAreaFt2: number;
  /** Null = count from circuits (minimum 2). */
  smallApplianceCircuits: number | null;
  /** Null = count from circuits (minimum 1). */
  laundryCircuits: number | null;
  /** Null = count heating circuits. */
  heatingUnits: number | null;
  /** Heat pump with electric backup strips that can run with the compressor. */
  heatPumpWithStrips: boolean;
  /** Highest demand over the last 12 months from the utility, kW (for 220.87). */
  measuredPeakKW: number | null;
  /** Null = the service panel's main rating. */
  serviceAmps: number | null;
  whatIf: WhatIfLoad[];
}

export interface Project {
  schemaVersion: 2;
  id: string;
  name: string;
  address: string;
  notes: string;
  necEdition: NecEdition;
  /** Service panel(s) first; subpanels reference their feeder breaker. */
  panels: Panel[];
  loadCalc: LoadCalcSettings;
  createdAt: string;
  updatedAt: string;
}
