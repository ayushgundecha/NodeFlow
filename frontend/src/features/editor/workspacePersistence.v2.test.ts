import { describe, expect, it } from "vitest";
import { defaultWorkflowTemplate } from "./workflowTemplates";
import { createEditorWorkspace, EDITOR_WORKSPACE_STORAGE_KEY, loadEditorWorkspace, parseEditorWorkspace, saveEditorWorkspace, serializeEditorWorkspace } from "./workspacePersistence";

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
};

describe("editor workspace persistence v2", () => {
  it("keeps the editor usable when browser storage throws", () => {
    const storage = createStorage();
    storage.getItem = () => { throw new Error("Storage blocked"); };
    storage.setItem = () => { throw new Error("Storage blocked"); };
    expect(loadEditorWorkspace(storage)).toEqual({ status: "unavailable" });
    expect(saveEditorWorkspace(createEditorWorkspace(defaultWorkflowTemplate), storage)).toBe(false);
  });

  it("round-trips a validated versioned workspace", () => {
    const storage = createStorage();
    const workspace = createEditorWorkspace({ ...defaultWorkflowTemplate }, new Date("2026-09-02T00:00:00Z"));
    saveEditorWorkspace(workspace, storage);
    expect(loadEditorWorkspace(storage)).toEqual({ status: "loaded", workspace });
    expect(parseEditorWorkspace(serializeEditorWorkspace(workspace))).toEqual(workspace);
  });

  it("removes transient execution status before saving", () => {
    const nodes = defaultWorkflowTemplate.nodes.map((node, index) => ({ ...node, data: { ...node.data, status: index ? "failed" as const : "running" as const } }));
    const workspace = createEditorWorkspace({ ...defaultWorkflowTemplate, nodes });
    expect(workspace.nodes.every((node) => node.data.status === "idle")).toBe(true);
  });

  it("backs up corrupt local data and recovers safely", () => {
    const storage = createStorage(); storage.setItem(EDITOR_WORKSPACE_STORAGE_KEY, "not-json");
    expect(loadEditorWorkspace(storage).status).toBe("recovered");
    expect(storage.getItem(EDITOR_WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(Array.from({ length: storage.length }, (_, index) => storage.key(index)).some((key) => key?.includes(".corrupt."))).toBe(true);
  });

  it("rejects unsupported versions and dangling edges", () => {
    expect(() => parseEditorWorkspace('{"format":"nodeflow.workflow/99"}')).toThrow(/Expected format/);
    const workspace = createEditorWorkspace({ ...defaultWorkflowTemplate, edges: [{ id: "bad", source: "missing", target: defaultWorkflowTemplate.nodes[0]!.id }] });
    expect(() => parseEditorWorkspace(serializeEditorWorkspace(workspace))).toThrow(/malformed/);
  });
});
