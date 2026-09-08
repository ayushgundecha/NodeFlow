import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../contracts/types";
import { createEditorWorkspace } from "../editor/workspacePersistence";
import { isStoredTrace, compareRuns, makeStoredTrace, replayEventsThrough, traceCompatibility, workflowSignature } from "./runHistory";

const workspace = createEditorWorkspace({
  description: "Test",
  edges: [],
  id: "workflow-1",
  name: "Test workflow",
  nodes: [{ id: "input", type: "default", position: { x: 0, y: 0 }, data: { id: "input", nodeType: "manualInput", label: "Input", config: {} } }],
}, new Date("2026-09-03T00:00:00Z"));

const completedEvents = (runId: string, durationMs: number, output: unknown): RunEvent[] => [
  { type: "run.started", runId, clientRunId: `client-${runId}`, sequence: 0, occurredAt: "2026-09-03T10:00:00.000Z" },
  { type: "node.queued", runId, nodeId: "input", sequence: 1, occurredAt: "2026-09-03T10:00:00.001Z" },
  { type: "node.started", runId, nodeId: "input", sequence: 2, occurredAt: "2026-09-03T10:00:00.002Z", input: null },
  { type: "node.completed", runId, nodeId: "input", sequence: 3, occurredAt: "2026-09-03T10:00:00.010Z", durationMs, output },
  { type: "run.completed", runId, sequence: 4, occurredAt: "2026-09-03T10:00:00.011Z", durationMs: durationMs + 1, outputs: { input: output } },
];

describe("local run history", () => {
  it("rejects damaged records and mixed run ownership before replay", () => {
    const trace = makeStoredTrace(completedEvents("run-1", 8, true), workspace)!;
    expect(isStoredTrace(trace)).toBe(true);
    expect(isStoredTrace(null)).toBe(false);
    expect(isStoredTrace({ ...trace, events: [null] })).toBe(false);
    expect(isStoredTrace({ ...trace, runId: "other" })).toBe(false);
    expect(isStoredTrace({ ...trace, completedAt: {} })).toBe(false);
  });
  it("stores terminal traces with a stable workflow identity", () => {
    const trace = makeStoredTrace(completedEvents("run-1", 8, { ok: true }), workspace);
    expect(trace).toMatchObject({ runId: "run-1", workflowId: "workflow-1", workflowSignature: workflowSignature(workspace) });
    expect(traceCompatibility(trace!, workspace)).toBeNull();
  });

  it("does not persist partial runs and labels changed workflows incompatible", () => {
    expect(makeStoredTrace(completedEvents("run-1", 8, true).slice(0, -1), workspace)).toBeNull();
    const trace = makeStoredTrace(completedEvents("run-1", 8, true), workspace)!;
    const changed = { ...workspace, id: "workflow-2" };
    expect(traceCompatibility(trace, changed)).toBe("Different workflow");
  });

  it("replays immutable prefixes and compares status, duration, and output", () => {
    const before = makeStoredTrace(completedEvents("run-1", 8, { value: 1 }), workspace)!;
    const after = makeStoredTrace(completedEvents("run-2", 13, { value: 2 }), workspace)!;
    expect(replayEventsThrough(after.events, 2).map((event) => event.sequence)).toEqual([0, 1, 2]);
    expect(compareRuns(before, after)).toEqual([{
      durationDeltaMs: 5,
      nodeId: "input",
      outputChanged: true,
      presence: "both",
      statusAfter: "completed",
      statusBefore: "completed",
    }]);
  });

  it("reports nodes added between revisions of the same workflow", () => {
    const before = makeStoredTrace(completedEvents("run-1", 8, true), workspace)!;
    const afterEvents: RunEvent[] = [
      ...completedEvents("run-2", 8, true).slice(0, -1),
      { type: "node.queued", runId: "run-2", nodeId: "new-node", sequence: 4, occurredAt: "2026-09-03T10:00:00.011Z" },
      { type: "node.started", runId: "run-2", nodeId: "new-node", sequence: 5, occurredAt: "2026-09-03T10:00:00.012Z", input: true },
      { type: "node.completed", runId: "run-2", nodeId: "new-node", sequence: 6, occurredAt: "2026-09-03T10:00:00.014Z", durationMs: 2, output: true },
      { type: "run.completed", runId: "run-2", sequence: 7, occurredAt: "2026-09-03T10:00:00.015Z", durationMs: 15, outputs: { result: true } },
    ];
    const after = { ...makeStoredTrace(afterEvents, workspace)!, workflowSignature: "revised-structure" };
    expect(compareRuns(before, after).find((row) => row.nodeId === "new-node")).toMatchObject({ presence: "added", statusBefore: null, statusAfter: "completed" });
  });
});
