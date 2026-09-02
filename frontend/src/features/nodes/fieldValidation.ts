import type { NodeFieldDefinition } from "../../domain/nodes/registry";

export type FieldValidation =
  | { valid: true; value: unknown }
  | { valid: false; message: string };

export function formatFieldValue(value: unknown, kind: NodeFieldDefinition["kind"]): string {
  if (kind === "json") return JSON.stringify(value ?? null, null, 2);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function validateField(field: NodeFieldDefinition, rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (field.required && !value) {
    return { valid: false, message: `${field.label} is required. Add a value to continue.` };
  }

  if (field.kind === "json") {
    if (!value) return { valid: true, value: null };
    try {
      return { valid: true, value: JSON.parse(value) as unknown };
    } catch {
      return { valid: false, message: "This is not valid JSON. Check quotes, commas, and closing brackets." };
    }
  }

  if (field.kind === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return { valid: false, message: "Enter a valid number." };
    if (field.min !== undefined && number < field.min) return { valid: false, message: `Use ${field.min} or greater.` };
    if (field.max !== undefined && number > field.max) return { valid: false, message: `Use ${field.max} or less.` };
    return { valid: true, value: number };
  }

  if (field.kind === "url" && value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return { valid: false, message: "Use a public HTTPS URL, beginning with https://." };
    } catch {
      return { valid: false, message: "Enter a complete URL, for example https://api.example.com/data." };
    }
  }

  return { valid: true, value: rawValue };
}
