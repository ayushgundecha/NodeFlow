import type {
  NodeType,
  PortDefinition,
  WorkflowNode,
} from "../../contracts/types";

export type NodeCategory = "input" | "data" | "logic" | "ai" | "flow" | "output";

export type NodeDefinition<Type extends NodeType = NodeType> = {
  type: Type;
  label: string;
  description: string;
  category: NodeCategory;
  accent: string;
  ports: readonly PortDefinition[];
  createConfig: () => Extract<WorkflowNode, { type: Type }>["config"];
};

const inputPort = (id: string, label: string, required = true): PortDefinition => ({
  id,
  label,
  direction: "input",
  dataType: "any",
  required,
  multiple: false,
});

const outputPort = (id: string, label: string): PortDefinition => ({
  id,
  label,
  direction: "output",
  dataType: "any",
  required: true,
  multiple: false,
});

export const nodeRegistry = {
  manualInput: {
    type: "manualInput",
    label: "Manual input",
    description: "Provide a typed value when a run starts.",
    category: "input",
    accent: "#2563eb",
    ports: [outputPort("value", "Value")],
    createConfig: () => ({ inputKey: "payload", defaultValue: null }),
  },
  template: {
    type: "template",
    label: "Template",
    description: "Render text from upstream values.",
    category: "data",
    accent: "#7c3aed",
    ports: [inputPort("input", "Input", false), outputPort("output", "Text")],
    createConfig: () => ({ template: "" }),
  },
  httpRequest: {
    type: "httpRequest",
    label: "HTTP request",
    description: "Call an allowlisted public HTTP endpoint.",
    category: "data",
    accent: "#0891b2",
    ports: [inputPort("body", "Body", false), outputPort("response", "Response")],
    createConfig: () => ({ method: "GET", url: "", headers: {}, body: null }),
  },
  transform: {
    type: "transform",
    label: "Transform",
    description: "Reshape JSON with a deterministic expression.",
    category: "data",
    accent: "#0d9488",
    ports: [inputPort("input", "Input"), outputPort("output", "Output")],
    createConfig: () => ({ expression: "@" }),
  },
  condition: {
    type: "condition",
    label: "Condition",
    description: "Route values through true or false branches.",
    category: "logic",
    accent: "#d97706",
    ports: [
      inputPort("input", "Input"),
      outputPort("true", "True"),
      outputPort("false", "False"),
    ],
    createConfig: () => ({ rule: {} }),
  },
  merge: {
    type: "merge",
    label: "Merge",
    description: "Combine multiple upstream results.",
    category: "logic",
    accent: "#ca8a04",
    ports: [
      { ...inputPort("items", "Items"), multiple: true },
      outputPort("output", "Merged"),
    ],
    createConfig: () => ({ strategy: "object" }),
  },
  javascript: {
    type: "javascript",
    label: "JavaScript",
    description: "Run a limited script inside an isolated sandbox.",
    category: "logic",
    accent: "#ea580c",
    ports: [inputPort("input", "Input", false), outputPort("output", "Output")],
    createConfig: () => ({ source: "return input;" }),
  },
  delay: {
    type: "delay",
    label: "Delay",
    description: "Pause a branch for a bounded duration.",
    category: "flow",
    accent: "#4f46e5",
    ports: [inputPort("input", "Input"), outputPort("output", "Output")],
    createConfig: () => ({ milliseconds: 0 }),
  },
  llm: {
    type: "llm",
    label: "LLM",
    description: "Generate structured output from a prompt.",
    category: "ai",
    accent: "#db2777",
    ports: [
      inputPort("context", "Context", false),
      outputPort("response", "Response"),
    ],
    createConfig: () => ({ systemPrompt: "", promptTemplate: "{{ input }}" }),
  },
  output: {
    type: "output",
    label: "Output",
    description: "Publish a named workflow result.",
    category: "output",
    accent: "#16a34a",
    ports: [inputPort("value", "Value")],
    createConfig: () => ({ label: "Result", format: "json" }),
  },
} as const satisfies { [Type in NodeType]: NodeDefinition<Type> };

export const nodeDefinitions = Object.values(nodeRegistry);

export const getNodeDefinition = (type: NodeType): NodeDefinition =>
  nodeRegistry[type];
