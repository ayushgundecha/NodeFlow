import type { RunEvent } from "../../contracts/types";

export type NodeRunDetails = {
  error: { code: string; message: string; retryable: boolean } | null;
  input: unknown;
  logs: Array<{ message: string; stream: "stderr" | "stdout" | "system"; truncated: boolean }>;
  output: unknown;
};

export type RunTiming = {
  durationMs: number;
  nodeId: string;
  offsetMs: number;
  status: "completed" | "failed";
};

export type RunSummary = {
  completed: number;
  durationMs: number | null;
  failed: number;
  queued: number;
  skipped: number;
  status: "completed" | "failed" | "idle" | "running";
};

export const eventNodeId = (event: RunEvent): string | null =>
  "nodeId" in event ? event.nodeId : null;

export const eventLabel = (event: RunEvent) => {
  switch (event.type) {
    case "run.started": return "Run started";
    case "run.completed": return "Run completed";
    case "run.failed": return "Run failed";
    case "node.queued": return "Queued";
    case "node.started": return "Started";
    case "node.log": return `${event.stream} log`;
    case "node.completed": return "Completed";
    case "node.failed": return "Failed";
    case "node.skipped": return "Skipped";
  }
};

export const eventDescription = (event: RunEvent) => {
  switch (event.type) {
    case "node.log": return event.truncated ? `${event.message} (truncated)` : event.message;
    case "node.failed":
    case "run.failed": return event.error.message;
    case "node.skipped": return event.reason;
    case "node.completed": return `${event.durationMs} ms`;
    case "run.completed": return `${event.durationMs} ms total`;
    default: return eventLabel(event);
  }
};

export const detailsForNode = (events: readonly RunEvent[], nodeId: string | null): NodeRunDetails => {
  const details: NodeRunDetails = { error: null, input: undefined, logs: [], output: undefined };
  if (!nodeId) return details;
  for (const event of events) {
    if (!("nodeId" in event) || event.nodeId !== nodeId) continue;
    if (event.type === "node.started") details.input = event.input;
    else if (event.type === "node.completed") details.output = event.output;
    else if (event.type === "node.log") {
      details.logs.push({ message: event.message, stream: event.stream, truncated: event.truncated });
    } else if (event.type === "node.failed") details.error = event.error;
    else if (event.type === "node.skipped") {
      details.error = { code: "NODE_SKIPPED", message: event.reason, retryable: false };
    }
  }
  return details;
};

export const summarizeRun = (events: readonly RunEvent[]): RunSummary => {
  const terminal = events.at(-1);
  return {
    completed: events.filter((event) => event.type === "node.completed").length,
    durationMs: terminal?.type === "run.completed" || terminal?.type === "run.failed"
      ? terminal.durationMs
      : null,
    failed: events.filter((event) => event.type === "node.failed").length,
    queued: new Set(events.filter((event) => event.type === "node.queued").map((event) => event.nodeId)).size,
    skipped: events.filter((event) => event.type === "node.skipped").length,
    status: terminal?.type === "run.completed"
      ? "completed"
      : terminal?.type === "run.failed"
        ? "failed"
        : events.length
          ? "running"
          : "idle",
  };
};

export const runTimings = (events: readonly RunEvent[]): RunTiming[] => {
  const startedAt = Date.parse(events.find((event) => event.type === "run.started")?.occurredAt ?? "");
  return events.flatMap((event) => {
    if (event.type !== "node.completed" && event.type !== "node.failed") return [];
    const completedAt = Date.parse(event.occurredAt);
    const offsetMs = Number.isFinite(startedAt) && Number.isFinite(completedAt)
      ? Math.max(0, completedAt - startedAt - event.durationMs)
      : 0;
    return [{
      durationMs: event.durationMs,
      nodeId: event.nodeId,
      offsetMs,
      status: event.type === "node.completed" ? "completed" as const : "failed" as const,
    }];
  });
};

export const safeJson = (value: unknown, maxCharacters = 20_000) => {
  if (value === undefined) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2) ?? "[Unsupported value]";
  } catch {
    serialized = "[Value could not be displayed safely]";
  }
  if (serialized.length <= maxCharacters) return { text: serialized, truncated: false };
  return { text: `${serialized.slice(0, maxCharacters)}\n…`, truncated: true };
};
