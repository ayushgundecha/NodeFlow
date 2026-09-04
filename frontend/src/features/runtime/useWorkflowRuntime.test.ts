import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorWorkspace } from "../editor/workspacePersistence";
import { runtimeWorkflowRevision, useWorkflowRuntime } from "./useWorkflowRuntime";

const workspace: EditorWorkspace = {
  description: "Test",
  edges: [],
  format: "nodeflow.workflow/2",
  id: "runtime-test",
  name: "Runtime test",
  nodes: [],
  savedAt: "2026-09-02T00:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("useWorkflowRuntime", () => {
  it("blocks invalid runs with backend issues and never opens the SSE request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: [{
        code: "required_input_missing",
        edgeId: null,
        field: "value",
        message: "Connect the required input before running.",
        nodeId: "output",
        severity: "error",
      }],
      executionOrder: [],
      valid: false,
      warnings: [],
    }), { headers: { "Content-Type": "application/json" }, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWorkflowRuntime(workspace));

    await act(async () => result.current.run());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.validationIssues[0]?.code).toBe("required_input_missing");
    expect(result.current.busy).toBe(false);
  });

  it("rejects duplicate run submissions while validation is active", async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWorkflowRuntime(workspace));

    act(() => { void result.current.run(); void result.current.run(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release?.(new Response(JSON.stringify({ errors: [], executionOrder: [], valid: false, warnings: [] }), { status: 200 }));
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it("does not cancel a run when React Flow adds visual-only node measurements", () => {
    const configured = {
      ...workspace,
      nodes: [{ id: "input-1", type: "registryNode", position: { x: 0, y: 0 }, data: { id: "input-1", nodeType: "manualInput", config: { inputKey: "payload", defaultValue: null } } }],
    };
    const measured = { ...configured, nodes: configured.nodes.map((node) => ({ ...node, width: 216, height: 108, selected: true })) };
    const moved = { ...configured, nodes: configured.nodes.map((node) => ({ ...node, position: { x: 480, y: 260 } })) };
    const reconfigured = { ...configured, nodes: configured.nodes.map((node) => ({ ...node, data: { ...node.data, config: { inputKey: "changed", defaultValue: null } } })) };

    expect(runtimeWorkflowRevision(measured)).toBe(runtimeWorkflowRevision(configured));
    expect(runtimeWorkflowRevision(moved)).toBe(runtimeWorkflowRevision(configured));
    expect(runtimeWorkflowRevision(reconfigured)).not.toBe(runtimeWorkflowRevision(configured));
  });
});
