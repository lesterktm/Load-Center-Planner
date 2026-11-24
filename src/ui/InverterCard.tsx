import type { Panel, Phase, Project } from '../core/types';
import { batteryRuntime } from '../core/battery';
import { gridInputCheck, inverterCheck, MOTOR_START_FACTOR } from '../core/inverter';
import { circuitNumber } from '../core/panel';
import { feederOf } from '../core/tree';
import { fmt0, fmt1, fmtHours } from './format';

interface Props {
  project: Project;
  panel: Panel;
  onOpenBattery(): void;
  onSelectBreaker(panelId: string, id: string): void;
}

/**
 * Battery inverter backing up a panel: its loads against the inverter's continuous
 * output (overall and per leg) and surge rating, its grid input, the battery, and how
 * the bypass works.
 */
export function InverterCard({ project, panel, onOpenBattery, onSelectBreaker }: Props) {
  const inv = inverterCheck(project, panel);
  if (!inv) return null;
  const out = Math.max(1, inv.outputW);
  const feeder = feederOf(project, panel);
  const grid = gridInputCheck(project, panel);
  const battery = batteryRuntime(project, panel);
  const bar = (value: number, max: number, cls: string) => (
    <div className="bar">
      <div className={`${cls}${value > max ? ' over' : ''}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
  const leg = (ph: Phase) => (
    <div className="leg" key={ph}>
      <div className="leg-head">
        <b className={`leg-name ${ph}`}>{ph}</b>
        <span>
          {fmt0(inv.legVA[ph])} of {fmt0(out / 2)} VA
        </span>
      </div>
      {bar(inv.legVA[ph], out / 2, ph)}
    </div>
  );
  const motor = inv.largestMotor;
  const motorStart = motor ? motor.va * MOTOR_START_FACTOR : 0;
  const surgeShort = !!motor && inv.surgeLimitW != null && inv.surgeLimitW < motorStart;
  const breakerShort = inv.breakerAmps != null && inv.breakerAmps < inv.outputAmps;

  return (
    <section className="card inverter-card">
      <h2>Inverter: {panel.name || 'Panel'}</h2>
      <div className="stat">
        <span>Continuous output</span>
        <b>
          {fmt0(inv.outputW)} W ({fmt1(inv.outputAmps)} A)
        </b>
      </div>
      <div className="stat">
        <span>Surge</span>
        <b className={surgeShort ? 'bad' : ''}>
          {inv.surgeLimitW == null ? 'not entered' : `${fmt0(inv.surgeLimitW)} W${inv.surgeByBattery ? ' (battery limit)' : ''}`}
        </b>
      </div>
      <div className="stat">
        <span>Inverter breaker</span>
        <b className={breakerShort ? 'bad' : ''}>
          {inv.breaker ? `${inv.breakerAmps} A at ${circuitNumber(inv.breaker, 0)}` : 'not placed yet'}
        </b>
      </div>
      <div className="stat">
        <span>Calculated load (Art. 220)</span>
        <b className={inv.calcVA > inv.outputW ? 'bad' : ''}>
          {fmt0(inv.calcVA)} VA ({Math.round((inv.calcVA / out) * 100)}%)
        </b>
      </div>
      <div className="leg">
        <div className="leg-head">
          <b>Connected</b>
          <span>
            {fmt0(inv.connectedVA)} of {fmt0(inv.outputW)} W
          </span>
        </div>
        {bar(inv.connectedVA, out, 'inv')}
      </div>
      {leg('L1')}
      {leg('L2')}
      {motor && (
        <p className={`hint${surgeShort ? ' bad' : ''}`} style={{ marginTop: 8 }}>
          Largest motor: {motor.name}, {fmt0(motor.va)} VA running. Starting takes 3 to 6 times that (about {fmt0(motorStart)} VA or more);
          compare its LRA with the surge.
        </p>
      )}

      <h3>Grid input</h3>
      {grid ? (
        <>
          <div className="stat">
            <span>Breaker</span>
            <button type="button" className="link-btn" onClick={() => onSelectBreaker(grid.panel.id, grid.breaker.id)}>
              {grid.breakerAmps} A at {grid.panel.name} {circuitNumber(grid.breaker, 0)}
            </button>
          </div>
          <div className="stat">
            <span>Passed through to loads</span>
            <b>{grid.passVA > 0 ? `${fmt1(grid.passAmps)} A` : 'none'}</b>
          </div>
          <div className="stat">
            <span>Battery charging</span>
            <b>{grid.chargeVA > 0 ? `${fmt1(grid.chargeAmps)} A of ${fmt1(grid.chargeVA / 240)} A` : 'not entered'}</b>
          </div>
          <div className="leg">
            <div className="leg-head">
              <b>Total</b>
              <span className={grid.minAmps > grid.breakerAmps ? 'bad' : ''}>
                {fmt1(grid.drawAmps)} of {grid.breakerAmps} A
              </span>
            </div>
            {bar(grid.drawAmps, Math.max(1, grid.breakerAmps), 'inv')}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {grid.minAmps > grid.breakerAmps ? `Needs at least ${fmt1(grid.minAmps)} A with charging at 125%. ` : ''}
            {grid.limitAmps != null && grid.wantAmps > grid.limitAmps
              ? grid.throttles
                ? `Charging slows down to stay within the ${fmt1(grid.limitAmps)} A input limit. `
                : `Over the ${fmt1(grid.limitAmps)} A input limit. `
              : ''}
            {grid.chargeVA > grid.roomForChargingVA
              ? `Up to ${fmt0(Math.floor(grid.roomForChargingVA / 100) * 100)} W of charging fits. `
              : `There's room for up to ${fmt0(Math.floor(grid.roomForChargingVA / 100) * 100)} W of charging. `}
            Charging counts in the service load calculation. The panel's own loads are already in it, so they aren't added twice.
          </p>
        </>
      ) : (
        <p className="hint">None set. If a breaker feeds the inverter's grid input, add it under Backup power in the panel settings.</p>
      )}

      <h3>Battery</h3>
      {battery?.settings.batteryKWh ? (
        <>
          <div className="stat">
            <span>Capacity</span>
            <b>
              {fmt1(battery.settings.batteryKWh)} kWh ({fmt1(battery.usableKWh ?? 0)} usable)
            </b>
          </div>
          <div className="stat">
            <span>Run time</span>
            <b>{battery.hours != null ? `${fmtHours(battery.hours)} at ${fmt0(battery.averageW)} W` : 'enter loads'}</b>
          </div>
          {battery.rechargeHours != null && (
            <div className="stat">
              <span>Recharge from grid</span>
              <b>{fmtHours(battery.rechargeHours)}</b>
            </div>
          )}
        </>
      ) : (
        <p className="hint">Enter the battery capacity on the Battery tab to estimate run time.</p>
      )}
      <button type="button" className="link-btn" onClick={onOpenBattery}>
        Battery and run time
      </button>

      <h3>Bypass</h3>
      <p className="hint">
        Normally the inverter feeds this panel through its breaker
        {inv.breaker ? ` at ${circuitNumber(inv.breaker, 0)}` : ''} while the interlock holds the main off. To bypass the inverter, turn its
        breaker off, slide the interlock, and turn the main on
        {feeder ? ` (fed from ${feeder.panel.name}, circuit ${circuitNumber(feeder.breaker, 0)}, ${feeder.breaker.circuits[0]?.amps} A)` : ''}.
      </p>
    </section>
  );
}
