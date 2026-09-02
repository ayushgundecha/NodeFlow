import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  GitBranch,
  LoaderCircle,
  PanelBottomClose,
  PanelBottomOpen,
  Play,
  Redo2,
  RotateCcw,
  Settings2,
  Share2,
  Square,
  TerminalSquare,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Profiler, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../../store';
import { useEditorStore } from '../editor/editorStore';
import { WorkspaceExperience } from '../editor/WorkspaceExperience';
import { ResponsiveReadOnlyViewer } from '../editor/ResponsiveReadOnlyViewer';
import { recordReactRender } from '../editor/reactProfiling';
import { createEditorWorkspace, loadEditorWorkspace, saveEditorWorkspace, type EditorWorkspace } from '../editor/workspacePersistence';
import { defaultWorkflowTemplate } from '../editor/workflowTemplates';
import { NodeInspector } from '../nodes/NodeInspector';
import { NodeLibrary } from '../nodes/NodeLibrary';
import { RegistryWorkflowCanvas } from '../nodes/RegistryWorkflowCanvas';
import { useWorkflowRuntime } from '../runtime/useWorkflowRuntime';
import type { RunEvent } from '../../contracts/types';
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LIMITS,
  clampPanelSize,
  loadPanelLayout,
  savePanelLayout,
  type PanelLayout,
} from './panelLayout';
import './workspace-shell.css';

interface ResizeHandleProps {
  ariaLabel: string;
  axis: 'x' | 'y';
  current: number;
  limits: { max: number; min: number };
  onChange: (next: number) => void;
  reverse?: boolean;
  slot?: 'inspector' | 'library';
}

function ResizeHandle({ ariaLabel, axis, current, limits, onChange, reverse = false, slot }: ResizeHandleProps) {
  const updateFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const negativeKey = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const positiveKey = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== negativeKey && event.key !== positiveKey) return;
    event.preventDefault();
    const direction = event.key === positiveKey ? 1 : -1;
    const step = event.shiftKey ? 48 : 16;
    onChange(clampPanelSize(current + direction * step * (reverse ? -1 : 1), limits));
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const origin = axis === 'x' ? event.clientX : event.clientY;
    const initial = current;
    const move = (moveEvent: PointerEvent) => {
      const pointer = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
      const delta = (pointer - origin) * (reverse ? -1 : 1);
      onChange(clampPanelSize(initial + delta, limits));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuemax={limits.max}
      aria-valuemin={limits.min}
      aria-valuenow={current}
      className={`nf-resize-handle nf-resize-handle--${axis}${slot ? ` nf-resize-handle--${slot}` : ''}`}
      onKeyDown={updateFromKeyboard}
      onPointerDown={startResize}
      role="separator"
      tabIndex={0}
    ><span /></div>
  );
}

interface IconButtonProps {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
}

function IconButton({ disabled, icon: Icon, label, onClick, pressed }: IconButtonProps) {
  return (
    <button aria-label={label} aria-pressed={pressed} className="nf-icon-button" disabled={disabled} onClick={onClick} title={label} type="button">
      <Icon aria-hidden="true" size={17} strokeWidth={2} />
    </button>
  );
}

const eventSummary = (event: RunEvent) => {
  if (event.type === 'node.log') return event.message;
  if (event.type === 'node.failed' || event.type === 'run.failed') return event.error.message;
  if (event.type === 'node.skipped') return event.reason;
  if (event.type === 'node.completed') return `Completed in ${event.durationMs}ms`;
  if (event.type === 'run.completed') return `Run completed in ${event.durationMs}ms`;
  return event.type.replace('.', ' ');
};

interface DebuggerPanelProps {
  busy: boolean;
  collapsed: boolean;
  events: RunEvent[];
  onRun: () => void;
  onStop: () => void;
  onToggle: () => void;
  retryable: boolean;
  statusMessage: string;
}

