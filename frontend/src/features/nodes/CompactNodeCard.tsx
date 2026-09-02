import { CheckCircle2, Circle, CircleDot, LoaderCircle, XCircle } from "lucide-react";
import type { PortDefinition } from "../../contracts/types";
import { getNodeDefinition } from "../../domain/nodes/registry";
import type { FlowNode } from "../../types/editor";
import { nodeCategoryLabels, nodeIcons } from "./nodePresentation";

export type ActivePort = { dataType: PortDefinition["dataType"]; direction: PortDefinition["direction"]; nodeId: string; portId: string } | null;

const statusLabels = {
  failed: "Failed",
  idle: "Idle",
  paused: "Paused",
  queued: "Queued",
  running: "Running",
  skipped: "Skipped",
  succeeded: "Succeeded",
} as const;

const statusIcons: Record<NonNullable<FlowNode["data"]["status"]>, typeof Circle> = {
  failed: XCircle,
  idle: Circle,
  paused: CircleDot,
  queued: CircleDot,
  running: LoaderCircle,
  skipped: CircleDot,
  succeeded: CheckCircle2,
};

function compatibility(activePort: ActivePort, nodeId: string, port: PortDefinition) {
  if (!activePort) return "neutral";
  if (activePort.nodeId === nodeId && activePort.portId === port.id) return "source";
  if (activePort.direction === port.direction || activePort.nodeId === nodeId) return "incompatible";
  return activePort.dataType === "any" || port.dataType === "any" || activePort.dataType === port.dataType ? "compatible" : "incompatible";
}

interface CompactNodeCardProps {
  activePort: ActivePort;
  node: FlowNode;
  onPortChange: (port: ActivePort) => void;
  onSelect: (nodeId: string, additive: boolean) => void;
  selected: boolean;
}

export function CompactNodeCard({ activePort, node, onPortChange, onSelect, selected }: CompactNodeCardProps) {
  const definition = getNodeDefinition(node.data.nodeType as Parameters<typeof getNodeDefinition>[0]);
  const Icon = nodeIcons[definition.icon];
  const status = node.data.status ?? "idle";
  const StatusIcon = statusIcons[status];
  const inputs = definition.ports.filter((port) => port.direction === "input");
  const outputs = definition.ports.filter((port) => port.direction === "output");

  const renderPort = (port: PortDefinition) => {
    const mode = compatibility(activePort, node.id, port);
    const feedback = mode === "compatible" ? "compatible" : mode === "incompatible" ? "not compatible" : mode === "source" ? "selected" : "available";
    return (
      <button
        aria-label={`${port.direction} port ${port.label}, ${port.dataType}, ${feedback}`}
        className={`nf-typed-port nf-typed-port--${port.direction} nf-typed-port--${port.dataType} nf-typed-port--${mode}`}
        key={`${port.direction}.${port.id}`}
        onClick={() => onPortChange(mode === "source" ? null : { dataType: port.dataType, direction: port.direction, nodeId: node.id, portId: port.id })}
        title={`${port.label} · ${port.dataType}`}
        type="button"
      ><i aria-hidden="true" /><span>{port.label}</span><small>{port.dataType}</small></button>
    );
  };

  return (
    <article className={`nf-registry-node nf-registry-node--${status}${selected ? " nf-registry-node--selected" : ""}`}>
      <button aria-label={`Select ${node.data.label ?? definition.label} node`} className="nf-registry-node__select" onClick={(event) => onSelect(node.id, event.shiftKey)} type="button">
        <span className={`nf-registry-node__icon nf-node-tone--${definition.category}`}><Icon aria-hidden="true" size={17} /></span>
        <span><small>{nodeCategoryLabels[definition.category]}</small><strong>{node.data.label ?? definition.label}</strong></span>
        <span className={`nf-registry-node__status nf-registry-node__status--${status}`}><StatusIcon aria-hidden="true" size={12} />{selected ? "Selected" : statusLabels[status]}</span>
      </button>
      <div className="nf-registry-node__ports">
        <div>{inputs.map(renderPort)}</div>
        <div>{outputs.map(renderPort)}</div>
      </div>
    </article>
  );
}
