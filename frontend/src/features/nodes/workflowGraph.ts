import type { Connection } from "reactflow";
import type { NodeType, PortDefinition } from "../../contracts/types";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowEdge, FlowNode } from "../../types/editor";

export const NODEFLOW_DRAG_TYPE = "application/nodeflow";

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
