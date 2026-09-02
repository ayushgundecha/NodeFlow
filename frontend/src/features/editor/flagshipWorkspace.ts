import type { FlowEdge, FlowNode } from "../../types/editor";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { NodeType } from "../../contracts/types";

const specs: Array<{ id: string; label: string; type: NodeType }> = [
  { id: "manualInput-1", label: "Incident input", type: "manualInput" },
  { id: "transform-1", label: "Validate payload", type: "transform" },
  { id: "javascript-1", label: "Analyze incident", type: "javascript" },
  { id: "condition-1", label: "Severity branch", type: "condition" },
  { id: "llm-1", label: "AI incident brief", type: "llm" },
  { id: "output-1", label: "Publish result", type: "output" },
];

export const flagshipNodes: FlowNode[] = specs.map(({ id, label, type }, index) => ({
  id,
  type: "registryNode",
  position: { x: 80 + index * 260, y: 220 },
  data: { id, nodeType: type, label, config: getNodeDefinition(type).createConfig(), status: "idle" },
}));

export const flagshipEdges: FlowEdge[] = flagshipNodes.slice(1).map((node, index) => ({
  id: `edge-${index + 1}`,
  source: flagshipNodes[index]!.id,
  sourceHandle: getNodeDefinition(specs[index]!.type).ports.find((port) => port.direction === "output")?.id,
  target: node.id,
  targetHandle: getNodeDefinition(specs[index + 1]!.type).ports.find((port) => port.direction === "input")?.id,
}));
