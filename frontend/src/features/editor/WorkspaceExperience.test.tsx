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
  it("keeps first load free of a blocking welcome overlay", () => {
    render(<WorkspaceExperience currentWorkspace={createEditorWorkspace(defaultWorkflowTemplate)} onClose={vi.fn()} onReplace={vi.fn()} open={false} />);

    expect(screen.queryByLabelText("Welcome to NodeFlow")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives visitors an explicit blank-canvas path from the workspace menu", () => {
    const onReplace = vi.fn();
    render(<WorkspaceExperience currentWorkspace={createEditorWorkspace(defaultWorkflowTemplate)} onClose={vi.fn()} onReplace={onReplace} open />);

    fireEvent.click(screen.getByRole("button", { name: "Start a blank workflow" }));
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
