import type { InverterSettings, Panel, Project } from '../../core/types';
import { batteryRuntime, hoursAt, inverterPanels } from '../../core/battery';
import { gridInputCheck } from '../../core/inverter';
import { applyBatteryModel } from '../../core/equipment';
import { sortByText } from '../../core/labels';
import { circuitNumber } from '../../core/panel';
import { BATTERIES, batteryModel, inverterModel } from '../../data/equipment';
import type { Dispatch } from '../../state/projectReducer';
import { NumField } from '../NumField';
import { VAField } from '../VAField';
import { fmt0, fmt1, fmtHours } from '../format';
import { PrintHeader } from './PrintHeader';

interface Props {
  project: Project;
  dispatch: Dispatch;
  onSelectBreaker(panelId: string, id: string): void;
}

const BATTERY_OPTIONS = sortByText(BATTERIES, (b) => b.name);
const STEADY_LOADS = [250, 500, 1000, 1500, 2000, 3000, 5000, 8000];
const kwh = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 1 });

/** Battery run time for each inverter-backed panel: battery size, what runs and for how long, and recharging. */
export function BatteryView({ project, dispatch, onSelectBreaker }: Props) {
  return (
    <div className="doc battery">
      {inverterPanels(project).map((panel) => (
        <BatterySection key={panel.id} project={project} panel={panel} dispatch={dispatch} onSelectBreaker={onSelectBreaker} />
      ))}
      <p className="disclaimer">
        Run times are estimates. They treat VA as watts, use one efficiency figure at all loads, and assume a healthy battery at room
        temperature. Cold, age and high loads shorten them. This is a planning aid; compare with the battery and inverter spec sheets.
      </p>
    </div>
  );
}

