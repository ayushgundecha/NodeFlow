import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceExperience } from "./WorkspaceExperience";
import { defaultWorkflowTemplate } from "./workflowTemplates";
import { createEditorWorkspace } from "./workspacePersistence";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("WorkspaceExperience", () => {
  it("gives a first-time visitor an explicit blank-canvas path", () => {
    const onReplace = vi.fn();
    render(<WorkspaceExperience currentWorkspace={createEditorWorkspace(defaultWorkflowTemplate)} onClose={vi.fn()} onReplace={onReplace} open={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("a blank canvas");
    expect(screen.getByRole("button", { name: "Replace workflow" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Replace workflow" }));

    expect(onReplace).toHaveBeenCalledWith(expect.objectContaining({ id: "blank-workflow", nodes: [], edges: [] }));
  });

  it("uses clear labels for the template replacement decision", () => {
    const onReplace = vi.fn();
    render(<WorkspaceExperience currentWorkspace={createEditorWorkspace(defaultWorkflowTemplate)} onClose={vi.fn()} onReplace={onReplace} open />);

    expect(screen.getByRole("button", { name: "Start a blank workflow" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use GitHub Release Digest template" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("GitHub Release Digest");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace workflow" })).toBeVisible();
  });
});
