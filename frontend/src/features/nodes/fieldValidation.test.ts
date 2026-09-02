import { describe, expect, it } from "vitest";
import type { NodeFieldDefinition } from "../../domain/nodes/registry";
import { validateField } from "./fieldValidation";

const field = (overrides: Partial<NodeFieldDefinition>): NodeFieldDefinition => ({
  helper: "Helpful context.",
  key: "value",
  kind: "text",
  label: "Value",
  ...overrides,
});

describe("inspector field validation", () => {
  it("returns parsed JSON for valid editor input", () => {
    expect(validateField(field({ kind: "json" }), '{"severity":"high"}')).toEqual({
      valid: true,
      value: { severity: "high" },
    });
  });

  it("explains how to recover from malformed JSON", () => {
    expect(validateField(field({ kind: "json" }), "{" )).toEqual({
      valid: false,
      message: "This is not valid JSON. Check quotes, commas, and closing brackets.",
    });
  });

  it("enforces numeric bounds", () => {
    expect(validateField(field({ kind: "number", max: 30000 }), "50000")).toEqual({
      valid: false,
      message: "Use 30000 or less.",
    });
  });

  it("allows only complete HTTPS URLs", () => {
    expect(validateField(field({ kind: "url" }), "http://example.com")).toEqual({
      valid: false,
      message: "Use a public HTTPS URL, beginning with https://.",
    });
    expect(validateField(field({ kind: "url" }), "https://example.com/data")).toEqual({
      valid: true,
      value: "https://example.com/data",
    });
  });
});
