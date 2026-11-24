import { useState, type ReactNode } from 'react';
import type { Panel, Project } from '../../core/types';
import { circuitNumber, formRows, occupancy, rowCount } from '../../core/panel';
import { PROTECTION_BADGE } from '../../core/labels';
import { feederOf, panelFedBy, panelOrder } from '../../core/tree';
import { isBackfedType } from '../../core/generator';
import { gridInputCheck, inverterFedBy } from '../../core/inverter';

interface CardProps {
  project: Project;
  panel: Panel;
  compact: boolean;
  showAmps: boolean;
}

/** Two-column directory card laid out like the panel, for the inside of the door (NEC 408.4(A)). */
function DirectoryCard({ project, panel, compact, showAmps }: CardProps) {
  const rows = rowCount(panel.spaces);
  const occ = occupancy(panel.breakers);
  const feeder = feederOf(project, panel);
  const grid = gridInputCheck(project, panel);

  const side = (s: number): ReactNode[] => {
    const cells: ReactNode[] = [
      <td key={`n${s}`} className="n">
        {s <= panel.spaces ? s : ''}
      </td>,
    ];
    if (s > panel.spaces) {
      cells.push(<td key={`d${s}`} />);
      return cells;
    }
    const b = occ.get(s);
    if (!b) {
      cells.push(
        <td key={`d${s}`} className="spare">
          Space
        </td>,
      );
      return cells;
    }
    if (b.space !== s) return cells; // covered by a 2-pole cell above
    const two = b.circuits.length === 2;
    const poles = formRows(b.form) === 2 ? '2P' : '';
    const feeds = panelFedBy(project, b.id);
    const inverterFor = b.circuits[0]?.loadType === 'inverter-input' ? inverterFedBy(project, b.id) : undefined;
    const isGen = b.circuits.some((c) => isBackfedType(c.loadType));
    cells.push(
      <td key={`d${s}`} rowSpan={formRows(b.form)} className={isGen ? 'gen-cell' : ''}>
        {b.circuits.map((c, i) => (
          <div key={c.id} className="d-line">
            {two && <span className="d-sub">{circuitNumber(b, i).split(',')[0]}</span>}
            <span className="d-label">
              {c.label || '—'}
              {feeds && i === 0 && !c.label.includes(feeds.name) ? ` (to ${feeds.name})` : ''}
              {inverterFor && i === 0 && !c.label.includes(inverterFor.name) ? ` (inverter for ${inverterFor.name})` : ''}
              {c.gfciReceptacle && c.servesReceptacles && <span className="d-tag">GFCI receptacle</span>}
            </span>
            {showAmps && (
              <span className="d-amps">
                {c.amps}A{poles ? ` ${poles}` : ''}
                {!two && PROTECTION_BADGE[b.protection] ? ` ${PROTECTION_BADGE[b.protection]}` : ''}
              </span>
            )}
          </div>
        ))}
      </td>,
    );
    return cells;
  };

  return (
    <div className={`directory page${compact ? ' compact' : ''}`}>
      <div className="dir-head">
        <h1>{panel.name || 'Panel'} directory</h1>
        <div>
          {project.address || project.name}
          {panel.mainType === 'main-breaker' ? ` · Main ${panel.mainAmps ?? '?'} A` : ` · Main lugs, ${panel.busAmps} A`}
          {feeder ? ` · Fed from ${feeder.panel.name}, circuit ${circuitNumber(feeder.breaker, 0)}` : ''}
        </div>
        {panel.interlock && (
          <div className="dir-warn">
            {panel.interlock.kind === 'inverter'
              ? `Inverter interlock: normally the INVERTER breaker (${panel.interlock.side === 'left' ? '1,3' : '2,4'}) is on and the MAIN is off. To bypass the inverter, turn the INVERTER breaker off, then the MAIN on.${grid ? ` Inverter grid input: ${grid.panel.name}, circuit ${circuitNumber(grid.breaker, 0)}.` : ''}`
              : `Generator interlock: turn the MAIN off before turning on the GENERATOR breaker (${panel.interlock.side === 'left' ? '1,3' : '2,4'}).`}
          </div>
        )}
      </div>
      <table>
        <colgroup>
          <col className="c-n" />
          <col />
          <col className="c-n" />
          <col />
        </colgroup>
        <tbody>
          {Array.from({ length: rows }, (_, i) => {
            const left = 2 * i + 1;
            return (
              <tr key={left}>
                {side(left)}
                {side(left + 1)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="dir-foot">Updated {new Date().toLocaleDateString()}</div>
    </div>
  );
}

export function DirectoryView({ project }: { project: Project }) {
  const [compact, setCompact] = useState(false);
  const [showAmps, setShowAmps] = useState(true);
  return (
    <div className="doc">
      <div className="toolbar no-print">
        <label>
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Compact
        </label>
        <label>
          <input type="checkbox" checked={showAmps} onChange={(e) => setShowAmps(e.target.checked)} /> Show breaker sizes
        </label>
        <span className="hint" style={{ margin: 0 }}>
          Each panel prints on its own page. Fix it inside the panel door.
        </span>
      </div>
      {panelOrder(project).map((panel) => (
        <DirectoryCard key={panel.id} project={project} panel={panel} compact={compact} showAmps={showAmps} />
      ))}
    </div>
  );
}
