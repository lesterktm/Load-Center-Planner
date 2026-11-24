import type { Breaker, Circuit, ConductorMaterial, LoadCategory, LoadType, Location, Panel, Project, WireSize, WireType } from '../core/types';
import { circuitNumber, formVolts } from '../core/panel';
import {
  CATEGORY_LABELS, CATEGORY_OPTIONS, CONTINUOUS_LOAD_TYPES, LOAD_TYPE_LABELS, LOAD_TYPE_OPTIONS, LOCATION_LABELS, LOCATION_OPTIONS,
  sortByText, WIRE_TYPE_NOTES,
} from '../core/labels';
import {
  checkWire, largestRatingAtMost, sizeLabel, STANDARD_RATINGS, suggestWireSize, voltageDrop, WIRE_SIZES, WIRE_TYPES,
} from '../core/wire';
import { autoCategory, cookingDemandVA } from '../core/loadcalc';
import { feederCalc } from '../core/feeder';
import { isBackfedType, isGeneratorInterlock } from '../core/generator';
import { gridInputCheck, inverterFedBy } from '../core/inverter';
import { panelFedBy, upstreamChain } from '../core/tree';
import { panelLegVA } from '../core/circuits';
import type { Dispatch } from '../state/projectReducer';
import { NumField } from './NumField';
import { VAField } from './VAField';
import { fmt0, fmt1 } from './format';
import { feederWireStatus } from './feederText';

interface Props {
  project: Project;
  panel: Panel;
  breaker: Breaker;
  circuit: Circuit;
  index: number;
  dispatch: Dispatch;
}

const WIRE_TYPE_OPTIONS = sortByText(WIRE_TYPES, (t) => t);
const METALS: { id: ConductorMaterial; label: string }[] = [
  { id: 'Al', label: 'Aluminum' },
  { id: 'Cu', label: 'Copper' },
];

