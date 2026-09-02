import type { RunEvent } from "../../contracts/types";

export type RunNodeState = {
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  input?: unknown;
  output?: unknown;
  logs: string[];
  durationMs?: number;
  error?: string;
};

export type RunState = {
  runId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  events: readonly RunEvent[];
  nodes: Readonly<Record<string, RunNodeState>>;
  outputs: Readonly<Record<string, unknown>>;
  error: string | null;
};

export const initialRunState: RunState = {
  runId: null,
  status: "idle",
  events: [],
  nodes: {},
  outputs: {},
  error: null,
};

export const reduceRunEvent = (state: RunState, event: RunEvent): RunState => {
  if (event.sequence !== state.events.length) {
    throw new Error(`Expected run event sequence ${state.events.length}, received ${event.sequence}.`);
  }
  if (state.runId !== null && event.runId !== state.runId) {
    throw new Error(`Run event ${event.sequence} belongs to a different run.`);
  }

  const events = [...state.events, event];
  const runId = state.runId ?? event.runId;

  switch (event.type) {
    case "run.started":
      return { ...state, runId, status: "running", events, error: null };
    case "run.completed":
      return { ...state, runId, status: "completed", events, outputs: event.outputs ?? {} };
    case "run.failed":
      return { ...state, runId, status: "failed", events, error: event.error.message };
    default: {
      const previous = state.nodes[event.nodeId] ?? { status: "queued" as const, logs: [] };
      let node: RunNodeState;
      switch (event.type) {
        case "node.queued":
          node = { ...previous, status: "queued" };
          break;
        case "node.started":
          node = { ...previous, status: "running", input: event.input };
          break;
        case "node.log":
          node = { ...previous, logs: [...previous.logs, event.message] };
          break;
        case "node.completed":
          node = { ...previous, status: "completed", output: event.output, durationMs: event.durationMs };
          break;
        case "node.failed":
          node = { ...previous, status: "failed", error: event.error.message, durationMs: event.durationMs };
          break;
        case "node.skipped":
          node = { ...previous, status: "skipped", error: event.reason };
          break;
      }
      return { ...state, runId, events, nodes: { ...state.nodes, [event.nodeId]: node } };
    }
  }
};

export const replayRunEvents = (events: readonly RunEvent[]): RunState =>
  events.reduce(reduceRunEvent, initialRunState);
