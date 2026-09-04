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
});
