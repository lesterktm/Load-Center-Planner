import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Project } from './core/types';
import { validateProject, type Finding } from './core/rules';
import { occupancy } from './core/panel';
import { newProject, parseProject, planSubpanel, serializeProject } from './core/project';
import { exampleProject } from './core/example';
import { findPanel, panelOrder } from './core/tree';
import { inverterPanels } from './core/battery';
import { projectReducer, type Dispatch } from './state/projectReducer';
import { initHistory, withHistory } from './state/history';
import { TopBar } from './ui/TopBar';
import { PanelSetup } from './ui/PanelSetup';
import { Summary } from './ui/Summary';
import { GeneratorCard } from './ui/GeneratorCard';
import { InverterCard } from './ui/InverterCard';
import { FindingsList } from './ui/FindingsList';
import { PanelBoard, type DragInfo } from './ui/PanelBoard';
import { AddBreaker } from './ui/AddBreaker';
import { BreakerEditor } from './ui/BreakerEditor';
import { Welcome } from './ui/Welcome';
import { ScheduleView } from './ui/views/ScheduleView';
import { DirectoryView } from './ui/views/DirectoryView';
import { MaterialsView } from './ui/views/MaterialsView';
import { LoadCalcView } from './ui/views/LoadCalcView';
import { BatteryView } from './ui/views/BatteryView';
import { PrintHeader } from './ui/views/PrintHeader';
import { slugify } from './ui/format';

type Tab = 'panel' | 'loadcalc' | 'battery' | 'schedule' | 'directory' | 'materials';
type Selection =
  | { kind: 'none' }
  | { kind: 'breaker'; panelId: string; id: string }
  | { kind: 'space'; panelId: string; space: number };

const TABS: { id: Tab; label: string }[] = [
  { id: 'panel', label: 'Panels' },
  { id: 'loadcalc', label: 'Load calc' },
  { id: 'battery', label: 'Battery' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'directory', label: 'Directory' },
  { id: 'materials', label: 'Materials' },
];

const STORAGE_KEY = 'load-center-planner:project';
const historyReducer = withHistory(projectReducer);

function loadInitialProject(): Project {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseProject(saved);
  } catch {
    // Unreadable or blocked storage: fall back to the example.
  }
  return exampleProject();
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

const isNarrow = () => window.innerWidth <= 880;

