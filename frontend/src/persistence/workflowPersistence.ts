import type { WorkflowDefinition } from "../contracts/types";

export const WORKFLOW_STORAGE_KEY = "nodeflow.workflow";
export const STORAGE_VERSION = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WorkflowEnvelope = {
  storageVersion: typeof STORAGE_VERSION;
  savedAt: string;
  workflow: WorkflowDefinition;
};

export type LoadWorkflowResult =
  | { status: "empty" }
  | { status: "loaded"; workflow: WorkflowDefinition; savedAt: string }
  | { status: "recovered"; backupKey: string; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWorkflowEnvelope = (value: unknown): value is WorkflowEnvelope => {
  if (!isRecord(value) || value.storageVersion !== STORAGE_VERSION) return false;
  if (typeof value.savedAt !== "string" || !isRecord(value.workflow)) return false;
  return value.workflow.schemaVersion === "1.0"
    && typeof value.workflow.id === "string"
    && typeof value.workflow.name === "string";
};

export const saveWorkflow = (
  storage: StorageLike,
  workflow: WorkflowDefinition,
  now = new Date(),
): void => {
  const envelope: WorkflowEnvelope = {
    storageVersion: STORAGE_VERSION,
    savedAt: now.toISOString(),
    workflow,
  };
  storage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(envelope));
};

export const loadWorkflow = (
  storage: StorageLike,
  now = new Date(),
): LoadWorkflowResult => {
  const raw = storage.getItem(WORKFLOW_STORAGE_KEY);
  if (raw === null) return { status: "empty" };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkflowEnvelope(parsed)) {
      throw new Error("Unsupported or malformed workflow envelope.");
    }
    return { status: "loaded", workflow: parsed.workflow, savedAt: parsed.savedAt };
  } catch (error) {
    const backupKey = `${WORKFLOW_STORAGE_KEY}.corrupt.${now.toISOString()}`;
    storage.setItem(backupKey, raw);
    storage.removeItem(WORKFLOW_STORAGE_KEY);
    return {
      status: "recovered",
      backupKey,
      reason: error instanceof Error ? error.message : "Unknown persistence error.",
    };
  }
};
