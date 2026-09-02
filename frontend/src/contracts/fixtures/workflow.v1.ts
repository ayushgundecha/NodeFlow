import type { components } from "../generated/api";

export const workflowV1Fixture = {
  schemaVersion: "1.0",
  id: "fixture.hello-world",
  name: "Hello world",
  nodes: [
    {
      id: "input.payload",
      type: "manualInput",
      label: "Payload",
      position: { x: 80, y: 160 },
      config: { inputKey: "payload", defaultValue: { name: "Ada" } },
    },
    {
      id: "template.greeting",
      type: "template",
      label: "Create greeting",
      position: { x: 400, y: 160 },
      config: { template: "Hello, {{ payload.name }}!" },
    },
    {
      id: "output.result",
      type: "output",
      label: "Result",
      position: { x: 720, y: 160 },
      config: { label: "Greeting", format: "text" },
    },
  ],
  edges: [
    {
      id: "edge.input-template",
      source: "input.payload",
      sourceHandle: "value",
      target: "template.greeting",
      targetHandle: "input",
    },
    {
      id: "edge.template-output",
      source: "template.greeting",
      sourceHandle: "output",
      target: "output.result",
      targetHandle: "value",
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
} satisfies components["schemas"]["WorkflowDefinition"];
