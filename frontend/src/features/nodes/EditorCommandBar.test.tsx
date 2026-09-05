import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../../store";
import { useEditorStore } from "../editor/editorStore";
import { EditorCommandBar } from "./EditorCommandBar";

beforeEach(() => {
  useStore.setState({ nodeIDs: {}, nodes: [], edges: [], historyPast: [], historyFuture: [] });
  useEditorStore.getState().resetEditor();
});

afterEach(cleanup);

describe("EditorCommandBar", () => {
  it("portals the command palette to the document and restores trigger focus", async () => {
    render(<div data-testid="transformed-parent"><EditorCommandBar /></div>);
    const trigger = screen.getByRole("button", { name: "Commands" });

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Quick commands" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: /Arrange workflow/ })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Quick commands" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("dismisses only when the backdrop itself is clicked", () => {
    render(<EditorCommandBar />);
    fireEvent.click(screen.getByRole("button", { name: "Commands" }));
    const dialog = screen.getByRole("dialog", { name: "Quick commands" });

    fireEvent.mouseDown(screen.getByText("Quick commands"));
    expect(dialog).toBeVisible();
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole("dialog", { name: "Quick commands" })).not.toBeInTheDocument();
  });
});
