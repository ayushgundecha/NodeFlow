import { CheckCircle2, Circle, CircleDot, Eye, LoaderCircle, Play, ShieldCheck, XCircle } from "lucide-react";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowNode } from "../../types/editor";
import { nodeCategoryLabels, nodeIcons } from "../nodes/nodePresentation";
import type { RuntimeNodeStatus } from "../runtime/useWorkflowRuntime";

const statusIcons = { idle: Circle, queued: CircleDot, running: LoaderCircle, succeeded: CheckCircle2, failed: XCircle, paused: CircleDot, skipped: CircleDot } as const;
const statusLabels = { idle: "Ready", queued: "Queued", running: "Running", succeeded: "Succeeded", failed: "Failed", paused: "Paused", skipped: "Skipped" } as const;

export function ResponsiveReadOnlyViewer({ description, name, nodeStatuses = {}, nodes }: { description: string; name: string; nodeStatuses?: Record<string, RuntimeNodeStatus>; nodes: FlowNode[] }) {
  return <main className="nf-readonly-viewer" id="responsive-workflow-viewer" tabIndex={-1}>
    <section className="nf-readonly-hero"><span className="nf-overline">Visual workflow debugger</span><h1>{name}</h1><p>{description}</p><div><span><Eye aria-hidden="true" size={15} />Read-only viewer</span><span><ShieldCheck aria-hidden="true" size={15} />Browser-local draft</span></div></section>
    <section aria-labelledby="workflow-map-title" className="nf-readonly-map"><header><div><small>Workflow map</small><h2 id="workflow-map-title">Understand the graph at a glance</h2></div><span>{nodes.length} nodes</span></header>
      {nodes.length ? <ol>{nodes.map((node, index) => {
        const definition = getNodeDefinition(node.data.nodeType as Parameters<typeof getNodeDefinition>[0]);
        const Icon = nodeIcons[definition.icon];
        const status = nodeStatuses[node.id] ?? node.data.status ?? "idle";
        const StatusIcon = statusIcons[status];
        return <li key={node.id}><span className="nf-readonly-index">{String(index + 1).padStart(2, "0")}</span><span className={`nf-readonly-node-icon nf-node-tone--${definition.category}`}><Icon aria-hidden="true" size={17} /></span><span><small>{nodeCategoryLabels[definition.category]}</small><strong>{node.data.label ?? definition.label}</strong><em>{definition.description}</em></span><span className={`nf-readonly-status nf-readonly-status--${status}`}><StatusIcon aria-hidden="true" size={12} />{statusLabels[status]}</span></li>;
      })}</ol> : <div className="nf-readonly-empty"><Circle aria-hidden="true" size={20} /><strong>No nodes in this draft</strong><span>Open NodeFlow on a larger screen to build your workflow.</span></div>}
    </section>
    <section className="nf-readonly-run"><span><Play aria-hidden="true" size={18} /></span><div><small>Real execution trace</small><strong>Run from the primary action above</strong><p>Timing, logs, outputs, failures, and skipped branches appear only from real backend events—never simulated.</p></div></section>
    <p className="nf-readonly-note">Editing tools are intentionally available on wider screens. This compact view keeps the graph and run story clear without squeezing a desktop canvas onto your device.</p>
  </main>;
}
