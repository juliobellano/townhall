import Ajv from "ajv";

export type JsonSchema = {
  type?: string;
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

const ajv = new Ajv({ allErrors: true, strict: false });

export function isInputSchema(x: unknown): x is JsonSchema {
  if (x === null || typeof x !== "object" || Array.isArray(x)) return false;
  const s = x as JsonSchema;
  return s.type === "object" && s.properties !== null && typeof s.properties === "object" && !Array.isArray(s.properties);
}

/**
 * Validates inputs against a tool's schema. Undeclared keys are rejected no matter
 * what the schema says, so an input is never silently ignored by the script.
 */
export function validateInputs(schema: JsonSchema, inputs: unknown): { ok: true } | { ok: false; error: string } {
  if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) {
    return { ok: false, error: "inputs must be a JSON object" };
  }
  const declared = Object.keys(schema.properties ?? {});
  const undeclared = Object.keys(inputs).filter((k) => !declared.includes(k));
  if (undeclared.length > 0) {
    return {
      ok: false,
      error: `Unknown input${undeclared.length > 1 ? "s" : ""}: ${undeclared.join(", ")}. This version declares: ${declared.join(", ") || "(none)"}.`,
    };
  }
  const validate = ajv.compile(schema);
  if (!validate(inputs)) {
    return { ok: false, error: `Invalid inputs: ${ajv.errorsText(validate.errors, { dataVar: "inputs" })}` };
  }
  return { ok: true };
}

/** Problems that make `next` an unsafe change to `prev` (empty array = safe). */
export function schemaDiffProblems(prev: JsonSchema, next: JsonSchema): string[] {
  const problems: string[] = [];
  const prevProps = prev.properties ?? {};
  const nextProps = next.properties ?? {};
  for (const key of Object.keys(prevProps)) {
    if (!(key in nextProps)) {
      problems.push(`removed input "${key}"`);
    } else if (JSON.stringify(prevProps[key]) !== JSON.stringify(nextProps[key])) {
      problems.push(`changed input "${key}"`);
    }
  }
  const prevRequired = new Set(prev.required ?? []);
  for (const key of next.required ?? []) {
    if (!prevRequired.has(key)) problems.push(`input "${key}" is newly required`);
  }
  for (const key of prev.required ?? []) {
    if (!(next.required ?? []).includes(key)) problems.push(`input "${key}" is no longer required`);
  }
  for (const key of Object.keys(nextProps)) {
    if (!(key in prevProps) && !("default" in nextProps[key])) {
      problems.push(`new input "${key}" has no default`);
    }
  }
  if ((prev.additionalProperties ?? true) !== (next.additionalProperties ?? true)) {
    problems.push("changed additionalProperties");
  }
  return problems;
}
