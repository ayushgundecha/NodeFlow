import type { FlowNodeData } from "../../types/editor";

const defaultsByType: Record<string, Record<string, unknown>> = {
  customInput: { inputName: "", inputType: "Text" },
  llm: {},
  customOutput: { outputName: "", outputType: "Text" },
  text: { text: "" },
  api: { apiUrl: "", method: "GET", headers: "", body: "" },
  imageProcessing: { processingType: "Filter", width: "", height: "" },
  timer: { delay: 0 },
  emailFormatter: { emailFormat: "{name}@example.com" },
  textTransformation: { transformation: "uppercase" },
};

export const createLegacyNodeData = (nodeId: string, type: string): FlowNodeData => ({
  id: nodeId,
  nodeType: type,
  ...(defaultsByType[type] ?? {}),
});
