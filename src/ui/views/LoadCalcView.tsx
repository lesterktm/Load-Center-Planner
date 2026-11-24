import { useMemo, useState } from 'react';
import type { Circuit, InstallStatus, LoadCalcSettings, LoadCategory, Project, WhatIfLoad } from '../../core/types';
import { autoCategory, calculateLoads, type CalcItem } from '../../core/loadcalc';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, STATUS_LABELS } from '../../core/labels';
import { newId } from '../../core/project';
import { isServicePanel, panelRating } from '../../core/tree';
import type { Dispatch } from '../../state/projectReducer';
import { NumField } from '../NumField';
import { VAField } from '../VAField';
import { fmt0, fmt1 } from '../format';
import { PrintHeader } from './PrintHeader';
import { MethodTable } from './MethodTable';
import { FeederSection } from './FeederSection';

const QUICK_ADD: Omit<WhatIfLoad, 'id'>[] = [
  { name: 'EV charger, 48 A', category: 'ev', va: 11520 },
  { name: 'EV charger, 32 A', category: 'ev', va: 7680 },
  { name: 'Heat pump, 3 ton', category: 'cooling', va: 4600 },
  { name: 'Hot tub', category: 'appliance', va: 7200 },
  { name: 'Electric range', category: 'cooking', va: 12000 },
  { name: 'Electric dryer', category: 'dryer', va: 5000 },
  { name: 'Water heater', category: 'appliance', va: 4500 },
  { name: 'Electric heat, 10 kW', category: 'heating', va: 10000 },
];

interface Props {
  project: Project;
  dispatch: Dispatch;
  onSelectBreaker(panelId: string, id: string): void;
}

const positive = (v: number | null) => (v != null && v > 0 ? v : null);

/**
 * Scratch converters for nameplate ratings: spec-sheet kW to VA, and volts × amps.
 * Not saved with the project.
 */
function QuickConvert() {
  const [kw, setKw] = useState<number | null>(null);
  const [volts, setVolts] = useState<number | null>(240);
  const [amps, setAmps] = useState<number | null>(null);
  const k = positive(kw);
  const v = positive(volts);
  const a = positive(amps);
  const kwVA = k != null ? k * 1000 : null;
  const viVA = v != null && a != null ? v * a : null;
  return (
    <div className="kw-calc no-print">
      <div className="kw-row">
        <label className="kw-in">
          <span className="kw-name">kW to VA</span>
          <NumField value={kw} allowEmpty min={0} step={0.1} placeholder="e.g. 4.5" onChange={(v) => setKw(v != null && v >= 0 ? v : null)} />
          <span>kW</span>
        </label>
        <output className="kw-out">
          {kwVA != null ? (
            <>
              = <b>{fmt0(kwVA)} VA</b>
              <span className="muted">
                {' '}
                · {fmt1(kwVA / 240)} A at 240 V · {fmt1(kwVA / 120)} A at 120 V
              </span>
            </>
          ) : (
            <span className="muted">Type a kW rating from a spec sheet</span>
          )}
        </output>
      </div>
      <div className="kw-row">
        <div className="kw-in">
          <span className="kw-name">V × A = W</span>
          <NumField value={volts} allowEmpty min={0} step={1} placeholder="240" aria-label="Volts" onChange={(v) => setVolts(v != null && v >= 0 ? v : null)} />
          <span>V ×</span>
          <NumField value={amps} allowEmpty min={0} step={0.1} placeholder="e.g. 24" aria-label="Amps" onChange={(v) => setAmps(v != null && v >= 0 ? v : null)} />
          <span>A</span>
        </div>
        <output className="kw-out">
          {viVA != null ? (
            <>
              = <b>{fmt0(viVA)} VA</b>
              <span className="muted"> · {fmt1(viVA / 1000)} kW for resistive loads</span>
            </>
          ) : (
            <span className="muted">Type the volts and amps from a nameplate</span>
          )}
        </output>
      </div>
      <span className="hint">
        For resistive appliances (ranges, ovens, cooktops, dryers, water heaters, electric heat), watts and VA are the same: 1 kW =
        1,000 VA. For motors and AC, use volts × amps from the nameplate, since their kW rating understates the VA they draw.
      </span>
    </div>
  );
}

