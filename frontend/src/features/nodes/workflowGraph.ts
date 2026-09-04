import type { Connection } from "reactflow";
import type { NodeType, PortDefinition } from "../../contracts/types";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowEdge, FlowNode } from "../../types/editor";

export const NODEFLOW_DRAG_TYPE = "application/nodeflow";

export function workflowNodePosition(index: number) {
  return { x: 72 + index * 260, y: 220 };
}

export function layoutWorkflowNodes(nodes: readonly FlowNode[], edges: readonly FlowEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  });

  const levels = new Map<string, number>();
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  queue.forEach((id) => levels.set(id, 0));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const source = queue[cursor]!;
    const nextLevel = (levels.get(source) ?? 0) + 1;
    outgoing.get(source)?.forEach((target) => {
      levels.set(target, Math.max(levels.get(target) ?? 0, nextLevel));
      const remaining = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    });
  }

  let fallbackLevel = Math.max(0, ...levels.values()) + 1;
  nodes.forEach((node) => {
    if (!levels.has(node.id)) levels.set(node.id, fallbackLevel++);
  });
  const levelGroups = new Map<number, string[]>();
  nodes.forEach((node) => {
    const level = levels.get(node.id)!;
    levelGroups.set(level, [...(levelGroups.get(level) ?? []), node.id]);
  });

  return nodes.map((node) => {
    const level = levels.get(node.id)!;
    const siblings = levelGroups.get(level)!;
    const slot = siblings.indexOf(node.id);
    return {
      ...node,
      position: {
        x: 72 + level * 260,
        y: 220 + (slot - (siblings.length - 1) / 2) * 180,
      },
    };
  });
}

export function createLibraryNode(type: NodeType, id: string, position: { x: number; y: number }): FlowNode {
  const definition = getNodeDefinition(type);
  return {
    id,
    type: "registryNode",
    position,
    data: { id, nodeType: type, label: definition.label, config: definition.createConfig(), status: "idle" },
  };
}

function port(node: FlowNode, id: string | null | undefined, direction: PortDefinition["direction"]) {
  if (!id) return undefined;
  return getNodeDefinition(node.data.nodeType as NodeType).ports.find((candidate) => candidate.id === id && candidate.direction === direction);
}

export function canConnectNodes(connection: Connection, nodes: readonly FlowNode[], edges: readonly FlowEdge[]) {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle || connection.source === connection.target) return false;
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) return false;
  const sourcePort = port(source, connection.sourceHandle, "output");
  const targetPort = port(target, connection.targetHandle, "input");
  if (!sourcePort || !targetPort) return false;
  if (sourcePort.dataType !== "any" && targetPort.dataType !== "any" && sourcePort.dataType !== targetPort.dataType) return false;
  if (!targetPort.multiple && edges.some((edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle)) return false;
  return !edges.some((edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle && edge.target === connection.target && edge.targetHandle === connection.targetHandle);
}