function DebuggerPanel({ busy, collapsed, events, onRun, onStop, onToggle, retryable, statusMessage }: DebuggerPanelProps) {
  const hasEvents = events.length > 0;
  return (
    <section aria-labelledby="debugger-title" className="nf-debugger" hidden={collapsed}>
      <header className="nf-debugger__header">
        <div><TerminalSquare aria-hidden="true" size={17} /><h2 id="debugger-title">Debugger</h2><span className={`nf-shell-badge${busy ? ' nf-shell-badge--running' : ''}`}>{busy ? <LoaderCircle aria-hidden="true" size={12} /> : <Clock3 aria-hidden="true" size={12} />}{busy ? 'Live run' : hasEvents ? 'Latest trace' : 'No active run'}</span></div>
        <div><button className="nf-debug-tab nf-debug-tab--active" type="button">Timeline</button><button className="nf-debug-tab" type="button">Logs</button><button className="nf-debug-tab" type="button">Payload</button><IconButton icon={PanelBottomClose} label="Collapse debugger" onClick={onToggle} /></div>
      </header>
      {hasEvents ? <div className="nf-debugger__timeline" aria-label="Live run timeline">{events.map((event) => <div className={`nf-debug-event nf-debug-event--${event.type.replace('.', '-')}`} key={`${event.runId}.${event.sequence}`}><time>{String(event.sequence).padStart(3, '0')}</time><span>{event.type}</span><strong>{'nodeId' in event ? event.nodeId : 'workflow'}</strong><p>{eventSummary(event)}</p></div>)}</div> : <div className="nf-debugger__empty">
        <span><Clock3 aria-hidden="true" size={20} /></span>
        <div><strong>Ready to trace your workflow</strong><p>{statusMessage}</p></div>
        <button className="nf-text-button" onClick={onRun} type="button"><Play aria-hidden="true" size={14} fill="currentColor" /> Run workflow</button>
      </div>}
      {busy || retryable ? <div className="nf-debugger__run-control"><span>{statusMessage}</span>{busy ? <button className="nf-button nf-button--secondary" onClick={onStop} type="button"><Square aria-hidden="true" fill="currentColor" size={12} /> Stop run</button> : <button className="nf-button nf-button--secondary" onClick={onRun} type="button"><RotateCcw aria-hidden="true" size={14} /> Retry run</button>}</div> : null}
    </section>
  );
}

function ProductHeader({ busy, name, onOpenWorkspace, onRun, onStop, validating }: { busy: boolean; name: string; onOpenWorkspace: () => void; onRun: () => void; onStop: () => void; validating: boolean }) {
  const canUndo = useStore((state) => state.historyPast.length > 0);
  const canRedo = useStore((state) => state.historyFuture.length > 0);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  return (
    <header className="nf-product-header">
      <div className="nf-product-brand"><span className="nf-product-mark"><GitBranch aria-hidden="true" size={18} /></span><strong>NodeFlow</strong><span className="nf-product-edition">Studio</span></div>
      <div className="nf-header-workflow"><button aria-haspopup="dialog" onClick={onOpenWorkspace} type="button"><span>{name}</span><ChevronDown aria-hidden="true" size={15} /></button><span><CheckCircle2 aria-hidden="true" size={13} /> Autosaved locally</span></div>
      <nav aria-label="Workflow commands" className="nf-header-actions">
        <div className="nf-command-group"><IconButton disabled={!canUndo} icon={Undo2} label="Undo" onClick={undo} /><IconButton disabled={!canRedo} icon={Redo2} label="Redo" onClick={redo} /></div>
        <IconButton icon={Share2} label="Import or export workflow" onClick={onOpenWorkspace} />
        <IconButton icon={Settings2} label="Templates and workspace settings" onClick={onOpenWorkspace} />
        {busy ? <button aria-busy={validating} className="nf-button nf-button--secondary nf-run-stop" onClick={onStop} type="button"><Square aria-hidden="true" fill="currentColor" size={12} />{validating ? 'Cancel validation' : 'Stop run'}</button> : <button className="nf-button nf-button--primary" onClick={onRun} type="button"><Play aria-hidden="true" fill="currentColor" size={15} /> Run workflow</button>}
      </nav>
    </header>
  );
}

