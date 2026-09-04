import type { RunEvent } from "../../contracts/types";
import type { EditorWorkspace } from "../editor/workspacePersistence";
import { replayRunEvents } from "./runReducer";

export const RUN_HISTORY_SCHEMA = "nodeflow.run-history/1";
export const RUN_HISTORY_LIMIT = 10;
const DATABASE_NAME = "nodeflow-local";
const STORE_NAME = "run-traces";

export type StoredRunTrace = {
  completedAt: string;
  events: RunEvent[];
  runId: string;
  schema: typeof RUN_HISTORY_SCHEMA;
  workflowFormat: string;
  workflowId: string;
  workflowSignature: string;
};

export type RunComparisonRow = {
  durationDeltaMs: number | null;
  nodeId: string;
  outputChanged: boolean;
  presence: "added" | "both" | "removed";
  statusAfter: string | null;
  statusBefore: string | null;
};

export const workflowSignature = (workspace: EditorWorkspace) => JSON.stringify({
  edges: workspace.edges.map(({ source, sourceHandle, target, targetHandle }) => ({ source, sourceHandle, target, targetHandle })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  format: workspace.format,
  id: workspace.id,
  nodes: workspace.nodes.map((node) => ({ id: node.id, type: node.data.nodeType })).sort((a, b) => a.id.localeCompare(b.id)),
});

export const traceCompatibility = (trace: StoredRunTrace, workspace: EditorWorkspace) => {
  if (trace.schema !== RUN_HISTORY_SCHEMA) return "Run history schema differs";
  if (trace.workflowFormat !== workspace.format) return "Workflow format differs";
  if (trace.workflowId !== workspace.id) return "Different workflow";
  if (trace.workflowSignature !== workflowSignature(workspace)) return "Workflow structure changed";
  return null;
};

const comparableValue = (value: unknown) => {
  try { return JSON.stringify(value); } catch { return "[unserializable]"; }
};

export const compareRuns = (before: StoredRunTrace, after: StoredRunTrace): RunComparisonRow[] => {
  if (before.schema !== after.schema || before.workflowFormat !== after.workflowFormat || before.workflowId !== after.workflowId) return [];
  const beforeState = replayRunEvents(before.events);
  const afterState = replayRunEvents(after.events);
  const nodeIds = [...new Set([...Object.keys(beforeState.nodes), ...Object.keys(afterState.nodes)])].sort();
  return nodeIds.map((nodeId) => {
    const left = beforeState.nodes[nodeId];
    const right = afterState.nodes[nodeId];
    return {
      durationDeltaMs: left?.durationMs === undefined || right?.durationMs === undefined ? null : right.durationMs - left.durationMs,
      nodeId,
      outputChanged: comparableValue(left?.output) !== comparableValue(right?.output),
      presence: left && right ? "both" : right ? "added" : "removed",
      statusAfter: right?.status ?? null,
      statusBefore: left?.status ?? null,
    };
  });
};

export const replayEventsThrough = (events: readonly RunEvent[], sequence: number) =>
  events.filter((event) => event.sequence <= sequence);

export const makeStoredTrace = (events: RunEvent[], workspace: EditorWorkspace): StoredRunTrace | null => {
  const terminal = events.at(-1);
  if (!terminal || (terminal.type !== "run.completed" && terminal.type !== "run.failed")) return null;
  return {
    completedAt: terminal.occurredAt,
    events: [...events],
    runId: terminal.runId,
    schema: RUN_HISTORY_SCHEMA,
    workflowFormat: workspace.format,
    workflowId: workspace.id,
    workflowSignature: workflowSignature(workspace),
  };
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("Local run history request failed.")), { once: true });
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: true });
  transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Local run history transaction was aborted.")), { once: true });
  transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Local run history transaction failed.")), { once: true });
});

const openDatabase = (factory: IDBFactory) => new Promise<IDBDatabase>((resolve, reject) => {
  const request = factory.open(DATABASE_NAME, 1);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "runId" });
  });
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("Local run history is unavailable.")), { once: true });
});

export async function loadRunHistory(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<StoredRunTrace[]> {
  if (!factory) return [];
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll() as IDBRequest<StoredRunTrace[]>);
    await transactionDone(transaction);
    return records.filter((record) => record.schema === RUN_HISTORY_SCHEMA).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  } finally { database.close(); }
}

export async function saveRunTrace(trace: StoredRunTrace, factory: IDBFactory | undefined = globalThis.indexedDB) {
  if (!factory) return;
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(trace);
    const records = await requestResult(store.getAll() as IDBRequest<StoredRunTrace[]>);
    records.sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(RUN_HISTORY_LIMIT).forEach((record) => store.delete(record.runId));
    await transactionDone(transaction);
  } finally { database.close(); }
}

export async function clearRunHistory(factory: IDBFactory | undefined = globalThis.indexedDB) {
  if (!factory) return;
  const database = await openDatabase(factory);
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } finally { database.close(); }
}
