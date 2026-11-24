import type { Breaker, Circuit, Panel, Project } from './types';
import { acceptsTandem, circuitNumber, polesUsed, spacesOf } from './panel';
import { checkWire, largestRatingAtMost, sizeForVoltageDrop, sizeLabel, voltageDrop, wireLabel } from './wire';
import { legLoads } from './balance';
import { circuitRows, type CircuitRow } from './circuits';
import { LOCATION_LABELS, PROTECTION_BADGE } from './labels';
import { feederOf, isServicePanel, panelOrder, panelRating, upstreamChain } from './tree';
import { backfedBreakers, generatorLoad, interlockSpace, isBackfedType, sourceName } from './generator';
import { gridInputCheck, inverterCheck, inverterFedBy, MOTOR_START_FACTOR, type InverterCheck } from './inverter';
import { calculateLoads, cookingDemandVA } from './loadcalc';
import { chargeAmpsFor } from './equipment';
import { batteryModel, inverterModel } from '../data/equipment';
import { feederCalcs, type FeederCalc } from './feeder';
import {
  afciExtensionRef, afciRule, allowsThreeWireBuildingFeeder, ampacityTableRef, backfedRef, directoryRef, dwellingConductorRef, editionYear,
  energyStorageRef, gfciScope, has42CircuitLimit, needsGeneratorShutdown, standbyCapacityRef, standbySignRef, transferRef, voltageDropRef,
} from './editions';

/**
 * error   – definitely wrong (won't fit, wire too small, overloaded)
 * warning – likely a problem or relies on an exception
 * check   – may be required by code; confirm (often depends on local amendments)
 * info    – worth knowing
 */
export type Severity = 'error' | 'warning' | 'check' | 'info';
export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, check: 2, info: 3 };

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  message: string;
  /** NEC reference, e.g. "210.12(A)". */
  ref?: string;
  /** Short location text, e.g. "Ckt 5 · Kitchen countertop". */
  where?: string;
  panelId?: string;
  breakerId?: string;
  circuitId?: string;
}

type Push = (f: Omit<Finding, 'id'>) => void;

interface Ctx {
  p: Project;
  push: Push;
  multi: boolean;
  feeders: Map<string, FeederCalc>;
}

const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return (Math.round(n * f) / f).toLocaleString('en-US');
};