export default function App() {
  const [hist, send] = useReducer(historyReducer, null, () => initHistory(loadInitialProject()));
  const project = hist.present;
  const dispatch: Dispatch = useCallback((action, coalesceKey) => send({ type: 'do', action, coalesceKey, at: Date.now() }), []);
  const undo = useCallback(() => send({ type: 'undo' }), []);
  const redo = useCallback(() => send({ type: 'redo' }), []);

  const [wantedTab, setTab] = useState<Tab>('panel');
  const [sel, setSel] = useState<Selection>({ kind: 'none' });
  const [activeId, setActiveId] = useState<string>(() => project.panels[0]?.id ?? '');
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  // Breaker drag, shared by all boards so a breaker can be dropped on another panel.
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [hover, setHover] = useState<{ panelId: string; space: number } | null>(null);
  const endDrag = useCallback(() => {
    setDrag(null);
    setHover(null);
  }, []);

  const order = useMemo(() => panelOrder(project), [project]);
  const activePanel = findPanel(project, activeId) ?? order[0];
  // The Battery tab only exists while a panel is backed up by an inverter.
  const hasInverter = useMemo(() => inverterPanels(project).length > 0, [project]);
  const tab: Tab = wantedTab === 'battery' && !hasInverter ? 'panel' : wantedTab;

  const findings = useMemo(() => validateProject(project), [project]);
  const findingsByBreaker = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) {
      if (!f.breakerId) continue;
      const list = m.get(f.breakerId) ?? [];
      list.push(f);
      m.set(f.breakerId, list);
    }
    return m;
  }, [findings]);

  const selPanel = sel.kind === 'none' ? undefined : findPanel(project, sel.panelId);
  const selectedBreaker = sel.kind === 'breaker' && selPanel ? (selPanel.breakers.find((b) => b.id === sel.id) ?? null) : null;
  const selectedSpace =
    sel.kind === 'space' && selPanel && sel.space <= selPanel.spaces && !occupancy(selPanel.breakers).has(sel.space) ? sel.space : null;

  const selectBreaker = useCallback((panelId: string, id: string) => {
    setTab('panel');
    setActiveId(panelId);
    setSel({ kind: 'breaker', panelId, id });
    setScrollTarget(`brk-${id}`);
  }, []);
  const selectPanel = useCallback((panelId: string) => {
    setTab('panel');
    setActiveId(panelId);
    setSel({ kind: 'none' });
    setScrollTarget(`panel-${panelId}`);
  }, []);

  // Bring a breaker or panel into view after selecting it from a list or link.
  useEffect(() => {
    if (!scrollTarget) return;
    const id = window.requestAnimationFrame(() => {
      const target = isNarrow() && scrollTarget.startsWith('brk-') ? document.querySelector('.inspector') : document.getElementById(scrollTarget);
      target?.scrollIntoView({ behavior: 'smooth', block: scrollTarget.startsWith('panel-') ? 'start' : 'nearest' });
      setScrollTarget(null);
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollTarget]);

  // On narrow screens the editor sits below the boards: bring it into view on a click.
  useEffect(() => {
    if (sel.kind === 'none' || !isNarrow()) return;
    document.querySelector('.inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sel]);

  // Autosave to this browser.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializeProject(project));
      } catch {
        // Storage full or disabled; the Save button still works.
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [project]);

  // Keyboard shortcuts (ignored while typing in a field, so the field's own undo works).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' && sel.kind === 'breaker' && tab === 'panel') {
        e.preventDefault();
        dispatch({ type: 'deleteBreaker', panelId: sel.panelId, id: sel.id });
        setSel({ kind: 'none' });
      } else if (e.key === 'Escape') {
        setSel({ kind: 'none' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, dispatch, sel, tab]);

  const replace = (p: Project) => {
    dispatch({ type: 'replace', project: p });
    setSel({ kind: 'none' });
    setActiveId(p.panels[0]?.id ?? '');
  };

  const openFile = async (file: File) => {
    try {
      replace(parseProject(await file.text()));
    } catch (e) {
      window.alert(`Couldn't open ${file.name}: ${(e as Error).message}`);
    }
  };

  const saveFile = () => {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(project.name) || 'panel'}.lcp.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const addSubpanel = () => {
    if (!activePanel) return;
    const plan = planSubpanel(activePanel, `Subpanel ${project.panels.length}`);
    if (!plan) {
      window.alert(`There's no free 2-pole space in "${activePanel.name}" for a feeder breaker.`);
      return;
    }
    dispatch({ type: 'addPanel', panel: plan.panel, feeder: { panelId: activePanel.id, breaker: plan.feeder } });
    selectPanel(plan.panel.id);
  };

  const onFinding = (f: Finding) => {
    if (f.rule === 'service-load') setTab('loadcalc');
    else if (f.rule.startsWith('battery-')) setTab('battery');
    else if (f.breakerId && f.panelId) selectBreaker(f.panelId, f.breakerId);
    else if (f.panelId) selectPanel(f.panelId);
  };

  const errorCount = findings.filter((f) => f.severity === 'error').length;

  return (
    <div className="app">
      <TopBar
        project={project}
        canUndo={hist.past.length > 0}
        canRedo={hist.future.length > 0}
        onMeta={(patch, key) => dispatch({ type: 'meta', patch }, key)}
        onNew={() => {
          if (window.confirm('Start a new, empty project? You can get the current one back with Undo.')) replace(newProject());
        }}
        onExample={() => replace(exampleProject())}
        onOpen={openFile}
        onSave={saveFile}
        onUndo={undo}
        onRedo={redo}
        onPrint={() => window.print()}
      />
      <nav className="tabs no-print" role="tablist">
        {TABS.filter((t) => t.id !== 'battery' || hasInverter).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'panel' && errorCount > 0 && <span className="tab-count">{errorCount}</span>}
          </button>
        ))}
      </nav>

      {tab === 'panel' && activePanel && (
        <main className="workspace">
          <aside className="sidebar no-print">
            <PanelSetup
              key={activePanel.id}
              project={project}
              panel={activePanel}
              dispatch={dispatch}
              onSelectPanel={selectPanel}
              onSelectBreaker={selectBreaker}
              onDeleted={() => {
                setSel({ kind: 'none' });
                setActiveId(order[0]?.id ?? '');
              }}
            />
            {activePanel.interlock?.kind === 'inverter' ? (
              <InverterCard project={project} panel={activePanel} onOpenBattery={() => setTab('battery')} onSelectBreaker={selectBreaker} />
            ) : (
              activePanel.interlock && <GeneratorCard project={project} panel={activePanel} />
            )}
            <Summary project={project} panel={activePanel} />
            <FindingsList findings={findings} onSelect={onFinding} />
          </aside>
          <section className="boards">
            {order.map((panel) => (
              <div key={panel.id} className="board-wrap">
                <PrintHeader project={project} title="Panel layout" panel={panel} className="print-only" />
                <PanelBoard
                  project={project}
                  panel={panel}
                  active={panel.id === activePanel.id && order.length > 1}
                  findingsByBreaker={findingsByBreaker}
                  selectedBreakerId={selectedBreaker && sel.kind === 'breaker' && sel.panelId === panel.id ? selectedBreaker.id : null}
                  selectedSpace={sel.kind === 'space' && sel.panelId === panel.id ? selectedSpace : null}
                  onActivate={() => setActiveId(panel.id)}
                  onSelectSpace={(space) => {
                    setActiveId(panel.id);
                    setSel({ kind: 'space', panelId: panel.id, space });
                  }}
                  onSelectBreaker={(panelId, id) => {
                    if (panelId === panel.id) {
                      setActiveId(panelId);
                      setSel({ kind: 'breaker', panelId, id });
                    } else {
                      selectBreaker(panelId, id);
                    }
                  }}
                  drag={drag}
                  hoverSpace={hover?.panelId === panel.id ? hover.space : null}
                  onDragStart={setDrag}
                  onDragEnd={endDrag}
                  onHover={(space) => setHover({ panelId: panel.id, space })}
                  onDrop={(space) => {
                    const d = drag;
                    endDrag();
                    if (!d) return;
                    dispatch({ type: 'transferBreaker', fromPanelId: d.panelId, toPanelId: panel.id, id: d.id, space });
                    setActiveId(panel.id);
                    setSel({ kind: 'breaker', panelId: panel.id, id: d.id });
                  }}
                />
              </div>
            ))}
            <div className="add-sub no-print">
              <button type="button" onClick={addSubpanel}>
                + Add subpanel fed from {activePanel.name || 'this panel'}
              </button>
              <span className="hint">Adds a 60 A, 2-pole feeder breaker in the first free space. Adjust both afterward.</span>
            </div>
          </section>
          <aside className="inspector no-print">
            {selectedBreaker && selPanel ? (
              <BreakerEditor
                key={selectedBreaker.id}
                project={project}
                panel={selPanel}
                breaker={selectedBreaker}
                findings={findingsByBreaker.get(selectedBreaker.id) ?? []}
                dispatch={dispatch}
                onSelectBreaker={selectBreaker}
                onSelectPanel={selectPanel}
                onClose={() => setSel({ kind: 'none' })}
              />
            ) : selectedSpace != null && selPanel ? (
              <AddBreaker
                panel={selPanel}
                space={selectedSpace}
                onAdd={(breaker) => {
                  dispatch({ type: 'addBreaker', panelId: selPanel.id, breaker });
                  setSel({ kind: 'breaker', panelId: selPanel.id, id: breaker.id });
                }}
                onCancel={() => setSel({ kind: 'none' })}
              />
            ) : (
              <Welcome project={project} dispatch={dispatch} />
            )}
          </aside>
        </main>
      )}
      {tab === 'loadcalc' && (
        <main className="docwrap">
          <LoadCalcView project={project} dispatch={dispatch} onSelectBreaker={selectBreaker} />
        </main>
      )}
      {tab === 'battery' && (
        <main className="docwrap">
          <BatteryView project={project} dispatch={dispatch} onSelectBreaker={selectBreaker} />
        </main>
      )}
      {tab === 'schedule' && (
        <main className="docwrap">
          <ScheduleView project={project} />
        </main>
      )}
      {tab === 'directory' && (
        <main className="docwrap">
          <DirectoryView project={project} />
        </main>
      )}
      {tab === 'materials' && (
        <main className="docwrap">
          <MaterialsView project={project} />
        </main>
      )}
    </div>
  );
}
