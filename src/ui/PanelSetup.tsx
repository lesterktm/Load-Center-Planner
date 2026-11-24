import { useState } from 'react';
import type { BreakerFamilyId, GeneratorInterlock, InstallStatus, InverterSettings, Panel, PanelConfig, Project } from '../core/types';
import { FAMILIES } from '../data/families';
import { PANEL_PRESETS, presetPatch } from '../data/presets';
import { TEMPLATES } from '../data/templates';
import { inverterModel, INVERTERS } from '../data/equipment';
import { checkPlacement, circuitNumber, findFreeSpace, formatSpaceList, parseSpaceList } from '../core/panel';
import { breakerFromTemplate, defaultInterlock } from '../core/project';
import { childrenOf, depthOf, feederOf, isWithin, panelFedBy, panelOrder } from '../core/tree';
import { backfedBreakers, interlockSpace, sourceName } from '../core/generator';
import { applyInverterModel, chargeWatts, gridBreakerAmps, outputBreakerAmps } from '../core/equipment';
import { gridInputCheck, gridInputLabel, inverterFedBy } from '../core/inverter';
import { suggestWireSize } from '../core/wire';
import { sortByText, STATUS_LABELS } from '../core/labels';
import type { Dispatch, PanelPatch } from '../state/projectReducer';
import { NumField } from './NumField';
import { VAField } from './VAField';

const PRESET_OPTIONS = sortByText(PANEL_PRESETS, (x) => x.name);
const FAMILY_OPTIONS = sortByText(FAMILIES, (f) => f.label);
const INVERTER_OPTIONS = sortByText(INVERTERS, (m) => m.name);

interface Props {
  project: Project;
  panel: Panel;
  dispatch: Dispatch;
  onSelectPanel(id: string): void;
  onSelectBreaker(panelId: string, id: string): void;
  onDeleted(): void;
}