function BatterySection({ project, panel, dispatch, onSelectBreaker }: { panel: Panel } & Props) {
  const r = batteryRuntime(project, panel);
  const il = panel.interlock;
  if (!r || !il) return null;
  const s = r.settings;
  const grid = gridInputCheck(project, panel);
  const set = (patch: Partial<InverterSettings>, key: string) =>
    dispatch({ type: 'panel', panelId: panel.id, patch: { interlock: { ...il, inverter: { ...s, ...patch } } } }, `${panel.id}:batt:${key}`);
  const inverter = inverterModel(s.modelId);
  const battery = batteryModel(s.batteryModelId);
  const percent = (v: number | null) => (v != null && v >= 1 && v <= 100 ? v : null);

  const overrides = r.loads.filter((l) => l.circuit.outageHours != null);
  const resetHours = () => {
    for (const l of overrides) {
      dispatch(
        { type: 'updateCircuit', panelId: l.panel.id, breakerId: l.breaker.id, circuitId: l.circuit.id, patch: { outageHours: null } },
        `${panel.id}:batt:reset`,
      );
    }
  };
  const multi = new Set(r.loads.map((l) => l.panel.id)).size > 1;
  const total = r.loads.reduce((n, l) => n + l.kWhPerDay, 0);
  const steady = [...STEADY_LOADS.filter((w) => w < r.maxLoadW), ...(r.maxLoadW > 0 ? [r.maxLoadW] : [])];

  return (
    <section className="page">
      <PrintHeader project={project} title={`Battery run time: ${panel.name || 'Panel'}`} panel={panel} />

      <div className="lc-inputs">
        <label className="field">
          <span>Battery model</span>
          <select
            value={s.batteryModelId ?? ''}
            onChange={(e) => {
              const m = batteryModel(e.target.value);
              set(m ? applyBatteryModel(s, m, s.batteryCount) : { batteryModelId: null }, 'model');
            }}
          >
            <option value="">Custom (enter from the spec sheet)</option>
            {BATTERY_OPTIONS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {battery && (
          <label className="field">
            <span>Batteries</span>
            <NumField
              value={s.batteryCount}
              min={1}
              max={battery.maxParallel}
              step={1}
              onChange={(v) => v != null && v >= 1 && v <= battery.maxParallel && set(applyBatteryModel(s, battery, v), 'count')}
            />
          </label>
        )}
        <label className="field">
          <span>Battery capacity (kWh)</span>
          <NumField
            value={s.batteryKWh}
            allowEmpty
            min={0}
            step={0.1}
            placeholder="e.g. 14.3, all batteries"
            onChange={(v) => set({ batteryKWh: v != null && v > 0 ? v : null, batteryModelId: null }, 'kwh')}
          />
        </label>
        <label className="field" title="How far the battery is drained before the inverter shuts off. Lithium (LFP) is often 80 to 95%, lead-acid about 50%.">
          <span>Usable part (%)</span>
          <NumField
            value={s.usablePct}
            min={1}
            max={100}
            step={5}
            onChange={(v) => {
              const n = percent(v);
              if (n != null) set({ usablePct: n }, 'usable');
            }}
          />
        </label>
        <label className="field" title="Losses between the battery and the AC output. Spec sheets usually say 90 to 95%.">
          <span>Inverter efficiency (%)</span>
          <NumField
            value={s.efficiencyPct}
            min={1}
            max={100}
            step={1}
            onChange={(v) => {
              const n = percent(v);
              if (n != null) set({ efficiencyPct: n }, 'eff');
            }}
          />
        </label>
        <label className="field" title="What the inverter itself uses, day and night. Spec sheets call it idle, standby or no-load consumption.">
          <span>Inverter's own draw (W)</span>
          <NumField value={s.idleWatts} min={0} step={5} onChange={(v) => v != null && v >= 0 && set({ idleWatts: v }, 'idle')} />
        </label>
        <label className="field" title="The most the batteries can deliver continuously, all together.">
          <span>Battery output limit (W)</span>
          <VAField
            value={s.dischargeWatts}
            placeholder="W or kW, optional"
            aria-label="Battery output limit"
            onChange={(v) => set({ dischargeWatts: v > 0 ? v : null, batteryModelId: null }, 'discharge')}
          />
        </label>
        <label className="field" title="The most the batteries can deliver for a moment before their BMS shuts off. It limits motor starting, along with the inverter's surge.">
          <span>Battery surge limit (W)</span>
          <VAField
            value={s.dischargeSurgeWatts}
            placeholder="W or kW, optional"
            aria-label="Battery surge limit"
            onChange={(v) => set({ dischargeSurgeWatts: v > 0 ? v : null, batteryModelId: null }, 'dischargeSurge')}
          />
        </label>
        <label className="field" title="If an energy monitor gives you the average load of these circuits, enter it to use it instead of the table below.">
          <span>Measured average load (W)</span>
          <VAField
            value={s.measuredLoadW}
            placeholder="W or kW, optional"
            aria-label="Measured average load"
            onChange={(v) => set({ measuredLoadW: v > 0 ? v : null }, 'measured')}
          />
        </label>
      </div>

      <div className="method-grid">
        <div className={`method-card${r.hours != null ? ' best' : ' na'}`}>
          <div className="mc-title">Run time</div>
          {r.hours != null ? (
            <>
              <div className="mc-amps">{fmtHours(r.hours)}</div>
              <div className="mc-va">with no grid, solar or generator</div>
            </>
          ) : (
            <p className="hint">{s.batteryKWh ? 'Enter loads and hours below.' : 'Enter the battery capacity.'}</p>
          )}
        </div>
        <div className="method-card">
          <div className="mc-title">Average load</div>
          <div className="mc-amps">{fmt0(r.averageW)} W</div>
          <div className="mc-va">
            {kwh(r.kWhPerDay)} kWh a day, {r.measured ? 'from your measured load' : 'from the table below'}
          </div>
        </div>
        <div className={`method-card${r.usableKWh ? '' : ' na'}`}>
          <div className="mc-title">Usable energy</div>
          {r.usableKWh ? (
            <>
              <div className="mc-amps">{kwh(r.usableKWh)} kWh</div>
              <div className="mc-va">
                {fmt0(s.usablePct)}% of {kwh(s.batteryKWh ?? 0)} kWh. The inverter itself uses {kwh((s.idleWatts * 24) / 1000)} kWh a day.
              </div>
            </>
          ) : (
            <p className="hint">Enter the battery capacity.</p>
          )}
        </div>
        <div className={`method-card${r.rechargeHours ? '' : ' na'}`}>
          <div className="mc-title">Recharge from the grid</div>
          {r.rechargeHours ? (
            <>
              <div className="mc-amps">{fmtHours(r.rechargeHours)}</div>
              <div className="mc-va">from empty, charging at {fmt0(grid?.chargeVA ?? 0)} W</div>
            </>
          ) : (
            <p className="hint">
              {grid ? (
                <>
                  Enter the charging power on{' '}
                  <button type="button" className="link-btn" onClick={() => onSelectBreaker(grid.panel.id, grid.breaker.id)}>
                    {grid.panel.name}, circuit {circuitNumber(grid.breaker, 0)}
                  </button>
                  {s.batteryKWh ? '' : ' and the battery capacity'}.
                </>
              ) : (
                "Set the inverter's grid input breaker in this panel's settings, under Backup power."
              )}
            </p>
          )}
        </div>
      </div>

      {s.batteryKWh != null && steady.length > 0 && (
        <>
          <h3 className="doc-h">Run time at a steady load</h3>
          <table className="data steady-table">
            <thead>
              <tr>
                <th className="num">Load</th>
                <th className="num">Runs for</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {steady.map((w) => (
                <tr key={w}>
                  <td className="num">{fmt0(w)} W</td>
                  <td className="num">{fmtHours(hoursAt(s, w) ?? 0)}</td>
                  <td className="muted">{w === r.maxLoadW ? 'the most this inverter and battery can carry' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="doc-h">What runs in an outage</h3>
      <p className="hint">
        Hours a day means hours at the entered load. A refrigerator is plugged in all day but averages only a couple of hours at full load.
        The grey hours are rough typical values, so replace them with yours, and put 0 for anything you'd leave off (in summer, the
        heat; in winter, the AC). Loads edited here change the circuits.
        {r.measured ? ' Your measured average load is used for the run time, so this table is only for comparison.' : ''}
      </p>
      {r.loads.length === 0 ? (
        <p className="hint">No loads in this panel yet. Drag circuits into it on the Panels tab.</p>
      ) : (
        <table className="data loads-table">
          <thead>
            <tr>
              <th>Circuit</th>
              <th>Load</th>
              <th className="num">VA</th>
              <th className="num">Hours a day</th>
              <th className="num">kWh a day</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {r.loads.map((l) => {
              const name = l.circuit.label.trim() || 'Unlabeled';
              const off = l.hours <= 0;
              return (
                <tr key={l.circuit.id} className={off ? 'dim' : ''}>
                  <td className="nowrap">
                    <button type="button" className="link-btn" onClick={() => onSelectBreaker(l.panel.id, l.breaker.id)}>
                      {multi ? `${l.panel.name || 'Panel'} · ` : ''}Ckt {l.number}
                    </button>
                  </td>
                  <td>
                    {name}
                    {l.loadW <= 0 && !off && <div className="cell-note">no load entered, so not counted</div>}
                    {off && <div className="cell-note">left off on battery</div>}
                  </td>
                  <td className="num">
                    <VAField
                      className="va-input"
                      value={l.circuit.loadVA}
                      aria-label={`${name} load`}
                      onChange={(v) =>
                        dispatch(
                          { type: 'updateCircuit', panelId: l.panel.id, breakerId: l.breaker.id, circuitId: l.circuit.id, patch: { loadVA: v } },
                          `${l.circuit.id}:loadVA`,
                        )
                      }
                    />
                  </td>
                  <td className="num">
                    <NumField
                      className="hours-input"
                      value={l.circuit.outageHours}
                      allowEmpty
                      min={0}
                      max={24}
                      step={0.25}
                      placeholder={String(l.typicalHours)}
                      aria-label={`${name} hours a day`}
                      onChange={(v) => {
                        if (v != null && (v < 0 || v > 24)) return;
                        dispatch(
                          { type: 'updateCircuit', panelId: l.panel.id, breakerId: l.breaker.id, circuitId: l.circuit.id, patch: { outageHours: v } },
                          `${l.circuit.id}:outageHours`,
                        );
                      }}
                    />
                  </td>
                  <td className="num">{l.kWhPerDay > 0 ? kwh(l.kWhPerDay) : ''}</td>
                  <td className="num">{total > 0 && l.kWhPerDay > 0 ? `${Math.round((l.kWhPerDay / total) * 100)}%` : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total{r.withoutLoad > 0 ? ` (${r.withoutLoad} circuit${r.withoutLoad === 1 ? '' : 's'} with no load entered)` : ''}</td>
              <td className="num">{kwh(total)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={4}>Average over the day</td>
              <td className="num">{fmt0((total * 1000) / 24)} W</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {overrides.length > 0 && (
        <div className="quick-add no-print">
          <button type="button" onClick={resetHours}>
            Use typical hours for all
          </button>
        </div>
      )}
      {r.maxLoadW > 0 && r.maxLoadW < il.generatorWatts && (
        <p className="hint">
          The battery output limit holds this inverter to about {fmt0(r.maxLoadW)} W ({fmt1(r.maxLoadW / 240)} A at 240 V) on battery, below
          its {fmt0(il.generatorWatts)} W rating.
        </p>
      )}
      {[inverter, battery].map(
        (m) =>
          m && (
            <div key={m.id} className="manual-notes">
              <h3 className="doc-h">{m.name}</h3>
              <p className="hint">From the {m.source}; page numbers are the printed ones.</p>
              <ul>
                {m.notes.map((n) => (
                  <li key={n.text}>
                    {n.text} {n.page && <span className="muted">(p. {n.page})</span>}
                  </li>
                ))}
              </ul>
              {m.notStated.length > 0 && (
                <p className="hint">
                  <b>Not in the manual:</b> {m.notStated.join('; ')}.
                </p>
              )}
            </div>
          ),
      )}
    </section>
  );
}
