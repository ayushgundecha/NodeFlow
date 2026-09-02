import {
  Braces,
  Clock3,
  Code2,
  Combine,
  FileInput,
  Flag,
  GitBranch,
  Globe2,
  Sparkles,
  TextQuote,
  type LucideIcon,
} from "lucide-react";
import type { NodeCategory, NodeIconKey } from "../../domain/nodes/registry";

export const nodeIcons: Record<NodeIconKey, LucideIcon> = {
  braces: Braces,
  clock: Clock3,
  code: Code2,
  combine: Combine,
  fileInput: FileInput,
  gitBranch: GitBranch,
  globe: Globe2,
  sparkles: Sparkles,
  text: TextQuote,
  workflow: Flag,
};

export const nodeCategoryLabels: Record<NodeCategory, string> = {
  input: "Inputs",
  data: "Data",
  logic: "Logic",
  ai: "Intelligence",
  flow: "Flow control",
  output: "Outputs",
};
