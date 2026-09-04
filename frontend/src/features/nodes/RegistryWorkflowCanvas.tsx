import { Maximize2, PanelBottomOpen, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import ReactFlow, { Background, ConnectionLineType, type Connection, type NodeProps, type NodeTypes, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { useStore } from "../../store";
import type { FlowNodeData } from "../../types/editor";
import { useEditorStore } from "../editor/editorStore";
import type { RuntimeNodeStatus } from "../runtime/useWorkflowRuntime";
import type { ValidationIssue } from "../../contracts/types";
import { CompactNodeCard, type ActivePort } from "./CompactNodeCard";
import { EditorCommandBar } from "./EditorCommandBar";
import { NODEFLOW_DRAG_TYPE, canConnectNodes, createLibraryNode } from "./workflowGraph";

interface RegistryWorkflowCanvasProps {
  debuggerCollapsed: boolean;
  description: string;
  exampleOutcome?: string;
  inspectorCollapsed: boolean;
  libraryCollapsed: boolean;
  onShowDebugger: () => void;
  onShowInspector: () => void;
  onShowLibrary: () => void;
  workflowName: string;
  nodeStatuses: Record<string, RuntimeNodeStatus>;
  validationIssues: ValidationIssue[];
}

type RegistryNodeData = FlowNodeData & {
  activePort: ActivePort;
  runtimeStatus?: RuntimeNodeStatus;
  selectedForEditor?: boolean;
  validationMessage?: string;
  onPortChange: (port: ActivePort) => void;
  onSelect: (nodeId: string, additive: boolean) => void;
};

function RegistryNode({ data }: NodeProps<RegistryNodeData>) {
  return <CompactNodeCard activePort={data.activePort} node={{ id: data.id, type: "registryNode", position: { x: 0, y: 0 }, data }} onPortChange={data.onPortChange} onSelect={data.onSelect} selected={Boolean(data.selectedForEditor)} status={data.runtimeStatus} validationMessage={data.validationMessage} />;
}

const nodeTypes: NodeTypes = { registryNode: RegistryNode };

function CanvasIconButton({ icon: Icon, label, onClick }: { icon: typeof Maximize2; label: string; onClick?: () => void }) {
  return <button aria-label={label} className="nf-icon-button" onClick={onClick} title={label} type="button"><Icon aria-hidden="true" size={17} /></button>;
}

export function RegistryWorkflowCanvas({ debuggerCollapsed, description, exampleOutcome, inspectorCollapsed, libraryCollapsed, nodeStatuses, onShowDebugger, onShowInspector, onShowLibrary, validationIssues, workflowName }: RegistryWorkflowCanvasProps) {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const addNode = useStore((state) => state.addNode);
  const getNodeID = useStore((state) => state.getNodeID);
  const onConnect = useStore((state) => state.onConnect);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onNodesChange = useStore((state) => state.onNodesChange);
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const selectNode = useEditorStore((state) => state.selectNode);
  const toggleNodeSelection = useEditorStore((state) => state.toggleNodeSelection);
  const [activePort, setActivePort] = useState<ActivePort>(null);
  const [zoom, setZoom] = useState(100);
  const reactFlow = useRef<ReactFlowInstance | null>(null);
  const fitView = useCallback(() => {
    const instance = reactFlow.current;
    if (!instance) return;
    instance.fitView({ duration: 180, maxZoom: 1, padding: 0.12 });
    window.setTimeout(() => setZoom(Math.round(instance.getZoom() * 100)), 220);
  }, []);
  useEffect(() => {
    if (!nodes.length) return;
    const frame = window.requestAnimationFrame(fitView);
    const settled = window.setTimeout(fitView, 260);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settled);
    };
  }, [debuggerCollapsed, fitView, inspectorCollapsed, libraryCollapsed, nodes.length]);
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
  const revealInspector = useCallback(() => onShowInspector(), [onShowInspector]);
  const flowNodes = nodes.map((node) => ({ ...node, selected: selectedNodeIds.includes(node.id), data: { ...node.data, activePort, onPortChange: choosePort, onSelect: (nodeId: string, additive: boolean) => { if (additive) toggleNodeSelection(nodeId); else selectNode(nodeId); revealInspector(); }, runtimeStatus: nodeStatuses[node.id], selectedForEditor: selectedNodeIds.includes(node.id), validationMessage: nodeErrors.get(node.id) } }));
  const flowEdges = edges.map((edge) => ({
    ...edge,
    animated: nodeStatuses[edge.target] === "running",
    className: `nf-flow-edge nf-flow-edge--${nodeStatuses[edge.target] ?? "idle"}`,
    markerEnd: undefined,
    type: "smoothstep",
  }));
  const createNodeAt = useCallback((type: string, position: { x: number; y: number }) => {
    const id = getNodeID(type);
    addNode(createLibraryNode(type as Parameters<typeof createLibraryNode>[0], id, position));
    selectNode(id);
    revealInspector();
  }, [addNode, getNodeID, revealInspector, selectNode]);
  const connect = useCallback((connection: Connection) => {
    if (canConnectNodes(connection, nodes, edges)) onConnect(connection);
  }, [edges, nodes, onConnect]);
  const dropNode = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(NODEFLOW_DRAG_TYPE) || event.dataTransfer.getData("text/plain");
    if (!type || !reactFlow.current) return;
    createNodeAt(type, reactFlow.current.project({ x: event.clientX, y: event.clientY }));
  }, [createNodeAt]);

  return (
    <section aria-labelledby="canvas-title" className="nf-workflow-canvas">
      <div className="nf-canvas-toolbar">
        <div className="nf-canvas-identity">
          {exampleOutcome ? <span className="nf-canvas-mode">Example</span> : null}
          <h1 id="canvas-title">{workflowName}</h1>
          <span className="nf-canvas-purpose" title={description}>{description}</span>
        </div>
        <div>
          <span className="nf-shell-badge">{nodes.length} nodes · {edges.length} links</span>
          <CanvasIconButton icon={Maximize2} label="Fit workflow to view" onClick={fitView} />
          {debuggerCollapsed ? <CanvasIconButton icon={PanelBottomOpen} label="Open run debugger" onClick={onShowDebugger} /> : null}
        </div>
      </div>
      <div className="nf-canvas-stage">
        <ReactFlow
          className="nf-react-flow"
          connectionLineStyle={{ stroke: "var(--nf-color-action)", strokeWidth: 1.75 }}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{ animated: false, type: "smoothstep" }}
          edges={flowEdges}
          fitView
          minZoom={0.35}
          nodeTypes={nodeTypes}
          nodes={flowNodes}
          onConnect={connect}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={dropNode}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => { reactFlow.current = instance; window.requestAnimationFrame(fitView); }}
          onMoveEnd={(_event, viewport) => setZoom(Math.round(viewport.zoom * 100))}
          onNodeClick={(event, node) => { if (event.shiftKey) toggleNodeSelection(node.id); else selectNode(node.id); revealInspector(); }}
          onNodesChange={onNodesChange}
          onPaneClick={() => { selectNode(null); setActivePort(null); }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
        {validationIssues.length ? <div className="nf-validation-summary" id="validation-summary" role="alert" tabIndex={-1}><strong>Run blocked · {validationIssues.length} {validationIssues.length === 1 ? "issue" : "issues"}</strong><span>{validationIssues[0]!.message}</span></div> : null}
        <div className="nf-canvas-command-dock"><EditorCommandBar /></div>
        {!nodes.length ? <div className="nf-canvas-empty"><strong>Start your workflow here</strong><span>Drag a node from the library, or click one to add it and open its settings.</span><button className="nf-button nf-button--secondary" onClick={() => onShowLibrary()} type="button">Open node library</button></div> : null}
      </div>
      <div className="nf-canvas-controls" aria-label="Canvas controls">
        <CanvasIconButton icon={ZoomOut} label="Zoom out" onClick={() => { void reactFlow.current?.zoomOut({ duration: 120 }); }} />
        <span>{zoom}%</span>
        <CanvasIconButton icon={ZoomIn} label="Zoom in" onClick={() => { void reactFlow.current?.zoomIn({ duration: 120 }); }} />
        <span className="nf-control-divider" />
        <CanvasIconButton icon={Maximize2} label="Fit view" onClick={fitView} />
      </div>
    </section>
  );
}
