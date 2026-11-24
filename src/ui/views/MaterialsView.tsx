import type { Project } from '../../core/types';
import { buildBom, wireTotals } from '../../core/bom';
import { fmt0 } from '../format';
import { PrintHeader } from './PrintHeader';

export function MaterialsView({ project }: { project: Project }) {
  const bom = buildBom(project);
  const wires = wireTotals(project);
  const anyVerify = bom.lines.some((l) => l.verify);
  const skipped = [
    bom.existingPanels ? `${bom.existingPanels} existing panel${bom.existingPanels === 1 ? '' : 's'}` : '',
    bom.existingBreakers ? `${bom.existingBreakers} existing breaker${bom.existingBreakers === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return (
    <div className="doc">
      <PrintHeader project={project} title="Materials list" />
      {skipped.length > 0 && <p className="hint">Only new work is listed. Left off: {skipped.join(' and ')}.</p>}
      <h3 className="doc-h">Panels, breakers and hardware</h3>
      {bom.lines.length === 0 ? (
        <p className="hint">Nothing new to buy yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th className="num">Qty</th>
              <th>Part number</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((l) => (
              <tr key={l.key}>
                <td className="num">{l.qty}</td>
                <td className="mono nowrap">
                  {l.partNumber ?? '—'}
                  {l.verify && (
                    <span className="verify" title="Confirm against the manufacturer's current catalog">
                      verify
                    </span>
                  )}
                </td>
                <td>{l.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="doc-h">Wire and cable (new circuits)</h3>
      {wires.length === 0 ? (
        <p className="hint">No wire sizes entered for new circuits yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Wire / cable</th>
              <th className="num">Runs</th>
              <th className="num">Measured length</th>
              <th className="num">With 10% extra</th>
              <th>Missing lengths</th>
            </tr>
          </thead>
          <tbody>
            {wires.map((w) => (
              <tr key={w.key}>
                <td>{w.description}</td>
                <td className="num">{w.runs}</td>
                <td className="num">{w.totalFt ? `${fmt0(w.totalFt)} ft` : '—'}</td>
                <td className="num">{w.totalFt ? `${fmt0(w.totalFt * 1.1)} ft` : '—'}</td>
                <td>{w.runsWithoutLength ? `${w.runsWithoutLength} run${w.runsWithoutLength === 1 ? '' : 's'}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="disclaimer">
        Part numbers are suggestions built from common catalog patterns.
        {anyVerify
          ? ' Items marked "verify" vary by product generation or panel model (plug-on neutral or pigtail, interlock kit fit), so check them against the manufacturer\'s current catalog.'
          : ''}{' '}
        Use only breakers and accessories listed for the panel (see the panel label). Cable conductor counts (/2 or /3) are assumed from the
        load type.
      </p>
    </div>
  );
}
