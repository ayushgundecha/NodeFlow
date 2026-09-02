import { describe, expect, it } from "vitest";
import { workflowV1Fixture } from "../contracts/fixtures/workflow.v1";
import {
  WORKFLOW_STORAGE_KEY,
  loadWorkflow,
  saveWorkflow,
} from "./workflowPersistence";

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => { values.clear(); },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
};

describe("workflow persistence", () => {
  it("round-trips a versioned workflow", () => {
    const storage = createStorage();
    const now = new Date("2026-09-02T00:00:00Z");
    saveWorkflow(storage, workflowV1Fixture, now);

    expect(loadWorkflow(storage, now)).toEqual({
      status: "loaded",
      workflow: workflowV1Fixture,
      savedAt: now.toISOString(),
    });
  });

  it("backs up and removes corrupt data", () => {
    const storage = createStorage();
    storage.setItem(WORKFLOW_STORAGE_KEY, "not-json");

    const result = loadWorkflow(storage, new Date("2026-09-02T00:00:00Z"));

    expect(result.status).toBe("recovered");
    expect(storage.getItem(WORKFLOW_STORAGE_KEY)).toBeNull();
    if (result.status === "recovered") {
      expect(storage.getItem(result.backupKey)).toBe("not-json");
    }
  });
});
