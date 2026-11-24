import type { CSSProperties, DragEvent, ReactNode } from 'react';
import type { Breaker, BreakerForm, Panel, Project } from '../core/types';
import { SEVERITY_ORDER, type Finding } from '../core/rules';
import {
  acceptsTandem, circuitNumber, formRows, formVolts, isLeftSpace, occupancy, phaseOfSpace, rowCount, rowOf, spacesOf,
} from '../core/panel';
import { FORM_SHORT, PROTECTION_BADGE } from '../core/labels';
import { getFamily } from '../data/families';
import { feederOf, panelFedBy, upstreamChain } from '../core/tree';
import { checkMove, movedFromText } from '../core/move';
import { isBackfedType, isGeneratorInterlock, sourceName } from '../core/generator';
import { gridInputCheck, inverterFedBy } from '../core/inverter';
import { fmt0 } from './format';

/** The breaker being dragged, shared by all boards so it can be dropped on any panel. */
export interface DragInfo {
  panelId: string;
  id: string;
  form: BreakerForm;
}

interface Props {
  project: Project;
  panel: Panel;
  active: boolean;
  findingsByBreaker: Map<string, Finding[]>;
  selectedBreakerId: string | null;
  selectedSpace: number | null;
  drag: DragInfo | null;
  /** Space under the pointer during a drag, when it's over this panel. */
  hoverSpace: number | null;
  onActivate(): void;
  onSelectSpace(space: number): void;
  onSelectBreaker(panelId: string, id: string): void;
  onDragStart(info: DragInfo): void;
  onDragEnd(): void;
  onHover(space: number): void;
  onDrop(space: number): void;
}

const colOf = (space: number) => (isLeftSpace(space) ? 2 : 4);

