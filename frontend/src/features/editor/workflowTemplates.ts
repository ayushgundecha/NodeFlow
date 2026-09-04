import type { NodeType } from "../../contracts/types";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowEdge, FlowNode } from "../../types/editor";

export type WorkflowTemplate = { description: string; edges: FlowEdge[]; id: string; name: string; nodes: FlowNode[]; outcome: string };
type NodeSpec = { config?: Record<string, unknown>; label: string; type: NodeType };
type EdgeSpec = { source: number; sourceHandle?: string; target: number; targetHandle?: string };

const portId = (type: NodeType, direction: "input" | "output") => getNodeDefinition(type).ports.find((port) => port.direction === direction)?.id;

const buildTemplate = (id: string, name: string, description: string, outcome: string, specs: NodeSpec[], edgeSpecs: EdgeSpec[] = specs.slice(1).map((_, index) => ({ source: index, target: index + 1 }))): WorkflowTemplate => {
  const nodes: FlowNode[] = specs.map((spec, index) => {
    const nodeId = `${spec.type}-${index + 1}`;
    return { id: nodeId, type: "registryNode", position: { x: 80 + index * 260, y: 220 }, data: { id: nodeId, nodeType: spec.type, label: spec.label, config: { ...getNodeDefinition(spec.type).createConfig(), ...spec.config }, status: "idle" } };
  });
  const edges: FlowEdge[] = edgeSpecs.map((edge, index) => {
    const source = nodes[edge.source]!;
    const target = nodes[edge.target]!;
    return { id: `${id}-edge-${index + 1}`, source: source.id, sourceHandle: edge.sourceHandle ?? portId(source.data.nodeType as NodeType, "output"), target: target.id, targetHandle: edge.targetHandle ?? portId(target.data.nodeType as NodeType, "input") };
  });
  return { id, name, description, outcome, nodes, edges };
};

const incidentTriage = buildTemplate(
  "incident-triage", "Incident Triage",
  "Score a sample operational alert, route severe incidents, and prepare a short AI brief for human review.",
  "A structured incident brief with the computed severity and full execution trace.",
  [
    { type: "manualInput", label: "Incident input", config: { inputKey: "incident", defaultValue: { service: "checkout-api", errorRate: 0.18, latencyMs: 1420, region: "ap-south-1" } } },
    { type: "transform", label: "Validate payload", config: { expression: "@" } },
    { type: "javascript", label: "Compute severity", config: { source: "const score = input.errorRate * 100 + input.latencyMs / 100;\nreturn { ...input, score: Math.round(score), severity: score >= 25 ? 'high' : 'normal' };" } },
    { type: "condition", label: "High severity?", config: { rule: { path: "severity", operator: "eq", value: "high" } } },
    { type: "llm", label: "Draft incident brief", config: { systemPrompt: "You write concise operational incident briefs. State only facts from the supplied JSON and return plain text under 120 words.", promptTemplate: "Draft a human-reviewable incident brief from this context:\n{{ input }}" } },
    { type: "output", label: "Publish result", config: { label: "incidentBrief", format: "json" } },
  ],
  [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 2, target: 3 }, { source: 3, sourceHandle: "true", target: 4, targetHandle: "context" }, { source: 4, sourceHandle: "response", target: 5, targetHandle: "value" }],
);

const githubReleaseDigest = buildTemplate(
  "github-release-digest", "GitHub Release Digest",
  "Fetch the latest public releases for a sample repository and turn them into a bounded reviewable digest.",
  "A concise digest generated from a real public GitHub API response.",
  [
    { type: "manualInput", label: "Repository input", config: { inputKey: "repository", defaultValue: { owner: "vercel", repo: "next.js" } } },
    { type: "httpRequest", label: "Fetch public releases", config: { method: "GET", url: "https://api.github.com/repos/{{ input.owner }}/{{ input.repo }}/releases?per_page=3", headers: { Accept: "application/vnd.github+json" }, body: null } },
    { type: "transform", label: "Select release data", config: { expression: '{"latest":{"name":"@.body.0.name","tag":"@.body.0.tag_name","url":"@.body.0.html_url"},"previous":{"name":"@.body.1.name","tag":"@.body.1.tag_name","url":"@.body.1.html_url"},"third":{"name":"@.body.2.name","tag":"@.body.2.tag_name","url":"@.body.2.html_url"}}' } },
    { type: "llm", label: "Draft release digest", config: { systemPrompt: "Summarize only the supplied public release JSON. Use at most five bullets and do not invent changes.", promptTemplate: "Create a short release digest from these releases:\n{{ input }}" } },
    { type: "output", label: "Release digest", config: { label: "releaseDigest", format: "json" } },
  ],
  [{ source: 0, sourceHandle: "value", target: 1, targetHandle: "body" }, { source: 1, sourceHandle: "response", target: 2, targetHandle: "input" }, { source: 2, sourceHandle: "output", target: 3, targetHandle: "context" }, { source: 3, sourceHandle: "response", target: 4, targetHandle: "value" }],
);

const dataQualityGate = buildTemplate(
  "data-quality-gate", "Data Quality Gate",
  "Evaluate sample dataset metrics and show exactly which deterministic quality branch ran.",
  "One explicit valid or needs-review result, with the unused branch clearly skipped.",
  [
    { type: "manualInput", label: "Dataset metrics", config: { inputKey: "dataset", defaultValue: { qualityScore: 0.96, records: 128, invalidRecords: 2 } } },
    { type: "transform", label: "Normalize metrics", config: { expression: "@" } },
    { type: "condition", label: "Quality score ≥ 0.9?", config: { rule: { path: "qualityScore", operator: "gte", value: 0.9 } } },
    { type: "transform", label: "Valid result", config: { expression: '{"status":"valid","records":"@.records","qualityScore":"@.qualityScore"}' } },
    { type: "transform", label: "Needs review result", config: { expression: '{"status":"needs-review","invalidRecords":"@.invalidRecords","qualityScore":"@.qualityScore"}' } },
    { type: "merge", label: "Collect active result", config: { strategy: "array" } },
    { type: "output", label: "Quality decision", config: { label: "qualityDecision", format: "json" } },
  ],
  [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 2, sourceHandle: "true", target: 3 }, { source: 2, sourceHandle: "false", target: 4 }, { source: 3, target: 5, targetHandle: "items" }, { source: 4, target: 5, targetHandle: "items" }, { source: 5, target: 6 }],
);

export const workflowTemplates = [incidentTriage, githubReleaseDigest, dataQualityGate] as const;
export const defaultWorkflowTemplate = workflowTemplates[0];
