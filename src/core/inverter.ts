import type { Breaker, Circuit, Panel, Phase, Project } from './types';
import { legLoads } from './balance';
import { backfedBreakers } from './generator';
import { breakerFor, feederCalc, panelStandardMethod } from './feeder';
import { calculateLoads, collectItems } from './loadcalc';
import { findBreaker, isServicePanel, subtreeIds } from './tree';

/**
 * Battery inverter backing up a panel through an interlock (often a critical-loads
 * subpanel). In normal operation the inverter feeds the panel through its back-fed
 * breaker while the interlock holds the main off; the main is the bypass.
 *
 * Everything in the panel, and in any panel it feeds, runs on the inverter. The
 * inverter's grid input is fed by its own breaker, normally in the panel upstream.
 */

/** Motors draw several times their running load for a moment when starting; 3× is a low-end estimate. */
export const MOTOR_START_FACTOR = 3;

export interface InverterCheck {
  /** Continuous output, watts. */
  outputW: number;
  /** Continuous output current at 240 V. */
  outputAmps: number;
  surgeW: number | null;
  /** Surge the inverter and batteries can give together: the lower of the two. Null if the inverter's isn't known. */
  surgeLimitW: number | null;
  /** The batteries, not the inverter, set that limit. */
  surgeByBattery: boolean;
  /** The back-fed inverter breaker in this panel, if placed. */
  breaker: Breaker | null;
  breakerAmps: number | null;
  /** Smallest standard breaker at 125% of the continuous output current. */
  minBreaker: number | null;
  /** Connected load of the panel and its subpanels. */
  connectedVA: number;
  legVA: Record<Phase, number>;
  /** Article 220 load: the panel's feeder calculation, or the service calculation for a service panel. */
  calcVA: number;
  /** Largest motor or AC load on the inverter, at its running load. */
  largestMotor: { name: string; va: number } | null;
}

/**
 * Article 220 load of a panel: its feeder (or service) calculation; until that has what it
 * needs (a whole-house feeder needs the living area), the standard method over its own circuits.
 */
function panelCalcVA(p: Project, panel: Panel): number {
  let calc: number | null = null;
  if (panel.feed) {
    calc = feederCalc(p, panel).method?.totalVA ?? null;
  } else if (isServicePanel(p, panel)) {
    // The inverter doesn't carry its own battery charging.
    const own = panel.interlock?.inverter.gridBreakerId;
    const r = calculateLoads(p, (i) => i.loadType === 'inverter-input' && i.breakerId === own);
    calc = r.ctx.area > 0 && r.best ? r.best.totalVA : null;
  }
  return calc ?? panelStandardMethod(p, panel).totalVA;
}

export function inverterCheck(p: Project, panel: Panel): InverterCheck | null {
  const il = panel.interlock;
  if (!il || il.kind !== 'inverter') return null;
  const outputW = Math.max(0, il.generatorWatts);
  const outputAmps = outputW / 240;
  const breaker = backfedBreakers(panel)[0] ?? null;
  const legs = legLoads(p, panel);

  const inside = subtreeIds(p, panel.id);
  const motors = collectItems(p).filter(
    (i) => i.source === 'circuit' && inside.has(i.panelId!) && (i.category === 'motor' || i.category === 'cooling') && i.va > 0,
  );
  const top = motors.reduce<(typeof motors)[number] | null>((m, i) => (m == null || i.va > m.va ? i : m), null);

  const surgeW = il.surgeWatts && il.surgeWatts > 0 ? il.surgeWatts : null;
  const batterySurge = il.inverter.dischargeSurgeWatts ? il.inverter.dischargeSurgeWatts * (il.inverter.efficiencyPct / 100) : null;
  const surgeByBattery = surgeW != null && batterySurge != null && batterySurge < surgeW;

  return {
    outputW,
    outputAmps,
    surgeW,
    surgeLimitW: surgeByBattery ? batterySurge : surgeW,
    surgeByBattery,
    breaker,
    breakerAmps: breaker?.circuits[0]?.amps ?? null,
    minBreaker: outputAmps > 0 ? breakerFor(outputAmps * 1.25) : null,
    connectedVA: legs.totalVA,
    legVA: legs.va,
    calcVA: panelCalcVA(p, panel),
    largestMotor: top ? { name: top.name, va: top.va } : null,
  };
}

