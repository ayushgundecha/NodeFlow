import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorWorkspace } from "../editor/workspacePersistence";
import { useWorkflowRuntime } from "./useWorkflowRuntime";

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
});
