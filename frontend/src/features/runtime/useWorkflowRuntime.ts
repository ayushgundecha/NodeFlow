import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RunEvent, RunRequest, ValidationResult } from "../../contracts/types";
import { editorWorkspaceToExecutionWorkflow } from "../../domain/workflow/toExecutionWorkflow";
import type { EditorWorkspace } from "../editor/workspacePersistence";
import {
  initialRunEventState,
  streamWorkflowRun,
  type RunEventState,
} from "./runEventStream";

export type RuntimeNodeStatus = "failed" | "idle" | "paused" | "queued" | "running" | "skipped" | "succeeded";

const statusForEvent = (event: RunEvent): RuntimeNodeStatus | null => {
  if (event.type === "node.queued") return "queued";
  if (event.type === "node.started" || event.type === "node.log") return "running";
  if (event.type === "node.completed") return "succeeded";
  if (event.type === "node.failed") return "failed";
  if (event.type === "node.skipped") return "skipped";
  return null;
};

export const nodeStatusesForEvents = (events: readonly RunEvent[]) => {
  const statuses: Record<string, RuntimeNodeStatus> = {};
  for (const event of events) {
    if (!("nodeId" in event)) continue;
    const status = statusForEvent(event);
    if (status) statuses[event.nodeId] = status;
  }
  return statuses;
};

const messageForState = (state: RunEventState, error: string | null, validating: boolean) => {
  if (validating) return "Validating workflow with the backend.";
  if (error) return error;
  if (state.connection === "streaming") return "Workflow is running. Live events are arriving.";
  if (state.connection === "completed") return "Workflow completed successfully.";
  if (state.connection === "cancelled") return "Workflow run stopped.";
  if (state.connection === "disconnected") return "Run disconnected before a terminal event. Retry is available.";
  if (state.connection === "failed") return state.protocolError ?? "Workflow execution failed. Retry is available.";
  return "Workflow is ready to validate and run.";
};

export const runtimeWorkflowRevision = (workspace: EditorWorkspace) => JSON.stringify({
  edges: workspace.edges.map(({ source, sourceHandle, target, targetHandle }) => ({ source, sourceHandle, target, targetHandle })),
  id: workspace.id,
  nodes: workspace.nodes.map((node) => ({ config: node.data.config ?? {}, id: node.id, type: node.data.nodeType })),
});

export function useWorkflowRuntime(workspace: EditorWorkspace) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [runState, setRunState] = useState<RunEventState>(initialRunEventState);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const revision = useMemo(() => runtimeWorkflowRevision(workspace), [workspace]);
  const revisionRef = useRef(revision);
  const busy = validating || executing;

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    workspaceRef.current = workspace;
    if (revisionRef.current === revision) return;
    revisionRef.current = revision;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setExecuting(false);
    setValidation(null);
    setRequestError(null);
    setRunState(initialRunEventState());
  }, [revision, workspace]);

  const run = useCallback(async () => {
    if (controllerRef.current || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRequestError(null);
    setValidation(null);
    setRunState(initialRunEventState());
    setValidating(true);
    setExecuting(true);
    const workflow = editorWorkspaceToExecutionWorkflow(workspaceRef.current);
    try {
      const validationResponse = await fetch("/api/v1/workflows/validate", {
        body: JSON.stringify(workflow),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      if (!validationResponse.ok) throw new Error(`Validation failed with HTTP ${validationResponse.status}.`);
      const result = await validationResponse.json() as ValidationResult;
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      setValidation(result);
      setValidating(false);
      if (!result.valid) return;
      const request: RunRequest = {
        clientRunId: crypto.randomUUID(),
        input: null,
        workflow,
      };
      const terminal = await streamWorkflowRun(request, {
        onEvent: (_event, next) => setRunState(next),
        signal: controller.signal,
      });
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      setRunState(terminal);
    } catch (error) {
      if (!controller.signal.aborted && controllerRef.current === controller) {
        setRequestError(error instanceof Error ? error.message : "The backend request failed.");
      }
    } finally {
      if (controllerRef.current === controller) {
        setValidating(false);
        setExecuting(false);
        controllerRef.current = null;
      }
    }
  }, [busy]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setExecuting(false);
    setValidating(false);
    setRunState((current) => ({ ...current, connection: "cancelled" }));
  }, []);

  const nodeStatuses = useMemo(() => {
    const statuses = nodeStatusesForEvents(runState.events);
    if (["cancelled", "disconnected"].includes(runState.connection)) {
      for (const [nodeId, status] of Object.entries(statuses)) {
        if (status === "queued" || status === "running") statuses[nodeId] = "paused";
      }
    }
    return statuses;
  }, [runState.connection, runState.events]);

  const validationIssues = validation?.errors ?? [];
  const statusMessage = messageForState(runState, requestError, validating);
  const retryable = !busy && Boolean(requestError || ["disconnected", "failed"].includes(runState.connection));

  return {
    busy,
    nodeStatuses,
    requestError,
    retryable,
    run,
    runState,
    statusMessage,
    stop,
    validating,
    validationIssues,
  };
}
