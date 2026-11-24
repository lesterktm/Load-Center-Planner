import type { Project } from '../core/types';
import type { Dispatch } from '../state/projectReducer';

export function Welcome({ project, dispatch }: { project: Project; dispatch: Dispatch }) {
  return (
    <section className="card">
      <h2>Getting started</h2>
      <ul className="tips">
        <li>
          Click an empty <b>+</b> space to add a breaker, or start from a common circuit.
        </li>
        <li>Click a breaker to edit it. Drag it to move it, or use the arrows in the editor.</li>
        <li>
          Use <b>Add subpanel</b> below the panels for a garage or shop panel. Turn on a <b>generator interlock</b> in the Panel settings.
        </li>
        <li>
          Mark breakers already in place as <b>Existing</b>. The <b>Load calc</b> tab then shows whether the service can take the new work.
        </li>
        <li>
          Set the NEC edition (2005 to 2023) at the top. The checks follow it. To survey an existing house, pick the edition it was built
          under; switch to your area's current edition for new work.
        </li>
        <li>
          The <b>Schedule</b>, <b>Directory</b> and <b>Materials</b> tabs are ready to print.
        </li>
        <li>
          Work saves automatically in this browser. Use <b>Save</b> to keep a file you can reopen or share.
        </li>
      </ul>
      <label className="field">
        <span>Project notes</span>
        <textarea
          rows={5}
          value={project.notes}
          placeholder="Service details, utility, permit number, existing conditions…"
          onChange={(e) => dispatch({ type: 'meta', patch: { notes: e.target.value } }, 'meta:notes')}
        />
      </label>
    </section>
  );
}
