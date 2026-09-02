import { describe, expect, it } from "vitest";
import { workflowTemplates } from "./workflowTemplates";

describe("workflow templates", () => {
  it("defines the three promised graphs predictably", () => {
    expect(workflowTemplates.map((template) => template.name)).toEqual(["Incident Triage", "GitHub Release Digest", "Data Quality Gate"]);
    workflowTemplates.forEach((template) => {
      expect(template.nodes.length).toBeGreaterThanOrEqual(5);
      expect(template.edges).toHaveLength(template.nodes.length - 1);
      expect(new Set(template.nodes.map((node) => node.id)).size).toBe(template.nodes.length);
    });
  });
});
