import type { Breaker, Circuit, InverterSettings, Panel, Project } from './types';
import { TYPICAL_OUTAGE_HOURS } from '../data/usage';
import { circuitRows } from './circuits';
import { isBackfedType } from './generator';
import { gridInputCheck } from './inverter';
import { panelOrder, subtreeIds } from './tree';

/**
 * Battery run time for an inverter-backed panel.
 *
 * Each circuit's energy is its entered load times the hours a day it runs on
 * battery. Loads are entered in VA and treated as watts, which overstates motor
 * loads a little (so run time comes out slightly short).
 */

export interface OutageLoad {
  panel: Panel;
  breaker: Breaker;
  circuit: Circuit;
  number: string;
  loadW: number;
  /** Hours a day used in the estimate. */
  hours: number;
  /** Typical hours for this kind of load, used until the user enters their own. */
  typicalHours: number;
  kWhPerDay: number;
}

export interface BatteryRuntime {
  settings: InverterSettings;
  loads: OutageLoad[];
  /** Circuits with no load entered, so they count as nothing. */
  withoutLoad: number;
  /** AC energy a day, from the circuits or the measured average. */
  kWhPerDay: number;
  averageW: number;
  /** The average came from a measured load. */
  measured: boolean;
  /** Battery energy used before the inverter shuts off; null until the capacity is entered. */
  usableKWh: number | null;
  /** Run time at the average load; null until the capacity is entered. */
  hours: number | null;
  /** Largest load the inverter and batteries can carry together. */
  maxLoadW: number;
  /** Hours to recharge an empty battery from the grid at the charging power; null if either isn't entered. */
  rechargeHours: number | null;
}

/** Hours a battery runs a steady AC load, including the inverter's own draw. */
export function hoursAt(s: InverterSettings, loadW: number): number | null {
  if (!s.batteryKWh) return null;
  const draw = Math.max(0, loadW) / (s.efficiencyPct / 100) + s.idleWatts;
  if (draw <= 0) return null;
  return (s.batteryKWh * 1000 * (s.usablePct / 100)) / draw;
}

const isSpare = (c: Circuit) => /^spare\b/i.test(c.label.trim());

/** Every load in an inverter-backed panel and the panels it feeds. */
export function outageLoads(p: Project, panel: Panel): OutageLoad[] {
  const inside = subtreeIds(p, panel.id);
  return panelOrder(p)
    .filter((x) => inside.has(x.id))
    .flatMap((x) => circuitRows(p, x))
    .filter((r) => !r.feeds && r.circuit.loadType !== 'subpanel' && !isBackfedType(r.circuit.loadType) && !isSpare(r.circuit))
    .map((r) => {
      const typicalHours = TYPICAL_OUTAGE_HOURS[r.circuit.loadType];
      const hours = r.circuit.outageHours ?? typicalHours;
      return {
        panel: r.panel,
        breaker: r.breaker,
        circuit: r.circuit,
        number: r.number,
        loadW: r.loadVA,
        hours,
        typicalHours,
        kWhPerDay: (r.loadVA * hours) / 1000,
      };
    });
}

export function batteryRuntime(p: Project, panel: Panel): BatteryRuntime | null {
  const il = panel.interlock;
  if (!il || il.kind !== 'inverter') return null;
  const s = il.inverter;
  const loads = outageLoads(p, panel);
  const summed = loads.reduce((n, l) => n + l.kWhPerDay, 0);
  const measured = s.measuredLoadW != null && s.measuredLoadW > 0;
  const averageW = measured ? s.measuredLoadW! : (summed * 1000) / 24;
  const usableKWh = s.batteryKWh ? s.batteryKWh * (s.usablePct / 100) : null;
  const batteryLimitW = s.dischargeWatts ? s.dischargeWatts * (s.efficiencyPct / 100) : Infinity;
  const chargeVA = gridInputCheck(p, panel)?.chargeVA ?? 0;
  return {
    settings: s,
    loads,
    withoutLoad: loads.filter((l) => l.loadW <= 0).length,
    kWhPerDay: (averageW * 24) / 1000,
    averageW,
    measured,
    usableKWh,
    hours: averageW > 0 ? hoursAt(s, averageW) : null,
    maxLoadW: Math.min(il.generatorWatts, batteryLimitW),
    rechargeHours: usableKWh && chargeVA > 0 ? (usableKWh * 1000) / (chargeVA * (s.efficiencyPct / 100)) : null,
  };
}

/** Panels backed up by a battery inverter, in display order. */
export const inverterPanels = (p: Project): Panel[] => panelOrder(p).filter((x) => x.interlock?.kind === 'inverter');
