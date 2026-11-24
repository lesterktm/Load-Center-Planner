import type { Finding, Severity } from '../core/rules';

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  check: 'Check',
  info: 'Note',
};

export function FindingItem({ finding: f, onSelect }: { finding: Finding; onSelect?: (f: Finding) => void }) {
  const body = (
    <>
      <span className="sev-tag">{SEVERITY_LABEL[f.severity]}</span>
      {f.where && <span className="where">{f.where}</span>}
      <span className="msg">{f.message}</span>
      {f.ref && <span className="ref">NEC {f.ref}</span>}
    </>
  );
  return (
    <li className={`finding sev-${f.severity}`}>
      {onSelect && (f.breakerId || f.panelId || f.rule === 'service-load') ? (
        <button type="button" onClick={() => onSelect(f)}>
          {body}
        </button>
      ) : (
        <div>{body}</div>
      )}
    </li>
  );
}

interface Props {
  findings: Finding[];
  onSelect(f: Finding): void;
}

export function FindingsList({ findings, onSelect }: Props) {
  const counts = (['error', 'warning', 'check', 'info'] as Severity[])
    .map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <section className="card findings">
      <h2>
        Checks
        <span className="counts">
          {counts.map(([s, n]) => (
            <span key={s} className={`count sev-${s}`} title={SEVERITY_LABEL[s]}>
              {n}
            </span>
          ))}
        </span>
      </h2>
      {findings.length === 0 ? (
        <p className="hint">No issues found.</p>
      ) : (
        <ul>
          {findings.map((f) => (
            <FindingItem key={f.id} finding={f} onSelect={onSelect} />
          ))}
        </ul>
      )}
      <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
        These checks are a planning aid. Local amendments and the inspector have the final say.
      </p>
    </section>
  );
}
