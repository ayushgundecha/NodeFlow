import { describe, expect, it } from "vitest";
import { workflowTemplates } from "./workflowTemplates";

describe("workflow templates", () => {
  it("defines the three promised graphs predictably", () => {
    expect(workflowTemplates.map((template) => template.name)).toEqual(["Incident Triage", "GitHub Release Digest", "Data Quality Gate"]);
    workflowTemplates.forEach((template) => {
      expect(template.nodes.length).toBeGreaterThanOrEqual(5);
      expect(new Set(template.nodes.map((node) => node.id)).size).toBe(template.nodes.length);
      expect(template.edges.every((edge) => edge.sourceHandle && edge.targetHandle)).toBe(true);
    });
  });

  it("uses real adapters and explicit branches in every promised story", () => {
    const [incident, github, quality] = workflowTemplates;
    expect(incident.nodes.find((node) => node.data.nodeType === "javascript")?.data.config?.source).toContain("severity");
    expect(incident.nodes.find((node) => node.data.nodeType === "llm")?.data.config?.systemPrompt).toContain("facts");
    expect(github.nodes.find((node) => node.data.nodeType === "httpRequest")?.data.config?.url).toContain("api.github.com");
    expect(github.nodes.find((node) => node.data.nodeType === "httpRequest")?.data.config?.url).toContain("{{ input.owner }}");
    expect(quality.edges.filter((edge) => edge.source === quality.nodes[2]?.id).map((edge) => edge.sourceHandle).sort()).toEqual(["false", "true"]);
    expect(quality.nodes.filter((node) => node.data.nodeType === "output")).toHaveLength(1);
  });
});
