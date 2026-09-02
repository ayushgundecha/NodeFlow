import type { NodeType } from "../../contracts/types";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowEdge, FlowNode } from "../../types/editor";

export type WorkflowTemplate = { description: string; id: string; name: string; nodes: FlowNode[]; edges: FlowEdge[]; outcome: string };

const buildTemplate = (id: string, name: string, description: string, outcome: string, specs: Array<{ label: string; type: NodeType }>): WorkflowTemplate => {
  const nodes: FlowNode[] = specs.map((spec, index) => {
    const nodeId = `${spec.type}-${index + 1}`;
    return { id: nodeId, type: "registryNode", position: { x: 80 + index * 260, y: 220 }, data: { id: nodeId, nodeType: spec.type, label: spec.label, config: getNodeDefinition(spec.type).createConfig(), status: "idle" } };
  });
  const edges: FlowEdge[] = nodes.slice(1).map((node, index) => {
    const source = nodes[index]!;
    return { id: `${id}-edge-${index + 1}`, source: source.id, sourceHandle: getNodeDefinition(source.data.nodeType as NodeType).ports.find((port) => port.direction === "output")?.id, target: node.id, targetHandle: getNodeDefinition(node.data.nodeType as NodeType).ports.find((port) => port.direction === "input")?.id };
  });
  return { id, name, description, outcome, nodes, edges };
};

export const workflowTemplates = [
  buildTemplate("incident-triage", "Incident Triage", "Validate an operational alert, analyze severity, and prepare an AI-assisted incident brief.", "A structured incident brief ready for human review.", [{ type: "manualInput", label: "Incident input" }, { type: "transform", label: "Validate payload" }, { type: "javascript", label: "Analyze incident" }, { type: "condition", label: "Severity branch" }, { type: "llm", label: "AI incident brief" }, { type: "output", label: "Publish result" }]),
  buildTemplate("github-release-digest", "GitHub Release Digest", "Fetch release data, normalize it, and draft a concise update for a release channel.", "A reviewable release digest; public HTTP and AI execution arrive with backend adapters.", [{ type: "manualInput", label: "Repository input" }, { type: "httpRequest", label: "Fetch releases" }, { type: "transform", label: "Normalize releases" }, { type: "llm", label: "Draft digest" }, { type: "output", label: "Release digest" }]),
  buildTemplate("data-quality-gate", "Data Quality Gate", "Validate an incoming dataset and route passing and failing results explicitly.", "A deterministic quality decision with inspectable branches.", [{ type: "manualInput", label: "Dataset input" }, { type: "transform", label: "Normalize schema" }, { type: "javascript", label: "Calculate quality" }, { type: "condition", label: "Quality gate" }, { type: "output", label: "Quality result" }]),
] as const;

export const defaultWorkflowTemplate = workflowTemplates[0];
