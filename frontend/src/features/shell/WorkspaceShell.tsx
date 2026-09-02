import {
  Box,
  Braces,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Code2,
  GitBranch,
  ListTree,
  Maximize2,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Undo2,
  Webhook,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
}

function IconButton({ icon: Icon, label, onClick, pressed }: IconButtonProps) {
  return (
    <button aria-label={label} aria-pressed={pressed} className="nf-icon-button" onClick={onClick} title={label} type="button">
      <Icon aria-hidden="true" size={17} strokeWidth={2} />
    </button>
  );
}

const libraryItems: Array<{ description: string; icon: LucideIcon; label: string }> = [
  { description: 'Start with real JSON', icon: Webhook, label: 'Incident input' },
  { description: 'Validate a contract', icon: CheckCircle2, label: 'Validate data' },
  { description: 'Run isolated logic', icon: Code2, label: 'JavaScript' },
  { description: 'Route by an expression', icon: GitBranch, label: 'Condition' },
  { description: 'Generate structured text', icon: Sparkles, label: 'AI brief' },
];

function NodeLibrary({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside aria-label="Node library" className="nf-shell-panel nf-library" hidden={collapsed}>
      <header className="nf-panel-heading">
        <div><Box aria-hidden="true" size={17} /><h2>Node library</h2></div>
        <IconButton icon={PanelLeftClose} label="Collapse node library" onClick={onToggle} />
      </header>
      <label className="nf-shell-search">
        <span className="nf-visually-hidden">Search nodes</span>
        <Search aria-hidden="true" size={16} />
        <input placeholder="Search nodes" type="search" />
        <kbd>⌘K</kbd>
      </label>
      <div className="nf-library-section">
        <div className="nf-library-section__heading"><span>Core nodes</span><span>5</span></div>
        <div className="nf-library-list">
          {libraryItems.map(({ description, icon: Icon, label }) => (
            <button className="nf-library-item" key={label} type="button">
              <span className="nf-library-item__icon"><Icon aria-hidden="true" size={17} /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
              <Plus aria-hidden="true" size={16} />
            </button>
          ))}
        </div>
      </div>
      <footer className="nf-panel-footer"><span><Circle aria-hidden="true" size={9} fill="currentColor" /> 10 node types available</span></footer>
    </aside>
  );
}

function CanvasNode({ icon: Icon, label, meta, status }: { icon: LucideIcon; label: string; meta: string; status: 'idle' | 'ready' | 'selected' }) {
  return (
    <button className={`nf-canvas-node nf-canvas-node--${status}`} type="button">
      <span className="nf-canvas-node__icon"><Icon aria-hidden="true" size={18} /></span>
      <span><small>{meta}</small><strong>{label}</strong></span>
      <span className="nf-canvas-node__status">{status === 'selected' ? 'Selected' : status === 'ready' ? 'Ready' : 'Idle'}</span>
    </button>
  );
}

