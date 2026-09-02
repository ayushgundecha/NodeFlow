import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "../../contracts/types";
import type { EditorWorkspace } from "../../features/editor/workspacePersistence";

export type EditableWorkflow = {
  id: string;
  name: string;
  nodes: readonly WorkflowNode[];
  edges: readonly WorkflowEdge[];
  viewport: WorkflowDefinition["viewport"];
};

/**
 * Build a fresh transport object from durable workflow fields only.
 * Selection, open panels, uploaded File objects, and run state are impossible
 * to include because this boundary does not accept editor or run stores.
 */
export const toExecutionWorkflow = (workflow: EditableWorkflow): WorkflowDefinition => ({
  schemaVersion: "1.0",
  id: workflow.id,
  name: workflow.name,
  nodes: workflow.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    config: { ...node.config },
  })) as WorkflowNode[],
  edges: workflow.edges.map((edge) => ({ ...edge })),
  viewport: workflow.viewport ? { ...workflow.viewport } : undefined,
});

export const editorWorkspaceToExecutionWorkflow = (
  workspace: EditorWorkspace,
): WorkflowDefinition => ({
  schemaVersion: "1.0",
  id: workspace.id,
  name: workspace.name,
  nodes: workspace.nodes.map((node) => ({
    config: { ...(node.data.config ?? {}) },
    id: node.id,
    label: node.data.label,
    position: { x: node.position.x, y: node.position.y },
    type: node.data.nodeType,
  })) as WorkflowNode[],
  edges: workspace.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? "",
    target: edge.target,
    targetHandle: edge.targetHandle ?? "",
  })),
  viewport: { x: 0, y: 0, zoom: 1 },
});