export function PanelSetup({ project, panel, dispatch, onSelectPanel, onSelectBreaker, onDeleted }: Props) {
  const [open, setOpen] = useState(true);
  const [tandemDraft, setTandemDraft] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [gridMessage, setGridMessage] = useState<string | null>(null);
  const change = (patch: PanelPatch, key?: string) => dispatch({ type: 'panel', panelId: panel.id, patch }, key && `${panel.id}:${key}`);
  // Editing a sized field makes the panel "custom".
  const custom = (patch: Partial<PanelConfig>, key?: string) => change({ ...patch, presetId: null }, key);
  const tandemMode = Array.isArray(panel.tandemSpaces) ? 'list' : panel.tandemSpaces;
  const order = panelOrder(project);
  const children = childrenOf(project, panel.id);

  // Breakers that could feed this panel: 2-pole, in a panel outside this one's subtree, not feeding another panel.
  const feedOptions = sortByText(
    project.panels
      .filter((q) => !isWithin(project, q.id, panel.id))
      .flatMap((q) =>
        q.breakers
          .filter((b) => b.form === 'double')
          .filter((b) => {
            const fed = panelFedBy(project, b.id);
            return !fed || fed.id === panel.id;
          })
          .map((b) => {
            const c = b.circuits[0];
            const text = `${q.name} · ckt ${circuitNumber(b, 0)} · ${c?.amps} A${c?.label ? ` · ${c.label}` : ''}`;
            return { panel: q, breaker: b, text };
          }),
      ),
    (o) => o.text,
  );

  // Renaming a subpanel also renames its feeder and inverter grid-input breakers while they still have the automatic label.
  const rename = (name: string) => {
    change({ name }, 'name');
    const fd = feederOf(project, panel);
    const c = fd?.breaker.circuits[0];
    if (fd && c && c.label === `Subpanel: ${panel.name}`) {
      dispatch(
        { type: 'updateCircuit', panelId: fd.panel.id, breakerId: fd.breaker.id, circuitId: c.id, patch: { label: `Subpanel: ${name}` } },
        `${panel.id}:name`,
      );
    }
    const g = gridInputCheck(project, panel);
    if (g && g.circuit.label === gridInputLabel(panel.name)) {
      dispatch(
        { type: 'updateCircuit', panelId: g.panel.id, breakerId: g.breaker.id, circuitId: g.circuit.id, patch: { label: gridInputLabel(name) } },
        `${panel.id}:name`,
      );
    }
  };

  const il = panel.interlock;
  const gens = backfedBreakers(panel);
  const setInterlock = (patch: Partial<GeneratorInterlock>, key?: string) => il && change({ interlock: { ...il, ...patch } }, key);
  const src = il ? sourceName(il) : 'generator';
  const inverter = il?.kind === 'inverter';
  const setInverter = (patch: Partial<InverterSettings>, key?: string) => il && setInterlock({ inverter: { ...il.inverter, ...patch } }, key);
  const model = inverter ? inverterModel(il?.inverter.modelId) : undefined;
  const grid = gridInputCheck(project, panel);
  const upstream = feederOf(project, panel)?.panel;

  // Grid-input breakers this inverter could use: not already another inverter's, and not in a panel it backs up (unless it's the current one).
  const gridOptions = inverter
    ? sortByText(
        project.panels.flatMap((q) =>
          q.breakers
            .filter((b) => b.circuits[0]?.loadType === 'inverter-input')
            .filter((b) => b.id === grid?.breaker.id || (!inverterFedBy(project, b.id) && !isWithin(project, q.id, panel.id)))
            .map((b) => {
              const c = b.circuits[0];
              return { id: b.id, text: `${q.name} · ckt ${circuitNumber(b, 0)} · ${c.amps} A${c.label ? ` · ${c.label}` : ''}` };
            }),
        ),
        (o) => o.text,
      )
    : [];

  const addGridBreaker = () => {
    if (!il || !upstream) return;
    const t = TEMPLATES.find((x) => x.id === 'inverter-grid');
    const space = findFreeSpace(upstream, upstream.breakers, 'double');
    if (!t) return;
    if (space == null) {
      setGridMessage(`There's no free 2-pole space in ${upstream.name}.`);
      return;
    }
    setGridMessage(null);
    const amps = gridBreakerAmps(il.inverter);
    const wireSize = suggestWireSize(amps, 'Cu', 'THHN/THWN-2', 'inverter-input');
    const b = breakerFromTemplate(t, space, {
      amps,
      label: gridInputLabel(panel.name),
      ...(model ? { loadVA: chargeWatts(model, model.gridCharge.defaultA) } : {}),
      ...(wireSize ? { wire: { size: wireSize, material: 'Cu' as const, type: 'THHN/THWN-2' as const } } : {}),
    });
    const key = `${panel.id}:gridInput:${b.id}`; // one undo step
    dispatch({ type: 'addBreaker', panelId: upstream.id, breaker: b }, key);
    dispatch({ type: 'panel', panelId: panel.id, patch: { interlock: { ...il, inverter: { ...il.inverter, gridBreakerId: b.id } } } }, key);
  };

  const addSourceBreaker = () => {
    if (!il) return;
    const space = interlockSpace(il.side);
    const t = TEMPLATES.find((x) => x.id === (inverter ? 'inverter-out' : il.inletAmps === 50 ? 'generator-50' : 'generator-30'));
    if (!t) return;
    const r = checkPlacement(panel, panel.breakers, 'double', space);
    if (!r.ok) {
      setGenMessage(`Spaces ${space},${space + 2} need to be free first: ${r.reason.toLowerCase()}.`);
      return;
    }
    setGenMessage(null);
    // An inverter breaker starts at 125% of the inverter's continuous output current, within what its manual allows.
    const amps = inverter && il.generatorWatts > 0 ? outputBreakerAmps(il) : undefined;
    const wireSize = amps ? suggestWireSize(amps, 'Cu', 'THHN/THWN-2', 'inverter') : null;
    const extra = amps ? { amps, ...(wireSize ? { wire: { size: wireSize, material: 'Cu' as const, type: 'THHN/THWN-2' as const } } : {}) } : {};
    const b = breakerFromTemplate(t, space, extra);
    dispatch({ type: 'addBreaker', panelId: panel.id, breaker: b });
    onSelectBreaker(panel.id, b.id);
  };

  return (
    <section className="card">
      <h2>
        Panel
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Edit'}
        </button>
      </h2>
      {order.length > 1 && (
        <label className="field">
          <span>Editing</span>
          <select value={panel.id} onChange={(e) => onSelectPanel(e.target.value)}>
            {order.map((x) => (
              <option key={x.id} value={x.id}>
                {'— '.repeat(depthOf(project, x))}
                {x.name || 'Panel'}
              </option>
            ))}
          </select>
        </label>
      )}
      {!open ? (
        <p className="hint">
          {panel.name}: {panel.busAmps} A bus · {panel.mainType === 'main-breaker' ? `${panel.mainAmps ?? '?'} A main` : 'main lugs'} ·{' '}
          {panel.spaces} spaces / {panel.maxCircuits} circuits
        </p>
      ) : (
        <>
          <label className="field">
            <span>Start from</span>
            <select
              value={panel.presetId ?? ''}
              onChange={(e) => {
                const preset = PANEL_PRESETS.find((x) => x.id === e.target.value);
                change(preset ? presetPatch(preset) : { presetId: null });
              }}
            >
              <option value="">Custom (match the panel label)</option>
              {PRESET_OPTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid2">
            <label className="field">
              <span>Panel name</span>
              <input value={panel.name} onChange={(e) => rename(e.target.value)} />
            </label>
            <label className="field">
              <span>Breaker line</span>
              <select value={panel.family} onChange={(e) => change({ family: e.target.value as BreakerFamilyId })}>
                {FAMILY_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Bus rating (A)</span>
              <NumField value={panel.busAmps} min={30} step={5} onChange={(v) => v != null && v > 0 && custom({ busAmps: v }, 'bus')} />
            </label>
            <label className="field">
              <span>Main</span>
              <select
                value={panel.mainType}
                onChange={(e) => {
                  const mainType = e.target.value as PanelConfig['mainType'];
                  custom({ mainType, mainAmps: mainType === 'main-breaker' ? (panel.mainAmps ?? panel.busAmps) : null });
                }}
              >
                <option value="main-breaker">Main breaker</option>
                <option value="main-lug">Main lugs only</option>
              </select>
            </label>
            {panel.mainType === 'main-breaker' && (
              <label className="field">
                <span>Main breaker (A)</span>
                <NumField value={panel.mainAmps} min={15} step={5} onChange={(v) => v != null && v > 0 && custom({ mainAmps: v }, 'main')} />
              </label>
            )}
            <label className="field">
              <span>Spaces</span>
              <NumField
                value={panel.spaces}
                min={2}
                max={84}
                step={2}
                onChange={(v) => v != null && Number.isInteger(v) && v >= 2 && v <= 84 && custom({ spaces: v }, 'spaces')}
              />
            </label>
            <label className="field">
              <span>Max circuits</span>
              <NumField
                value={panel.maxCircuits}
                min={2}
                max={168}
                step={2}
                onChange={(v) => v != null && Number.isInteger(v) && v >= 1 && custom({ maxCircuits: v }, 'max')}
              />
            </label>
            <label className="field">
              <span>Panel is</span>
              <select value={panel.status} onChange={(e) => change({ status: e.target.value as InstallStatus })}>
                <option value="existing">{STATUS_LABELS.existing}</option>
                <option value="new">{STATUS_LABELS.new}</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Spaces that accept tandem breakers</span>
            <select
              value={tandemMode}
              onChange={(e) => {
                const mode = e.target.value;
                if (mode === 'list') custom({ tandemSpaces: [] });
                else custom({ tandemSpaces: mode as 'none' | 'all' });
              }}
            >
              <option value="all">All spaces</option>
              <option value="none">None</option>
              <option value="list">Only some spaces…</option>
            </select>
          </label>
          {Array.isArray(panel.tandemSpaces) && (
            <label className="field">
              <span>Tandem spaces (e.g. 21-30, 35)</span>
              <input
                value={tandemDraft ?? formatSpaceList(panel.tandemSpaces)}
                placeholder="21-30"
                onFocus={() => setTandemDraft(formatSpaceList(panel.tandemSpaces as number[]))}
                onBlur={() => setTandemDraft(null)}
                onChange={(e) => {
                  setTandemDraft(e.target.value);
                  custom({ tandemSpaces: parseSpaceList(e.target.value) }, 'tandem');
                }}
              />
            </label>
          )}
          <label className="field">
            <span>Catalog number (optional)</span>
            <input value={panel.catalogNumber} placeholder="From the panel label" onChange={(e) => change({ catalogNumber: e.target.value }, 'catalog')} />
          </label>

          {panel.feed && (
            <>
              <h3>Subpanel</h3>
              <label className="field">
                <span>Fed from</span>
                <select
                  value={panel.feed ? `${panel.feed.panelId}|${panel.feed.breakerId}` : ''}
                  onChange={(e) => {
                    const [panelId, breakerId] = e.target.value.split('|');
                    const opt = feedOptions.find((o) => o.panel.id === panelId && o.breaker.id === breakerId);
                    if (!opt) return;
                    change({ feed: { panelId, breakerId } });
                    const c = opt.breaker.circuits[0];
                    if (c && c.loadType !== 'subpanel') {
                      dispatch({
                        type: 'updateCircuit',
                        panelId,
                        breakerId,
                        circuitId: c.id,
                        patch: { loadType: 'subpanel', label: c.label.trim() ? c.label : `Subpanel: ${panel.name}` },
                      });
                    }
                  }}
                >
                  {!feedOptions.some((o) => o.breaker.id === panel.feed?.breakerId) && <option value="">(missing)</option>}
                  {feedOptions.map((o) => (
                    <option key={o.breaker.id} value={`${o.panel.id}|${o.breaker.id}`}>
                      {o.text}
                    </option>
                  ))}
                </select>
              </label>
              <div className="checkrow">
                <label>
                  <input type="checkbox" checked={panel.separateBuilding} onChange={(e) => change({ separateBuilding: e.target.checked })} />
                  In a separate building
                </label>
              </div>
              <button
                type="button"
                className="danger"
                disabled={children.length > 0}
                title={children.length ? 'Delete the subpanels fed from this panel first' : ''}
                onClick={() => {
                  if (!window.confirm(`Delete subpanel "${panel.name}"? Its feeder breaker stays in place. You can undo this.`)) return;
                  dispatch({ type: 'deletePanel', panelId: panel.id });
                  onDeleted();
                }}
              >
                Delete subpanel
              </button>
            </>
          )}

          <h3>Backup power</h3>
          <div className="checkrow">
            <label>
              <input
                type="checkbox"
                checked={!!il}
                onChange={(e) => change({ interlock: e.target.checked ? defaultInterlock() : null })}
              />
              Interlock with a generator or battery inverter
            </label>
          </div>
          {il && (
            <>
              <div className="grid2">
                <label className="field">
                  <span>Source</span>
                  <select
                    value={il.kind}
                    onChange={(e) => {
                      const kind = e.target.value as GeneratorInterlock['kind'];
                      setInterlock({
                        kind,
                        inletAmps: kind === 'portable' ? (il.inletAmps ?? 30) : null,
                        surgeWatts: kind === 'inverter' ? il.surgeWatts : null,
                      });
                    }}
                  >
                    <option value="inverter">Battery inverter</option>
                    <option value="portable">Portable generator, via power inlet</option>
                    <option value="standby">Standby generator (permanent)</option>
                  </select>
                </label>
                {inverter && (
                  <label className="field wide">
                    <span>Inverter model</span>
                    <select
                      value={il.inverter.modelId ?? ''}
                      onChange={(e) => {
                        const m = inverterModel(e.target.value);
                        change({ interlock: m ? applyInverterModel(il, m) : { ...il, inverter: { ...il.inverter, modelId: null } } });
                      }}
                    >
                      <option value="">Custom (enter from the spec sheet)</option>
                      {INVERTER_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>{inverter ? 'Inverter' : 'Generator'} breaker</span>
                  <select value={il.side} onChange={(e) => setInterlock({ side: e.target.value as GeneratorInterlock['side'] })}>
                    <option value="left">Left of main (spaces 1,3)</option>
                    <option value="right">Right of main (spaces 2,4)</option>
                  </select>
                </label>
                <label className="field">
                  <span>{inverter ? 'Continuous output' : 'Running watts'}</span>
                  <VAField
                    value={il.generatorWatts}
                    placeholder={inverter ? 'W, or kW like 12 kW' : 'W, or kW like 7.5 kW'}
                    onChange={(v) => setInterlock({ generatorWatts: v, inverter: { ...il.inverter, modelId: null } }, 'genW')}
                  />
                </label>
                {inverter && (
                  <label className="field">
                    <span>Surge (peak)</span>
                    <VAField
                      value={il.surgeWatts}
                      placeholder="W or kW, optional"
                      onChange={(v) => setInterlock({ surgeWatts: v > 0 ? v : null, inverter: { ...il.inverter, modelId: null } }, 'surgeW')}
                    />
                  </label>
                )}
                {il.kind === 'portable' && (
                  <label className="field">
                    <span>Power inlet</span>
                    <select value={il.inletAmps ?? 30} onChange={(e) => setInterlock({ inletAmps: Number(e.target.value) })}>
                      <option value={20}>20 A</option>
                      <option value={30}>30 A</option>
                      <option value={50}>50 A</option>
                    </select>
                  </label>
                )}
              </div>
              {gens.length === 0 ? (
                <>
                  <button type="button" onClick={addSourceBreaker}>
                    Add {src} breaker at spaces {interlockSpace(il.side)},{interlockSpace(il.side) + 2}
                  </button>
                  {genMessage && <p className="hint bad" style={{ marginTop: 6 }}>{genMessage}</p>}
                </>
              ) : (
                <p className="hint">
                  {inverter ? 'Inverter' : 'Generator'} breaker:{' '}
                  {gens.map((g) => (
                    <button key={g.id} type="button" className="link-btn" onClick={() => onSelectBreaker(panel.id, g.id)}>
                      spaces {circuitNumber(g, 0)}, {g.circuits[0]?.amps} A
                    </button>
                  ))}
                </p>
              )}
              {inverter && (
                <>
                  <h3>Inverter grid input</h3>
                  <label className="field">
                    <span>Grid input breaker</span>
                    <select value={grid?.breaker.id ?? ''} onChange={(e) => setInverter({ gridBreakerId: e.target.value || null })}>
                      <option value="">None</option>
                      {gridOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.text}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!grid && upstream && (
                    <button type="button" onClick={addGridBreaker}>
                      Add grid input breaker in {upstream.name || 'the panel upstream'}
                    </button>
                  )}
                  {gridMessage && <p className="hint bad" style={{ marginTop: 6 }}>{gridMessage}</p>}
                  {!grid && (
                    <p className="hint" style={{ marginTop: 6 }}>
                      Already have the breaker? Set its load type to "Inverter grid input" and pick it here.
                    </p>
                  )}
                  <div className="grid2" style={{ marginTop: 6 }}>
                    <label className="field">
                      <span>AC input limit (A)</span>
                      <NumField
                        value={il.inverter.gridInputAmps}
                        allowEmpty
                        min={0}
                        step={5}
                        placeholder="optional"
                        onChange={(v) => setInverter({ gridInputAmps: v != null && v > 0 ? v : null, modelId: null }, 'gridA')}
                      />
                    </label>
                    <label className="field" title="Largest breaker the inverter's manual allows on its AC input and output.">
                      <span>Max AC breaker (A)</span>
                      <NumField
                        value={il.inverter.acBreakerAmps}
                        allowEmpty
                        min={0}
                        step={5}
                        placeholder="from the manual"
                        onChange={(v) => setInverter({ acBreakerAmps: v != null && v > 0 ? v : null }, 'acBrk')}
                      />
                    </label>
                    {grid && (
                      <label className="field">
                        <span>Charging power</span>
                        <VAField
                          value={grid.chargeVA}
                          placeholder="W, or kW like 5 kW"
                          onChange={(v) =>
                            dispatch(
                              { type: 'updateCircuit', panelId: grid.panel.id, breakerId: grid.breaker.id, circuitId: grid.circuit.id, patch: { loadVA: v } },
                              `${grid.circuit.id}:loadVA`,
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                  {grid && model && (
                    <p className="hint" style={{ marginTop: 0 }}>
                      {model.gridCharge.setting[0].toUpperCase() + model.gridCharge.setting.slice(1)}:{' '}
                      {[model.gridCharge.defaultA, model.gridCharge.maxA].map((a, i) => (
                        <span key={a}>
                          {i > 0 && ' · '}
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              dispatch({
                                type: 'updateCircuit',
                                panelId: grid.panel.id,
                                breakerId: grid.breaker.id,
                                circuitId: grid.circuit.id,
                                patch: { loadVA: chargeWatts(model, a) },
                              })
                            }
                          >
                            {a} A {i === 0 ? 'default' : 'max'} = {chargeWatts(model, a).toLocaleString('en-US')} W
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="checkrow">
                    <label title="While the utility is up, the inverter sends grid power through to this panel's loads, as well as charging the battery.">
                      <input type="checkbox" checked={il.inverter.passThrough} onChange={(e) => setInverter({ passThrough: e.target.checked })} />
                      Grid power passes through to the loads
                    </label>
                    {il.inverter.gridInputAmps != null && (
                      <label title="Some inverters cut back charging when the panel's loads use up the AC input. Tick this only if the manual says so.">
                        <input type="checkbox" checked={il.inverter.throttlesInput} onChange={(e) => setInverter({ throttlesInput: e.target.checked })} />
                        Slows charging to stay within the limit
                      </label>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
