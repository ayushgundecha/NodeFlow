import { Circle, Maximize2, PanelLeftOpen, PanelRightOpen, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";
import type { RuntimeNodeStatus } from "../runtime/useWorkflowRuntime";
import type { ValidationIssue } from "../../contracts/types";
import { CompactNodeCard, type ActivePort } from "./CompactNodeCard";
import { EditorCommandBar } from "./EditorCommandBar";

interface RegistryWorkflowCanvasProps {
  description: string;
  inspectorCollapsed: boolean;
  libraryCollapsed: boolean;
  onShowInspector: () => void;
  onShowLibrary: () => void;
  workflowName: string;
  nodeStatuses: Record<string, RuntimeNodeStatus>;
  validationIssues: ValidationIssue[];
}

function CanvasIconButton({ icon: Icon, label, onClick }: { icon: typeof Maximize2; label: string; onClick?: () => void }) {
  return <button aria-label={label} className="nf-icon-button" onClick={onClick} title={label} type="button"><Icon aria-hidden="true" size={17} /></button>;
}

export function RegistryWorkflowCanvas({ description, inspectorCollapsed, libraryCollapsed, nodeStatuses, onShowInspector, onShowLibrary, validationIssues, workflowName }: RegistryWorkflowCanvasProps) {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const onConnect = useStore((state) => state.onConnect);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const selectNode = useEditorStore((state) => state.selectNode);
  const toggleNodeSelection = useEditorStore((state) => state.toggleNodeSelection);
  const [activePort, setActivePort] = useState<ActivePort>(null);
  const [zoom, setZoom] = useState(100);
  const stageRef = useRef<HTMLDivElement>(null);
  const fitView = () => { setZoom(100); stageRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" }); };
  const choosePort = (nextPort: ActivePort) => {
    if (!activePort || !nextPort) { setActivePort(nextPort); return; }
    if (activePort.nodeId === nextPort.nodeId && activePort.portId === nextPort.portId) { setActivePort(null); return; }
    const compatible = activePort.nodeId !== nextPort.nodeId
      && activePort.direction !== nextPort.direction
      && (activePort.dataType === "any" || nextPort.dataType === "any" || activePort.dataType === nextPort.dataType);
    if (!compatible) return;
    const source = activePort.direction === "output" ? activePort : nextPort;
    const target = activePort.direction === "input" ? activePort : nextPort;
    const duplicate = edges.some((edge) => edge.source === source.nodeId && edge.sourceHandle === source.portId && edge.target === target.nodeId && edge.targetHandle === target.portId);
    if (duplicate) { setActivePort(null); return; }
    onConnect({ source: source.nodeId, sourceHandle: source.portId, target: target.nodeId, targetHandle: target.portId });
    setActivePort(null);
  };
  const nodeErrors = new Map(validationIssues.filter((issue) => issue.nodeId).map((issue) => [issue.nodeId!, issue.message]));
  const edgeStatus = (sourceId: string, targetId: string) => {
    const source = nodeStatuses[sourceId] ?? "idle";
    const target = nodeStatuses[targetId] ?? "idle";
    if (source === "failed" || target === "failed") return "failed";
    if (source === "skipped" || target === "skipped") return "skipped";
    if (source === "paused" || target === "paused") return "paused";
    if (source === "running" || target === "running") return "running";
    if (source === "succeeded" && target === "succeeded") return "succeeded";
    if (source === "queued" || target === "queued") return "queued";
    return "idle";
  };

  return (
    <section aria-labelledby="canvas-title" className="nf-workflow-canvas">
      <div className="nf-canvas-toolbar">
        <div>
          {libraryCollapsed ? <CanvasIconButton icon={PanelLeftOpen} label="Open node library" onClick={onShowLibrary} /> : null}
          <span className="nf-canvas-breadcrumb"><span>Workflows</span><span>/</span><strong>{workflowName}</strong></span>
        </div>
        <div>
          <span className="nf-shell-badge"><Circle aria-hidden="true" fill="currentColor" size={8} /> Draft · {nodes.length} nodes · {edges.length} links</span>
          <CanvasIconButton icon={Maximize2} label="Fit workflow to view" onClick={fitView} />
          {inspectorCollapsed ? <CanvasIconButton icon={PanelRightOpen} label="Open inspector" onClick={onShowInspector} /> : null}
        </div>
      </div>
      <div className="nf-canvas-stage" onClick={(event) => { if (event.currentTarget === event.target) selectNode(null); }} ref={stageRef}>
        <div className="nf-canvas-title">
          <span className="nf-overline">Flagship workflow</span>
          <h1 id="canvas-title">{workflowName}</h1>
          <p>{description}</p>
        </div>
        <EditorCommandBar />
        {validationIssues.length ? <div className="nf-validation-summary" id="validation-summary" role="alert" tabIndex={-1}><strong>Run blocked · {validationIssues.length} {validationIssues.length === 1 ? "issue" : "issues"}</strong><span>{validationIssues[0]!.message}</span></div> : null}
        {nodes.length ? (
          <div className="nf-registry-workflow" aria-label="Editable workflow nodes" style={{ transform: `scale(${zoom / 100})` }}>
            {nodes.map((node, index) => (
              <div className="nf-registry-workflow__step" key={node.id}>
                <CompactNodeCard activePort={activePort} node={node} onPortChange={choosePort} onSelect={(nodeId, additive) => additive ? toggleNodeSelection(nodeId) : selectNode(nodeId)} selected={selectedNodeIds.includes(node.id)} status={nodeStatuses[node.id]} validationMessage={nodeErrors.get(node.id)} />
                {index < nodes.length - 1 ? (() => { const next = nodes[index + 1]!; const connection = edges.find((edge) => edge.source === node.id && edge.target === next.id); const status = connection ? edgeStatus(connection.source, connection.target) : "idle"; return <span aria-label={`Connection ${node.data.label ?? node.id} to ${next.data.label ?? next.id}: ${status}`} className={`nf-registry-edge nf-registry-edge--${status}${validationIssues.some((issue) => issue.edgeId === connection?.id) ? " nf-registry-edge--invalid" : ""}`} role="img"><i aria-hidden="true" /></span>; })() : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="nf-canvas-empty"><strong>Your workflow is empty</strong><span>Add a node from the library to begin.</span></div>
        )}
      </div>
      <div className="nf-canvas-controls" aria-label="Canvas controls">
        <CanvasIconButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom((current) => Math.max(60, current - 10))} />
        <span>{zoom}%</span>
        <CanvasIconButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom((current) => Math.min(140, current + 10))} />
        <span className="nf-control-divider" />
        <CanvasIconButton icon={Maximize2} label="Fit view" onClick={fitView} />
      </div>
    </section>
  );
}
