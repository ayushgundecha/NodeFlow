import { describe, expect, it } from "vitest";
import { nodeDefinitions, nodeRegistry } from "./registry";

describe("node registry", () => {
  it("defines every v1 node type exactly once", () => {
    expect(nodeDefinitions).toHaveLength(10);
    expect(new Set(nodeDefinitions.map((definition) => definition.type)).size).toBe(10);
    expect(nodeDefinitions.every((definition) => definition.icon && definition.fields.length > 0)).toBe(true);
    expect(nodeDefinitions.map((definition) => definition.label)).not.toContain("Image");
    expect(nodeDefinitions.map((definition) => definition.label)).not.toContain("Email");
  });

  it("creates independent config objects and addressable ports", () => {
    const first = nodeRegistry.httpRequest.createConfig();
    const second = nodeRegistry.httpRequest.createConfig();

    expect(first).not.toBe(second);
    expect(nodeRegistry.condition.ports.map((port) => port.id)).toEqual([
      "input",
      "true",
      "false",
    ]);
  });
});
