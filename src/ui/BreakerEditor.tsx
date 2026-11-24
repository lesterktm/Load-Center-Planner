import type { Breaker, BreakerForm, InstallStatus, Panel, Project, Protection } from '../core/types';
import type { Finding } from '../core/rules';
import { breakerPhases, checkPlacement, circuitNumber, findFreeSpace, isLeftSpace, phaseOfSpace, spacesOf } from '../core/panel';
import { FORM_LABELS, FORM_OPTIONS, PROTECTION_LABELS, PROTECTION_OPTIONS, STATUS_LABELS } from '../core/labels';
import { cloneBreaker } from '../core/project';
import { depthOf, panelFedBy, panelOrder } from '../core/tree';
import { checkMove, firstSpaceFor, movedFromText } from '../core/move';
import type { Dispatch } from '../state/projectReducer';
import { CircuitFields } from './CircuitFields';
import { FindingItem } from './FindingsList';

interface Props {
  project: Project;
  panel: Panel;
  breaker: Breaker;
  findings: Finding[];
  dispatch: Dispatch;
  onSelectBreaker(panelId: string, id: string): void;
  onSelectPanel(id: string): void;
  onClose(): void;
}

export function BreakerEditor({ project, panel, breaker: b, findings, dispatch, onSelectBreaker, onSelectPanel, onClose }: Props) {
  const { breakers } = panel;
  const canMoveTo = (space: number) => space >= 1 && checkPlacement(panel, breakers, b.form, space, b.id).ok;
  const move = (space: number) => {
    if (canMoveTo(space)) dispatch({ type: 'moveBreaker', panelId: panel.id, id: b.id, space });
  };
  const validSpaces: number[] = [];
  for (let s = 1; s <= panel.spaces; s++) if (s === b.space || canMoveTo(s)) validSpaces.push(s);
  const side = isLeftSpace(b.space) ? b.space + 1 : b.space - 1;
  const freeForCopy = findFreeSpace(panel, breakers, b.form, b.space + 1);
  const feeds = panelFedBy(project, b.id);
  const movedFrom = movedFromText(project, b);
  const origin = b.movedFrom;
  const canGoBack = !!origin && checkMove(project, panel.id, b.id, origin.panelId, origin.space).ok;
  const transfer = (to: string, space: number | null) => {
    if (space == null) return;
    dispatch({ type: 'transferBreaker', fromPanelId: panel.id, toPanelId: to, id: b.id, space });
    onSelectBreaker(to, b.id);
  };
  const panelChoices =
    project.panels.length > 1
      ? panelOrder(project).map((x) => ({ panel: x, space: x.id === panel.id ? b.space : firstSpaceFor(project, panel.id, b.id, x.id) }))
      : [];

  return (
    <section className="card editor">
      <div className="editor-head">
        <h2>{b.circuits.length === 1 ? `Circuit ${circuitNumber(b, 0)}` : `Spaces ${spacesOf(b.form, b.space).join(',')}`}</h2>
        <button type="button" className="icon" onClick={onClose} aria-label="Close editor">
          ×
        </button>
      </div>
      <p className="hint">
        {project.panels.length > 1 ? `${panel.name} · ` : ''}
        {FORM_LABELS[b.form]} · on {breakerPhases(panel.system, b).join(' + ')}
      </p>
      {feeds && (
        <p className="callout">
          Feeds subpanel <b>{feeds.name}</b>.{' '}
          <button type="button" className="link-btn" onClick={() => onSelectPanel(feeds.id)}>
            Show it
          </button>
        </p>
      )}
      {movedFrom && origin && (
        <p className="callout">
          Moving here from <b>{movedFrom}</b>.{' '}
          {canGoBack && (
            <button type="button" className="link-btn" onClick={() => transfer(origin.panelId, origin.space)}>
              Move it back
            </button>
          )}
        </p>
      )}

      <div className="grid2">
        <label className="field">
          <span>Breaker</span>
          <select value={b.form} onChange={(e) => dispatch({ type: 'changeForm', panelId: panel.id, id: b.id, form: e.target.value as BreakerForm })}>
            {FORM_OPTIONS.map((f) => {
              const r = f === b.form ? { ok: true as const } : checkPlacement(panel, breakers, f, b.space, b.id);
              return (
                <option key={f} value={f} disabled={!r.ok}>
                  {FORM_LABELS[f]}
                  {r.ok ? '' : ` (${r.reason.toLowerCase()})`}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span>Protection</span>
          <select
            value={b.protection}
            onChange={(e) => dispatch({ type: 'updateBreaker', panelId: panel.id, id: b.id, patch: { protection: e.target.value as Protection } })}
          >
            {PROTECTION_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PROTECTION_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={b.status}
            onChange={(e) => dispatch({ type: 'updateBreaker', panelId: panel.id, id: b.id, patch: { status: e.target.value as InstallStatus } })}
            title="Existing breakers stay off the materials list and count as existing load in the 220.83 calculation"
          >
            <option value="existing">{STATUS_LABELS.existing} (already installed)</option>
            <option value="new">{STATUS_LABELS.new} (planned)</option>
          </select>
        </label>
        <label className="field">
          <span>Space</span>
          <select value={b.space} onChange={(e) => move(Number(e.target.value))} aria-label="Move to space">
            {validSpaces.map((s) => (
              <option key={s} value={s}>
                {s}: {isLeftSpace(s) ? 'left' : 'right'}, {phaseOfSpace(panel.system, s)}
              </option>
            ))}
          </select>
        </label>
        {panelChoices.length > 0 && (
          <label className="field wide">
            <span>Panel</span>
            <select
              value={panel.id}
              onChange={(e) => {
                const choice = panelChoices.find((c) => c.panel.id === e.target.value);
                if (choice && choice.panel.id !== panel.id) transfer(choice.panel.id, choice.space);
              }}
              title="Move this breaker to another panel (first free space that fits)"
            >
              {panelChoices.map(({ panel: x, space }) => (
                <option key={x.id} value={x.id} disabled={space == null}>
                  {'— '.repeat(depthOf(project, x))}
                  {x.name || 'Panel'}
                  {x.id === panel.id ? '' : space == null ? ' (no room)' : ` (to space ${space})`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="btn-row">
        <button type="button" onClick={() => move(b.space - 2)} disabled={!canMoveTo(b.space - 2)} title="Move up one row">
          ↑
        </button>
        <button type="button" onClick={() => move(b.space + 2)} disabled={!canMoveTo(b.space + 2)} title="Move down one row">
          ↓
        </button>
        <button type="button" onClick={() => move(side)} disabled={!canMoveTo(side)} title="Move to the other column">
          ⇄
        </button>
        <span className="spacer" />
        <button
          type="button"
          disabled={freeForCopy == null}
          onClick={() => {
            if (freeForCopy == null) return;
            const copy = cloneBreaker(b, freeForCopy);
            dispatch({ type: 'addBreaker', panelId: panel.id, breaker: copy });
            onSelectBreaker(panel.id, copy.id);
          }}
          title={freeForCopy == null ? 'No free space for a copy' : `Copy to space ${freeForCopy}`}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (feeds && !window.confirm(`This breaker feeds subpanel "${feeds.name}". Delete it anyway?`)) return;
            dispatch({ type: 'deleteBreaker', panelId: panel.id, id: b.id });
            onClose();
          }}
          title="Delete (Del key). Undo brings it back."
        >
          Delete
        </button>
      </div>

      {b.circuits.map((c, i) => (
        <CircuitFields key={c.id} project={project} panel={panel} breaker={b} circuit={c} index={i} dispatch={dispatch} />
      ))}

      {findings.length > 0 && (
        <>
          <h3>Checks for this breaker</h3>
          <ul className="finding-list">
            {findings.map((f) => (
              <FindingItem key={f.id} finding={f} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
