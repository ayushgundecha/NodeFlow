import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../contracts/types";
import { detailsForNode, runTimings, safeJson, summarizeRun } from "./debuggerModel";

const events: RunEvent[] = [
  { type: "run.started", runId: "run-1", clientRunId: "client-1", sequence: 0, occurredAt: "2026-09-03T10:00:00.000Z" },
  { type: "node.queued", runId: "run-1", nodeId: "fetch", sequence: 1, occurredAt: "2026-09-03T10:00:00.001Z" },
  { type: "node.started", runId: "run-1", nodeId: "fetch", sequence: 2, occurredAt: "2026-09-03T10:00:00.005Z", input: { id: 42 } },
  { type: "node.log", runId: "run-1", nodeId: "fetch", sequence: 3, occurredAt: "2026-09-03T10:00:00.010Z", message: "request sent", stream: "system", truncated: false },
  { type: "node.completed", runId: "run-1", nodeId: "fetch", sequence: 4, occurredAt: "2026-09-03T10:00:00.025Z", output: { ok: true }, durationMs: 20 },
  { type: "run.completed", runId: "run-1", sequence: 5, occurredAt: "2026-09-03T10:00:00.030Z", outputs: { fetch: { ok: true } }, durationMs: 30 },
];

describe("debugger model", () => {
  it("derives exact node data without mutating the event trace", () => {
    expect(detailsForNode(events, "fetch")).toEqual({
      error: null,
      input: { id: 42 },
      logs: [{ message: "request sent", stream: "system", truncated: false }],
      output: { ok: true },
    });
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("summarizes terminal status and produces exact timing rows", () => {
    expect(summarizeRun(events)).toEqual({ completed: 1, durationMs: 30, failed: 0, queued: 1, skipped: 0, status: "completed" });
    expect(runTimings(events)).toEqual([{ durationMs: 20, nodeId: "fetch", offsetMs: 5, status: "completed" }]);
  });

  it("safely handles empty, large, and malformed values", () => {
    expect(safeJson(undefined)).toBeNull();
    expect(safeJson("abcdefgh", 4)).toEqual({ text: '"abc\n…', truncated: true });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(safeJson(circular)?.text).toBe("[Value could not be displayed safely]");
  });

  it("turns skipped nodes into clear diagnostics", () => {
    const skipped: RunEvent = { type: "node.skipped", runId: "run-2", nodeId: "notify", sequence: 0, occurredAt: "2026-09-03T10:00:00Z", reason: "Dependency failed" };
    expect(detailsForNode([skipped], "notify").error).toEqual({ code: "NODE_SKIPPED", message: "Dependency failed", retryable: false });
  });
});