function WorkflowCanvas({ libraryCollapsed, onShowLibrary, inspectorCollapsed, onShowInspector }: { libraryCollapsed: boolean; onShowLibrary: () => void; inspectorCollapsed: boolean; onShowInspector: () => void }) {
  return (
    <section aria-labelledby="canvas-title" className="nf-workflow-canvas">
      <div className="nf-canvas-toolbar">
        <div>
          {libraryCollapsed ? <IconButton icon={PanelLeftOpen} label="Open node library" onClick={onShowLibrary} /> : null}
          <span className="nf-canvas-breadcrumb"><span>Workflows</span><span>/</span><strong>Incident response</strong></span>
        </div>
        <div>
          <span className="nf-shell-badge"><Circle aria-hidden="true" fill="currentColor" size={8} /> Draft</span>
          <IconButton icon={Maximize2} label="Fit workflow to view" />
          {inspectorCollapsed ? <IconButton icon={PanelRightOpen} label="Open inspector" onClick={onShowInspector} /> : null}
        </div>
      </div>
      <div className="nf-canvas-stage">
        <div className="nf-canvas-title">
          <span className="nf-overline">Flagship workflow</span>
          <h1 id="canvas-title">Incident response</h1>
          <p>Turn an incoming alert into a validated, severity-aware incident brief.</p>
        </div>
        <div className="nf-workflow-preview" aria-label="Workflow preview">
          <CanvasNode icon={Webhook} label="Incident input" meta="Trigger" status="ready" />
          <span className="nf-preview-edge"><span>event</span></span>
          <CanvasNode icon={Braces} label="Parse incident" meta="Transform" status="selected" />
          <span className="nf-preview-edge"><span>incident</span></span>
          <CanvasNode icon={Sparkles} label="AI incident brief" meta="Intelligence" status="idle" />
        </div>
        <div className="nf-canvas-tip"><ListTree aria-hidden="true" size={16} /><span><strong>Workflow structure is valid.</strong> Select a node to inspect its configuration.</span></div>
      </div>
      <div className="nf-canvas-controls" aria-label="Canvas controls">
        <IconButton icon={ZoomOut} label="Zoom out" />
        <span>100%</span>
        <IconButton icon={ZoomIn} label="Zoom in" />
        <span className="nf-control-divider" />
        <IconButton icon={Maximize2} label="Fit view" />
      </div>
    </section>
  );
}

function Inspector({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside aria-label="Node inspector" className="nf-shell-panel nf-inspector" hidden={collapsed}>
      <header className="nf-panel-heading">
        <div><SlidersHorizontal aria-hidden="true" size={17} /><h2>Inspector</h2></div>
        <IconButton icon={PanelRightClose} label="Collapse inspector" onClick={onToggle} />
      </header>
      <div className="nf-inspector-tabs" role="tablist" aria-label="Inspector views">
        <button aria-selected="true" role="tab" type="button">Configure</button>
        <button aria-selected="false" role="tab" tabIndex={-1} type="button">Input</button>
        <button aria-selected="false" role="tab" tabIndex={-1} type="button">Output</button>
      </div>
      <div className="nf-inspector-content">
        <div className="nf-selected-node">
          <span><Code2 aria-hidden="true" size={18} /></span>
          <div><small>JavaScript</small><strong>Parse incident</strong></div>
          <button aria-label="Node actions" type="button"><ChevronDown aria-hidden="true" size={16} /></button>
        </div>
        <label className="nf-shell-field"><span>Name</span><input defaultValue="Parse incident" /></label>
        <div className="nf-shell-field"><span id="runtime-label">Runtime</span><button aria-labelledby="runtime-label runtime-value" className="nf-select-button" type="button"><span id="runtime-value">JavaScript · Sandbox</span><ChevronDown aria-hidden="true" size={15} /></button></div>
        <div className="nf-shell-field"><span>Code</span><span className="nf-code-preview"><code>return normalize(input.event);</code><button aria-label="Open JavaScript editor" type="button">Open editor</button></span><small>Runs in an isolated environment with no network access.</small></div>
      </div>
      <footer className="nf-panel-footer"><span><CheckCircle2 aria-hidden="true" size={14} /> Configuration valid</span></footer>
    </aside>
  );
}

function DebuggerPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <section aria-labelledby="debugger-title" className="nf-debugger" hidden={collapsed}>
      <header className="nf-debugger__header">
        <div><TerminalSquare aria-hidden="true" size={17} /><h2 id="debugger-title">Debugger</h2><span className="nf-shell-badge">No active run</span></div>
        <div><button className="nf-debug-tab nf-debug-tab--active" type="button">Timeline</button><button className="nf-debug-tab" type="button">Logs</button><button className="nf-debug-tab" type="button">Payload</button><IconButton icon={PanelBottomClose} label="Collapse debugger" onClick={onToggle} /></div>
      </header>
      <div className="nf-debugger__empty">
        <span><Clock3 aria-hidden="true" size={20} /></span>
        <div><strong>Ready to trace your workflow</strong><p>Run the workflow to see node timing, structured logs, inputs, outputs, and failures here.</p></div>
        <button className="nf-text-button" type="button"><Play aria-hidden="true" size={14} fill="currentColor" /> Run workflow</button>
      </div>
    </section>
  );
}