export function PanelBoard(props: Props) {
  const { project, panel, active, findingsByBreaker, selectedBreakerId, selectedSpace, drag, hoverSpace: hover } = props;
  const { breakers } = panel;
  const rows = rowCount(panel.spaces);
  const occ = occupancy(breakers);
  const showTandemMarks = Array.isArray(panel.tandemSpaces);
  const mixedStatus = breakers.some((b) => b.status === 'existing') && breakers.some((b) => b.status === 'new');
  const generatorPower = [panel, ...upstreamChain(project, panel).chain].some((x) => isGeneratorInterlock(x.interlock));
  const canDrop = (space: number) => (drag ? checkMove(project, drag.panelId, drag.id, panel.id, space).ok : false);

  const inPanel = (b: Breaker) => spacesOf(b.form, b.space).every((s) => s >= 1 && s <= panel.spaces);
  const outside = breakers.filter((b) => !inPanel(b));

  const cells: ReactNode[] = [];
  for (let r = 1; r <= rows; r++) {
    const left = 2 * r - 1;
    const phase = phaseOfSpace(panel.system, left);
    cells.push(
      <div key={`nl${r}`} className="space-num" style={{ gridRow: r, gridColumn: 1 }}>
        {left}
      </div>,
      <div key={`bus${r}`} className={`bus bus-${phase}`} style={{ gridRow: r, gridColumn: 3 }} title={`Bus leg ${phase}`}>
        {phase}
      </div>,
    );
    if (left + 1 <= panel.spaces) {
      cells.push(
        <div key={`nr${r}`} className="space-num" style={{ gridRow: r, gridColumn: 5 }}>
          {left + 1}
        </div>,
      );
    }
  }

  for (let s = 1; s <= panel.spaces; s++) {
    if (occ.has(s)) continue;
    cells.push(
      <button
        key={`e${s}`}
        type="button"
        className={`slot${selectedSpace === s ? ' selected' : ''}`}
        style={{ gridRow: rowOf(s), gridColumn: colOf(s) }}
        onClick={() => props.onSelectSpace(s)}
        aria-label={`Add a breaker at space ${s} of ${panel.name}`}
        title={`Space ${s}: click to add a breaker`}
      >
        +
        {showTandemMarks && acceptsTandem(panel, s) && (
          <span className="tandem-mark" title="Accepts tandem breakers">
            T
          </span>
        )}
      </button>,
    );
  }

  for (const b of breakers) {
    if (!inPanel(b)) continue;
    cells.push(
      <BreakerCard
        key={b.id}
        breaker={b}
        feeds={panelFedBy(project, b.id)}
        inverterFor={inverterFedBy(project, b.id)}
        movedFrom={movedFromText(project, b)}
        showNew={mixedStatus && b.status === 'new'}
        findings={findingsByBreaker.get(b.id) ?? []}
        selected={b.id === selectedBreakerId}
        dragging={drag?.id === b.id}
        style={{ gridRow: `${rowOf(b.space)} / span ${formRows(b.form)}`, gridColumn: colOf(b.space) }}
        onSelect={() => props.onSelectBreaker(panel.id, b.id)}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', b.id);
          e.dataTransfer.effectAllowed = 'move';
          // Changing the DOM inside dragstart cancels the drag in some browsers, so defer.
          window.setTimeout(() => props.onDragStart({ panelId: panel.id, id: b.id, form: b.form }), 0);
        }}
        onDragEnd={props.onDragEnd}
      />,
    );
  }

  if (drag) {
    for (let s = 1; s <= panel.spaces; s++) {
      const ok = canDrop(s);
      cells.push(
        <div
          key={`d${s}`}
          className="drop"
          style={{ gridRow: rowOf(s), gridColumn: colOf(s) }}
          onDragOver={(e) => {
            if (ok) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
            if (hover !== s) props.onHover(s);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (ok) props.onDrop(s);
            else props.onDragEnd();
          }}
        />,
      );
    }
    if (hover != null) {
      const ok = canDrop(hover);
      const span = Math.min(formRows(drag.form), rows - rowOf(hover) + 1);
      cells.push(
        <div key="drop-hi" className={`drop-hi ${ok ? 'ok' : 'bad'}`} style={{ gridRow: `${rowOf(hover)} / span ${span}`, gridColumn: colOf(hover) }} />,
      );
    }
  }

  const fam = getFamily(panel.family);
  const feeder = feederOf(project, panel);
  const il = panel.interlock;
  const grid = gridInputCheck(project, panel);

  return (
    <div id={`panel-${panel.id}`} className={`board${active ? ' active' : ''}${feeder ? ' sub' : ''}`} onClick={props.onActivate}>
      <div className="board-title">
        {panel.name || 'Panel'}
        {panel.status === 'existing' && <span className="tag">Existing</span>}
        {panel.separateBuilding && <span className="tag">Separate building</span>}
      </div>
      <div className="board-sub">
        {fam.id === 'generic' ? 'Generic' : fam.label} · {panel.busAmps} A bus · {panel.spaces} spaces / {panel.maxCircuits} circuits · 120/240 V
      </div>
      {panel.feed && (
        <div className="board-feed">
          {feeder ? (
            <>
              Fed from{' '}
              <button
                type="button"
                className="link-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onSelectBreaker(feeder.panel.id, feeder.breaker.id);
                }}
              >
                {feeder.panel.name}, circuit {circuitNumber(feeder.breaker, 0)}
              </button>{' '}
              · {feeder.breaker.circuits[0]?.amps} A feeder
            </>
          ) : (
            <span className="bad">Feeder breaker missing</span>
          )}
        </div>
      )}
      <div className="main-area">
        {panel.mainType === 'main-breaker' ? (
          <div className="main-breaker">MAIN {panel.mainAmps ?? '?'} A</div>
        ) : (
          <div className="main-lugs">MAIN LUGS · {panel.busAmps} A</div>
        )}
        {il && (
          <div
            className={`interlock-plate ${il.side}`}
            title={`Interlock: the ${sourceName(il)} breaker can only turn on when the main is off${il.kind === 'inverter' ? ' (the main is the inverter bypass)' : ''}`}
          >
            <span>INTERLOCK</span>
          </div>
        )}
      </div>
      {il && (
        <div className="board-gen">
          {il.kind === 'inverter'
            ? `Battery inverter: ${fmt0(il.generatorWatts)} W continuous${il.surgeWatts ? `, ${fmt0(il.surgeWatts)} W surge` : ''} · main is the bypass${grid ? ` · grid input: ${grid.panel.name}, circuit ${circuitNumber(grid.breaker, 0)}` : ''}`
            : `Generator: ${fmt0(il.generatorWatts)} W ${il.kind === 'portable' ? `portable${il.inletAmps ? `, ${il.inletAmps} A inlet` : ''}` : 'standby'}`}
        </div>
      )}
      <div className="board-grid" style={{ gridTemplateRows: `repeat(${rows}, var(--row-h))` }}>
        {cells}
      </div>
      {outside.length > 0 && (
        <div className="outside">
          <b>Outside the panel's spaces:</b>
          {outside.map((b) => (
            <button key={b.id} type="button" onClick={() => props.onSelectBreaker(panel.id, b.id)}>
              {b.circuits[0]?.label || 'Unlabeled'} (space {b.space})
            </button>
          ))}
        </div>
      )}
      <p className="board-legend no-print">
        Drag a breaker to move it{project.panels.length > 1 ? ', including onto another panel' : ''}. Rows alternate between bus legs L1
        and L2, so a 2-pole breaker gets 240 V.
        {generatorPower && ' A yellow edge marks circuits that run on the generator.'}
      </p>
    </div>
  );
}

