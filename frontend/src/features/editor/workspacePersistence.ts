import { isNodeType } from "../../domain/nodes/registry";
import type { FlowEdge, FlowNode } from "../../types/editor";

export const EDITOR_WORKSPACE_STORAGE_KEY = "nodeflow.editor-workspace.v2";
export const EDITOR_WORKSPACE_FORMAT = "nodeflow.workflow/2";

export type EditorWorkspace = {
  description: string;
  edges: FlowEdge[];
  format: typeof EDITOR_WORKSPACE_FORMAT;
  id: string;
  name: string;
  nodes: FlowNode[];
  savedAt: string;
};

export type WorkspaceLoadResult =
  | { status: "empty" }
  | { status: "unavailable" }
  | { status: "loaded"; workspace: EditorWorkspace }
  | { status: "recovered"; reason: string };

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const validWorkspace = (value: unknown): value is EditorWorkspace => {
  if (!isRecord(value) || value.format !== EDITOR_WORKSPACE_FORMAT || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.description !== "string" || typeof value.savedAt !== "string" || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 25 || value.edges.length > 40) return false;
  const ids = new Set<string>();
  const nodesValid = value.nodes.every((node) => isRecord(node) && typeof node.id === "string" && !ids.has(node.id) && ids.add(node.id) && isRecord(node.position) && typeof node.position.x === "number" && Number.isFinite(node.position.x) && typeof node.position.y === "number" && Number.isFinite(node.position.y) && isRecord(node.data) && isNodeType(node.data.nodeType));
  return Boolean(nodesValid) && value.edges.every((edge) => isRecord(edge) && typeof edge.id === "string" && typeof edge.source === "string" && typeof edge.target === "string" && ids.has(edge.source) && ids.has(edge.target));
};

const editableNodes = (nodes: FlowNode[]): FlowNode[] => nodes.map((node) => ({ ...node, data: { ...node.data, status: "idle" } }));

export function createEditorWorkspace(input: Omit<EditorWorkspace, "format" | "savedAt">, now = new Date()): EditorWorkspace {
  return { ...input, nodes: editableNodes(input.nodes), format: EDITOR_WORKSPACE_FORMAT, savedAt: now.toISOString() };
}

export function serializeEditorWorkspace(workspace: EditorWorkspace): string { return JSON.stringify(workspace, null, 2); }

export function parseEditorWorkspace(raw: string): EditorWorkspace {
  if (raw.length > 512 * 1024) throw new Error("Workflow files must be smaller than 512 KB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("This file is not valid JSON. Choose an exported NodeFlow workflow."); }
  if (!validWorkspace(parsed)) throw new Error(`Unsupported or malformed workflow. Expected format ${EDITOR_WORKSPACE_FORMAT}.`);
  return parsed;
}

export function loadEditorWorkspace(storage?: StorageLike): WorkspaceLoadResult {
  let raw: string | null;
  try { storage ??= localStorage; raw = storage.getItem(EDITOR_WORKSPACE_STORAGE_KEY); }
  catch { return { status: "unavailable" }; }
  if (!raw) return { status: "empty" };
  try { return { status: "loaded", workspace: parseEditorWorkspace(raw) }; }
  catch (error) {
    const reason = error instanceof Error ? error.message : "The saved workflow could not be read.";
    try { storage.setItem(`${EDITOR_WORKSPACE_STORAGE_KEY}.corrupt.${Date.now()}`, raw); storage.removeItem(EDITOR_WORKSPACE_STORAGE_KEY); } catch { /* Recovery remains usable when storage is unavailable. */ }
    return { status: "recovered", reason };
  }
}

export function saveEditorWorkspace(workspace: EditorWorkspace, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? localStorage).setItem(EDITOR_WORKSPACE_STORAGE_KEY, serializeEditorWorkspace(workspace)); return true; } catch { return false; }
}
