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
    useStore.setState({ nodeIDs: {}, nodes: [], edges: [], historyPast: [], historyFuture: [] });
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

  it("updates node configuration without mutating previous data", () => {
    const configuredNode = { ...node, data: { ...node.data, config: { milliseconds: 0 } } };
    useStore.getState().addNode(configuredNode);
    const before = useStore.getState().nodes[0]!;

    useStore.getState().updateNodeConfig(node.id, "milliseconds", 500);
    const after = useStore.getState().nodes[0]!;

    expect(after.data.config).toEqual({ milliseconds: 500 });
    expect(after.data).not.toBe(before.data);
    expect(before.data.config).toEqual({ milliseconds: 0 });
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

  it("undoes and redoes graph mutations", () => {
    useStore.getState().addNode(node);
    expect(useStore.getState().nodes).toHaveLength(1);
    useStore.getState().undo();
    expect(useStore.getState().nodes).toHaveLength(0);
    useStore.getState().redo();
    expect(useStore.getState().nodes).toHaveLength(1);
  });

  it("duplicates selected subgraphs with collision-free ids", () => {
    const second = { ...node, id: "text-2", data: { ...node.data, id: "text-2" } };
    useStore.setState({ nodeIDs: { text: 2 }, nodes: [node, second], edges: [{ id: "edge-1", source: node.id, target: second.id }] });
    const created = useStore.getState().duplicateNodes([node.id, second.id]);

    expect(created).toEqual(["text-3", "text-4"]);
    expect(useStore.getState().nodes).toHaveLength(4);
    expect(useStore.getState().edges).toHaveLength(2);
  });

  it("applies deterministic layout and can undo it", () => {
    useStore.setState({ nodes: [{ ...node, position: { x: 900, y: 900 } }] });
    useStore.getState().autoLayout();
    expect(useStore.getState().nodes[0]?.position).toEqual({ x: 80, y: 220 });
    useStore.getState().undo();
    expect(useStore.getState().nodes[0]?.position).toEqual({ x: 900, y: 900 });
  });
});
