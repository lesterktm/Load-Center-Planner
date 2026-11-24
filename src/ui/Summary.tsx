import type { Panel, Phase, Project } from '../core/types';
import { legLoads } from '../core/balance';
import { polesUsed, spacesOf } from '../core/panel';
import { feederOf, isServicePanel, panelRating } from '../core/tree';
import { feederCalc } from '../core/feeder';
import { calculateLoads } from '../core/loadcalc';
import { fmt0, fmt1 } from './format';

/** Article 220 result for the panel: its feeder calculation, or the service calculation for a service panel. */
function calcLine(project: Project, panel: Panel): { label: string; text: string; over: boolean } | null {
  if (panel.feed) {
    const fc = feederCalc(project, panel);
    if (!fc.method || fc.breakerAmps <= 0) return { label: 'Feeder load (Art. 220)', text: 'see Load calc', over: false };
    return { label: 'Feeder load (Art. 220)', text: `${fmt1(fc.amps)} A of ${fc.breakerAmps} A`, over: fc.amps > fc.breakerAmps };
  }
  if (!isServicePanel(project, panel)) return null;
  const r = calculateLoads(project);
  if (r.ctx.area <= 0 || !r.best) return { label: 'Service load (Art. 220)', text: 'enter area on Load calc', over: false };
  return { label: 'Service load (Art. 220)', text: `${fmt1(r.best.amps)} A of ${r.ctx.serviceAmps} A`, over: r.best.amps > r.ctx.serviceAmps };
}

export function Summary({ project, panel }: { project: Project; panel: Panel }) {
  const legs = legLoads(project, panel);
  const used = new Set(panel.breakers.flatMap((b) => spacesOf(b.form, b.space)).filter((s) => s >= 1 && s <= panel.spaces)).size;
  const poles = polesUsed(panel.breakers);
  const feeder = feederOf(project, panel);
  const feederAmps = feeder?.breaker.circuits[0]?.amps;
  const rating = feederAmps ? Math.min(feederAmps, panelRating(panel)) : panelRating(panel);
  const ratingText = feederAmps && feederAmps <= panelRating(panel) ? `${rating} A feeder` : `${rating} A ${panel.mainType === 'main-breaker' ? 'main' : 'bus'}`;
  const calc = calcLine(project, panel);

  const leg = (ph: Phase) => (
    <div className="leg" key={ph}>
      <div className="leg-head">
        <b className={`leg-name ${ph}`}>{ph}</b>
        <span>
          {fmt0(legs.va[ph])} VA · {fmt1(legs.amps[ph])} A
        </span>
      </div>
      <div className="bar" title={`${fmt1(legs.amps[ph])} A of ${rating} A`}>
        <div className={ph} style={{ width: `${Math.min(100, (legs.amps[ph] / rating) * 100)}%` }} />
      </div>
    </div>
  );

  return (
    <section className="card">
      <h2>Summary: {panel.name || 'Panel'}</h2>
      <div className="stat">
        <span>Spaces used</span>
        <b>
          {used} / {panel.spaces}
        </b>
      </div>
      <div className="stat">
        <span>Circuits (poles)</span>
        <b className={poles > panel.maxCircuits ? 'bad' : ''}>
          {poles} / {panel.maxCircuits}
        </b>
      </div>
      <div className="stat">
        <span>Leg difference</span>
        <b>{fmt0(legs.imbalancePct)}%</b>
      </div>
      {calc && (
        <div className="stat">
          <span>{calc.label}</span>
          <b className={calc.over ? 'bad' : ''}>{calc.text}</b>
        </div>
      )}
      {leg('L1')}
      {leg('L2')}
      <p className="hint" style={{ marginTop: 8 }}>
        Bars show connected load{project.panels.length > 1 ? ', including subpanels,' : ''} against the {ratingText}. Connected load
        overstates demand; the Load calc tab has the NEC Article 220 calculations.
      </p>
    </section>
  );
}
