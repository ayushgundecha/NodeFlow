import { describe, expect, it } from "vitest";
import { createLibraryNode, canConnectNodes } from "./workflowGraph";

describe("workflow graph helpers", () => {
  it("creates configured registry nodes for a blank canvas", () => {
    const node = createLibraryNode("condition", "condition-1", { x: 120, y: 80 });
    expect(node.data).toMatchObject({ id: "condition-1", nodeType: "condition", label: "Condition" });
    expect(node.position).toEqual({ x: 120, y: 80 });
  });

  it("only allows compatible, non-duplicate port connections", () => {
    const input = createLibraryNode("manualInput", "input-1", { x: 0, y: 0 });
    const condition = createLibraryNode("condition", "condition-1", { x: 260, y: 0 });
    const output = createLibraryNode("output", "output-1", { x: 520, y: 0 });
    const nodes = [input, condition, output];
    const first = { source: input.id, sourceHandle: "value", target: condition.id, targetHandle: "input" };
    expect(canConnectNodes(first, nodes, [])).toBe(true);
    expect(canConnectNodes(first, nodes, [{ id: "edge-1", ...first }])).toBe(false);
    expect(canConnectNodes({ source: input.id, sourceHandle: "value", target: output.id, targetHandle: "value" }, nodes, [])).toBe(true);
    expect(canConnectNodes({ source: condition.id, sourceHandle: "true", target: condition.id, targetHandle: "input" }, nodes, [])).toBe(false);
  });
});
