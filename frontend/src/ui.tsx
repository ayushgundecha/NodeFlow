import { useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import ReactFlow, {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
} from "reactflow";
import type { NodeTypes, ReactFlowInstance } from "reactflow";
import { useStore } from "./store";
import { useShallow } from "zustand/react/shallow";
import { InputNode } from "./nodes/inputNode";
import { LLMNode } from "./nodes/llmNode";
import { OutputNode } from "./nodes/outputNode";
import { TextNode } from "./nodes/textNode";
import { ApiFetchNode } from "./nodes/apiNode";
import { ImageProcessingNode } from "./nodes/imageProcessingNode";
import { TimerNode } from "./nodes/timer";
import { EmailFormatterNode } from "./nodes/email";
import { TextTransformationNode } from "./nodes/transformation";
import "reactflow/dist/style.css";
import "./ui.css"; // Custom styles for animations
import type { FlowNode, FlowNodeData, FlowStore } from "./types/editor";
import { createLegacyNodeData } from "./features/editor/legacyNodeDefaults";
import { useEditorStore } from "./features/editor/editorStore";

const gridSize = 20;
const proOptions = { hideAttribution: true };

const nodeTypes: NodeTypes = {
  customInput: InputNode,
  llm: LLMNode,
  customOutput: OutputNode,
  text: TextNode,
  api: ApiFetchNode,
  imageProcessing: ImageProcessingNode,
  timer: TimerNode,
  emailFormatter: EmailFormatterNode,
  textTransformation: TextTransformationNode,
};

const selector = (state: FlowStore) => ({
  nodes: state.nodes,
  edges: state.edges,
  getNodeID: state.getNodeID,
  addNode: state.addNode,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
});

export const PipelineUI = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<FlowNodeData> | null>(null);
  const { nodes, edges, getNodeID, addNode, onNodesChange, onEdgesChange, onConnect } = useStore(useShallow(selector));
  const selectNode = useEditorStore((state) => state.selectNode);
  const setViewport = useEditorStore((state) => state.setViewport);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const wrapper = reactFlowWrapper.current;
      if (!wrapper || !reactFlowInstance) return;
      const reactFlowBounds = wrapper.getBoundingClientRect();

      const serializedData = event.dataTransfer.getData("application/reactflow");
      if (serializedData) {
        const appData = JSON.parse(serializedData) as { nodeType?: string };
        const type = appData.nodeType;

        if (!type) return;

        const position = reactFlowInstance.project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        });

        const nodeID = getNodeID(type);
        const newNode: FlowNode = {
          id: nodeID,
          type,
          position,
          data: createLegacyNodeData(nodeID, type),
        };

        addNode(newNode);
      }
    },
    [addNode, getNodeID, reactFlowInstance]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  return (
    <div ref={reactFlowWrapper} className="flow-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={setReactFlowInstance}
        onNodeClick={(_event, node) => { selectNode(node.id); }}
        onPaneClick={() => { selectNode(null); }}
        onMoveEnd={(_event, viewport) => { setViewport(viewport); }}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        snapGrid={[gridSize, gridSize]}
        connectionLineType={ConnectionLineType.SmoothStep}
        className="react-flow-custom"
      >
        <Background color="#aaa" gap={gridSize} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
