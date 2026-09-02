import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../contracts/types";
import { initialRunState, reduceRunEvent, replayRunEvents } from "./runReducer";

const events: RunEvent[] = [
  {
    type: "run.started",
    runId: "run-1",
    clientRunId: "client-1",
    sequence: 0,
    occurredAt: "2026-09-02T00:00:00Z",
  },
  {
    type: "node.queued",
    runId: "run-1",
    nodeId: "input.payload",
    sequence: 1,
    occurredAt: "2026-09-02T00:00:00Z",
  },
  {
    type: "node.completed",
    runId: "run-1",
    nodeId: "input.payload",
    sequence: 2,
    occurredAt: "2026-09-02T00:00:00Z",
    output: { name: "Ada" },
    durationMs: 2,
  },
  {
    type: "run.completed",
    runId: "run-1",
    sequence: 3,
    occurredAt: "2026-09-02T00:00:00Z",
    outputs: { result: "Hello, Ada!" },
    durationMs: 4,
  },
];

describe("run event reducer", () => {
  it("replays the same immutable state deterministically", () => {
    const first = replayRunEvents(events);
    const second = replayRunEvents(events);

    expect(first).toEqual(second);
    expect(first.status).toBe("completed");
    expect(first.nodes["input.payload"]?.status).toBe("completed");
    expect(first.outputs).toEqual({ result: "Hello, Ada!" });
    expect(initialRunState).toEqual({
      runId: null,
      status: "idle",
      events: [],
      nodes: {},
      outputs: {},
      error: null,
    });
  });

  it("rejects missing or cross-run events", () => {
    expect(() => reduceRunEvent(initialRunState, { ...events[0]!, sequence: 2 })).toThrow(
      "Expected run event sequence 0",
    );
    const started = reduceRunEvent(initialRunState, events[0]!);
    expect(() => reduceRunEvent(started, { ...events[1]!, runId: "run-2" })).toThrow(
      "different run",
    );
  });
});
