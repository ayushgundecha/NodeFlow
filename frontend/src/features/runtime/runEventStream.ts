import type { RunEvent, RunRequest } from "../../contracts/types";

const eventTypes = new Set<RunEvent["type"]>([
  "run.started",
  "node.queued",
  "node.started",
  "node.log",
  "node.completed",
  "node.failed",
  "node.skipped",
  "run.completed",
  "run.failed",
]);

const terminalTypes = new Set<RunEvent["type"]>(["run.completed", "run.failed"]);

export type RunConnectionState = "cancelled" | "completed" | "disconnected" | "failed" | "idle" | "streaming";

export type RunEventState = {
  connection: RunConnectionState;
  events: RunEvent[];
  lastSequence: number;
  protocolError: string | null;
  runId: string | null;
  terminal: boolean;
};

export const initialRunEventState = (): RunEventState => ({
  connection: "idle",
  events: [],
  lastSequence: -1,
  protocolError: null,
  runId: null,
  terminal: false,
});

export class RunProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunProtocolError";
  }
}

export type SseFrame = { data: string; event: string | null; id: string | null };

const parseFrame = (source: string): SseFrame | null => {
  const lines = source.split(/\r?\n/);
  const data: string[] = [];
  let event: string | null = null;
  let id: string | null = null;
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    else if (field === "id") id = value;
  }
  return data.length ? { data: data.join("\n"), event, id } : null;
};

export class SseFrameDecoder {
  private buffer = "";

  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let boundary = this.buffer.match(/\r?\n\r?\n/);
    while (boundary?.index !== undefined) {
      const source = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const frame = parseFrame(source);
      if (frame) frames.push(frame);
      boundary = this.buffer.match(/\r?\n\r?\n/);
    }
    return frames;
  }

  finish(): SseFrame[] {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return [];
    }
    const frame = parseFrame(this.buffer);
    this.buffer = "";
    return frame ? [frame] : [];
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseRunEvent = (frame: SseFrame): RunEvent => {
  let value: unknown;
  try {
    value = JSON.parse(frame.data);
  } catch {
    throw new RunProtocolError("Run stream contained malformed JSON.");
  }
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    !eventTypes.has(value.type as RunEvent["type"]) ||
    typeof value.runId !== "string" ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0 ||
    typeof value.occurredAt !== "string"
  ) {
    throw new RunProtocolError("Run stream contained an invalid event envelope.");
  }
  if (frame.event && frame.event !== value.type) {
    throw new RunProtocolError("SSE event name did not match its payload type.");
  }
  if (frame.id !== null && Number(frame.id) !== value.sequence) {
    throw new RunProtocolError("SSE event ID did not match its payload sequence.");
  }
  const invalidNode = value.type.startsWith('node.') && (typeof value.nodeId !== 'string' || !value.nodeId);
  const invalidStart = value.type === 'run.started' && typeof value.clientRunId !== 'string';
  const invalidDuration = ['node.completed', 'node.failed', 'run.completed', 'run.failed'].includes(value.type)
    && (!Number.isSafeInteger(value.durationMs) || (value.durationMs as number) < 0);
  const invalidError = value.type.endsWith('.failed') && (!isRecord(value.error)
    || typeof value.error.code !== 'string' || typeof value.error.message !== 'string');
  const invalidLog = value.type === 'node.log' && (typeof value.message !== 'string'
    || !['stdout', 'stderr', 'system'].includes(value.stream as string));
  const invalidSkip = value.type === 'node.skipped' && typeof value.reason !== 'string';
  const invalidOutputs = value.type === 'run.completed' && !isRecord(value.outputs);
  if (invalidNode || invalidStart || invalidDuration || invalidError || invalidLog || invalidSkip || invalidOutputs) {
    throw new RunProtocolError('Run stream contained an invalid event payload.');
  }
  return value as RunEvent;
};

export const reduceRunEvent = (state: RunEventState, event: RunEvent): RunEventState => {
  if (state.terminal) return state;
  if (event.sequence <= state.lastSequence) return state;
  const expected = state.lastSequence + 1;
  if (event.sequence !== expected) {
    return {
      ...state,
      connection: "failed",
      protocolError: `Expected run event ${expected}, received ${event.sequence}.`,
    };
  }
  if (state.runId !== null && event.runId !== state.runId) {
    return { ...state, connection: "failed", protocolError: "Run ID changed during the stream." };
  }
  if (state.lastSequence === -1 && event.type !== "run.started") {
    return { ...state, connection: "failed", protocolError: "Run stream did not start with run.started." };
  }
  const terminal = terminalTypes.has(event.type);
  const connection = terminal ? (event.type === "run.completed" ? "completed" : "failed") : "streaming";
  return {
    connection,
    events: [...state.events, event],
    lastSequence: event.sequence,
    protocolError: null,
    runId: state.runId ?? event.runId,
    terminal,
  };
};

export type RunStreamOptions = {
  onEvent?: (event: RunEvent, state: RunEventState) => void;
  signal?: AbortSignal;
};

export const streamWorkflowRun = async (
  request: RunRequest,
  options: RunStreamOptions = {},
): Promise<RunEventState> => {
  let state = initialRunEventState();
  const decoder = new SseFrameDecoder();
  const textDecoder = new TextDecoder();
  try {
    const response = await fetch("/api/v1/runs", {
      body: JSON.stringify(request),
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      method: "POST",
      signal: options.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Run request failed with HTTP ${response.status}.`);
    const reader = response.body.getReader();
    let done = false;
    try {
      while (!done && !state.terminal && state.protocolError === null) {
        const chunk = await reader.read();
        done = chunk.done;
        const frames = decoder.push(textDecoder.decode(chunk.value, { stream: !done }));
        if (done) frames.push(...decoder.finish());
        for (const frame of frames) {
          const event = parseRunEvent(frame);
          const next = reduceRunEvent(state, event);
          if (next !== state && next.events.length > state.events.length) options.onEvent?.(event, next);
          state = next;
          if (state.terminal || state.protocolError) break;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (!state.terminal && !state.protocolError) state = { ...state, connection: "disconnected" };
    return state;
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return { ...state, connection: "cancelled" };
    }
    if (error instanceof RunProtocolError) {
      return { ...state, connection: "failed", protocolError: error.message };
    }
    throw error;
  }
};
