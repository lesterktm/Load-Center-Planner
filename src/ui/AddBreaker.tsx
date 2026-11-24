import type { Breaker, BreakerForm, Panel } from '../core/types';
import { checkPlacement, isLeftSpace, phaseOfSpace } from '../core/panel';
import { FORM_LABELS, FORM_SHORT, PROTECTION_BADGE } from '../core/labels';
import { breakerFromTemplate, newBreaker } from '../core/project';
import { TEMPLATES, type CircuitTemplate } from '../data/templates';

interface Props {
  panel: Panel;
  space: number;
  onAdd(breaker: Breaker): void;
  onCancel(): void;
}

const FORMS: BreakerForm[] = ['single', 'double', 'tandem', 'quad'];

function groupTemplates(): [string, CircuitTemplate[]][] {
  const groups = new Map<string, CircuitTemplate[]>();
  for (const t of TEMPLATES) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  return [...groups.entries()];
}
const GROUPS = groupTemplates();

export function AddBreaker({ panel, space, onAdd, onCancel }: Props) {
  const check = (form: BreakerForm) => checkPlacement(panel, panel.breakers, form, space);
  return (
    <section className="card">
      <div className="editor-head">
        <h2>Add a breaker at space {space}</h2>
        <button type="button" className="icon" onClick={onCancel} aria-label="Close">
          ×
        </button>
      </div>
      <p className="hint">
        {panel.name}: {isLeftSpace(space) ? 'left' : 'right'} column, bus leg {phaseOfSpace(panel.system, space)}.
      </p>
      <div className="form-buttons">
        {FORMS.map((f) => {
          const r = check(f);
          return (
            <button key={f} type="button" disabled={!r.ok} title={r.ok ? '' : r.reason} onClick={() => onAdd(newBreaker(f, space))}>
              <span>{FORM_LABELS[f]}</span>
              {!r.ok && <small>{r.reason}</small>}
            </button>
          );
        })}
      </div>
      <h3>Or start from a common circuit</h3>
      {GROUPS.map(([group, templates]) => (
        <div key={group} className="tpl-group">
          <h4>{group}</h4>
          <div className="tpl-list">
            {templates.map((t) => {
              const r = check(t.form);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="tpl"
                  disabled={!r.ok}
                  title={r.ok ? '' : r.reason}
                  onClick={() => onAdd(breakerFromTemplate(t, space))}
                >
                  <span>{t.name}</span>
                  <small>
                    {t.circuit.amps} A {FORM_SHORT[t.form]}
                    {t.protection !== 'standard' ? ` · ${PROTECTION_BADGE[t.protection]}` : ''}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
