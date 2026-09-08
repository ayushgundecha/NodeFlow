import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunEvent, RunRequest } from "../../contracts/types";
import {
  SseFrameDecoder,
  initialRunEventState,
  parseRunEvent,
  reduceRunEvent,
  streamWorkflowRun,
} from "./runEventStream";

afterEach(() => vi.unstubAllGlobals());

const event = (sequence: number, type: RunEvent["type"] = "node.queued"): RunEvent => ({
  nodeId: "node-1",
  occurredAt: "2026-09-02T00:00:00Z",
  runId: "run-1",
  sequence,
  type: type as "node.queued",
});

describe("SseFrameDecoder", () => {
  it("reassembles arbitrary chunk boundaries and ignores heartbeats", () => {
    const decoder = new SseFrameDecoder();
    const frames = [
      ...decoder.push(': heart'),
      ...decoder.push('beat\n\nid: 0\nevent: run.started\ndata: {"type":"run.started",'),
      ...decoder.push('"runId":"run-1","sequence":0,"occurredAt":"now","clientRunId":"client"}\n\n'),
    ];

    expect(frames).toHaveLength(1);
    expect(parseRunEvent(frames[0]!).type).toBe("run.started");
  });

  it("rejects malformed event JSON and mismatched IDs", () => {
    expect(() => parseRunEvent({ data: "{", event: null, id: null })).toThrow("malformed JSON");
    expect(() => parseRunEvent({
      data: '{"type":"node.queued","runId":"run-1","sequence":1,"occurredAt":"now","nodeId":"n"}',
      event: "node.queued",
      id: "2",
    })).toThrow("did not match");
  });
});

describe("reduceRunEvent", () => {
  it("ignores duplicates and rejects gaps without mutating accepted history", () => {
    const started = {
      clientRunId: "client",
      occurredAt: "now",
      runId: "run-1",
      sequence: 0,
      type: "run.started",
    } satisfies RunEvent;
    const initial = initialRunEventState();
    const accepted = reduceRunEvent(initial, started);

    expect(reduceRunEvent(accepted, started)).toBe(accepted);
    const gapped = reduceRunEvent(accepted, event(2));
    expect(gapped.connection).toBe("failed");
    expect(gapped.events).toEqual([started]);
  });

  it("defends run ownership and ignores all events after terminal", () => {
    const started = reduceRunEvent(initialRunEventState(), {
      clientRunId: "client",
      occurredAt: "now",
      runId: "run-1",
      sequence: 0,
      type: "run.started",
    });
    const wrongRun = reduceRunEvent(started, { ...event(1), runId: "run-2" });
    expect(wrongRun.protocolError).toContain("Run ID");

    const terminal = reduceRunEvent(started, {
      durationMs: 1,
      occurredAt: "now",
      outputs: {},
      runId: "run-1",
      sequence: 1,
      type: "run.completed",
    });
    expect(terminal.connection).toBe("completed");
    expect(reduceRunEvent(terminal, event(2))).toBe(terminal);
  });
});

describe("streamWorkflowRun", () => {
  it("rejects malformed typed payloads before the debugger can consume them", () => {
    expect(() => parseRunEvent({ event: null, id: null, data: JSON.stringify({ ...event(1), type: 'node.failed', durationMs: 1, error: null }) })).toThrow(/payload/);
  });

  it("cancels the response reader when a malformed frame interrupts the run", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {bad}\n\n')); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const state = await streamWorkflowRun({} as RunRequest);
    expect(state.protocolError).toContain('malformed JSON');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("maps AbortController cancellation to an explicit client state", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));

    const state = await streamWorkflowRun({} as RunRequest, { signal: controller.signal });

    expect(state.connection).toBe("cancelled");
    expect(state.events).toEqual([]);
  });
});
