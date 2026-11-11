import { describe, expect, it } from "vitest";
import { isInputSchema, schemaDiffProblems, validateInputs, type JsonSchema } from "@/lib/town/schema";

const v1: JsonSchema = {
  type: "object",
  properties: { month: { type: "string", pattern: "^\\d{4}-\\d{2}$" }, branches: { type: "array", items: { type: "string" } } },
  required: ["month"],
  additionalProperties: false,
};

describe("validateInputs", () => {
  it("accepts valid inputs", () => {
    expect(validateInputs(v1, { month: "2026-10" })).toEqual({ ok: true });
    expect(validateInputs(v1, { month: "2026-10", branches: ["taipei"] })).toEqual({ ok: true });
  });
  it("rejects an input key the version does not declare, even if the schema allowed extras", () => {
    const loose = { ...v1, additionalProperties: true };
    const res = validateInputs(loose, { month: "2026-10", timezone: "Asia/Jakarta" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Unknown input: timezone/);
  });
  it("rejects a missing required input and a wrong type", () => {
    expect(validateInputs(v1, {}).ok).toBe(false);
    expect(validateInputs(v1, { month: 202610 }).ok).toBe(false);
    expect(validateInputs(v1, { month: "October" }).ok).toBe(false);
  });
  it("rejects non-object inputs", () => {
    expect(validateInputs(v1, null).ok).toBe(false);
    expect(validateInputs(v1, [1]).ok).toBe(false);
  });
});

describe("isInputSchema", () => {
  it("requires an object schema with properties", () => {
    expect(isInputSchema(v1)).toBe(true);
    expect(isInputSchema({ type: "string" })).toBe(false);
    expect(isInputSchema(null)).toBe(false);
    expect(isInputSchema({ type: "object" })).toBe(false);
  });
});

describe("schemaDiffProblems", () => {
  const withTz = (extra: Record<string, unknown>): JsonSchema => ({
    ...v1,
    properties: { ...v1.properties, timezone: { type: "string", default: "UTC", ...extra } },
  });
  it("allows adding an optional property with a default", () => {
    expect(schemaDiffProblems(v1, withTz({}))).toEqual([]);
  });
  it("rejects an added property without a default", () => {
    const next = withTz({});
    delete (next.properties!.timezone as Record<string, unknown>).default;
    expect(schemaDiffProblems(v1, next)).toContain('new input "timezone" has no default');
  });
  it("rejects a newly required property", () => {
    expect(schemaDiffProblems(v1, { ...withTz({}), required: ["month", "timezone"] })).toContain('input "timezone" is newly required');
  });
  it("rejects a removed or changed property", () => {
    expect(schemaDiffProblems(v1, { ...v1, properties: { month: v1.properties!.month } })).toContain('removed input "branches"');
    expect(schemaDiffProblems(v1, { ...v1, properties: { ...v1.properties, month: { type: "number" } } })).toContain('changed input "month"');
  });
});
