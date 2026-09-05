import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";
import { NodeLibrary } from "./NodeLibrary";

beforeEach(() => {
  useStore.setState({ nodeIDs: {}, nodes: [], edges: [], historyPast: [], historyFuture: [] });
  useEditorStore.getState().resetEditor();
});

afterEach(cleanup);

describe("NodeLibrary", () => {
  it("keeps an operable catalog rail when the full library is collapsed", () => {
    const onToggle = vi.fn();
    const onNodeAdded = vi.fn();
    render(<NodeLibrary collapsed onNodeAdded={onNodeAdded} onToggle={onToggle} />);

    expect(screen.getByRole("complementary", { name: "Collapsed node library" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Expand node library" }));
    expect(onToggle).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Add Manual input node" }));
    expect(useStore.getState().nodes).toHaveLength(1);
    expect(useEditorStore.getState().selectedNodeId).toBe("manualInput-1");
    expect(onNodeAdded).toHaveBeenCalledOnce();
  });

  it("supports both drag-to-place and click-to-add from the full catalog", () => {
    const onNodeAdded = vi.fn();
    const setData = vi.fn();
    render(<NodeLibrary collapsed={false} onNodeAdded={onNodeAdded} onToggle={vi.fn()} />);
    const item = screen.getByRole("button", { name: "Add Manual input node" });

    expect(item).toHaveAttribute("draggable", "true");
    expect(screen.getByText("Drag to place · click to add")).toBeVisible();
    fireEvent.dragStart(item, { dataTransfer: { effectAllowed: "none", setData } });
    expect(setData).toHaveBeenCalledWith("application/nodeflow", "manualInput");
    expect(setData).toHaveBeenCalledWith("text/plain", "manualInput");

    fireEvent.click(item);
    expect(useStore.getState().nodes).toHaveLength(1);
    expect(onNodeAdded).toHaveBeenCalledOnce();
  });
});
