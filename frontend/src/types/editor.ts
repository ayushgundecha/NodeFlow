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
  getNodeID: (type: string) => string;
  addNode: (node: FlowNode) => void;
  removeNode: (nodeId: string) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: OnConnect;
  updateNodeField: (nodeId: string, fieldName: string, fieldValue: unknown) => void;
};

export type FlowConnection = Connection;
