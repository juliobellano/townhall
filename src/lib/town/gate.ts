import fs from "node:fs";
import path from "node:path";
import { toolsDir } from "./paths";
import { readSchema, runScript } from "./runner";
import { schemaDiffProblems, validateInputs, type JsonSchema } from "./schema";
import { materialize } from "./registry";
import type { Check } from "./types";

export type GateCheck = { name: string; pass: boolean; detail: string };
export type GateResult = { pass: boolean; checks: GateCheck[] };

/** New imports a creator-agent change may add. Everything else is rejected. */
export const ALLOWED_NEW_IMPORTS = ["zoneinfo", "datetime"];

/**
 * Tokens that must not appear in lines a change adds. This is a cheap lint, not a
 * security control: indirect Python can get around it. The fixture runs are the real check.
 */
const DENIED_TOKENS: [RegExp, string][] = [
  [/\bsocket\b/, "socket"],
  [/\burllib\b/, "urllib"],
  [/\brequests\b/, "requests"],
  [/\bhttp\.client\b/, "http.client"],
  [/\bsubprocess\b/, "subprocess"],
  [/\bos\.system\b/, "os.system"],
  [/\beval\s*\(/, "eval("],
  [/\bexec\s*\(/, "exec("],
  [/__import__/, "__import__"],
  [/\bopen\s*\(/, "open("],
  [/\bshutil\b/, "shutil"],
  [/\bctypes\b/, "ctypes"],
];

export function importedModules(src: string): Set<string> {
  const mods = new Set<string>();
  for (const line of src.split("\n")) {
    const from = /^\s*from\s+([\w.]+)\s+import\b/.exec(line);
    if (from) {
      mods.add(from[1].split(".")[0]);
      continue;
    }
    const imp = /^\s*import\s+(.+)$/.exec(line);
    if (imp) for (const part of imp[1].split(",")) mods.add(part.trim().split(/\s+as\s+/)[0].split(".")[0]);
  }
  return mods;
}

export function sourceScanProblems(prevSource: string, nextSource: string): string[] {
  const problems: string[] = [];
  const before = importedModules(prevSource);
  for (const mod of importedModules(nextSource)) {
    if (!before.has(mod) && !ALLOWED_NEW_IMPORTS.includes(mod)) problems.push(`new import "${mod}" is not on the allowlist (${ALLOWED_NEW_IMPORTS.join(", ")})`);
  }
  const prevLines = new Set(prevSource.split("\n").map((l) => l.trim()));
  for (const raw of nextSource.split("\n")) {
    const line = raw.trim();
    if (!line || prevLines.has(line)) continue;
    for (const [re, label] of DENIED_TOKENS) {
      if (re.test(line)) problems.push(`added line uses "${label}": ${line.slice(0, 80)}`);
    }
  }
  return problems;
}

export function canonical(x: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, sort(val)]));
    }
    return v;
  };
  return JSON.stringify(sort(x));
}

/**
 * The deploy gate. Runs before any auto-deploy of an agent-written change:
 *  1. tool contract + schema diff (only optional inputs with defaults may be added)
 *  2. source scan (a lint; see DENIED_TOKENS)
 *  3. fixture runs: the new version at the old fixtures must equal the old version's output,
 *     and recorded expectations that the new schema supports must hold.
 */
export async function runDeployGate(args: {
  toolId: string;
  prevVersion: number;
  prevSource: string;
  prevSchema: JsonSchema;
  nextSource: string;
  checks: Check;
}): Promise<GateResult> {
  const checks: GateCheck[] = [];
  const done = () => ({ pass: checks.every((c) => c.pass), checks });

  const dir = path.join(toolsDir(), args.toolId);
  fs.mkdirSync(dir, { recursive: true });
  const candidate = path.join(dir, "candidate.py");
  fs.writeFileSync(candidate, args.nextSource, { mode: 0o600 });
  try {
    const schemaRes = await readSchema(candidate);
    if (!schemaRes.ok) {
      checks.push({ name: "Tool contract", pass: false, detail: schemaRes.error });
      return done();
    }
    checks.push({ name: "Tool contract", pass: true, detail: "--schema prints a valid input schema" });
    const nextSchema = schemaRes.schema;

    const diff = schemaDiffProblems(args.prevSchema, nextSchema);
    const added = Object.keys(nextSchema.properties ?? {}).filter((k) => !(k in (args.prevSchema.properties ?? {})));
    checks.push({
      name: "Schema diff",
      pass: diff.length === 0,
      detail: diff.length === 0 ? (added.length ? `adds optional input${added.length > 1 ? "s" : ""} with defaults: ${added.join(", ")}` : "no input changes") : diff.join("; "),
    });

    const scan = sourceScanProblems(args.prevSource, args.nextSource);
    checks.push({
      name: "Source scan (lint)",
      pass: scan.length === 0,
      detail: scan.length === 0 ? `no new imports outside the allowlist, no denied calls in added lines` : scan.join("; "),
    });

    // Fixture runs: compatibility with the previous version.
    const prevFile = materialize(args.toolId, args.prevVersion, args.prevSource);
    const fixtures = args.checks.fixtures ?? [];
    const problems: string[] = [];
    for (const fx of fixtures) {
      const [a, b] = await Promise.all([runScript(prevFile, fx.inputs), runScript(candidate, fx.inputs)]);
      if (!a.ok) {
        problems.push(`previous version failed on ${JSON.stringify(fx.inputs)}: ${a.error}`);
      } else if (!b.ok) {
        problems.push(`new version failed on ${JSON.stringify(fx.inputs)}: ${b.error}`);
      } else if (canonical(a.output) !== canonical(b.output)) {
        problems.push(`output changed at defaults for ${JSON.stringify(fx.inputs)}`);
      }
    }
    const noFixtures = fixtures.length === 0;
    checks.push({
      name: "Fixture runs (compatibility)",
      pass: !noFixtures && problems.length === 0,
      detail: noFixtures
        ? "no fixtures recorded for this tool, so the new version cannot be checked against the old one. Publish the tool with at least one example input."
        : problems.length === 0
          ? `${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"}: new version equals previous version at defaults`
          : problems.join("; "),
    });

    // Expectations: recorded results for inputs the new schema now supports.
    const applicable = (args.checks.expectations ?? []).filter((e) => validateInputs(nextSchema, e.inputs).ok && !validateInputs(args.prevSchema, e.inputs).ok);
    const expProblems: string[] = [];
    for (const e of applicable) {
      const r = await runScript(candidate, e.inputs);
      if (!r.ok) {
        expProblems.push(`new version failed on ${JSON.stringify(e.inputs)}: ${r.error}`);
        continue;
      }
      const out = r.output as Record<string, unknown>;
      for (const [k, v] of Object.entries(e.expect)) {
        if (canonical(out[k]) !== canonical(v)) expProblems.push(`${k} was ${canonical(out[k])}, expected ${canonical(v)} for ${JSON.stringify(e.inputs)}`);
      }
    }
    checks.push({
      name: "Recorded totals (expectations)",
      pass: expProblems.length === 0,
      detail:
        expProblems.length === 0
          ? applicable.length
            ? `${applicable.length} recorded expectation${applicable.length === 1 ? "" : "s"} for the new input match`
            : "no recorded expectation covers the new input"
          : expProblems.join("; "),
    });
    return done();
  } finally {
    fs.rmSync(candidate, { force: true });
  }
}
