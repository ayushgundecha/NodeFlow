import { create } from "zustand";
import {
  MarkerType,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";
import type { FlowStore } from "./types/editor";

export const useStore = create<FlowStore>((set, get) => ({
  nodeIDs: {},
  nodes: [],
  edges: [],
  getNodeID: (type) => {
    const nextSequence = (get().nodeIDs[type] ?? 0) + 1;
    set((state) => ({
      nodeIDs: { ...state.nodeIDs, [type]: nextSequence },
    }));
    return `${type}-${nextSequence}`;
  },
  addNode: (node) => {
    set((state) => ({ nodes: [...state.nodes, node] }));
  },
  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    }));
  },
  onNodesChange: (changes) => {
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));
  },
  onEdgesChange: (changes) => {
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }));
  },
  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: true,
          markerEnd: { type: MarkerType.Arrow, height: 20, width: 20 },
        },
        state.edges,
      ),
    }));
  },
  updateNodeField: (nodeId, fieldName, fieldValue) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
          : node,
      ),
    }));
  },
}));
