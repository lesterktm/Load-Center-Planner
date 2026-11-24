import { useRef } from 'react';
import type { NecEdition, Project } from '../core/types';
import { NEC_EDITIONS } from '../core/types';

interface Props {
  project: Project;
  canUndo: boolean;
  canRedo: boolean;
  onMeta(patch: Partial<Pick<Project, 'name' | 'address' | 'necEdition'>>, coalesceKey?: string): void;
  onNew(): void;
  onExample(): void;
  onOpen(file: File): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  onPrint(): void;
}

export function TopBar(props: Props) {
  const { project } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar no-print">
      <div className="brand">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="5" fill="#374151" />
          <path d="M13 3 6 14h5l-1 7 7-11h-5z" fill="#facc15" />
        </svg>
        Load Center Planner
      </div>
      <input
        className="proj-name"
        value={project.name}
        placeholder="Project name"
        aria-label="Project name"
        onChange={(e) => props.onMeta({ name: e.target.value }, 'meta:name')}
      />
      <input
        className="proj-addr"
        value={project.address}
        placeholder="Address / job"
        aria-label="Address or job"
        onChange={(e) => props.onMeta({ address: e.target.value }, 'meta:address')}
      />
      <label
        className="inline"
        title="The code edition your jurisdiction has adopted; checks follow it. For an existing house, pick the edition in force when it was built to see what was required then."
      >
        NEC
        <select value={project.necEdition} onChange={(e) => props.onMeta({ necEdition: e.target.value as NecEdition })}>
          {NEC_EDITIONS.map((ed) => (
            <option key={ed} value={ed}>
              {ed}
            </option>
          ))}
        </select>
      </label>
      <div className="spacer" />
      <div className="btn-group">
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
      </div>
      <div className="btn-group">
        <button type="button" onClick={props.onNew}>New</button>
        <button type="button" onClick={props.onExample} title="Load the example house">Example</button>
        <button type="button" onClick={() => fileRef.current?.click()}>Open…</button>
        <button type="button" onClick={props.onSave} title="Download this project as a file">Save</button>
        <button type="button" onClick={props.onPrint}>Print</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) props.onOpen(f);
          e.target.value = '';
        }}
      />
    </header>
  );
}