export function validateProject(p: Project): Finding[] {
  const out: Finding[] = [];
  const push: Push = (f) => out.push({ id: `${f.rule}#${out.length}`, ...f });
  const ctx: Ctx = { p, push, multi: p.panels.length > 1, feeders: feederCalcs(p) };
  for (const panel of panelOrder(p)) validatePanel(ctx, panel);
  validateLoadCalc(p, push);
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function validatePanel(ctx: Ctx, panel: Panel): void {
  const { p, push } = ctx;
  const name = panel.name || 'Panel';
  const prefix = ctx.multi ? `${name} · ` : '';
  const at = { panelId: panel.id, where: ctx.multi ? name : undefined };
  const service = isServicePanel(p, panel);

  // ---- Panel ---------------------------------------------------------------
  if (!Number.isInteger(panel.spaces) || panel.spaces < 2 || panel.spaces % 2 !== 0) {
    push({ ...at, rule: 'panel-spaces', severity: 'error', message: `Number of spaces should be an even number (currently ${panel.spaces}).` });
  }
  if (panel.maxCircuits < panel.spaces) {
    push({
      ...at,
      rule: 'panel-max-circuits',
      severity: 'warning',
      message: `Max circuits (${panel.maxCircuits}) is less than the number of spaces (${panel.spaces}). Check the panel label.`,
    });
  }
  if (panel.mainType === 'main-breaker') {
    if (panel.mainAmps == null) {
      push({ ...at, rule: 'main-missing', severity: 'warning', message: 'Main breaker rating is not set.' });
    } else if (panel.mainAmps > panel.busAmps) {
      push({
        ...at,
        rule: 'main-over-bus',
        severity: 'error',
        message: `Main breaker (${panel.mainAmps} A) is larger than the bus rating (${panel.busAmps} A).`,
        ref: '408.36',
      });
    }
  } else if (service) {
    push({
      ...at,
      rule: 'main-lug',
      severity: 'info',
      message: `Main-lug panel: protect it with an upstream breaker rated no more than the ${panel.busAmps} A bus.`,
      ref: '408.36',
    });
  }
  const poles = polesUsed(panel.breakers);
  if (poles > panel.maxCircuits) {
    push({
      ...at,
      rule: 'too-many-circuits',
      severity: 'error',
      message: `${poles} circuits are installed but the panel is listed for ${panel.maxCircuits}.`,
      ref: '408.54',
    });
  }
  if (has42CircuitLimit(p.necEdition) && poles > 42) {
    push({
      ...at,
      rule: 'panel-42',
      severity: 'error',
      message: `${poles} circuits (poles) in one panel. The ${p.necEdition} NEC allows no more than 42 in a lighting and appliance panelboard; the limit was dropped in 2008.`,
      ref: '408.35',
    });
  }

  validateFeed(ctx, panel, at);
  validateInterlock(ctx, panel, at, prefix);

  // ---- Breakers ------------------------------------------------------------
  const taken = new Map<number, Breaker>();
  for (const b of panel.breakers) {
    const spaces = spacesOf(b.form, b.space);
    const where = `${prefix}Space ${spaces.join(',')}`;
    const bat = { panelId: panel.id, breakerId: b.id, where };
    if (spaces.some((s) => s < 1 || s > panel.spaces)) {
      push({ ...bat, rule: 'out-of-range', severity: 'error', message: `Breaker sits outside the panel's ${panel.spaces} spaces. Move or delete it.` });
    }
    const clash = spaces.find((s) => taken.has(s));
    if (clash !== undefined) {
      push({ ...bat, rule: 'overlap', severity: 'error', message: `Overlaps another breaker at space ${clash}.` });
    }
    for (const s of spaces) if (!taken.has(s)) taken.set(s, b);

    const halfSize = b.form === 'tandem' || b.form === 'quad';
    if (halfSize && spaces.some((s) => s >= 1 && s <= panel.spaces && !acceptsTandem(panel, s))) {
      push({
        ...bat,
        rule: 'tandem-space',
        severity: 'error',
        message: `This space doesn't accept ${b.form} breakers on this panel. The panel label shows which spaces take them.`,
        ref: '110.3(B)',
      });
    }
    if (halfSize && b.protection !== 'standard') {
      push({
        ...bat,
        rule: 'tandem-protection',
        severity: 'warning',
        message: `${PROTECTION_BADGE[b.protection]} ${b.form} breakers are rare or unavailable for most panel lines. Check availability.`,
      });
    }
  }
  for (const row of circuitRows(p, panel)) checkCircuit(ctx, row, prefix);

  // ---- Panel summaries -----------------------------------------------------
  const circuits = panel.breakers.flatMap((b) => b.circuits);
  const isSpare = (c: Circuit) => /^spare\b/i.test(c.label.trim());
  const noWire = circuits.filter((c) => !c.wire && !isSpare(c)).length;
  if (noWire > 0) {
    push({
      ...at,
      rule: 'no-wire',
      severity: 'info',
      message: `${noWire} circuit${noWire === 1 ? ' has' : 's have'} no wire size entered, so wire checks were skipped.`,
    });
  }
  const movedIn = panel.breakers.filter((b) => b.movedFrom && b.movedFrom.panelId !== panel.id);
  if (movedIn.length > 0) {
    const from = [...new Set(movedIn.map((b) => p.panels.find((x) => x.id === b.movedFrom!.panelId)?.name || 'another panel'))];
    const afciRef = afciExtensionRef(p.necEdition);
    push({
      ...at,
      rule: 'moved-circuits',
      severity: 'info',
      message:
        `${movedIn.length} existing circuit${movedIn.length === 1 ? '' : 's'} move${movedIn.length === 1 ? 's' : ''} here from ${from.join(' and ')}. ` +
        "Where the old conductors don't reach, extend them with splices in a junction box or in the panel enclosure (within its fill limits)." +
        (afciRef ? ' An extension longer than 6 ft brings the circuit under the AFCI rules for the room it serves.' : ''),
      ref: afciRef ? `312.8, ${afciRef}` : '312.8',
    });
  }
  const unlabeled = circuits.filter((c) => !c.label.trim()).length;
  if (unlabeled > 0) {
    push({
      ...at,
      rule: 'no-label',
      severity: 'warning',
      message: `${unlabeled} circuit${unlabeled === 1 ? ' has' : 's have'} no description. Every circuit must be clearly identified in the panel directory.`,
      ref: directoryRef(p.necEdition),
    });
  }

  const legs = legLoads(p, panel);
  if (legs.totalVA >= 2000 && legs.imbalancePct > 25) {
    const light = legs.va.L1 < legs.va.L2 ? 'L1' : 'L2';
    push({
      ...at,
      rule: 'imbalance',
      severity: 'info',
      message: `Legs are unbalanced: L1 ${round(legs.va.L1, 0)} VA vs L2 ${round(legs.va.L2, 0)} VA (${round(legs.imbalancePct, 0)}% apart). Move some 120 V circuits to ${light} rows.`,
    });
  }
  const heaviest = Math.max(legs.amps.L1, legs.amps.L2);
  if (service && p.loadCalc.floorAreaFt2 <= 0 && heaviest > panelRating(panel)) {
    push({
      ...at,
      rule: 'connected-load',
      severity: 'info',
      message: `Connected load reaches ${round(heaviest, 0)} A on one leg, above the ${panelRating(panel)} A rating. Connected load overstates real demand: enter the floor area on the Load calc tab for an Article 220 calculation.`,
      ref: 'Article 220',
    });
  }
}

function validateFeed(ctx: Ctx, panel: Panel, at: { panelId: string; where?: string }): void {
  const { p, push } = ctx;
  const where = panel.name || 'Subpanel';
  if (panel.feed) {
    const feeder = feederOf(p, panel);
    if (!feeder) {
      push({
        ...at,
        where,
        rule: 'feed-missing',
        severity: 'error',
        message: "This subpanel's feeder breaker no longer exists. Choose a feeder breaker in the panel settings.",
      });
    } else {
      if (upstreamChain(p, panel).loop) {
        push({ ...at, where, rule: 'feed-loop', severity: 'error', message: 'Panels feed each other in a loop. Pick a different feeder breaker.' });
      }
      const fb = feeder.breaker;
      const fa = fb.circuits[0]?.amps ?? 0;
      if (fb.form !== 'double') {
        push({ ...at, where, rule: 'feed-form', severity: 'error', message: 'A subpanel feeder needs a 2-pole breaker (240 V).' });
      }
      if (panel.mainType === 'main-lug' && fa > panel.busAmps) {
        push({
          ...at,
          where,
          rule: 'feed-over-bus',
          severity: 'error',
          message: `The ${fa} A feeder breaker is larger than this subpanel's ${panel.busAmps} A bus.`,
          ref: '408.36',
        });
      }
      push({
        ...at,
        where,
        rule: 'subpanel-bonding',
        severity: 'info',
        message: 'Subpanel: run a 4-wire feeder (two hots, neutral, ground), keep neutrals and grounds on separate bars, and leave the bonding screw out.',
        ref: '250.24(A)(5)',
      });
      const fc = ctx.feeders.get(panel.id);
      if (fc?.method && fa > 0 && fc.amps > fa + 1e-9) {
        push({
          ...at,
          where,
          rule: 'feeder-load',
          severity: 'warning',
          message: `Calculated load on this feeder is ${round(fc.amps)} A (${fc.wholeHouse ? `“${fc.method.title}”` : 'Article 220 standard method'}), more than the ${fa} A feeder breaker.${fc.minBreaker ? ` It needs at least ${fc.minBreaker} A.` : ''}`,
          ref: fc.wholeHouse ? fc.method.ref : '215.2(A)(1), 220.40',
        });
      }
    }
  }
  if (panel.separateBuilding) {
    push({
      ...at,
      where,
      rule: 'separate-building',
      severity: 'check',
      message:
        'A detached building needs its own grounding electrode system and a disconnecting means at the building.' +
        (allowsThreeWireBuildingFeeder(p.necEdition)
          ? ' The 2005 NEC still allowed a 3-wire feeder (neutral bonded at the building) where no metal water pipe or other metal path connects the buildings; new work under later editions needs a 4-wire feeder.'
          : ''),
      ref: allowsThreeWireBuildingFeeder(p.necEdition) ? '250.32(B)(2), 225.31' : '250.32, 225.31',
    });
    if (panel.mainType === 'main-lug') {
      push({
        ...at,
        where,
        rule: 'separate-building-disconnect',
        severity: 'warning',
        message: 'Main-lug panel in a separate building: add a disconnect, or use a main-breaker panel as the building disconnect.',
        ref: '225.31',
      });
    }
  }
}

function validateInterlock(ctx: Ctx, panel: Panel, at: { panelId: string; where?: string }, prefix: string): void {
  const { p, push } = ctx;
  const ed = p.necEdition;
  const gens = backfedBreakers(panel);
  const il = panel.interlock;
  if (!il) {
    for (const b of gens) {
      push({
        panelId: panel.id,
        breakerId: b.id,
        where: `${prefix}Space ${spacesOf(b.form, b.space).join(',')}`,
        rule: 'generator-no-interlock',
        severity: 'error',
        message: 'Back-fed generator or inverter breaker with no interlock. Without an interlock or transfer switch the backup source can energize the utility lines. Turn on the interlock in the panel settings.',
        ref: transferRef(ed),
      });
    }
    return;
  }
  const src = sourceName(il);
  const Src = src[0].toUpperCase() + src.slice(1);
  const where = `${prefix}${Src} interlock`;
  const base = { ...at, where };
  const required = interlockSpace(il.side);
  if (panel.mainType !== 'main-breaker') {
    push({
      ...base,
      rule: 'interlock-no-main',
      severity: 'error',
      message: `An interlock slides between the main breaker and the ${src} breaker, so this panel needs a main breaker. Otherwise use a transfer switch.`,
      ref: transferRef(ed),
    });
  }
  if (gens.length === 0) {
    push({
      ...base,
      rule: 'interlock-no-breaker',
      severity: 'warning',
      message: `No ${src} breaker yet. Add a 2-pole breaker at spaces ${required},${required + 2} with the load type "${il.kind === 'inverter' ? 'Inverter output' : 'Generator'} (back-fed)".`,
    });
  }
  if (gens.length > 1) {
    push({ ...base, rule: 'interlock-multiple', severity: 'error', message: 'Only one back-fed breaker can be interlocked with the main.' });
  }
  for (const gb of gens) {
    const gat = { panelId: panel.id, breakerId: gb.id, where: `${prefix}${Src} breaker` };
    if (gb.form !== 'double') {
      push({ ...gat, rule: 'generator-form', severity: 'error', message: `The ${src} breaker must be a 2-pole breaker so it feeds both legs.` });
    }
    if (gb.space !== required) {
      push({
        ...gat,
        rule: 'interlock-position',
        severity: 'error',
        message: `Interlock kits hold the ${src} breaker in the first spaces beside the main (${required},${required + 2} for this kit). Move it there or switch the interlock side.`,
        ref: '110.3(B)',
      });
    }
    const amps = gb.circuits[0]?.amps ?? 0;
    if (il.kind === 'portable' && il.inletAmps && amps > il.inletAmps) {
      push({ ...gat, rule: 'generator-inlet', severity: 'error', message: `Generator breaker (${amps} A) is larger than the ${il.inletAmps} A power inlet.` });
    }
  }
  push({
    ...base,
    rule: 'interlock-install',
    severity: 'check',
    message:
      il.kind === 'inverter'
        ? 'Use an interlock kit listed for this panel model, secure the back-fed inverter breaker with a hold-down kit, and post a sign at the service equipment saying a battery inverter backs up this panel and where it is.'
        : 'Use an interlock kit listed for this panel model, secure the back-fed breaker with a hold-down kit, and post a sign at the service equipment showing the generator type and location.',
    ref: `${transferRef(ed)}, ${backfedRef(ed)}, ${standbySignRef(ed)}`,
  });
  if (il.kind === 'inverter') {
    validateInverter(ctx, panel, base);
    return;
  }
  if (il.kind === 'standby' && needsGeneratorShutdown(ed)) {
    push({
      ...base,
      rule: 'generator-shutdown',
      severity: 'check',
      message: 'A permanently installed generator needs an emergency shutdown device outside the house.',
      ref: '445.18(D)',
    });
  }

  const load = generatorLoad(p, panel);
  if (load.circuits === 0) {
    push({
      ...base,
      rule: 'generator-loads',
      severity: 'info',
      message: 'Mark the circuits you plan to run on the generator ("On generator" in each circuit) to check them against its rating.',
    });
    return;
  }
  if (load.totalVA > il.generatorWatts) {
    push({
      ...base,
      rule: 'generator-overload',
      severity: 'warning',
      message: `Circuits marked for the generator total ${round(load.totalVA, 0)} VA, more than its ${round(il.generatorWatts, 0)} W running rating. Plan to switch some off while on generator.`,
    });
  }
  const half = il.generatorWatts / 2;
  for (const leg of ['L1', 'L2'] as const) {
    if (load.legVA[leg] > half) {
      push({
        ...base,
        rule: 'generator-leg',
        severity: 'warning',
        message: `${leg} carries ${round(load.legVA[leg], 0)} VA of the generator load, more than half the generator's rating (${round(half, 0)} W per leg). Move some 120 V generator circuits to the other leg.`,
      });
    }
  }
}

/** Loads of an inverter-backed panel against the inverter's continuous, per-leg and surge ratings, and its breaker size. */
function validateInverter(ctx: Ctx, panel: Panel, base: { panelId: string; where: string }): void {
  const { p, push } = ctx;
  const inv = inverterCheck(p, panel);
  if (!inv) return;
  validateGridInput(ctx, panel, base);
  validateBattery(ctx, panel, base, inv);
  if (inv.outputW <= 0) {
    push({ ...base, rule: 'inverter-rating', severity: 'info', message: "Enter the inverter's continuous output (W) in the panel settings to check its loads." });
    return;
  }
  const out = inv.outputW;
  if (inv.calcVA > out) {
    push({
      ...base,
      rule: 'inverter-load',
      severity: 'warning',
      message: `The calculated load on this panel is ${round(inv.calcVA, 0)} VA (Article 220), more than the inverter's ${round(out, 0)} W continuous output. On battery, keep some loads off (you may choose which), or use a larger inverter.`,
      ref: standbyCapacityRef(p.necEdition),
    });
  } else if (inv.connectedVA > out) {
    push({
      ...base,
      rule: 'inverter-connected',
      severity: 'info',
      message: `Everything on this panel adds up to ${round(inv.connectedVA, 0)} VA, more than the inverter's ${round(out, 0)} W. That's fine as long as it doesn't all run at once; the calculated load (${round(inv.calcVA, 0)} VA) fits.`,
    });
  }
  for (const leg of ['L1', 'L2'] as const) {
    if (inv.legVA[leg] > out / 2) {
      push({
        ...base,
        rule: 'inverter-leg',
        severity: 'info',
        message: `${leg} has ${round(inv.legVA[leg], 0)} VA connected, more than half the inverter's output (${round(out / 2, 0)} W per leg on most split-phase inverters). Balance 120 V circuits between the legs.`,
      });
    }
  }
  const m = inv.largestMotor;
  if (m && inv.surgeW == null) {
    push({ ...base, rule: 'inverter-surge', severity: 'info', message: `Enter the inverter's surge rating to check that it can start the ${m.name} and other motors.` });
  } else if (m && inv.surgeLimitW != null && inv.surgeLimitW < m.va * MOTOR_START_FACTOR) {
    push({
      ...base,
      rule: 'inverter-surge',
      severity: 'warning',
      message: `Starting the ${m.name} (${round(m.va, 0)} VA running) can take 3 to 6 times its running load, about ${round(m.va * MOTOR_START_FACTOR, 0)} VA or more, beyond ${inv.surgeByBattery ? `the ${round(inv.surgeLimitW, 0)} W the batteries can deliver for a moment` : `the inverter's ${round(inv.surgeLimitW, 0)} W surge rating`}. Compare its locked-rotor amps (LRA), ${inv.surgeByBattery ? 'add batteries' : "check the inverter's surge current"}, or add a soft starter.`,
    });
  }
  if (inv.breaker && inv.breakerAmps != null) {
    const bat = { panelId: panel.id, breakerId: inv.breaker.id, where: base.where.replace(/interlock$/, 'breaker') };
    const max = panel.interlock!.inverter.acBreakerAmps;
    if (max && inv.breakerAmps > max) {
      push({
        ...bat,
        rule: 'inverter-breaker-max',
        severity: 'warning',
        message: `The ${inv.breakerAmps} A inverter breaker is larger than the ${round(max)} A breaker the inverter's manual calls for on its AC output. Use ${largestRatingAtMost(max) ?? max} A.`,
        ref: '110.3(B)',
      });
    }
    if (inv.breakerAmps < inv.outputAmps) {
      push({
        ...bat,
        rule: 'inverter-breaker',
        severity: 'warning',
        message: `The ${inv.breakerAmps} A inverter breaker is smaller than the inverter's ${round(inv.outputAmps)} A continuous output, so it would trip before the inverter reaches its rating.`,
        ref: '110.3(B)',
      });
    } else if (inv.breakerAmps < inv.outputAmps * 1.25 - 1e-9) {
      push({
        ...bat,
        rule: 'inverter-breaker',
        severity: 'check',
        message: `Inverter output breakers are usually at least 125% of the continuous output current (${round(inv.outputAmps)} A × 1.25 = ${round(inv.outputAmps * 1.25)} A${inv.minBreaker ? `, so ${inv.minBreaker} A` : ''}). Use the size the inverter's manual gives.`,
        ref: '110.3(B)',
      });
    }
  }
}

/** The inverter's grid-input breaker against charging and pass-through, and how the two paths to the panel share a neutral. */
function validateGridInput(ctx: Ctx, panel: Panel, base: { panelId: string; where: string }): void {
  const { p, push } = ctx;
  const g = gridInputCheck(p, panel);
  if (!g) return;
  const at = {
    panelId: g.panel.id,
    breakerId: g.breaker.id,
    circuitId: g.circuit.id,
    where: `${ctx.multi ? `${g.panel.name || 'Panel'} · ` : ''}Ckt ${circuitNumber(g.breaker, 0)} · ${g.circuit.label.trim() || 'Inverter grid input'}`,
  };
  const name = panel.name || 'the panel';
  if (g.loop) {
    push({
      ...at,
      rule: 'grid-input-loop',
      severity: 'error',
      message: `The inverter would feed its own grid input: this breaker is in a panel the inverter backs up (${name}). Move it to the panel upstream.`,
    });
    return;
  }
  if (g.breaker.form !== 'double') {
    push({ ...at, rule: 'grid-input-form', severity: 'error', message: 'A 120/240 V inverter needs a 2-pole breaker for its grid input.' });
  }
  if (g.chargeVA <= 0) {
    push({
      ...at,
      rule: 'grid-input-load',
      severity: 'info',
      message: "Enter the inverter's grid charging power as this circuit's load, so the service calculation includes it.",
    });
  }
  const s = panel.interlock!.inverter;
  const model = inverterModel(s.modelId);
  const parts = g.passVA > 0 ? `${round(g.passAmps)} A passed through to ${name} and ${round(g.chargeAmps)} A of charging` : `${round(g.chargeAmps)} A of charging`;
  const room = `Up to ${round(Math.floor(g.roomForChargingVA / 100) * 100, 0)} W of charging fits${model ? ` (${model.gridCharge.setting}: up to ${chargeAmpsFor(model, g.roomForChargingVA)} A)` : ''}.`;
  if (g.limitAmps != null && g.passVA / 240 > g.limitAmps) {
    push({
      ...at,
      rule: 'grid-input-limit',
      severity: 'warning',
      message: `The calculated load of ${name} is ${round(g.passVA / 240)} A, more than the ${round(g.limitAmps)} A this inverter can pass through from the grid. Move some loads out of the panel, or use a larger inverter.`,
      ref: '110.3(B)',
    });
  } else if (g.limitAmps != null && g.wantAmps > g.limitAmps + 1e-9) {
    push({
      ...at,
      rule: 'grid-input-limit',
      severity: g.throttles ? 'info' : 'warning',
      message:
        `Panel load and full charging together want ${round(g.wantAmps)} A, more than the inverter's ${round(g.limitAmps)} A grid input. ` +
        (g.throttles ? 'Charging slows down when the panel is busy.' : `Set a lower charging power in the inverter. ${room}`),
      ref: g.throttles ? undefined : '110.3(B)',
    });
  }
  if (s.acBreakerAmps && g.breakerAmps > s.acBreakerAmps) {
    push({
      ...at,
      rule: 'grid-input-max',
      severity: 'warning',
      message: `This ${g.breakerAmps} A breaker is larger than the ${round(s.acBreakerAmps)} A breaker the inverter's manual calls for on its AC input. Use ${largestRatingAtMost(s.acBreakerAmps) ?? s.acBreakerAmps} A.`,
      ref: '110.3(B)',
    });
  }
  if (g.drawAmps > g.breakerAmps + 1e-9) {
    push({
      ...at,
      rule: 'grid-input-breaker',
      severity: 'warning',
      message:
        `This ${g.breakerAmps} A breaker can be asked for ${round(g.drawAmps)} A (${parts}), so it may trip.` +
        (g.minBreaker && (!s.acBreakerAmps || g.minBreaker <= s.acBreakerAmps)
          ? ` Use at least ${g.minBreaker} A if the inverter's grid input is rated for it, or lower the charging power. ${room}`
          : ` Lower the charging power in the inverter's settings. ${room}`),
      ref: '110.3(B)',
    });
  } else if (g.minAmps > g.breakerAmps + 1e-9) {
    push({
      ...at,
      rule: 'grid-input-breaker',
      severity: 'warning',
      message:
        `Battery charging can run for hours, so it counts at 125%: ${parts} need a breaker of at least ${round(g.minAmps)} A` +
        (g.minBreaker && (!s.acBreakerAmps || g.minBreaker <= s.acBreakerAmps) ? ` (${g.minBreaker} A standard size)` : '') +
        `, or a lower charging power. ${room}`,
      ref: '210.20(A)',
    });
  }
  if (panel.feed) {
    push({
      ...base,
      rule: 'inverter-neutral',
      severity: 'check',
      message:
        `Both the bypass feeder and the inverter (with its own grid input) connect ${name} back to the service, and the interlock doesn't switch the neutral. ` +
        "Wire the neutrals the way the inverter manual shows so they don't run in parallel, and keep a single neutral-to-ground bond, at the service." +
        (model ? ` ${model.neutralNote}` : ''),
      ref: '250.6, 250.24(A)(5)',
    });
  }
  if (model && !model.exports) return; // the manual shows no way to feed the grid
  push({
    ...at,
    rule: 'grid-input-export',
    severity: 'info',
    message: `If this inverter can also send power back out its grid input, it needs utility approval to interconnect, and the bus of ${g.panel.name || 'this panel'} has to be checked for a back-fed source.`,
    ref: 'Article 705',
  });
}

/** Battery output against the inverter, and the battery installation itself. */
function validateBattery(ctx: Ctx, panel: Panel, base: { panelId: string; where: string }, inv: InverterCheck): void {
  const { p, push } = ctx;
  const s = panel.interlock!.inverter;
  const where = base.where.replace(/Inverter interlock$/, 'Battery');
  if (s.dischargeWatts && inv.outputW > 0) {
    const acW = s.dischargeWatts * (s.efficiencyPct / 100);
    if (acW < inv.outputW) {
      push({
        ...base,
        where,
        rule: 'battery-discharge',
        severity: inv.calcVA > acW ? 'warning' : 'info',
        message:
          `The batteries deliver ${round(s.dischargeWatts, 0)} W continuously, about ${round(acW, 0)} W after inverter losses, less than the inverter's ${round(inv.outputW, 0)} W output. ` +
          (inv.calcVA > acW
            ? `The calculated load on this panel is ${round(inv.calcVA, 0)} VA, so add batteries or keep some loads off.`
            : `That still covers the calculated load on this panel (${round(inv.calcVA, 0)} VA).`),
      });
    }
  }
  const battery = batteryModel(s.batteryModelId);
  if (battery && battery.listing == null) {
    push({
      ...base,
      where,
      rule: 'battery-listing',
      severity: 'check',
      message: `The manual for the ${battery.name} doesn't state a UL 9540 or UL 1973 listing. Ask the seller for the certificate before buying: most permit offices want to see it.`,
      ref: energyStorageRef(p.necEdition),
    });
  }
  if (s.batteryKWh) {
    push({
      ...base,
      where,
      rule: 'battery-install',
      severity: 'check',
      message:
        'Battery installation: use a listed system (UL 9540), keep a readily accessible shutoff (in newer codes, outside the house), and follow the building code on location, spacing and size. ' +
        'The 2021 residential code (IRC R328) allows up to 20 kWh per unit, and 40 kWh (utility and storage spaces) or 80 kWh (garages, outdoors) in total.' +
        (s.batteryKWh > 40 ? ` This battery is ${round(s.batteryKWh)} kWh.` : ''),
      ref: energyStorageRef(p.necEdition),
    });
  }
}

function checkCircuit(ctx: Ctx, row: CircuitRow, prefix: string): void {
  const { p, push } = ctx;
  const { panel, breaker: b, circuit: c, volts } = row;
  const label = c.label.trim();
  const base = {
    where: `${prefix}Ckt ${row.number}${label ? ` · ${label}` : ''}`,
    panelId: panel.id,
    breakerId: b.id,
    circuitId: c.id,
  };
  const isGenerator = isBackfedType(c.loadType);
  const table = ampacityTableRef(p.necEdition);

  if (c.amps > panel.busAmps) {
    push({ ...base, rule: 'breaker-over-bus', severity: 'error', message: `${c.amps} A breaker is larger than the ${panel.busAmps} A bus.` });
  }

  // A subpanel feeder is checked against its Article 220 feeder calculation instead.
  const fc = row.feeds ? ctx.feeders.get(row.feeds.id) : undefined;
  if (row.feeds) {
    if (fc) checkFeeder(ctx, fc, c, base);
    return;
  }

  // ---- Load vs breaker ----
  // Ranges and cooktops may use their Table 220.55 demand for the branch circuit (210.19(A)(3)).
  const cooking = c.loadType === 'range' || c.loadType === 'cooktop-oven';
  const branchVA = cooking ? cookingDemandVA([c.loadVA]) : c.loadVA;
  // An inverter's grid input also carries whatever it passes through; its breaker is checked in validateGridInput.
  const backed = c.loadType === 'inverter-input' ? inverterFedBy(p, b.id) : undefined;
  const grid = backed ? gridInputCheck(p, backed) : null;
  if (c.loadType === 'inverter-input' && !backed) {
    push({
      ...base,
      rule: 'grid-input-unlinked',
      severity: 'info',
      message: "This inverter grid input isn't tied to a panel yet. Pick it under Backup power in the settings of the panel the inverter backs up.",
    });
  }
  const loadA = grid ? grid.drawAmps : branchVA > 0 ? branchVA / volts : 0;
  if (grid) {
    // Checked with the inverter.
  } else if (loadA > c.amps) {
    push({ ...base, rule: 'overload', severity: 'error', message: `Load of ${round(loadA)} A is more than the ${c.amps} A breaker.` });
  } else if (c.continuous && loadA * 1.25 > c.amps + 1e-9) {
    push({
      ...base,
      rule: 'continuous',
      severity: 'warning',
      message: `Continuous load of ${round(loadA)} A needs a breaker of at least ${round(loadA * 1.25)} A (125%).`,
      ref: '210.20(A)',
    });
  }
  if (!c.continuous) {
    const hint =
      c.loadType === 'ev'
        ? { message: 'EV charging is a continuous load. Size the breaker at 125% of the charger current.', ref: 'Article 625' }
        : c.loadType === 'water-heater'
          ? { message: 'Storage water heaters (120 gal or less) count as continuous loads (125%).', ref: '422.13' }
          : c.loadType === 'heat'
            ? { message: 'Fixed electric space heating counts as a continuous load (125%).', ref: 'Article 424' }
            : c.loadType === 'inverter-input' && !grid
              ? { message: 'Battery charging can run for hours, so count it as a continuous load (125%).', ref: '210.20(A)' }
              : null;
    if (hint) push({ ...base, rule: 'continuous-hint', severity: 'info', ...hint });
  }

  // ---- Wire ----
  if (c.wire) {
    const w = wireLabel(c.wire);
    const v = checkWire(c.wire, c.amps, c.loadType, c.servesReceptacles);
    if (v.status === 'undersized') {
      push({
        ...base,
        rule: 'wire-undersized',
        severity: 'error',
        message: `${w} is good for ${largestRatingAtMost(v.limit) ?? v.limit} A max, but the breaker is ${c.amps} A.`,
        ref: `240.4(D), ${table}`,
      });
    } else if (v.status === 'next-size-up') {
      if (loadA > v.limit) {
        push({
          ...base,
          rule: 'wire-undersized',
          severity: 'error',
          message: `Load of ${round(loadA)} A exceeds the ${v.limit} A ampacity of ${w}.`,
          ref: table,
        });
      } else {
        push({
          ...base,
          rule: 'wire-next-size-up',
          severity: 'warning',
          message: `${c.amps} A breaker on ${w} (${v.limit} A) relies on the next-size-up rule. That's OK only if the load stays at or under ${v.limit} A.`,
          ref: '240.4(B)',
        });
      }
    } else if (v.status === 'equipment-mocp') {
      push({
        ...base,
        rule: 'wire-equipment',
        severity: 'check',
        message: `${c.amps} A breaker is above the ${v.limit} A rating of ${w}. That's allowed for AC and motor equipment only if the breaker is within the nameplate maximum (MOCP) and the wire meets the nameplate minimum circuit ampacity (MCA).`,
        ref: '240.4(G), Article 440',
      });
    } else if (v.status === 'unknown') {
      push({ ...base, rule: 'wire-invalid', severity: 'warning', message: `${w} isn't in the ampacity table.` });
    }
    voltageDropFinding(ctx, base, c, loadA, volts);
  }

  if (isGenerator || c.loadType === 'subpanel' || c.loadType === 'inverter-input') return;

  // ---- AFCI ----
  const afci = afciRule(p.necEdition);
  const hasAfci = b.protection === 'afci' || b.protection === 'df';
  if (volts === 120 && c.amps <= 20 && !hasAfci && afci.locations.includes(c.location)) {
    push({
      ...base,
      rule: 'afci',
      severity: 'check',
      message: `120 V 15/20 A circuits in a ${LOCATION_LABELS[c.location].toLowerCase()} likely need AFCI protection (${p.necEdition} NEC). An AFCI or dual-function breaker covers it.`,
      ref: afci.ref,
    });
  }

  // ---- GFCI ----
  const g = gfciRequirement(p, b, c, volts);
  if (g) {
    push({
      ...base,
      rule: 'gfci',
      severity: 'check',
      message: g.message + (b.protection === 'gfep' ? ' A GFEP (30 mA) breaker protects equipment, not people, so it does not count.' : ''),
      ref: g.ref,
    });
  }
}

type Base = { where: string; panelId: string; breakerId: string; circuitId: string };

function voltageDropFinding(ctx: Ctx, base: Base, c: Circuit, amps: number, volts: number): void {
  if (!c.wire || !c.lengthFt || c.lengthFt <= 0 || amps <= 0) return;
  const vd = voltageDrop(c.wire, c.lengthFt, amps, volts);
  if (vd.percent <= 3) return;
  const better = sizeForVoltageDrop(c.wire, c.lengthFt, amps, volts, 3);
  ctx.push({
    ...base,
    rule: 'voltage-drop',
    severity: 'warning',
    message:
      `Estimated voltage drop is ${round(vd.percent)}% (${round(vd.volts)} V) at ${round(amps)} A over ${c.lengthFt} ft.` +
      (better && better !== c.wire.size ? ` ${sizeLabel(better)} would keep it under 3%.` : ''),
    ref: voltageDropRef(ctx.p.necEdition),
  });
}

/** Feeder breaker wire: checked against the breaker and the calculated feeder load. */
function checkFeeder(ctx: Ctx, fc: FeederCalc, c: Circuit, base: Base): void {
  const { p, push } = ctx;
  if (!c.wire) return;
  const w = wireLabel(c.wire);
  const v = fc.wire;
  const table = ampacityTableRef(p.necEdition);
  if (v) {
    if (v.status === 'undersized') {
      push({
        ...base,
        rule: 'wire-undersized',
        severity: 'error',
        message: `${w} (${v.ampacity} A) is too small for the ${c.amps} A feeder breaker.` + (fc.suggested.Cu ? ` Use at least ${sizeLabel(fc.suggested.Cu)} Cu.` : ''),
        ref: `240.4, ${table}`,
      });
    } else if (v.status === 'below-load') {
      push({
        ...base,
        rule: 'wire-undersized',
        severity: 'error',
        message: `${w} (${v.ampacity} A) is smaller than the ${round(fc.amps)} A calculated load on this feeder.`,
        ref: `215.2(A)(1), ${table}`,
      });
    } else if (v.status === 'next-size-up') {
      push({
        ...base,
        rule: 'wire-next-size-up',
        severity: 'info',
        message: `${c.amps} A breaker on ${w} (${v.ampacity} A) uses the next-size-up rule. That's OK here because the calculated feeder load (${round(fc.amps)} A) is within ${v.ampacity} A.`,
        ref: '240.4(B)',
      });
    } else if (v.status === 'dwelling') {
      push({
        ...base,
        rule: 'wire-dwelling',
        severity: 'info',
        message: `${w} (${v.ampacity} A) is sized at 83% of the ${c.amps} A rating, which is allowed because this feeder carries the whole house.`,
        ref: dwellingConductorRef(p.necEdition),
      });
    } else if (v.status === 'unknown') {
      push({ ...base, rule: 'wire-invalid', severity: 'warning', message: `${w} isn't in the ampacity table.` });
    }
  }
  voltageDropFinding(ctx, base, c, fc.amps, 240);
}

function gfciRequirement(p: Project, b: Breaker, c: Circuit, volts: 120 | 240): { message: string; ref: string } | null {
  const atReceptacle = c.gfciReceptacle && c.servesReceptacles && volts === 120;
  if (b.protection === 'gfci' || b.protection === 'df' || atReceptacle) return null;
  const ed = p.necEdition;
  const scope = gfciScope(ed);
  const how =
    volts === 120
      ? 'A GFCI or dual-function breaker covers it, or tick "GFCI receptacle" if one protects this circuit.'
      : 'A 2-pole GFCI breaker covers it.';

  if (c.location === 'pool-spa' || c.loadType === 'hot-tub') {
    return { message: 'Pools, spas, hot tubs and fountains generally need GFCI protection.', ref: 'Article 680' };
  }
  if (c.loadType === 'dishwasher' && scope.dishwasher) {
    return { message: `Dishwasher outlets need GFCI protection (${ed} NEC). ${how}`, ref: editionYear(ed) >= 2020 ? '210.8(D), 422.5(A)' : '210.8(D)' };
  }
  if (c.servesReceptacles) {
    // Before 2020 only 125 V, 15/20 A receptacles were covered.
    const ratingCovered = scope.includes240V || (volts === 120 && c.amps <= 20);
    const kitchenCovered = c.location !== 'kitchen' || scope.allKitchenReceptacles || c.loadType === 'small-appliance';
    if (ratingCovered && kitchenCovered && scope.locations.includes(c.location)) {
      return {
        message: `Receptacles in a ${LOCATION_LABELS[c.location].toLowerCase()} likely need GFCI protection (${ed} NEC). ${how}`,
        ref: '210.8(A)',
      };
    }
    if (ratingCovered && c.location === 'laundry' && !scope.laundryAreas) {
      return {
        message: `Laundry receptacles within 6 ft of a sink need GFCI protection (${ed} NEC; laundry areas as a whole were added in 2014). ${how}`,
        ref: '210.8(A)(7)',
      };
    }
    if (c.loadType === 'ev' && scope.evReceptacles) {
      return { message: `Receptacles for EV charging need GFCI protection (${ed} NEC). ${how}`, ref: '625.54' };
    }
  }
  if (scope.crawlSpaceLightingRef && c.location === 'crawlspace' && c.loadType === 'lighting' && volts === 120) {
    return { message: `Lighting outlets in a crawl space need GFCI protection (${ed} NEC). A GFCI breaker covers it.`, ref: scope.crawlSpaceLightingRef };
  }
  if (
    scope.outdoorOutlets &&
    !c.servesReceptacles &&
    c.location === 'outdoor' &&
    c.amps <= 50 &&
    c.loadType !== 'lighting' &&
    c.loadType !== 'landscape-lighting'
  ) {
    return {
      message:
        'Outdoor outlets up to 50 A, including hard-wired equipment such as AC condensers, need GFCI protection. Many jurisdictions have amended this for HVAC, so check locally.',
      ref: '210.8(F)',
    };
  }
  return null;
}

function validateLoadCalc(p: Project, push: Push): void {
  if (p.loadCalc.floorAreaFt2 <= 0) return;
  const r = calculateLoads(p);
  if (!r.best) return;
  if (r.best.amps > r.ctx.serviceAmps) {
    const charging = r.items.filter((i) => i.loadType === 'inverter-input' && i.category !== 'excluded').reduce((n, i) => n + i.va, 0);
    push({
      where: 'Load calculation',
      rule: 'service-load',
      severity: 'warning',
      message:
        `Calculated load is ${round(r.best.amps)} A even with the most favorable method (“${r.best.title}”), above the ${r.ctx.serviceAmps} A service.` +
        (charging > 0 ? ` That includes ${round(charging, 0)} VA of battery charging; a lower charging limit in the inverter's settings would reduce it.` : ''),
      ref: r.best.ref,
    });
  }
}
