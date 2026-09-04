import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "../../contracts/types";
import { DebuggerPanel } from "./DebuggerPanel";

const events: RunEvent[] = [
  { type: "run.started", runId: "run-1", clientRunId: "client-1", sequence: 0, occurredAt: "2026-09-03T10:00:00.000Z" },
  { type: "node.started", runId: "run-1", nodeId: "fetch", sequence: 1, occurredAt: "2026-09-03T10:00:00.005Z", input: { id: 42 } },
  { type: "node.completed", runId: "run-1", nodeId: "fetch", sequence: 2, occurredAt: "2026-09-03T10:00:00.025Z", output: { ok: true }, durationMs: 20 },
  { type: "run.completed", runId: "run-1", sequence: 3, occurredAt: "2026-09-03T10:00:00.030Z", outputs: { fetch: { ok: true } }, durationMs: 30 },
];

const renderPanel = (onInspectNode = vi.fn()) => {
  render(<DebuggerPanel busy={false} collapsed={false} events={events} historyAvailable nodeLabels={{ fetch: "Fetch customer" }} onClearHistory={vi.fn()} onInspectNode={onInspectNode} onReplayEvents={vi.fn()} onRun={vi.fn()} onStop={vi.fn()} onToggle={vi.fn()} retryable={false} statusMessage="Complete" traces={[]} workflowFormat="nodeflow.workflow/2" workflowId="test" workflowSignature="signature" />);
  return onInspectNode;
};

afterEach(cleanup);

describe("DebuggerPanel", () => {
  it("renders events in server sequence and synchronizes node selection", () => {
    const inspect = renderPanel();
    const eventButtons = within(screen.getByRole("list", { name: "Run events in server order" })).getAllByRole("button");
    expect(eventButtons.map((button) => button.textContent?.slice(0, 3))).toEqual(["000", "001", "002", "003"]);
    fireEvent.click(screen.getByRole("button", { name: /001StartedFetch customer/i }));
    expect(inspect).toHaveBeenCalledWith("fetch");
  });

  it("shows selected node input and an exact timing table", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /001StartedFetch customer/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Node data" }));
    expect(screen.getByText(/"id": 42/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Timing" }));
    expect(screen.getByRole("table", { name: "Exact node timing data" })).toBeInTheDocument();
    expect(screen.getAllByText("20 ms").length).toBeGreaterThan(0);
  });
});
