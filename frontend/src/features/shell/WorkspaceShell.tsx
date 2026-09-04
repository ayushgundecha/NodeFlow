import {
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Play,
  Redo2,
  Settings2,
  Share2,
  Square,
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
import { defaultWorkflowTemplate, workflowTemplates } from '../editor/workflowTemplates';
import { NodeInspector } from '../nodes/NodeInspector';
import { NodeLibrary } from '../nodes/NodeLibrary';
import { RegistryWorkflowCanvas } from '../nodes/RegistryWorkflowCanvas';
import { nodeStatusesForEvents, useWorkflowRuntime } from '../runtime/useWorkflowRuntime';
import { DebuggerPanel } from '../runs/DebuggerPanel';
import { workflowSignature } from '../runs/runHistory';
import { useRunHistory } from '../runs/useRunHistory';
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

const EXAMPLE_LAYOUT_MIGRATION_KEY = 'nodeflow.example-layout.v2';

function useCompactViewer() {
  const query = '(max-width: 900px)';
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const updateCompact = (event: MediaQueryListEvent) => setCompact(event.matches);
    media.addEventListener('change', updateCompact);
    return () => media.removeEventListener('change', updateCompact);
  }, []);
  return compact;
}

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

function ProductHeader({ busy, example, name, onOpenWorkspace, onRun, onStop, validating }: { busy: boolean; example: boolean; name: string; onOpenWorkspace: () => void; onRun: () => void; onStop: () => void; validating: boolean }) {
  const canUndo = useStore((state) => state.historyPast.length > 0);
  const canRedo = useStore((state) => state.historyFuture.length > 0);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  return (
    <header className="nf-product-header">
      <div className="nf-product-brand"><span className="nf-product-mark"><GitBranch aria-hidden="true" size={18} /></span><strong>NodeFlow</strong><span className="nf-product-edition">Studio</span></div>
      <div className="nf-header-workflow"><button aria-haspopup="dialog" onClick={onOpenWorkspace} type="button"><span>{name}</span>{example ? <small>Example</small> : null}<ChevronDown aria-hidden="true" size={15} /></button><span><CheckCircle2 aria-hidden="true" size={13} /> Autosaved locally</span></div>
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
  const compactViewer = useCompactViewer();
  const [layout, setLayout] = useState<PanelLayout>(() => {
    const stored = typeof localStorage === 'undefined' ? DEFAULT_PANEL_LAYOUT : loadPanelLayout();
    return { ...stored, debuggerCollapsed: true, inspectorCollapsed: true, libraryCollapsed: false };
  });
  const [initialLoad] = useState(() => loadEditorWorkspace());
  const [workspaceMeta, setWorkspaceMeta] = useState(() => {
    if (initialLoad.status !== 'loaded') return { id: defaultWorkflowTemplate.id, name: defaultWorkflowTemplate.name, description: defaultWorkflowTemplate.description };
    const currentTemplate = workflowTemplates.find((template) => template.id === initialLoad.workspace.id);
    return currentTemplate
      ? { id: currentTemplate.id, name: currentTemplate.name, description: currentTemplate.description }
      : { id: initialLoad.workspace.id, name: initialLoad.workspace.name, description: initialLoad.workspace.description };
  });
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [replayEvents, setReplayEvents] = useState<RunEvent[] | null>(null);
  const didHydrate = useRef(false);
  const skipInitialSave = useRef(true);
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const hydrateWorkflow = useStore((state) => state.hydrateWorkflow);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);

  useEffect(() => savePanelLayout(layout), [layout]);
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const source = initialLoad.status === 'loaded' ? initialLoad.workspace : defaultWorkflowTemplate;
    const currentTemplate = workflowTemplates.find((template) => template.id === source.id);
    const templatePositions = new Map(currentTemplate?.nodes.map((node) => [node.id, node.position]));
    const matchesTemplateGraph = currentTemplate
      && currentTemplate.nodes.length === source.nodes.length
      && source.nodes.every((node) => templatePositions.has(node.id));
    let sourceNodes = currentTemplate && source.nodes.length === 0 ? currentTemplate.nodes : source.nodes;
    const sourceEdges = currentTemplate && source.nodes.length === 0 ? currentTemplate.edges : source.edges;
    try {
      if (matchesTemplateGraph && localStorage.getItem(EXAMPLE_LAYOUT_MIGRATION_KEY) !== 'complete') {
        sourceNodes = source.nodes.map((node) => ({ ...node, position: { ...templatePositions.get(node.id)! } }));
        localStorage.setItem(EXAMPLE_LAYOUT_MIGRATION_KEY, 'complete');
      }
    } catch {
      // Layout refresh is an enhancement; storage restrictions must not block the editor.
    }
    hydrateWorkflow(sourceNodes, sourceEdges);
  }, [hydrateWorkflow, initialLoad]);
  useEffect(() => {
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    if (!didHydrate.current) return;
    const timeout = window.setTimeout(() => saveEditorWorkspace(createEditorWorkspace({ ...workspaceMeta, nodes, edges })), 500);
    return () => window.clearTimeout(timeout);
  }, [edges, nodes, workspaceMeta]);

  const currentWorkspace = useMemo(() => createEditorWorkspace({ ...workspaceMeta, nodes, edges }), [edges, nodes, workspaceMeta]);
  const nodeLabels = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node.data.label ?? node.id])), [nodes]);
  const runtime = useWorkflowRuntime(currentWorkspace);
  const history = useRunHistory(runtime.runState.events, currentWorkspace);
  const displayedNodeStatuses = replayEvents ? nodeStatusesForEvents(replayEvents) : runtime.nodeStatuses;
  const activeTemplate = workflowTemplates.find((template) => template.id === workspaceMeta.id);
  const inspectorEvents = replayEvents ?? runtime.runState.events;
  const runWorkflow = () => {
    setReplayEvents(null);
    setLayout((current) => ({ ...current, debuggerCollapsed: false, inspectorCollapsed: true, libraryCollapsed: true }));
    void runtime.run();
  };
  useEffect(() => {
    if (runtime.validationIssues.length) window.requestAnimationFrame(() => document.getElementById('validation-summary')?.focus());
  }, [runtime.validationIssues.length]);
  const replaceWorkspace = (workspace: Omit<EditorWorkspace, 'format' | 'savedAt'>) => {
    setWorkspaceMeta({ id: workspace.id, name: workspace.name, description: workspace.description });
    hydrateWorkflow(workspace.nodes, workspace.edges);
    selectNode(null);
    setReplayEvents(null);
  };
  const skipToWorkflow = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.requestAnimationFrame(() => document.getElementById('workflow-content')?.focus());
  };

  const update = (next: Partial<PanelLayout>) => setLayout((current) => ({ ...current, ...next }));
  const showInspector = () => update({ inspectorCollapsed: false, libraryCollapsed: true });
  const inspectorVisible = Boolean(selectedNodeId) && !layout.inspectorCollapsed;
  const style = {
    '--nf-debugger-height': layout.debuggerCollapsed ? '0px' : `${layout.debuggerHeight}px`,
    '--nf-inspector-width': inspectorVisible ? `${layout.inspectorWidth}px` : '0px',
    '--nf-library-width': layout.libraryCollapsed ? '52px' : `${layout.libraryWidth}px`,
  } as CSSProperties;

  return (
    <>
      <a className="nf-skip-link" href="#workflow-canvas" onClick={skipToWorkflow}>Skip to workflow</a>
      <div className="nf-product-shell">
        <ProductHeader busy={runtime.busy} example={Boolean(activeTemplate)} name={workspaceMeta.name} onOpenWorkspace={() => setWorkspaceMenuOpen(true)} onRun={runWorkflow} onStop={runtime.stop} validating={runtime.validating} />
        <p aria-atomic="true" className="nf-visually-hidden" role="status">{runtime.statusMessage}</p>
        <div className="nf-workflow-content" id="workflow-content" tabIndex={-1}>
          {compactViewer ? <ResponsiveReadOnlyViewer description={workspaceMeta.description} name={workspaceMeta.name} nodeStatuses={runtime.nodeStatuses} nodes={nodes} /> : <main className="nf-workbench" style={style}>
          <NodeLibrary collapsed={layout.libraryCollapsed} onNodeAdded={showInspector} onToggle={() => update(layout.libraryCollapsed ? { inspectorCollapsed: true, libraryCollapsed: false } : { libraryCollapsed: true })} />
          {layout.libraryCollapsed ? null : <ResizeHandle ariaLabel="Resize node library" axis="x" current={layout.libraryWidth} limits={PANEL_LIMITS.libraryWidth} onChange={(libraryWidth) => update({ libraryWidth })} slot="library" />}
          <div className="nf-canvas-column" id="workflow-canvas" tabIndex={-1}>
            <Profiler id="RegistryWorkflowCanvas" onRender={recordReactRender}><RegistryWorkflowCanvas debuggerCollapsed={layout.debuggerCollapsed} description={workspaceMeta.description} exampleOutcome={activeTemplate?.outcome} libraryCollapsed={layout.libraryCollapsed} nodeStatuses={displayedNodeStatuses} onShowDebugger={() => update({ debuggerCollapsed: false })} onShowLibrary={() => update({ libraryCollapsed: false })} inspectorCollapsed={!inspectorVisible} onShowInspector={showInspector} validationIssues={runtime.validationIssues} workflowName={workspaceMeta.name} /></Profiler>
            {layout.debuggerCollapsed ? null : <ResizeHandle ariaLabel="Resize debugger" axis="y" current={layout.debuggerHeight} limits={PANEL_LIMITS.debuggerHeight} onChange={(debuggerHeight) => update({ debuggerHeight })} reverse />}
            <DebuggerPanel busy={runtime.busy} collapsed={layout.debuggerCollapsed} events={runtime.runState.events} historyAvailable={history.available} key={runtime.runState.runId ?? 'idle'} nodeLabels={nodeLabels} onClearHistory={() => void history.clear()} onInspectNode={(nodeId) => { selectNode(nodeId); showInspector(); }} onReplayEvents={setReplayEvents} onRun={runWorkflow} onStop={runtime.stop} onToggle={() => update({ debuggerCollapsed: true })} retryable={runtime.retryable} statusMessage={runtime.statusMessage} traces={history.traces} workflowFormat={currentWorkspace.format} workflowId={currentWorkspace.id} workflowSignature={workflowSignature(currentWorkspace)} />
          </div>
          {inspectorVisible ? <ResizeHandle ariaLabel="Resize inspector" axis="x" current={layout.inspectorWidth} limits={PANEL_LIMITS.inspectorWidth} onChange={(inspectorWidth) => update({ inspectorWidth })} reverse slot="inspector" /> : null}
          <NodeInspector busy={runtime.busy} collapsed={!inspectorVisible} events={inspectorEvents} onToggle={() => update({ inspectorCollapsed: true })} validationIssues={runtime.validationIssues} />
          </main>}
        </div>
        <WorkspaceExperience currentWorkspace={currentWorkspace} onClose={() => setWorkspaceMenuOpen(false)} onReplace={replaceWorkspace} open={workspaceMenuOpen} recoveryReason={initialLoad.status === 'recovered' ? initialLoad.reason : undefined} />
      </div>
    </>
  );
}
