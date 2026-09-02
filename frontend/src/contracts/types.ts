import type { components } from "./generated/api";

export type WorkflowDefinition = components["schemas"]["WorkflowDefinition"];
export type WorkflowNode = NonNullable<WorkflowDefinition["nodes"]>[number];
export type WorkflowEdge = components["schemas"]["WorkflowEdge"];
export type PortDefinition = components["schemas"]["PortDefinition"];
export type ValidationResult = components["schemas"]["ValidationResult"];
export type RunRequest = components["schemas"]["RunRequest"];

export type RunEvent =
  | components["schemas"]["RunStartedEvent"]
  | components["schemas"]["NodeQueuedEvent"]
  | components["schemas"]["NodeStartedEvent"]
  | components["schemas"]["NodeLogEvent"]
  | components["schemas"]["NodeCompletedEvent"]
  | components["schemas"]["NodeFailedEvent"]
  | components["schemas"]["NodeSkippedEvent"]
  | components["schemas"]["RunCompletedEvent"]
  | components["schemas"]["RunFailedEvent"];

export type NodeType = WorkflowNode["type"];
