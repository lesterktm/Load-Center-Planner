import type { Panel, Project } from '../../core/types';
import { panelDescription } from '../../core/bom';

interface Props {
  project: Project;
  title: string;
  /** Show this panel's details; otherwise a project summary. */
  panel?: Panel;
  className?: string;
}

export function PrintHeader({ project, title, panel, className = '' }: Props) {
  return (
    <div className={`print-head ${className}`}>
      <div>
        <h1>{title}</h1>
        <div className="sub">
          {project.name}
          {project.address ? ` · ${project.address}` : ''}
        </div>
      </div>
      <div className="meta">
        {panel ? (
          <>
            <div>
              <b>{panel.name}</b>
            </div>
            <div>{panelDescription(panel)}</div>
          </>
        ) : (
          <div>
            {project.panels.length} panel{project.panels.length === 1 ? '' : 's'}
          </div>
        )}
        <div>
          NEC {project.necEdition} · Printed {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
