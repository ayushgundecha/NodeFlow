import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../../contracts/types";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";
import { defaultWorkflowTemplate } from "../editor/workflowTemplates";
import { NodeInspector } from "./NodeInspector";

const node = defaultWorkflowTemplate.nodes[0]!;
const events: RunEvent[] = [
  { type: "run.started", runId: "run-1", clientRunId: "client-1", sequence: 0, occurredAt: "2026-09-03T10:00:00.000Z" },
  { type: "node.started", runId: "run-1", nodeId: node.id, sequence: 1, occurredAt: "2026-09-03T10:00:00.005Z", input: { service: "checkout-api" } },
  { type: "node.completed", runId: "run-1", nodeId: node.id, sequence: 2, occurredAt: "2026-09-03T10:00:00.025Z", output: { severity: "high" }, durationMs: 20 },
];

afterEach(() => {
  cleanup();
  useStore.getState().hydrateWorkflow([], []);
  useEditorStore.getState().resetEditor();
});

describe("NodeInspector", () => {
  it("makes real node input and output available as interactive tabs", () => {
    useStore.getState().hydrateWorkflow([node], []);
    useEditorStore.getState().selectNode(node.id);
    render(<NodeInspector busy={false} collapsed={false} events={events} onToggle={vi.fn()} />);

    const inputTab = screen.getByRole("tab", { name: "input" });
    const outputTab = screen.getByRole("tab", { name: "output" });
    expect(inputTab).toBeEnabled();
    expect(outputTab).toBeEnabled();

    fireEvent.click(inputTab);
    expect(screen.getByText(/"service": "checkout-api"/)).toBeInTheDocument();
    fireEvent.click(outputTab);
    expect(screen.getByText(/"severity": "high"/)).toBeInTheDocument();
  });
});