export function LoadCalcView({ project, dispatch, onSelectBreaker }: Props) {
  const r = useMemo(() => calculateLoads(project), [project]);
  const s = project.loadCalc;
  const set = (patch: Partial<LoadCalcSettings>, key?: string) => dispatch({ type: 'loadCalc', patch }, key && `lc:${key}`);
  const service = r.ctx.serviceAmps;
  const mainRating = project.panels.filter((x) => isServicePanel(project, x)).reduce((n, x) => n + panelRating(x), 0);
  const ready = r.ctx.area > 0;

  // Circuit and breaker status lookup for the loads table.
  const circuits = useMemo(() => {
    const m = new Map<string, { circuit: Circuit; status: InstallStatus }>();
    for (const panel of project.panels) for (const b of panel.breakers) for (const c of b.circuits) m.set(c.id, { circuit: c, status: b.status });
    return m;
  }, [project]);

  const updateWhatIf = (id: string, patch: Partial<WhatIfLoad>, key?: string) =>
    set({ whatIf: s.whatIf.map((w) => (w.id === id ? { ...w, ...patch } : w)) }, key && `${id}:${key}`);

  const countsNote = (i: CalcItem) =>
    i.category === 'small-appliance' || i.category === 'laundry'
      ? 'counted as a 1,500 VA circuit'
      : i.category === 'general-lighting'
        ? 'in the floor-area allowance'
        : i.category === 'excluded'
          ? 'not counted'
          : i.va <= 0
            ? 'no load entered'
            : '';

  const circuitItems = r.items.filter((i) => i.source === 'circuit');

  return (
    <div className="doc loadcalc">
      <PrintHeader project={project} title="Service and feeder load calculations (NEC Article 220)" />

      <section className="lc-inputs">
        <label className="field">
          <span>Living area (ft²)</span>
          <NumField
            value={s.floorAreaFt2 || null}
            allowEmpty
            min={0}
            step={50}
            placeholder="e.g. 2000"
            onChange={(v) => set({ floorAreaFt2: Math.max(0, v ?? 0) }, 'area')}
          />
        </label>
        <label className="field">
          <span>Service rating (A)</span>
          <NumField
            value={s.serviceAmps}
            allowEmpty
            min={0}
            step={25}
            placeholder={`${mainRating} (from main)`}
            onChange={(v) => set({ serviceAmps: v && v > 0 ? v : null }, 'service')}
          />
        </label>
        <label className="field">
          <span>Small-appliance circuits</span>
          <NumField
            value={s.smallApplianceCircuits}
            allowEmpty
            min={0}
            placeholder={`${r.ctx.sa} (from circuits)`}
            onChange={(v) => set({ smallApplianceCircuits: v != null && v >= 0 ? Math.round(v) : null }, 'sa')}
          />
        </label>
        <label className="field">
          <span>Laundry circuits</span>
          <NumField
            value={s.laundryCircuits}
            allowEmpty
            min={0}
            placeholder={`${r.ctx.laundry} (from circuits)`}
            onChange={(v) => set({ laundryCircuits: v != null && v >= 0 ? Math.round(v) : null }, 'laundry')}
          />
        </label>
        <label className="field">
          <span>Separately controlled heating units</span>
          <NumField
            value={s.heatingUnits}
            allowEmpty
            min={0}
            placeholder={`${r.ctx.heatingCounted} (from circuits)`}
            onChange={(v) => set({ heatingUnits: v != null && v >= 0 ? Math.round(v) : null }, 'units')}
          />
        </label>
        <label className="field">
          <span>Peak demand, last 12 months (kW)</span>
          <NumField
            value={s.measuredPeakKW}
            allowEmpty
            min={0}
            step={0.1}
            placeholder="optional, from the utility"
            onChange={(v) => set({ measuredPeakKW: v && v > 0 ? v : null }, 'peak')}
          />
        </label>
        <label className="check-field">
          <input type="checkbox" checked={s.heatPumpWithStrips} onChange={(e) => set({ heatPumpWithStrips: e.target.checked })} />
          Heat pump with electric backup heat
        </label>
      </section>

      {!ready ? (
        <p className="callout">Enter the living area to run the calculation. Use outside dimensions, without open porches, garages or unfinished spaces.</p>
      ) : (
        r.best && (
          <div className={`verdict ${r.best.amps <= service ? 'ok' : 'over'}`}>
            {r.best.amps <= service ? (
              <>
                The <b>{service} A</b> service is large enough: <b>{fmt1(r.best.amps)} A</b> calculated (
                {Math.round((r.best.amps / service) * 100)}% of the service) using “{r.best.title}”, NEC {r.best.ref}.
              </>
            ) : (
              <>
                The calculated load is <b>{fmt1(r.best.amps)} A</b> even with the most favorable method (“{r.best.title}”, NEC {r.best.ref}),
                over the <b>{service} A</b> service. Options: a larger service, fewer or smaller new loads, or load management.
              </>
            )}
          </div>
        )
      )}

      <div className="method-grid">
        {r.methods.map((m) => (
          <div key={m.id} className={`method-card${m === r.best ? ' best' : ''}${m.applicable ? '' : ' na'}`}>
            <div className="mc-title">
              {m.title}
              {m === r.best && <span className="tag">Lowest</span>}
            </div>
            <div className="mc-ref">NEC {m.ref}</div>
            {m.applicable ? (
              <>
                <div className="mc-amps">{fmt1(m.amps)} A</div>
                <div className="mc-va">{fmt0(m.totalVA)} VA at 240 V</div>
                <div className="bar">
                  <div className={m.amps > service ? 'over' : 'fits'} style={{ width: `${Math.min(100, (m.amps / Math.max(1, service)) * 100)}%` }} />
                </div>
                <div className={m.amps > service ? 'bad' : 'fits-text'}>
                  {m.amps <= service ? `${fmt1(service - m.amps)} A to spare` : `${fmt1(m.amps - service)} A over`}
                </div>
                {m.before && <div className="mc-before">Before the new work: {fmt1(m.before.amps)} A</div>}
              </>
            ) : (
              <p className="hint">{m.reason}</p>
            )}
          </div>
        ))}
      </div>

      {ready && (
        <>
          <h3 className="doc-h">How each method adds up</h3>
          <div className="method-details">
            {r.methods
              .filter((m) => m.applicable)
              .map((m) => (
                <MethodTable key={m.id} method={m} />
              ))}
          </div>
        </>
      )}

      <FeederSection project={project} dispatch={dispatch} onSelectBreaker={onSelectBreaker} />

      <h3 className="doc-h">Loads from the panels</h3>
      <p className="hint">
        Enter nameplate ratings in VA, or type kW (like 4.5 kW) and it converts. Edits here change the circuits on the Panel tab.
        Lighting and receptacle circuits are covered by the floor-area allowance, so their own loads aren't added again.
      </p>
      <QuickConvert />
      {circuitItems.length === 0 ? (
        <p className="hint">No circuits yet.</p>
      ) : (
        <table className="data loads-table">
          <thead>
            <tr>
              <th>Circuit</th>
              <th>Load</th>
              <th>Counts as</th>
              <th className="num">Nameplate VA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {circuitItems.map((i) => {
              const info = circuits.get(i.circuitId!);
              if (!info) return null;
              const c = info.circuit;
              const note = countsNote(i);
              const dim = i.category === 'general-lighting' || i.category === 'excluded';
              return (
                <tr key={i.key} className={dim ? 'dim' : ''}>
                  <td className="nowrap">
                    <button type="button" className="link-btn" onClick={() => onSelectBreaker(i.panelId!, i.breakerId!)}>
                      {i.where}
                    </button>
                  </td>
                  <td>{i.name}</td>
                  <td>
                    <select
                      value={c.calcCategory ?? ''}
                      onChange={(e) =>
                        dispatch({
                          type: 'updateCircuit',
                          panelId: i.panelId!,
                          breakerId: i.breakerId!,
                          circuitId: c.id,
                          patch: { calcCategory: (e.target.value || null) as LoadCategory | null },
                        })
                      }
                    >
                      <option value="">Auto: {CATEGORY_LABELS[autoCategory(c.loadType)].toLowerCase()}</option>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                    {note && <div className="cell-note">{note}</div>}
                  </td>
                  <td className="num">
                    <VAField
                      className="va-input"
                      value={c.loadVA}
                      aria-label={`${i.name} load`}
                      onChange={(v) =>
                        dispatch(
                          { type: 'updateCircuit', panelId: i.panelId!, breakerId: i.breakerId!, circuitId: c.id, patch: { loadVA: v } },
                          `${c.id}:loadVA`,
                        )
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={info.status}
                      onChange={(e) =>
                        dispatch({ type: 'updateBreaker', panelId: i.panelId!, id: i.breakerId!, patch: { status: e.target.value as InstallStatus } })
                      }
                    >
                      <option value="existing">{STATUS_LABELS.existing}</option>
                      <option value="new">{STATUS_LABELS.new}</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 className="doc-h">What-if loads</h3>
      <p className="hint">Loads you're considering that aren't on a breaker yet. They count as new work.</p>
      {s.whatIf.length > 0 && (
        <table className="data loads-table">
          <thead>
            <tr>
              <th>Load</th>
              <th>Counts as</th>
              <th className="num">Nameplate VA</th>
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {s.whatIf.map((w) => (
              <tr key={w.id}>
                <td>
                  <input value={w.name} placeholder="Description" onChange={(e) => updateWhatIf(w.id, { name: e.target.value }, 'name')} />
                </td>
                <td>
                  <select value={w.category} onChange={(e) => updateWhatIf(w.id, { category: e.target.value as LoadCategory })}>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <VAField className="va-input" value={w.va} aria-label={`${w.name || 'What-if'} load`} onChange={(v) => updateWhatIf(w.id, { va: v }, 'va')} />
                </td>
                <td className="no-print">
                  <button type="button" className="danger" onClick={() => set({ whatIf: s.whatIf.filter((x) => x.id !== w.id) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="quick-add no-print">
        {QUICK_ADD.map((q) => (
          <button key={q.name} type="button" onClick={() => set({ whatIf: [...s.whatIf, { id: newId(), ...q }] })}>
            + {q.name}
          </button>
        ))}
        <button type="button" onClick={() => set({ whatIf: [...s.whatIf, { id: newId(), name: '', category: 'other', va: 0 }] })}>
          + Other…
        </button>
      </div>

      <p className="disclaimer">
        One-family dwelling calculations under NEC Article 220. Section numbers follow the 2005–2020 editions, which share Article 220's
        layout; the 2023 edition renumbered a few (the dwelling lighting load and its demand table) without changing the method, and its
        7,200 VA minimum for EV chargers (220.57) is applied when 2023 is selected. Subpanel feeders use the standard method over the
        loads they serve; without a living area, their lighting and receptacle circuits count at the loads entered. Not for multifamily
        (220.84) or commercial services. This is a planning aid; confirm with the authority having jurisdiction.
      </p>
    </div>
  );
}