export function CircuitFields({ project, panel, breaker: b, circuit: c, index, dispatch }: Props) {
  const set = (patch: Partial<Omit<Circuit, 'id'>>, field: string) =>
    dispatch({ type: 'updateCircuit', panelId: panel.id, breakerId: b.id, circuitId: c.id, patch }, `${c.id}:${field}`);

  const volts = formVolts(b.form);
  const feeds = index === 0 ? panelFedBy(project, b.id) : undefined;
  const fc = feeds ? feederCalc(project, feeds) : null;
  const feedVA = feeds ? Object.values(panelLegVA(project, feeds)).reduce((n, v) => n + v, 0) : 0;
  const cooking = c.loadType === 'range' || c.loadType === 'cooktop-oven';
  const branchVA = cooking ? cookingDemandVA([c.loadVA]) : c.loadVA;
  const isGridInput = c.loadType === 'inverter-input';
  const backed = isGridInput ? inverterFedBy(project, b.id) : undefined;
  const grid = backed ? gridInputCheck(project, backed) : null;
  const loadA = fc ? fc.amps : grid ? grid.drawAmps : branchVA > 0 ? branchVA / volts : 0;
  const verdict = c.wire && !fc ? checkWire(c.wire, c.amps, c.loadType, c.servesReceptacles) : null;
  const feederWire = fc ? feederWireStatus(c.wire, fc.wire, c.amps) : null;
  const vd = c.wire && c.lengthFt && loadA > 0 ? voltageDrop(c.wire, c.lengthFt, loadA, volts) : null;
  const ampOptions = [...new Set([...STANDARD_RATINGS.filter((r) => r <= Math.max(200, panel.busAmps)), c.amps])].sort(
    (a, b) => a - b,
  );
  const suggestion = fc
    ? c.wire?.material === 'Al'
      ? fc.suggested.Al
      : fc.suggested.Cu
    : suggestWireSize(c.amps, c.wire?.material ?? 'Cu', c.wire?.type ?? 'NM-B', c.loadType, c.servesReceptacles);
  // On an inverter-backed panel everything runs on the inverter, so "On generator" is only for generator interlocks.
  const generatorAvailable = [panel, ...upstreamChain(project, panel).chain].some((x) => isGeneratorInterlock(x.interlock));
  const special = isBackfedType(c.loadType) || c.loadType === 'subpanel' || !!feeds;

  return (
    <fieldset className="circuit">
      {b.circuits.length > 1 && <legend>Circuit {circuitNumber(b, index)}</legend>}
      <label className="field">
        <span>Description (shown in the directory)</span>
        <input value={c.label} placeholder="e.g. Kitchen countertop – left of sink" onChange={(e) => set({ label: e.target.value }, 'label')} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Location</span>
          <select value={c.location} onChange={(e) => set({ location: e.target.value as Location }, 'location')}>
            {LOCATION_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Load type</span>
          <select
            value={c.loadType}
            onChange={(e) => {
              const loadType = e.target.value as LoadType;
              const nowContinuous = CONTINUOUS_LOAD_TYPES.includes(loadType);
              const wasContinuous = CONTINUOUS_LOAD_TYPES.includes(c.loadType);
              set({ loadType, continuous: nowContinuous ? true : wasContinuous ? false : c.continuous }, 'loadType');
            }}
          >
            {LOAD_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {LOAD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Breaker (A)</span>
          <select value={c.amps} onChange={(e) => set({ amps: Number(e.target.value) }, 'amps')}>
            {ampOptions.map((a) => (
              <option key={a} value={a}>
                {a} A
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{isGridInput ? 'Charging power (VA)' : 'Load (VA)'}</span>
          <VAField value={c.loadVA} placeholder="VA, or kW like 4.5 kW" onChange={(v) => set({ loadVA: v }, 'loadVA')} />
        </label>
      </div>
      <div className="checkrow">
        <label>
          <input type="checkbox" checked={c.continuous} onChange={(e) => set({ continuous: e.target.checked }, 'continuous')} />
          Continuous (3 h+)
        </label>
        <label>
          <input
            type="checkbox"
            checked={c.servesReceptacles}
            onChange={(e) => set({ servesReceptacles: e.target.checked, ...(e.target.checked ? {} : { gfciReceptacle: false }) }, 'recep')}
          />
          Feeds receptacles
        </label>
        {volts === 120 && c.servesReceptacles && !special && (
          <label title="A GFCI receptacle protects this circuit. It also protects the receptacles wired after it (on its LOAD terminals).">
            <input type="checkbox" checked={c.gfciReceptacle} onChange={(e) => set({ gfciReceptacle: e.target.checked }, 'gfciR')} />
            GFCI receptacle
          </label>
        )}
        {generatorAvailable && !special && (
          <label className="gen-check">
            <input type="checkbox" checked={c.onGenerator} onChange={(e) => set({ onGenerator: e.target.checked }, 'gen')} />
            On generator
          </label>
        )}
      </div>

      <div className="grid3">
        <label className="field">
          <span>Wire</span>
          <select
            value={c.wire?.size ?? ''}
            onChange={(e) => {
              const size = e.target.value as WireSize | '';
              set({ wire: size ? { size, material: c.wire?.material ?? 'Cu', type: c.wire?.type ?? 'NM-B' } : null }, 'wire');
            }}
          >
            <option value="">None</option>
            {WIRE_SIZES.map((s) => (
              <option key={s} value={s}>
                {sizeLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Metal</span>
          <select
            value={c.wire?.material ?? 'Cu'}
            disabled={!c.wire}
            onChange={(e) => c.wire && set({ wire: { ...c.wire, material: e.target.value as ConductorMaterial } }, 'wire')}
          >
            {METALS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={c.wire?.type ?? 'NM-B'}
            disabled={!c.wire}
            title={c.wire ? WIRE_TYPE_NOTES[c.wire.type] : ''}
            onChange={(e) => c.wire && set({ wire: { ...c.wire, type: e.target.value as WireType } }, 'wire')}
          >
            {WIRE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid2">
        <label className="field">
          <span>Run length (ft, one way)</span>
          <NumField value={c.lengthFt} min={0} step={5} allowEmpty placeholder="optional" onChange={(v) => set({ lengthFt: v && v > 0 ? v : null }, 'length')} />
        </label>
        <div className="field">
          <span>&nbsp;</span>
          <button
            type="button"
            disabled={!suggestion || suggestion === c.wire?.size}
            onClick={() => suggestion && set({ wire: { size: suggestion, material: c.wire?.material ?? 'Cu', type: c.wire?.type ?? 'NM-B' } }, 'wire')}
            title={fc ? 'Smallest conductor for this feeder breaker and its calculated load' : 'Smallest wire fully rated for this breaker'}
          >
            {suggestion ? `Use ${sizeLabel(suggestion)}` : 'No size fits'}
          </button>
        </div>
      </div>

      <div className="calc">
        {fc ? (
          fc.method ? (
            <div className={fc.amps > c.amps ? 'bad' : ''}>
              Feeder load {fmt1(fc.amps)} A by NEC Article 220 ({fc.wholeHouse ? fc.method.title.toLowerCase() : 'standard method'}) on
              a {c.amps} A breaker{fc.amps > c.amps && fc.minBreaker ? `; needs at least ${fc.minBreaker} A` : ''}. Connected load{' '}
              {fmt0(feedVA)} VA. Details on the Load calc tab.
            </div>
          ) : (
            <div className="muted">This feeder carries the whole house. Enter the living area on the Load calc tab to calculate it.</div>
          )
        ) : grid ? (
          <>
            <div className={grid.minAmps > c.amps ? 'bad' : ''}>
              Grid input for {backed?.name || 'a panel'}: {grid.passVA > 0 ? `${fmt1(grid.passAmps)} A passed through + ` : ''}
              {fmt1(grid.chargeAmps)} A charging = {fmt1(grid.drawAmps)} A
              {grid.limitAmps != null && grid.wantAmps > grid.limitAmps ? ` (held to the ${fmt1(grid.limitAmps)} A input limit)` : ''} on a{' '}
              {c.amps} A breaker{grid.minAmps > c.amps ? `; needs at least ${fmt1(grid.minAmps)} A with charging at 125%` : ''}
            </div>
            {grid.chargeVA <= 0 && <div className="muted">Enter the inverter's grid charging power above.</div>}
          </>
        ) : loadA > 0 ? (
          <div className={loadA > c.amps ? 'bad' : c.continuous && loadA * 1.25 > c.amps ? 'warn' : ''}>
            Load {fmt1(loadA)} A{cooking ? ' (Table 220.55 demand)' : ''} on a {c.amps} A breaker ({Math.round((loadA / c.amps) * 100)}%)
            {c.continuous ? `; continuous loads need at least ${fmt1(loadA * 1.25)} A` : ''}
          </div>
        ) : (
          <div className="muted">Enter a load to check breaker loading and voltage drop.</div>
        )}
        {feederWire && c.wire && <div className={feederWire.cls}>{feederWire.text}</div>}
        {c.wire && verdict && (
          <div
            className={
              verdict.status === 'ok' ? 'ok' : verdict.status === 'undersized' || verdict.status === 'unknown' ? 'bad' : 'warn'
            }
          >
            {verdict.status === 'unknown'
              ? 'This wire size and metal is not in the ampacity table.'
              : `${sizeLabel(c.wire.size)} ${c.wire.material} ${c.wire.type}: rated up to ${largestRatingAtMost(verdict.limit) ?? verdict.limit} A. ` +
                (verdict.status === 'ok'
                  ? 'OK.'
                  : verdict.status === 'undersized'
                    ? 'Too small for this breaker.'
                    : verdict.status === 'next-size-up'
                      ? 'Next-size-up rule only.'
                      : 'Allowed only per the equipment nameplate.')}
          </div>
        )}
        {vd && (
          <div className={vd.percent > 3 ? 'warn' : 'ok'}>
            Voltage drop ≈ {fmt1(vd.percent)}% ({fmt1(vd.volts)} V) over {c.lengthFt} ft
          </div>
        )}
      </div>

      {!special && (
        <label className="field">
          <span>Load calculation</span>
          <select
            value={c.calcCategory ?? ''}
            onChange={(e) => set({ calcCategory: (e.target.value || null) as LoadCategory | null }, 'calcCategory')}
            title="How this circuit counts in the NEC Article 220 service calculation"
          >
            <option value="">Automatic: {CATEGORY_LABELS[autoCategory(c.loadType)].toLowerCase()}</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={c.notes} onChange={(e) => set({ notes: e.target.value }, 'notes')} />
      </label>
    </fieldset>
  );
}