function ProductHeader() {
  return (
    <header className="nf-product-header">
      <div className="nf-product-brand"><span className="nf-product-mark"><GitBranch aria-hidden="true" size={18} /></span><strong>NodeFlow</strong><span className="nf-product-edition">Studio</span></div>
      <div className="nf-header-workflow"><button type="button"><span>Incident response</span><ChevronDown aria-hidden="true" size={15} /></button><span><CheckCircle2 aria-hidden="true" size={13} /> Saved locally</span></div>
      <nav aria-label="Workflow commands" className="nf-header-actions">
        <div className="nf-command-group"><IconButton icon={Undo2} label="Undo" /><IconButton icon={Redo2} label="Redo" /></div>
        <IconButton icon={Share2} label="Share workflow" />
        <IconButton icon={Settings2} label="Workflow settings" />
        <button className="nf-button nf-button--primary" type="button"><Play aria-hidden="true" fill="currentColor" size={15} /> Run workflow</button>
      </nav>
    </header>
  );
}

export function WorkspaceShell() {
  const [layout, setLayout] = useState<PanelLayout>(() => typeof localStorage === 'undefined' ? DEFAULT_PANEL_LAYOUT : loadPanelLayout());

  useEffect(() => savePanelLayout(layout), [layout]);

  const update = (next: Partial<PanelLayout>) => setLayout((current) => ({ ...current, ...next }));
  const style = {
    '--nf-debugger-height': layout.debuggerCollapsed ? '0px' : `${layout.debuggerHeight}px`,
    '--nf-inspector-width': layout.inspectorCollapsed ? '0px' : `${layout.inspectorWidth}px`,
    '--nf-library-width': layout.libraryCollapsed ? '0px' : `${layout.libraryWidth}px`,
  } as CSSProperties;

  return (
    <>
      <a className="nf-skip-link" href="#workflow-canvas">Skip to workflow canvas</a>
      <div className="nf-product-shell">
        <ProductHeader />
        <main className="nf-workbench" style={style}>
          <NodeLibrary collapsed={layout.libraryCollapsed} onToggle={() => update({ libraryCollapsed: true })} />
          {layout.libraryCollapsed ? null : <ResizeHandle ariaLabel="Resize node library" axis="x" current={layout.libraryWidth} limits={PANEL_LIMITS.libraryWidth} onChange={(libraryWidth) => update({ libraryWidth })} slot="library" />}
          <div className="nf-canvas-column" id="workflow-canvas" tabIndex={-1}>
            <WorkflowCanvas libraryCollapsed={layout.libraryCollapsed} onShowLibrary={() => update({ libraryCollapsed: false })} inspectorCollapsed={layout.inspectorCollapsed} onShowInspector={() => update({ inspectorCollapsed: false })} />
            {layout.debuggerCollapsed ? (
              <button className="nf-debugger-restore" onClick={() => update({ debuggerCollapsed: false })} type="button"><PanelBottomOpen aria-hidden="true" size={16} /> Open debugger</button>
            ) : (
              <ResizeHandle ariaLabel="Resize debugger" axis="y" current={layout.debuggerHeight} limits={PANEL_LIMITS.debuggerHeight} onChange={(debuggerHeight) => update({ debuggerHeight })} reverse />
            )}
            <DebuggerPanel collapsed={layout.debuggerCollapsed} onToggle={() => update({ debuggerCollapsed: true })} />
          </div>
          {layout.inspectorCollapsed ? null : <ResizeHandle ariaLabel="Resize inspector" axis="x" current={layout.inspectorWidth} limits={PANEL_LIMITS.inspectorWidth} onChange={(inspectorWidth) => update({ inspectorWidth })} reverse slot="inspector" />}
          <Inspector collapsed={layout.inspectorCollapsed} onToggle={() => update({ inspectorCollapsed: true })} />
        </main>
      </div>
    </>
  );
}
