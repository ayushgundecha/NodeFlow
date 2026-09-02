import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { FlowNode } from "./types/editor";

const node: FlowNode = {
  id: "text-1",
  type: "text",
  position: { x: 0, y: 0 },
  data: { id: "text-1", nodeType: "text", text: "before" },
};

describe("workflow store", () => {
  beforeEach(() => {
    useStore.setState({ nodeIDs: {}, nodes: [], edges: [] });
  });

  it("updates node fields without mutating the previous node", () => {
    useStore.getState().addNode(node);
    const before = useStore.getState().nodes[0]!;

    useStore.getState().updateNodeField(node.id, "text", "after");
    const after = useStore.getState().nodes[0]!;

    expect(after.data.text).toBe("after");
    expect(after).not.toBe(before);
    expect(before.data.text).toBe("before");
  });

  it("removes attached edges with a deleted node", () => {
    useStore.setState({
      nodes: [node, { ...node, id: "output-1", data: { ...node.data, id: "output-1" } }],
      edges: [{ id: "edge-1", source: "text-1", target: "output-1" }],
    });

    useStore.getState().removeNode("text-1");

    expect(useStore.getState().nodes).toHaveLength(1);
    expect(useStore.getState().edges).toHaveLength(0);
  });
});