export function WorkspaceShell() {
  const [layout, setLayout] = useState<PanelLayout>(() => typeof localStorage === 'undefined' ? DEFAULT_PANEL_LAYOUT : loadPanelLayout());
  const [initialLoad] = useState(() => loadEditorWorkspace());
  const [workspaceMeta, setWorkspaceMeta] = useState(() => initialLoad.status === 'loaded'
    ? { id: initialLoad.workspace.id, name: initialLoad.workspace.name, description: initialLoad.workspace.description }
    : { id: defaultWorkflowTemplate.id, name: defaultWorkflowTemplate.name, description: defaultWorkflowTemplate.description });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const didHydrate = useRef(false);
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const hydrateWorkflow = useStore((state) => state.hydrateWorkflow);
  const selectNode = useEditorStore((state) => state.selectNode);

  useEffect(() => savePanelLayout(layout), [layout]);
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const source = initialLoad.status === 'loaded' ? initialLoad.workspace : defaultWorkflowTemplate;
    hydrateWorkflow(source.nodes, source.edges);
  }, [hydrateWorkflow, initialLoad]);
  useEffect(() => {
    if (!didHydrate.current) return;
    const timeout = window.setTimeout(() => saveEditorWorkspace(createEditorWorkspace({ ...workspaceMeta, nodes, edges })), 500);
    return () => window.clearTimeout(timeout);
  }, [edges, nodes, workspaceMeta]);

  const currentWorkspace = useMemo(() => createEditorWorkspace({ ...workspaceMeta, nodes, edges }), [edges, nodes, workspaceMeta]);
  const runtime = useWorkflowRuntime(currentWorkspace);
  useEffect(() => {
    if (runtime.validationIssues.length) window.requestAnimationFrame(() => document.getElementById('validation-summary')?.focus());
  }, [runtime.validationIssues.length]);
  const replaceWorkspace = (workspace: Omit<EditorWorkspace, 'format' | 'savedAt'>) => {
    setWorkspaceMeta({ id: workspace.id, name: workspace.name, description: workspace.description });
    hydrateWorkflow(workspace.nodes, workspace.edges);
    selectNode(null);
  };
  const skipToWorkflow = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.requestAnimationFrame(() => document.getElementById('workflow-content')?.focus());
  };

  const update = (next: Partial<PanelLayout>) => setLayout((current) => ({ ...current, ...next }));
  const style = {
    '--nf-debugger-height': layout.debuggerCollapsed ? '0px' : `${layout.debuggerHeight}px`,
    '--nf-inspector-width': layout.inspectorCollapsed ? '0px' : `${layout.inspectorWidth}px`,
    '--nf-library-width': layout.libraryCollapsed ? '0px' : `${layout.libraryWidth}px`,
  } as CSSProperties;

  return (
    <>
      <a className="nf-skip-link" href="#workflow-canvas" onClick={skipToWorkflow}>Skip to workflow</a>
      <div className="nf-product-shell">
        <ProductHeader busy={runtime.busy} name={workspaceMeta.name} onOpenWorkspace={() => setWorkspaceMenuOpen(true)} onRun={runtime.run} onStop={runtime.stop} validating={runtime.validating} />
        <p aria-atomic="true" className="nf-visually-hidden" role="status">{runtime.statusMessage}</p>
        <div className="nf-workflow-content" id="workflow-content" tabIndex={-1}>
          <ResponsiveReadOnlyViewer description={workspaceMeta.description} name={workspaceMeta.name} nodeStatuses={runtime.nodeStatuses} nodes={nodes} />
          <main className="nf-workbench" style={style}>
          <NodeLibrary collapsed={layout.libraryCollapsed} onToggle={() => update({ libraryCollapsed: true })} />
          {layout.libraryCollapsed ? null : <ResizeHandle ariaLabel="Resize node library" axis="x" current={layout.libraryWidth} limits={PANEL_LIMITS.libraryWidth} onChange={(libraryWidth) => update({ libraryWidth })} slot="library" />}
          <div className="nf-canvas-column" id="workflow-canvas" tabIndex={-1}>
            <Profiler id="RegistryWorkflowCanvas" onRender={recordReactRender}><RegistryWorkflowCanvas description={workspaceMeta.description} libraryCollapsed={layout.libraryCollapsed} nodeStatuses={runtime.nodeStatuses} onShowLibrary={() => update({ libraryCollapsed: false })} inspectorCollapsed={layout.inspectorCollapsed} onShowInspector={() => update({ inspectorCollapsed: false })} validationIssues={runtime.validationIssues} workflowName={workspaceMeta.name} /></Profiler>
            {layout.debuggerCollapsed ? (
              <button className="nf-debugger-restore" onClick={() => update({ debuggerCollapsed: false })} type="button"><PanelBottomOpen aria-hidden="true" size={16} /> Open debugger</button>
            ) : (
              <ResizeHandle ariaLabel="Resize debugger" axis="y" current={layout.debuggerHeight} limits={PANEL_LIMITS.debuggerHeight} onChange={(debuggerHeight) => update({ debuggerHeight })} reverse />
            )}
            <DebuggerPanel busy={runtime.busy} collapsed={layout.debuggerCollapsed} events={runtime.runState.events} onRun={runtime.run} onStop={runtime.stop} onToggle={() => update({ debuggerCollapsed: true })} retryable={runtime.retryable} statusMessage={runtime.statusMessage} />
          </div>
          {layout.inspectorCollapsed ? null : <ResizeHandle ariaLabel="Resize inspector" axis="x" current={layout.inspectorWidth} limits={PANEL_LIMITS.inspectorWidth} onChange={(inspectorWidth) => update({ inspectorWidth })} reverse slot="inspector" />}
          <NodeInspector collapsed={layout.inspectorCollapsed} onToggle={() => update({ inspectorCollapsed: true })} validationIssues={runtime.validationIssues} />
          </main>
        </div>
        <WorkspaceExperience currentWorkspace={currentWorkspace} onClose={() => setWorkspaceMenuOpen(false)} onReplace={replaceWorkspace} open={workspaceMenuOpen} recoveryReason={initialLoad.status === 'recovered' ? initialLoad.reason : undefined} />
      </div>
    </>
  );
}
