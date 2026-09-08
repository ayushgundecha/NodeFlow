import type {
  NodeType,
  PortDefinition,
  WorkflowNode,
} from "../../contracts/types";

export type NodeCategory = "input" | "data" | "logic" | "ai" | "flow" | "output";

export type NodeIconKey = "braces" | "clock" | "code" | "combine" | "fileInput" | "gitBranch" | "globe" | "sparkles" | "text" | "workflow";
export type NodeFieldKind = "json" | "number" | "select" | "text" | "textarea" | "url";

export type NodeFieldDefinition = {
  key: string;
  label: string;
  kind: NodeFieldKind;
  helper: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
};

export type NodeDefinition<Type extends NodeType = NodeType> = {
  type: Type;
  label: string;
  description: string;
  category: NodeCategory;
  icon: NodeIconKey;
  ports: readonly PortDefinition[];
  fields: readonly NodeFieldDefinition[];
  createConfig: () => Extract<WorkflowNode, { type: Type }>["config"];
};

type PortDataType = PortDefinition["dataType"];

const inputPort = (id: string, label: string, dataType: PortDataType, required = true): PortDefinition => ({
  id,
  label,
  direction: "input",
  dataType,
  required,
  multiple: false,
});

const outputPort = (id: string, label: string, dataType: PortDataType): PortDefinition => ({
  id,
  label,
  direction: "output",
  dataType,
  required: true,
  multiple: false,
});

export const nodeRegistry = {
  manualInput: {
    type: "manualInput",
    label: "Manual input",
    description: "Provide a typed value when a run starts.",
    category: "input",
    icon: "fileInput",
    ports: [outputPort("value", "Value", "json")],
    fields: [
      { key: "inputKey", label: "Input key", kind: "text", helper: "Name used to reference this value downstream.", required: true },
      { key: "defaultValue", label: "Default JSON", kind: "json", helper: "Used for test runs when no input is supplied." },
    ],
    createConfig: () => ({ inputKey: "payload", defaultValue: null }),
  },
  template: {
    type: "template",
    label: "Template",
    description: "Render text from upstream values.",
    category: "data",
    icon: "text",
    ports: [inputPort("input", "Input", "any", false), outputPort("output", "Text", "string")],
    fields: [{ key: "template", label: "Template", kind: "textarea", helper: "Use {{ input }} expressions to insert upstream values.", required: true }],
    createConfig: () => ({ template: "" }),
  },
  httpRequest: {
    type: "httpRequest",
    label: "HTTP request",
    description: "Call a public HTTPS endpoint.",
    category: "data",
    icon: "globe",
    ports: [inputPort("body", "Body", "json", false), outputPort("response", "Response", "json")],
    fields: [
      { key: "method", label: "Method", kind: "select", helper: "HTTP method used for the request.", options: ["GET", "POST"], required: true },
      { key: "url", label: "Public URL", kind: "url", helper: "HTTPS only. Private addresses and credential headers are blocked.", required: true },
      { key: "body", label: "Request body", kind: "json", helper: "Optional JSON body available to POST requests." },
    ],
    createConfig: () => ({ method: "GET", url: "", headers: {}, body: null }),
  },
  transform: {
    type: "transform",
    label: "Transform",
    description: "Reshape JSON with a deterministic expression.",
    category: "data",
    icon: "braces",
    ports: [inputPort("input", "Input", "json"), outputPort("output", "Output", "json")],
    fields: [{ key: "expression", label: "Expression", kind: "text", helper: "Use @ to reference the incoming JSON value.", required: true }],
    createConfig: () => ({ expression: "@" }),
  },
  condition: {
    type: "condition",
    label: "Condition",
    description: "Route values through true or false branches.",
    category: "logic",
    icon: "gitBranch",
    ports: [
      inputPort("input", "Input", "any"),
      outputPort("true", "True", "any"),
      outputPort("false", "False", "any"),
    ],
    fields: [{ key: "rule", label: "Rule", kind: "json", helper: "A structured comparison evaluated against the input.", required: true }],
    createConfig: () => ({ rule: {} }),
  },
  merge: {
    type: "merge",
    label: "Merge",
    description: "Combine multiple upstream results.",
    category: "logic",
    icon: "combine",
    ports: [
      { ...inputPort("items", "Items", "json"), multiple: true },
      outputPort("output", "Merged", "json"),
    ],
    fields: [{ key: "strategy", label: "Merge strategy", kind: "select", helper: "Combine inputs as one object or an ordered array.", options: ["object", "array"], required: true }],
    createConfig: () => ({ strategy: "object" }),
  },
  javascript: {
    type: "javascript",
    label: "JavaScript",
    description: "Run a limited script inside an isolated sandbox.",
    category: "logic",
    icon: "code",
    ports: [inputPort("input", "Input", "any", false), outputPort("output", "Output", "any")],
    fields: [{ key: "source", label: "Source", kind: "textarea", helper: "Return a JSON-serializable value. Network access is disabled.", required: true }],
    createConfig: () => ({ source: "return input;" }),
  },
  delay: {
    type: "delay",
    label: "Delay",
    description: "Pause a branch for a bounded duration.",
    category: "flow",
    icon: "clock",
    ports: [inputPort("input", "Input", "any"), outputPort("output", "Output", "any")],
    fields: [{ key: "milliseconds", label: "Duration (ms)", kind: "number", helper: "Bounded delay from 0 to 30,000 milliseconds.", min: 0, max: 30000, required: true }],
    createConfig: () => ({ milliseconds: 0 }),
  },
  llm: {
    type: "llm",
    label: "LLM",
    description: "Generate structured output from a prompt.",
    category: "ai",
    icon: "sparkles",
    ports: [
      inputPort("context", "Context", "json", false),
      outputPort("response", "Response", "json"),
    ],
    fields: [
      { key: "systemPrompt", label: "System prompt", kind: "textarea", helper: "Define the model's role and output rules.", required: true },
      { key: "promptTemplate", label: "Prompt template", kind: "textarea", helper: "Use {{ input }} to include upstream context.", required: true },
    ],
    createConfig: () => ({ systemPrompt: "", promptTemplate: "{{ input }}" }),
  },
  output: {
    type: "output",
    label: "Output",
    description: "Publish a named workflow result.",
    category: "output",
    icon: "workflow",
    ports: [inputPort("value", "Value", "any")],
    fields: [
      { key: "label", label: "Output label", kind: "text", helper: "Human-readable key shown in the run result.", required: true },
      { key: "format", label: "Format", kind: "select", helper: "Choose how the final value is displayed.", options: ["json", "text"], required: true },
    ],
    createConfig: () => ({ label: "Result", format: "json" }),
  },
} as const satisfies { [Type in NodeType]: NodeDefinition<Type> };

export const nodeDefinitions = Object.values(nodeRegistry);

const nodeTypes = new Set<string>(nodeDefinitions.map((definition) => definition.type));

export const isNodeType = (value: unknown): value is NodeType =>
  typeof value === "string" && nodeTypes.has(value);

export const getNodeDefinition = (type: NodeType): NodeDefinition =>
  nodeRegistry[type];
