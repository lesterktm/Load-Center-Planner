import type { Panel, Phase, Project } from '../core/types';
import { generatorLoad } from '../core/generator';
import { fmt0 } from './format';

/** Planned generator load against the generator's rating, overall and per leg. */
export function GeneratorCard({ project, panel }: { project: Project; panel: Panel }) {
  const il = panel.interlock;
  if (!il) return null;
  const load = generatorLoad(project, panel);
  const watts = Math.max(1, il.generatorWatts);
  const pct = (load.totalVA / watts) * 100;
  const bar = (value: number, max: number, cls: string) => (
    <div className="bar">
      <div className={`${cls}${value > max ? ' over' : ''}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
  const leg = (ph: Phase) => (
    <div className="leg" key={ph}>
      <div className="leg-head">
        <b className={`leg-name ${ph}`}>{ph}</b>
        <span>
          {fmt0(load.legVA[ph])} of {fmt0(watts / 2)} VA
        </span>
      </div>
      {bar(load.legVA[ph], watts / 2, ph)}
    </div>
  );
  return (
    <section className="card">
      <h2>Generator load</h2>
      <div className="stat">
        <span>Circuits on generator</span>
        <b>{load.circuits}</b>
      </div>
      <div className="stat">
        <span>Planned load</span>
        <b className={load.totalVA > watts ? 'bad' : ''}>
          {fmt0(load.totalVA)} VA ({Math.round(pct)}%)
        </b>
      </div>
      <div className="leg">
        <div className="leg-head">
          <b>Total</b>
          <span>of {fmt0(il.generatorWatts)} W running</span>
        </div>
        {bar(load.totalVA, watts, 'gen')}
      </div>
      {leg('L1')}
      {leg('L2')}
      <p className="hint" style={{ marginTop: 8 }}>
        Tick "On generator" on each circuit you'll run. Each leg of a 120/240 V generator can carry half its rating. Motors (AC, well
        pumps) need extra starting surge.
      </p>
    </section>
  );
}
