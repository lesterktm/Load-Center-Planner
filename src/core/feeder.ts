import type { Breaker, Circuit, ConductorMaterial, Panel, Project, WireSize, WireType } from './types';
import { calculateLoads, collectItems, feederContext, serviceAmpsOf, standardMethod, type CalcItem, type MethodResult } from './loadcalc';
import { feederOf, subtreeIds } from './tree';
import {
  checkFeederWire, dwellingMinAmpacity, egcSize, nextRatingAbove, isStandardRating, smallestWireFor, suggestFeederWire,
  voltageDrop, type FeederWireVerdict,
} from './wire';
import { ampacityTableRef, dwellingConductorRef } from './editions';

/**
 * Feeder calculations for subpanels (NEC 220.40 and 215.2), plus service conductor sizing.
 *
 * A subpanel feeder is calculated with the standard method over the loads in that
 * subpanel and any panels it feeds. If the feeder carries the whole house (for
 * example from an outdoor meter-main to the house panel), the service methods
 * apply instead and its conductors may be sized at 83% of the rating (310.12).
 */

export interface FeederCalc {
  panel: Panel;
  feeder: { panel: Panel; breaker: Breaker; circuit: Circuit } | null;
  breakerAmps: number;
  /** The feeder carries the entire dwelling load. */
  wholeHouse: boolean;
  /** Null for a whole-house feeder before the floor area is entered. */
  method: MethodResult | null;
  /** Calculated load at 240 V. */
  amps: number;
  /** Smallest standard breaker rating that carries the calculated load. */
  minBreaker: number | null;
  wire: FeederWireVerdict | null;
  /** Smallest conductors for the feeder breaker, in the entered wire type (THHN/THWN-2 if none). */
  suggested: { type: WireType; Cu: WireSize | null; Al: WireSize | null };
  egc: { Cu: WireSize; Al: WireSize } | null;
  voltageDrop: { percent: number; volts: number } | null;
}

const isSpare = (i: CalcItem) => /^spare\b/i.test(i.name.trim());
const isLoad = (i: CalcItem) => i.category !== 'excluded' && !isSpare(i) && (i.va > 0 || ['general-lighting', 'small-appliance', 'laundry'].includes(i.category));

/** Standard breaker rating at or above the load. */
export function breakerFor(amps: number): number | null {
  if (amps <= 15) return 15;
  return isStandardRating(Math.ceil(amps)) ? Math.ceil(amps) : nextRatingAbove(amps);
}

/** Standard method over the loads in a panel and the panels it feeds (feeder mode). */
export function panelStandardMethod(p: Project, panel: Panel, feederAmps = 0): MethodResult {
  const inside = subtreeIds(p, panel.id);
  const items = collectItems(p).filter((i) => i.source === 'circuit' && inside.has(i.panelId!));
  const m = standardMethod(items, feederContext(p, items, panel.feederAreaFt2, feederAmps));
  return { ...m, title: `${panel.name || 'Subpanel'} feeder`, ref: '220.40' };
}

export function feederCalc(p: Project, panel: Panel): FeederCalc {
  const fd = feederOf(p, panel);
  const circuit = fd?.breaker.circuits[0];
  const feeder = fd && circuit ? { ...fd, circuit } : null;
  const breakerAmps = circuit?.amps ?? 0;

  const inside = subtreeIds(p, panel.id);
  const all = collectItems(p).filter((i) => i.source === 'circuit');
  const items = all.filter((i) => inside.has(i.panelId!));
  // Charging a battery inverter has its own breaker upstream: this feeder doesn't carry it, and it doesn't count against "whole house".
  const charging = (i: CalcItem) => i.loadType === 'inverter-input' && i.panelId != null && !inside.has(i.panelId);
  const outside = all.filter((i) => !inside.has(i.panelId!) && i.circuitId !== circuit?.id && !charging(i));
  const wholeHouse = !!feeder && outside.every((i) => !isLoad(i)) && items.some(isLoad);

  let method: MethodResult | null;
  if (wholeHouse) {
    const r = calculateLoads(p, charging);
    method = r.ctx.area > 0 ? r.best : null;
  } else {
    method = panelStandardMethod(p, panel, breakerAmps);
  }
  const amps = method?.amps ?? 0;

  const wire = circuit?.wire ?? null;
  const type: WireType = wire?.type ?? 'THHN/THWN-2';
  const suggest = (material: ConductorMaterial) =>
    breakerAmps > 0 ? suggestFeederWire(material, type, breakerAmps, amps, wholeHouse) : null;
  const length = circuit?.lengthFt ?? 0;

  return {
    panel,
    feeder,
    breakerAmps,
    wholeHouse,
    method,
    amps,
    minBreaker: amps > 0 ? breakerFor(amps) : null,
    wire: wire && breakerAmps > 0 ? checkFeederWire(wire, breakerAmps, amps, wholeHouse) : null,
    suggested: { type, Cu: suggest('Cu'), Al: suggest('Al') },
    egc: breakerAmps > 0 ? egcSize(breakerAmps) : null,
    voltageDrop: wire && length > 0 && amps > 0 ? voltageDrop(wire, length, amps, 240) : null,
  };
}

/** Feeder calculations for every subpanel, keyed by panel id. */
export function feederCalcs(p: Project): Map<string, FeederCalc> {
  return new Map(p.panels.filter((x) => x.feed).map((x) => [x.id, feederCalc(p, x)]));
}

export interface ServiceConductors {
  rating: number;
  /** Minimum conductor ampacity: 83% of the rating for 100–400 A services, otherwise the rating. */
  minAmpacity: number;
  uses83: boolean;
  ref: string;
  Cu: WireSize | null;
  Al: WireSize | null;
}

/** Minimum service-entrance conductors for the service rating, at 75 °C with no adjustment factors. */
export function serviceConductors(p: Project): ServiceConductors {
  const rating = serviceAmpsOf(p);
  const min83 = dwellingMinAmpacity(rating);
  const minAmpacity = min83 ?? rating;
  return {
    rating,
    minAmpacity,
    uses83: min83 != null,
    ref: min83 != null ? dwellingConductorRef(p.necEdition) : ampacityTableRef(p.necEdition),
    Cu: smallestWireFor('Cu', 'THHN/THWN-2', minAmpacity),
    Al: smallestWireFor('Al', 'XHHW-2', minAmpacity),
  };
}
