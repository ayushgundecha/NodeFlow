import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";
import type { FlowStore } from "./types/editor";
import { layoutWorkflowNodes } from "./features/nodes/workflowGraph";

const snapshot = (state: Pick<FlowStore, "nodes" | "edges">) => ({ nodes: state.nodes, edges: state.edges });
let dragStartSnapshot: ReturnType<typeof snapshot> | null = null;
const withHistory = (state: FlowStore, next: Partial<Pick<FlowStore, "nodes" | "edges">>) => ({
  ...next,
  historyPast: [...state.historyPast.slice(-49), snapshot(state)],
  historyFuture: [],
});

export const useStore = create<FlowStore>((set, get) => ({
  nodeIDs: {},
  nodes: [],
  edges: [],
  historyPast: [],
  historyFuture: [],
  getNodeID: (type) => {
    const nextSequence = (get().nodeIDs[type] ?? 0) + 1;
    set((state) => ({
      nodeIDs: { ...state.nodeIDs, [type]: nextSequence },
    }));
    return `${type}-${nextSequence}`;
  },
  addNode: (node) => {
    set((state) => withHistory(state, { nodes: [...state.nodes, node] }));
  },
  hydrateWorkflow: (nodes, edges) => {
    dragStartSnapshot = null;
    const nodeIDs = nodes.reduce<Record<string, number>>((sequences, node) => {
      const type = node.data.nodeType;
      sequences[type] = Math.max(sequences[type] ?? 0, Number.parseInt(node.id.split("-").at(-1) ?? "0", 10) || 0);
      return sequences;
    }, {});
    set({ nodeIDs, nodes, edges, historyPast: [], historyFuture: [] });
  },
  removeNode: (nodeId) => {
    set((state) => withHistory(state, {
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    }));
  },
  onNodesChange: (changes) => {
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      if (changes.every((change) => change.type === 'dimensions' || change.type === 'select')) return { nodes };
      if (changes.some((change) => change.type === 'position' && change.dragging)) {
        dragStartSnapshot ??= snapshot(state);
        return { nodes };
      }
      if (dragStartSnapshot) {
        const previous = dragStartSnapshot;
        dragStartSnapshot = null;
        return { nodes, historyPast: [...state.historyPast.slice(-49), previous], historyFuture: [] };
      }
      return withHistory(state, { nodes });
    });
  },
  onEdgesChange: (changes) => {
    set((state) => {
      const edges = applyEdgeChanges(changes, state.edges);
      return changes.every((change) => change.type === 'select') ? { edges } : withHistory(state, { edges });
    });
  },
  onConnect: (connection) => {
    set((state) => withHistory(state, {
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: false,
        },
        state.edges,
      ),
    }));
  },
  updateNodeField: (nodeId, fieldName, fieldValue) => {
    set((state) => withHistory(state, {
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
          : node,
      ),
    }));
  },
  updateNodeConfig: (nodeId, fieldName, fieldValue) => {
    set((state) => withHistory(state, {
      nodes: state.nodes.map((node) => node.id === nodeId
        ? { ...node, data: { ...node.data, config: { ...node.data.config, [fieldName]: fieldValue } } }
        : node),
    }));
  },
  deleteNodes: (nodeIds) => {
    const ids = new Set(nodeIds);
    if (!ids.size) return;
    set((state) => withHistory(state, {
      nodes: state.nodes.filter((node) => !ids.has(node.id)),
      edges: state.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
    }));
  },
  duplicateNodes: (nodeIds) => {
    const state = get();
    const ids = new Set(nodeIds);
    const copies = state.nodes.filter((node) => ids.has(node.id));
    const idMap = new Map<string, string>();
    const nodes = copies.map((node) => {
      const id = get().getNodeID(node.data.nodeType);
      idMap.set(node.id, id);
      return { ...node, id, position: { x: node.position.x + 48, y: node.position.y + 48 }, data: { ...node.data, id, label: `${node.data.label ?? node.data.nodeType} copy` } };
    });
    const edges = state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ ...edge, id: `edge-${crypto.randomUUID()}`, source: idMap.get(edge.source)!, target: idMap.get(edge.target)! }));
    if (nodes.length) set((current) => withHistory(current, { nodes: [...current.nodes, ...nodes], edges: [...current.edges, ...edges] }));
    return nodes.map((node) => node.id);
  },
  moveNodes: (nodeIds, delta) => {
    const ids = new Set(nodeIds);
    if (!ids.size) return;
    set((state) => withHistory(state, { nodes: state.nodes.map((node) => ids.has(node.id) ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node) }));
  },
  autoLayout: () => {
    set((state) => withHistory(state, { nodes: layoutWorkflowNodes(state.nodes, state.edges) }));
  },
  undo: () => {
    set((state) => {
      const previous = state.historyPast.at(-1);
      if (!previous) return state;
      return { ...previous, historyPast: state.historyPast.slice(0, -1), historyFuture: [snapshot(state), ...state.historyFuture].slice(0, 50) };
    });
  },
  redo: () => {
    set((state) => {
      const next = state.historyFuture[0];
      if (!next) return state;
      return { ...next, historyPast: [...state.historyPast, snapshot(state)].slice(-50), historyFuture: state.historyFuture.slice(1) };
    });
  },
}));
