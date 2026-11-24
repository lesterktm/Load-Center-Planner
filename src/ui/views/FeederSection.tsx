import type { Project, WireSize } from '../../core/types';
import { feederCalc, serviceConductors, type FeederCalc } from '../../core/feeder';
import { panelOrder } from '../../core/tree';
import { circuitNumber } from '../../core/panel';
import { sizeLabel } from '../../core/wire';
import { dwellingConductorRef } from '../../core/editions';
import type { Dispatch } from '../../state/projectReducer';
import { NumField } from '../NumField';
import { fmt0, fmt1 } from '../format';
import { feederWireStatus } from '../feederText';
import { MethodTable } from './MethodTable';

interface Props {
  project: Project;
  dispatch: Dispatch;
  onSelectBreaker(panelId: string, id: string): void;
}

const size = (s: WireSize | null, metal: string) => (s ? `${sizeLabel(s)} ${metal}` : `larger than 350 kcmil ${metal}`);

/** Service conductor sizing and an Article 220 calculation for each subpanel feeder. */
export function FeederSection({ project, dispatch, onSelectBreaker }: Props) {
  const svc = serviceConductors(project);
  const feeders = panelOrder(project)
    .filter((x) => x.feed)
    .map((x) => feederCalc(project, x));
  const detailed = feeders.filter((fc) => fc.method && !fc.wholeHouse);

  return (
    <>
      <h3 className="doc-h">Service and feeder conductors</h3>
      <div className="method-grid feeder-grid">
        <div className="method-card">
          <div className="mc-title">Service conductors</div>
          <div className="mc-ref">NEC {svc.ref}</div>
          <div className="mc-amps">{size(svc.Cu, 'Cu')}</div>
          <div className="mc-va">or {size(svc.Al, 'Al')}</div>
          <p className="hint">
            Minimum for the {svc.rating} A service: {fmt0(svc.minAmpacity)} A
            {svc.uses83 ? ` (83% of ${svc.rating} A, allowed for a one-family dwelling)` : ''}. Assumes 75 °C conductors such as THWN-2,
            XHHW-2, USE-2 or SER, with no derating for heat or bundling.
          </p>
        </div>
        {feeders.map((fc) => (
          <FeederCard key={fc.panel.id} fc={fc} project={project} dispatch={dispatch} onSelectBreaker={onSelectBreaker} />
        ))}
      </div>
      {feeders.length === 0 && <p className="hint">No subpanels. Feeder calculations appear here for each subpanel you add.</p>}
      {detailed.length > 0 && (
        <>
          <h3 className="doc-h">How each feeder adds up</h3>
          <div className="method-details">
            {detailed.map((fc) => (
              <MethodTable key={fc.panel.id} method={fc.method!} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FeederCard({ fc, project, dispatch, onSelectBreaker }: { fc: FeederCalc } & Props) {
  const { panel, feeder, breakerAmps, method } = fc;
  const over = !!method && breakerAmps > 0 && fc.amps > breakerAmps + 1e-9;
  const wire = feeder?.circuit.wire ?? null;
  const status = feederWireStatus(wire, fc.wire, breakerAmps);
  const length = feeder?.circuit.lengthFt;

  return (
    <div className={`method-card feeder-card${over ? ' over' : ''}`}>
      <div className="mc-title">
        {panel.name || 'Subpanel'} feeder
        {fc.wholeHouse && <span className="tag">Whole house</span>}
      </div>
      <div className="mc-ref">
        {feeder ? (
          <button type="button" className="link-btn" onClick={() => onSelectBreaker(feeder.panel.id, feeder.breaker.id)}>
            {feeder.panel.name}, circuit {circuitNumber(feeder.breaker, 0)}
          </button>
        ) : (
          <span className="bad">Feeder breaker missing</span>
        )}{' '}
        · NEC {fc.wholeHouse ? (method?.ref ?? 'Article 220') : '220.40, 215.2'}
      </div>
      {method ? (
        <>
          <div className="mc-amps">{fmt1(fc.amps)} A</div>
          <div className="mc-va">
            {fmt0(method.totalVA)} VA at 240 V{fc.wholeHouse ? ` · ${method.title}` : ''}
          </div>
          {breakerAmps > 0 && (
            <>
              <div className="bar">
                <div className={over ? 'over' : 'fits'} style={{ width: `${Math.min(100, (fc.amps / breakerAmps) * 100)}%` }} />
              </div>
              <div className={over ? 'bad' : 'fits-text'}>
                {over
                  ? `${fmt1(fc.amps - breakerAmps)} A over the ${breakerAmps} A breaker${fc.minBreaker ? `; needs at least ${fc.minBreaker} A` : ''}`
                  : `${fmt1(breakerAmps - fc.amps)} A to spare on the ${breakerAmps} A breaker`}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="hint">This feeder carries the whole house. Enter the living area above to calculate it.</p>
      )}
      <dl className="feeder-facts">
        <dt>Conductors</dt>
        <dd className={status.cls}>{status.text}</dd>
        {breakerAmps > 0 && (
          <>
            <dt>Smallest for {breakerAmps} A</dt>
            <dd>
              {size(fc.suggested.Cu, 'Cu')} or {size(fc.suggested.Al, 'Al')} ({fc.suggested.type})
            </dd>
          </>
        )}
        {fc.egc && (
          <>
            <dt>Equipment ground</dt>
            <dd>
              {sizeLabel(fc.egc.Cu)} Cu or {sizeLabel(fc.egc.Al)} Al (Table 250.122)
            </dd>
          </>
        )}
        <dt>Voltage drop</dt>
        <dd className={fc.voltageDrop && fc.voltageDrop.percent > 3 ? 'warn' : ''}>
          {fc.voltageDrop
            ? `${fmt1(fc.voltageDrop.percent)}% (${fmt1(fc.voltageDrop.volts)} V) at ${fmt1(fc.amps)} A over ${length} ft`
            : wire && !length
              ? 'Enter the run length on the feeder breaker.'
              : '—'}
        </dd>
      </dl>
      {fc.wholeHouse ? (
        <p className="hint">
          Carries the whole house, so the service calculation applies and the conductors may be sized at 83% of the rating (
          {dwellingConductorRef(project.necEdition)}).
        </p>
      ) : (
        <label className="field">
          <span>Living area served (ft²)</span>
          <NumField
            value={panel.feederAreaFt2 || null}
            allowEmpty
            min={0}
            step={50}
            placeholder="none: use circuit loads"
            onChange={(v) => dispatch({ type: 'panel', panelId: panel.id, patch: { feederAreaFt2: Math.max(0, v ?? 0) } }, `${panel.id}:feederArea`)}
          />
        </label>
      )}
    </div>
  );
}
