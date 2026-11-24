import type { Panel, Project } from '../../core/types';
import { circuitRows } from '../../core/circuits';
import { legLoads } from '../../core/balance';
import { LOCATION_LABELS, PROTECTION_BADGE } from '../../core/labels';
import { wireLabel } from '../../core/wire';
import { feederOf, panelOrder } from '../../core/tree';
import { circuitNumber } from '../../core/panel';
import { movedFromText } from '../../core/move';
import { gridInputCheck, inverterFedBy } from '../../core/inverter';
import { fmt0, fmt1 } from '../format';
import { PrintHeader } from './PrintHeader';

function PanelSchedule({ project, panel }: { project: Project; panel: Panel }) {
  const rows = circuitRows(project, panel);
  const legs = legLoads(project, panel);
  const feeder = feederOf(project, panel);
  const grid = gridInputCheck(project, panel);
  // Existing circuits planned to leave this panel for another one.
  const movingOut = project.panels.flatMap((to) =>
    to.id === panel.id ? [] : to.breakers.filter((b) => b.movedFrom?.panelId === panel.id).map((b) => ({ to, b })),
  );
  return (
    <section className="page">
      <PrintHeader project={project} title={`Panel schedule: ${panel.name || 'Panel'}`} panel={panel} />
      {feeder && (
        <p className="hint">
          Fed from {feeder.panel.name}, circuit {circuitNumber(feeder.breaker, 0)} ({feeder.breaker.circuits[0]?.amps} A)
          {panel.separateBuilding ? ' · separate building' : ''}
        </p>
      )}
      {panel.interlock &&
        (panel.interlock.kind === 'inverter' ? (
          <p className="hint">
            Battery inverter interlock: {fmt0(panel.interlock.generatorWatts)} W continuous
            {panel.interlock.surgeWatts ? `, ${fmt0(panel.interlock.surgeWatts)} W surge` : ''}. Every circuit in this panel runs on the
            inverter; the main breaker is the bypass.
            {grid &&
              ` Inverter grid input: ${grid.panel.name}, circuit ${circuitNumber(grid.breaker, 0)} (${grid.breakerAmps} A)${grid.chargeVA > 0 ? `, charging up to ${fmt0(grid.chargeVA)} W` : ''}.`}
            {panel.interlock.inverter.batteryKWh ? ` Battery: ${fmt1(panel.interlock.inverter.batteryKWh)} kWh.` : ''}
          </p>
        ) : (
          <p className="hint">
            Generator interlock: {fmt0(panel.interlock.generatorWatts)} W {panel.interlock.kind}
            {panel.interlock.inletAmps ? `, ${panel.interlock.inletAmps} A inlet` : ''}. Circuits marked "G" are planned to run on the
            generator.
          </p>
        ))}
      {rows.length === 0 ? (
        <p className="hint">No circuits yet. Add breakers on the Panel tab.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Ckt</th>
              <th>Description</th>
              <th>Location</th>
              <th>Breaker</th>
              <th>Wire</th>
              <th className="num">Length</th>
              <th className="num">Load VA</th>
              <th className="num">L1 VA</th>
              <th className="num">L2 VA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inverterFor = r.circuit.loadType === 'inverter-input' ? inverterFedBy(project, r.breaker.id) : undefined;
              const badge = PROTECTION_BADGE[r.breaker.protection];
              const form =
                r.breaker.form === 'tandem' ? '1P tandem' : r.breaker.form === 'quad' ? '2P quad' : r.volts === 240 ? '2P' : '1P';
              return (
                <tr key={r.circuit.id} className={r.breaker.status === 'new' ? 'is-new' : ''}>
                  <td className="nowrap">
                    <b>{r.number}</b>
                  </td>
                  <td>
                    {r.circuit.label || <span className="muted">(no description)</span>}
                    {r.feeds && <span className="muted"> → {r.feeds.name} (connected load)</span>}
                    {inverterFor && <span className="muted"> → inverter for {inverterFor.name} (charging load)</span>}
                    {r.circuit.onGenerator && <span className="g-mark" title="On generator">G</span>}
                    {r.breaker.status === 'new' && <span className="new-mark">new</span>}
                    {r.breaker.movedFrom && <span className="moved-note">moved from {movedFromText(project, r.breaker, r.index)}</span>}
                  </td>
                  <td>{LOCATION_LABELS[r.circuit.location]}</td>
                  <td className="nowrap">
                    {r.circuit.amps} A {form}
                    {badge ? ` ${badge}` : ''}
                    {r.circuit.gfciReceptacle && r.circuit.servesReceptacles && r.volts === 120 ? ' · GFCI rcpt' : ''}
                  </td>
                  <td>{r.circuit.wire ? wireLabel(r.circuit.wire) : '—'}</td>
                  <td className="num">{r.circuit.lengthFt ? `${r.circuit.lengthFt} ft` : ''}</td>
                  <td className="num">{r.loadVA ? fmt0(r.loadVA) : ''}</td>
                  <td className="num">{r.va.L1 ? fmt0(r.va.L1) : ''}</td>
                  <td className="num">{r.va.L2 ? fmt0(r.va.L2) : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Total connected load</td>
              <td className="num">{fmt0(legs.totalVA)}</td>
              <td className="num">{fmt0(legs.va.L1)}</td>
              <td className="num">{fmt0(legs.va.L2)}</td>
            </tr>
            <tr>
              <td colSpan={7}>Amps per leg at 120 V</td>
              <td className="num">{fmt1(legs.amps.L1)} A</td>
              <td className="num">{fmt1(legs.amps.L2)} A</td>
            </tr>
          </tfoot>
        </table>
      )}
      {movingOut.length > 0 && (
        <div className="moving-out">
          <b>Moving out of this panel</b>
          <ul>
            {movingOut.map(({ to, b }) => (
              <li key={b.id}>
                Circuit {circuitNumber({ ...b, space: b.movedFrom!.space }, 0)}: {b.circuits.map((c) => c.label || '(no description)').join(' / ')} →{' '}
                {to.name || 'Panel'}, circuit {circuitNumber(b, 0)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ScheduleView({ project }: { project: Project }) {
  return (
    <div className="doc">
      {panelOrder(project).map((panel) => (
        <PanelSchedule key={panel.id} project={project} panel={panel} />
      ))}
      <p className="disclaimer">
        Connected load only. See the Load calc tab for the NEC Article 220 calculation. This schedule is a planning aid; confirm all work
        with the authority having jurisdiction.
      </p>
    </div>
  );
}
