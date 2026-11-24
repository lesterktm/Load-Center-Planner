import type {
  Breaker, BreakerFamilyId, BreakerForm, Circuit, GeneratorInterlock, InstallStatus, InverterSettings, LoadCalcSettings,
  LoadCategory, LoadType, Location, NecEdition, Panel, PanelConfig, PanelFeed, Project, Protection, WhatIfLoad, Wire,
} from './types';
import { NEC_EDITIONS } from './types';
import { findFreeSpace, formCircuits, formVolts } from './panel';
import { suggestWireSize, WIRE_SIZES, WIRE_TYPES } from './wire';
import { CATEGORY_LABELS, LOAD_TYPE_LABELS, LOCATION_LABELS, PROTECTION_LABELS } from './labels';
import type { CircuitTemplate } from '../data/templates';
import { batteryModel, inverterModel } from '../data/equipment';

export const SCHEMA_VERSION = 2 as const;

/** Unique id. Falls back when crypto.randomUUID is unavailable (plain http on a LAN). */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function defaultPanelConfig(): PanelConfig {
  return {
    presetId: 'mb200-40',
    name: 'Main panel',
    family: 'generic',
    system: '120/240V-1PH',
    busAmps: 200,
    mainType: 'main-breaker',
    mainAmps: 200,
    spaces: 40,
    maxCircuits: 40,
    tandemSpaces: 'none',
    catalogNumber: '',
  };
}

export function newPanel(overrides: Partial<Omit<Panel, 'id'>> = {}): Panel {
  return {
    ...defaultPanelConfig(),
    id: newId(),
    status: 'new',
    breakers: [],
    feed: null,
    separateBuilding: false,
    interlock: null,
    feederAreaFt2: 0,
    ...overrides,
  };
}

/** Settings for a new subpanel: 100 A main lug, 12 spaces / 24 circuits. */
export function subpanelConfig(name: string, family: BreakerFamilyId): Partial<Omit<Panel, 'id'>> {
  return {
    presetId: 'ml100-12-24',
    name,
    family,
    busAmps: 100,
    mainType: 'main-lug',
    mainAmps: null,
    spaces: 12,
    maxCircuits: 24,
    tandemSpaces: 'all',
  };
}

/** Typical figures for a 48 V hybrid inverter with lithium (LFP) batteries; edit to match the spec sheets. */
export function defaultInverterSettings(): InverterSettings {
  return {
    modelId: null,
    gridBreakerId: null,
    gridInputAmps: null,
    throttlesInput: false,
    acBreakerAmps: null,
    passThrough: true,
    batteryModelId: null,
    batteryCount: 1,
    batteryKWh: null,
    usablePct: 90,
    efficiencyPct: 92,
    idleWatts: 70,
    dischargeWatts: null,
    dischargeSurgeWatts: null,
    measuredLoadW: null,
  };
}

export function defaultInterlock(): GeneratorInterlock {
  return { side: 'right', kind: 'portable', generatorWatts: 7500, inletAmps: 30, surgeWatts: null, inverter: defaultInverterSettings() };
}

export function defaultLoadCalc(): LoadCalcSettings {
  return {
    floorAreaFt2: 0,
    smallApplianceCircuits: null,
    laundryCircuits: null,
    heatingUnits: null,
    heatPumpWithStrips: false,
    measuredPeakKW: null,
    serviceAmps: null,
    whatIf: [],
  };
}

export function newProject(): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: 'New project',
    address: '',
    notes: '',
    necEdition: '2023',
    panels: [newPanel()],
    loadCalc: defaultLoadCalc(),
    createdAt: now,
    updatedAt: now,
  };
}

