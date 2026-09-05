import { describe, expect, it } from "vitest";
import { centerDroppedNode, createLibraryNode, canConnectNodes, layoutWorkflowNodes, workflowNodePosition } from "./workflowGraph";

describe("workflow graph helpers", () => {
  it("creates configured registry nodes for a blank canvas", () => {
    const node = createLibraryNode("condition", "condition-1", { x: 120, y: 80 });
    expect(node.data).toMatchObject({ id: "condition-1", nodeType: "condition", label: "Condition" });
    expect(node.position).toEqual({ x: 120, y: 80 });
  });

  it("centers a dragged node on the pointer drop position", () => {
    expect(centerDroppedNode({ x: 500, y: 300 })).toEqual({ x: 392, y: 246 });
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

  it("lays workflow steps on the same horizontal axis as their ports", () => {
    expect(Array.from({ length: 7 }, (_, index) => workflowNodePosition(index))).toEqual([
      { x: 72, y: 220 },
      { x: 332, y: 220 },
      { x: 592, y: 220 },
      { x: 852, y: 220 },
      { x: 1112, y: 220 },
      { x: 1372, y: 220 },
      { x: 1632, y: 220 },
    ]);
  });

  it("fans branches out by layer and brings their merge back to center", () => {
    const nodes = ["manualInput", "condition", "transform", "transform", "merge", "output"].map((type, index) => createLibraryNode(type as Parameters<typeof createLibraryNode>[0], `node-${index}`, { x: 0, y: 0 }));
    const edges = [
      { id: "e1", source: "node-0", target: "node-1" },
      { id: "e2", source: "node-1", target: "node-2" },
      { id: "e3", source: "node-1", target: "node-3" },
      { id: "e4", source: "node-2", target: "node-4" },
      { id: "e5", source: "node-3", target: "node-4" },
      { id: "e6", source: "node-4", target: "node-5" },
    ];
    const positions = Object.fromEntries(layoutWorkflowNodes(nodes, edges).map((node) => [node.id, node.position]));
    expect(positions["node-2"]?.y).toBeLessThan(positions["node-3"]?.y ?? 0);
    expect(positions["node-4"]).toEqual({ x: 852, y: 220 });
    expect(positions["node-5"]).toEqual({ x: 1112, y: 220 });
  });
});
