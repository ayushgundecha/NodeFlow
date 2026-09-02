import type { ComponentType, CSSProperties, SVGProps } from "react";
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnConnect,
  Position,
} from "reactflow";

export type NodeIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type FlowNodeData = {
  id: string;
  nodeType: string;
  label?: string;
  config?: Record<string, unknown>;
  status?: "idle" | "queued" | "running" | "succeeded" | "failed" | "paused" | "skipped";
  [key: string]: unknown;
};

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export type NodeHandleSpec = {
  id: string;
  type: "source" | "target";
  position: Position | "left" | "right";
  style?: CSSProperties;
};

export type FlowStore = {
  nodeIDs: Record<string, number>;
  nodes: FlowNode[];
  edges: FlowEdge[];
  historyPast: Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>;
  historyFuture: Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>;
  getNodeID: (type: string) => string;
  addNode: (node: FlowNode) => void;
  hydrateWorkflow: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  updateNodeField: (nodeId: string, fieldName: string, fieldValue: unknown) => void;
  updateNodeConfig: (nodeId: string, fieldName: string, fieldValue: unknown) => void;
  deleteNodes: (nodeIds: string[]) => void;
  duplicateNodes: (nodeIds: string[]) => string[];
  moveNodes: (nodeIds: string[], delta: { x: number; y: number }) => void;
  autoLayout: () => void;
  undo: () => void;
  redo: () => void;
};

export type FlowConnection = Connection;