export function newCircuit(form: BreakerForm, overrides: Partial<Omit<Circuit, 'id'>> = {}): Circuit {
  const volts = formVolts(form);
  const amps = overrides.amps ?? (volts === 240 ? 30 : 20);
  const base: Circuit = {
    id: newId(),
    label: '',
    location: 'other',
    loadType: 'general',
    amps,
    loadVA: 0,
    continuous: false,
    servesReceptacles: volts === 120,
    gfciReceptacle: false,
    wire: { size: suggestWireSize(amps, 'Cu', 'NM-B') ?? '12', material: 'Cu', type: 'NM-B' },
    lengthFt: null,
    notes: '',
    calcCategory: null,
    onGenerator: false,
    outageHours: null,
  };
  return { ...base, ...overrides, id: base.id };
}

export function newBreaker(
  form: BreakerForm,
  space: number,
  protection: Protection = 'standard',
  circuitOverrides: Partial<Omit<Circuit, 'id'>>[] = [],
  status: InstallStatus = 'new',
): Breaker {
  return {
    id: newId(),
    form,
    space,
    protection,
    status,
    circuits: Array.from({ length: formCircuits(form) }, (_, i) => newCircuit(form, circuitOverrides[i] ?? {})),
    movedFrom: null,
  };
}

export function breakerFromTemplate(
  t: CircuitTemplate,
  space: number,
  extra: Partial<Omit<Circuit, 'id'>> = {},
  status: InstallStatus = 'new',
): Breaker {
  const wire = t.circuit.wire ? { ...t.circuit.wire } : t.circuit.wire;
  return newBreaker(t.form, space, t.protection, [{ ...t.circuit, wire, ...extra }], status);
}

export function cloneBreaker(b: Breaker, space: number): Breaker {
  return {
    ...b,
    id: newId(),
    space,
    circuits: b.circuits.map((c) => ({ ...c, id: newId(), wire: c.wire ? { ...c.wire } : null })),
    movedFrom: null,
  };
}

/**
 * A new subpanel plus the 2-pole feeder breaker that supplies it, placed in the
 * first free 2-pole space of the source panel. Returns null if there is no room.
 */
export function planSubpanel(
  source: Panel,
  name: string,
  feederAmps = 60,
): { panel: Panel; feeder: Breaker } | null {
  const space = findFreeSpace(source, source.breakers, 'double');
  if (space == null) return null;
  const feeder = newBreaker('double', space, 'standard', [
    {
      label: `Subpanel: ${name}`,
      location: 'multiple',
      loadType: 'subpanel',
      amps: feederAmps,
      servesReceptacles: false,
      wire: { size: suggestWireSize(feederAmps, 'Cu', 'THHN/THWN-2') ?? '6', material: 'Cu', type: 'THHN/THWN-2' },
    },
  ]);
  const panel = newPanel({ ...subpanelConfig(name, source.family), feed: { panelId: source.id, breakerId: feeder.id } });
  return { panel, feeder };
}

// ---- Save / load ---------------------------------------------------------

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const positiveOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const FORMS: readonly BreakerForm[] = ['single', 'double', 'tandem', 'quad'];
const STATUSES: readonly InstallStatus[] = ['existing', 'new'];
const FAMILIES: readonly BreakerFamilyId[] = ['generic', 'sqd-hom', 'sqd-qo', 'eaton-br', 'eaton-ch', 'siemens-qp', 'ge-thql'];
const PROTECTIONS = Object.keys(PROTECTION_LABELS) as Protection[];
const LOCATIONS = Object.keys(LOCATION_LABELS) as Location[];
const LOAD_TYPES = Object.keys(LOAD_TYPE_LABELS) as LoadType[];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as LoadCategory[];

function normalizeWire(v: unknown): Wire | null {
  if (!isObj(v)) return null;
  return {
    size: oneOf(v.size, WIRE_SIZES, '12'),
    material: oneOf(v.material, ['Cu', 'Al'] as const, 'Cu'),
    type: oneOf(v.type, WIRE_TYPES, 'NM-B'),
  };
}