// ---- Grid input ------------------------------------------------------------

export interface GridInputCheck {
  /** The panel the grid-input breaker is in. */
  panel: Panel;
  breaker: Breaker;
  circuit: Circuit;
  breakerAmps: number;
  /** Most the inverter draws from the grid to charge its batteries (the circuit's load). */
  chargeVA: number;
  /** Panel load passed through from the grid (Article 220); 0 if the inverter doesn't pass grid through. */
  passVA: number;
  /** The inverter's AC input limit. */
  limitAmps: number | null;
  /** The inverter slows charging to stay within the limit. */
  throttles: boolean;
  /** Charging plus pass-through at 240 V, before the input limit. */
  wantAmps: number;
  /** The pass-through and charging current the inverter takes, held to its input limit if it does that itself. */
  passAmps: number;
  chargeAmps: number;
  drawAmps: number;
  /** Pass-through plus 125% of charging, which is a continuous load. */
  minAmps: number;
  minBreaker: number | null;
  /** Most charging power that fits alongside the pass-through load, within the input limit and the breaker at 125%. */
  roomForChargingVA: number;
  /** The breaker is in a panel the inverter itself backs up: a loop. */
  loop: boolean;
}

/**
 * The grid-input breaker of an inverter-backed panel and what it carries. Null if there
 * is none, it was deleted, or its load type was changed to something else.
 */
export function gridInputCheck(p: Project, panel: Panel): GridInputCheck | null {
  const il = panel.interlock;
  if (!il || il.kind !== 'inverter' || !il.inverter.gridBreakerId) return null;
  const found = findBreaker(p, il.inverter.gridBreakerId);
  const circuit = found?.breaker.circuits[0];
  if (!found || !circuit || circuit.loadType !== 'inverter-input') return null;

  const loop = subtreeIds(p, panel.id).has(found.panel.id);
  const chargeVA = Math.max(0, circuit.loadVA || 0);
  const passVA = il.inverter.passThrough && !loop ? panelCalcVA(p, panel) : 0;
  const limit = il.inverter.gridInputAmps;
  const cap = limit != null && il.inverter.throttlesInput ? limit : Infinity;
  const wantPass = passVA / 240;
  const room = Math.min(limit != null ? limit - wantPass : Infinity, (circuit.amps - wantPass) / 1.25);
  const passAmps = Math.min(wantPass, cap);
  const chargeAmps = Math.min(chargeVA / 240, Math.max(0, cap - passAmps));
  const minAmps = passAmps + chargeAmps * 1.25;
  return {
    panel: found.panel,
    breaker: found.breaker,
    circuit,
    breakerAmps: circuit.amps,
    chargeVA,
    passVA,
    limitAmps: limit,
    throttles: il.inverter.throttlesInput,
    wantAmps: (chargeVA + passVA) / 240,
    passAmps,
    chargeAmps,
    drawAmps: passAmps + chargeAmps,
    minAmps,
    minBreaker: minAmps > 0 ? breakerFor(minAmps) : null,
    roomForChargingVA: Math.max(0, room) * 240,
    loop,
  };
}

/** The inverter-backed panel whose inverter this breaker feeds, if any. */
export const inverterFedBy = (p: Project, breakerId: string): Panel | undefined =>
  p.panels.find((x) => x.interlock?.kind === 'inverter' && x.interlock.inverter.gridBreakerId === breakerId);

/** Automatic label for a grid-input breaker. */
export const gridInputLabel = (panelName: string): string => `Inverter grid input (${panelName || 'panel'})`;
