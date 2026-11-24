import type { GeneratorInterlock, InverterSettings } from './types';
import type { BatteryModel, InverterModel } from '../data/equipment';
import { breakerFor } from './feeder';
import { largestRatingAtMost } from './wire';

/** Fill in an interlock from an inverter's manual. Battery and grid-breaker choices are kept. */
export function applyInverterModel(il: GeneratorInterlock, m: InverterModel): GeneratorInterlock {
  return {
    ...il,
    kind: 'inverter',
    inletAmps: null,
    generatorWatts: m.outputW,
    surgeWatts: m.surgeW,
    inverter: {
      ...il.inverter,
      modelId: m.id,
      gridInputAmps: m.acAmps,
      throttlesInput: m.throttlesInput,
      acBreakerAmps: m.acBreakerAmps,
      efficiencyPct: m.efficiencyPct,
      usablePct: m.usablePct,
    },
  };
}

/** Fill in the battery figures for a number of identical batteries. */
export function applyBatteryModel(s: InverterSettings, m: BatteryModel, count: number): InverterSettings {
  const n = Math.min(m.maxParallel, Math.max(1, Math.round(count)));
  return {
    ...s,
    batteryModelId: m.id,
    batteryCount: n,
    batteryKWh: Math.round(m.kWh * n * 1000) / 1000,
    dischargeWatts: Math.round(m.continuousA * m.volts * n),
    dischargeSurgeWatts: Math.round(m.surgeA * m.volts * n),
  };
}

/** AC power the inverter draws to charge at a DC current, at its highest charging voltage. */
export const chargeWatts = (m: InverterModel, dcAmps: number): number =>
  Math.round((dcAmps * m.gridCharge.volts) / (m.efficiencyPct / 100));

/** The DC charging current to set for an AC charging power, rounded down to whole amps. */
export const chargeAmpsFor = (m: InverterModel, acWatts: number): number =>
  Math.min(m.gridCharge.maxA, Math.max(0, Math.floor((acWatts * (m.efficiencyPct / 100)) / m.gridCharge.volts)));

/**
 * Starting size for a grid-input breaker. Never above the breaker the manual calls for.
 * Without one: 125% of the input limit if the inverter holds its draw to that limit,
 * otherwise the largest standard size within it.
 */
export function gridBreakerAmps(s: InverterSettings): number {
  if (s.acBreakerAmps) return largestRatingAtMost(s.acBreakerAmps) ?? 60;
  if (s.gridInputAmps) return (s.throttlesInput ? breakerFor(s.gridInputAmps * 1.25) : largestRatingAtMost(s.gridInputAmps)) ?? 60;
  return 60;
}

/** Starting size for the inverter output breaker: 125% of the output current, never above the manual's breaker. */
export function outputBreakerAmps(il: GeneratorInterlock): number {
  const want = il.generatorWatts > 0 ? (breakerFor((il.generatorWatts / 240) * 1.25) ?? 70) : 70;
  const max = il.inverter.acBreakerAmps;
  return max ? Math.min(want, largestRatingAtMost(max) ?? want) : want;
}