function normalizeCircuit(v: unknown, form: BreakerForm): Circuit {
  const d = newCircuit(form);
  if (!isObj(v)) return d;
  return {
    id: str(v.id, d.id),
    label: str(v.label, ''),
    location: oneOf(v.location, LOCATIONS, d.location),
    loadType: oneOf(v.loadType, LOAD_TYPES, d.loadType),
    amps: num(v.amps, d.amps),
    loadVA: num(v.loadVA, 0),
    continuous: v.continuous === true,
    servesReceptacles: typeof v.servesReceptacles === 'boolean' ? v.servesReceptacles : d.servesReceptacles,
    gfciReceptacle: v.gfciReceptacle === true,
    wire: v.wire === null ? null : (normalizeWire(v.wire) ?? d.wire),
    lengthFt: typeof v.lengthFt === 'number' && v.lengthFt > 0 ? v.lengthFt : null,
    notes: str(v.notes, ''),
    calcCategory: typeof v.calcCategory === 'string' && CATEGORIES.includes(v.calcCategory as LoadCategory) ? (v.calcCategory as LoadCategory) : null,
    onGenerator: v.onGenerator === true,
    outageHours: typeof v.outageHours === 'number' && Number.isFinite(v.outageHours) ? clamp(v.outageHours, 0, 24) : null,
  };
}

function normalizeBreaker(v: Obj): Breaker {
  const form = oneOf(v.form, FORMS, 'single');
  const raw = Array.isArray(v.circuits) ? v.circuits : [];
  return {
    id: str(v.id, newId()),
    form,
    space: Math.max(1, Math.round(num(v.space, 1))),
    protection: oneOf(v.protection, PROTECTIONS, 'standard'),
    status: oneOf(v.status, STATUSES, 'new'),
    circuits: Array.from({ length: formCircuits(form) }, (_, i) => normalizeCircuit(raw[i], form)),
    movedFrom:
      isObj(v.movedFrom) && typeof v.movedFrom.panelId === 'string' && typeof v.movedFrom.space === 'number'
        ? { panelId: v.movedFrom.panelId, space: Math.max(1, Math.round(v.movedFrom.space)) }
        : null,
  };
}

function normalizeInverter(v: unknown): InverterSettings {
  const d = defaultInverterSettings();
  if (!isObj(v)) return d;
  return {
    modelId: inverterModel(str(v.modelId, ''))?.id ?? null,
    gridBreakerId: typeof v.gridBreakerId === 'string' ? v.gridBreakerId : null,
    gridInputAmps: positiveOrNull(v.gridInputAmps),
    throttlesInput: v.throttlesInput === true,
    acBreakerAmps: positiveOrNull(v.acBreakerAmps),
    batteryModelId: batteryModel(str(v.batteryModelId, ''))?.id ?? null,
    batteryCount: clamp(Math.round(num(v.batteryCount, 1)), 1, 100),
    passThrough: v.passThrough !== false,
    batteryKWh: positiveOrNull(v.batteryKWh),
    usablePct: clamp(num(v.usablePct, d.usablePct), 1, 100),
    efficiencyPct: clamp(num(v.efficiencyPct, d.efficiencyPct), 1, 100),
    idleWatts: Math.max(0, num(v.idleWatts, d.idleWatts)),
    dischargeWatts: positiveOrNull(v.dischargeWatts),
    dischargeSurgeWatts: positiveOrNull(v.dischargeSurgeWatts),
    measuredLoadW: positiveOrNull(v.measuredLoadW),
  };
}

function normalizeInterlock(v: unknown): GeneratorInterlock | null {
  if (!isObj(v)) return null;
  const d = defaultInterlock();
  return {
    side: oneOf(v.side, ['left', 'right'] as const, d.side),
    kind: oneOf(v.kind, ['portable', 'standby', 'inverter'] as const, d.kind),
    generatorWatts: Math.max(0, num(v.generatorWatts, d.generatorWatts)),
    inletAmps: v.inletAmps === null ? null : numOrNull(v.inletAmps),
    surgeWatts: numOrNull(v.surgeWatts),
    inverter: normalizeInverter(v.inverter),
  };
}

function normalizeFeed(v: unknown): PanelFeed | null {
  if (!isObj(v) || typeof v.panelId !== 'string' || typeof v.breakerId !== 'string') return null;
  return { panelId: v.panelId, breakerId: v.breakerId };
}