interface CardProps {
  breaker: Breaker;
  feeds: Panel | undefined;
  /** The panel whose inverter this breaker feeds (its grid input). */
  inverterFor: Panel | undefined;
  movedFrom: string | null;
  showNew: boolean;
  findings: Finding[];
  selected: boolean;
  dragging: boolean;
  style: CSSProperties;
  onSelect(): void;
  onDragStart(e: DragEvent<HTMLDivElement>): void;
  onDragEnd(): void;
}

function BreakerCard({ breaker: b, feeds, inverterFor, movedFrom, showNew, findings, selected, dragging, style, onSelect, onDragStart, onDragEnd }: CardProps) {
  const flagged = findings.filter((f) => f.severity !== 'info');
  const worst = flagged.reduce<Finding | null>(
    (w, f) => (w == null || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[w.severity] ? f : w),
    null,
  );
  const isGen = b.circuits.some((c) => isBackfedType(c.loadType));
  const isInverter = b.circuits.some((c) => c.loadType === 'inverter');
  const isGridInput = b.circuits.some((c) => c.loadType === 'inverter-input');
  const onGen = b.circuits.some((c) => c.onGenerator);
  const gfciRcpt = formVolts(b.form) === 120 && b.circuits.some((c) => c.gfciReceptacle && c.servesReceptacles);
  const badge = PROTECTION_BADGE[b.protection];
  const span2 = formRows(b.form) === 2;
  const two = b.circuits.length === 2;
  const cls = [
    'breaker',
    isLeftSpace(b.space) ? 'left' : 'right',
    `form-${b.form}`,
    span2 ? 'span2' : '',
    isGen ? 'generator' : '',
    isInverter ? 'inverter' : '',
    onGen ? 'on-gen' : '',
    b.status === 'existing' ? 'existing' : '',
    selected ? 'selected' : '',
    dragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const title =
    b.circuits
      .map((c, i) => `${circuitNumber(b, i)}: ${c.label || 'Unlabeled'} (${c.amps} A)${c.gfciReceptacle && c.servesReceptacles ? ', GFCI receptacle' : ''}`)
      .join('\n') +
    (feeds ? `\nFeeds ${feeds.name}` : '') +
    (isGridInput && inverterFor ? `\nFeeds the inverter for ${inverterFor.name}` : '') +
    (movedFrom ? `\nMoving here from ${movedFrom}` : '') +
    (flagged.length ? `\n\n${flagged.map((f) => `• ${f.message}`).join('\n')}` : '');

  return (
    <div
      id={`brk-${b.id}`}
      className={cls}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={title}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {b.circuits.map((c, i) => (
        <div className="line" key={c.id}>
          <span className="ckt">{circuitNumber(b, i)}</span>
          <span className={`lbl${c.label ? '' : ' empty'}`}>{c.label || 'Unlabeled'}</span>
          {two && <span className="amps">{c.amps}A</span>}
        </div>
      ))}
      {(!two || span2) && (
        <div className="line meta">
          {!two && <span className="amps">{b.circuits[0]?.amps}A</span>}
          <span>
            {FORM_SHORT[b.form]}
            {span2 && !feeds ? ' · 240 V' : ''}
          </span>
          {feeds && <span className="feeds">→ {feeds.name}</span>}
          {isGen && <span className={`badge ${isInverter ? 'badge-inv' : 'badge-gen'}`}>{isInverter ? 'INV' : 'GEN'}</span>}
          {isGridInput && (
            <span className="badge badge-inv" title="Feeds a battery inverter's grid input">
              INV IN
            </span>
          )}
          {badge && <span className={`badge badge-${b.protection}`}>{badge}</span>}
          {gfciRcpt && !two && (
            <span className="badge badge-gfci-r" title="Protected by a GFCI receptacle">
              GFCI rcpt
            </span>
          )}
          {showNew && <span className="badge badge-new">NEW</span>}
          {movedFrom && (
            <span className="badge badge-moved" title={`Moving here from ${movedFrom}`}>
              MOVED
            </span>
          )}
        </div>
      )}
      {two && !span2 && badge && <span className={`badge badge-${b.protection} corner`}>{badge}</span>}
      <span className="handle" aria-hidden="true" />
      {worst && <span className={`sev-dot sev-${worst.severity}`}>{flagged.length}</span>}
    </div>
  );
}