function normalizePanel(rp: Obj, breakers: unknown[]): Panel {
  const base = newPanel();
  const tandem = rp.tandemSpaces;
  return {
    id: str(rp.id, base.id),
    presetId: typeof rp.presetId === 'string' ? rp.presetId : null,
    name: str(rp.name, base.name),
    family: oneOf(rp.family, FAMILIES, 'generic'),
    system: '120/240V-1PH',
    busAmps: num(rp.busAmps, base.busAmps),
    mainType: oneOf(rp.mainType, ['main-breaker', 'main-lug'] as const, 'main-breaker'),
    mainAmps: rp.mainAmps === null ? null : num(rp.mainAmps, base.mainAmps ?? 200),
    spaces: Math.round(num(rp.spaces, base.spaces)),
    maxCircuits: Math.round(num(rp.maxCircuits, base.maxCircuits)),
    tandemSpaces:
      tandem === 'all' || tandem === 'none'
        ? tandem
        : Array.isArray(tandem)
          ? tandem.filter((n): n is number => typeof n === 'number')
          : 'none',
    catalogNumber: str(rp.catalogNumber, ''),
    status: oneOf(rp.status, STATUSES, 'new'),
    breakers: breakers.filter(isObj).map(normalizeBreaker),
    feed: normalizeFeed(rp.feed),
    separateBuilding: rp.separateBuilding === true,
    interlock: normalizeInterlock(rp.interlock),
    feederAreaFt2: Math.max(0, num(rp.feederAreaFt2, 0)),
  };
}

function normalizeLoadCalc(v: unknown): LoadCalcSettings {
  const d = defaultLoadCalc();
  if (!isObj(v)) return d;
  const whatIf: WhatIfLoad[] = Array.isArray(v.whatIf)
    ? v.whatIf.filter(isObj).map((w) => ({
        id: str(w.id, newId()),
        name: str(w.name, ''),
        category: oneOf(w.category, CATEGORIES, 'other'),
        va: Math.max(0, num(w.va, 0)),
      }))
    : [];
  return {
    floorAreaFt2: Math.max(0, num(v.floorAreaFt2, 0)),
    smallApplianceCircuits: numOrNull(v.smallApplianceCircuits),
    laundryCircuits: numOrNull(v.laundryCircuits),
    heatingUnits: numOrNull(v.heatingUnits),
    heatPumpWithStrips: v.heatPumpWithStrips === true,
    measuredPeakKW: numOrNull(v.measuredPeakKW),
    serviceAmps: numOrNull(v.serviceAmps),
    whatIf,
  };
}

/**
 * Parse a saved project file. Version 1 files (one panel) are upgraded.
 * Throws an Error with a readable message on bad input.
 */
export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isObj(data)) throw new Error('The file does not contain a project.');

  let panels: Panel[];
  if (data.schemaVersion === 1) {
    if (!isObj(data.panel) || !Array.isArray(data.breakers)) throw new Error('The file is missing panel or breaker data.');
    panels = [normalizePanel(data.panel, data.breakers)];
  } else if (data.schemaVersion === SCHEMA_VERSION) {
    if (!Array.isArray(data.panels) || data.panels.length === 0) throw new Error('The file has no panels.');
    panels = data.panels.filter(isObj).map((rp) => normalizePanel(rp, Array.isArray(rp.breakers) ? rp.breakers : []));
  } else {
    throw new Error(`Unsupported project version: ${String(data.schemaVersion)}.`);
  }

  const base = newProject();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(data.id, base.id),
    name: str(data.name, 'Untitled project'),
    address: str(data.address, ''),
    notes: str(data.notes, ''),
    necEdition: oneOf<NecEdition>(data.necEdition, NEC_EDITIONS, '2023'),
    panels,
    loadCalc: normalizeLoadCalc(data.loadCalc),
    createdAt: str(data.createdAt, base.createdAt),
    updatedAt: str(data.updatedAt, base.updatedAt),
  };
}
